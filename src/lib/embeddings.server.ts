// Embeddings client locked to NVIDIA (padded to 1536 dims).
// The provider returns OpenAI-compatible /v1/embeddings responses.
// We always return 1536-dim vectors so the pgvector schema stays stable.

const TARGET_DIMS = 1536;

type Provider = {
  name: string;
  url: string;
  key: string | undefined;
  model: string;
  // If the model's native dims differ from TARGET_DIMS, we pad/truncate.
  nativeDims: number;
};

function providers(): Provider[] {
  return [
    {
      name: "nvidia",
      url: "https://integrate.api.nvidia.com/v1/embeddings",
      key: process.env.NVIDIA_API_KEY,
      // 1024-dim, high-quality retrieval model
      model: "nvidia/nv-embedqa-e5-v5",
      nativeDims: 1024,
    },
  ].filter((p) => !!p.key);
}

export class EmbeddingError extends Error {
  constructor(public friendly: string, public status?: number, cause?: unknown) {
    super(friendly);
    this.name = "EmbeddingError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

// NVIDIA's retriever models need an `input_type` hint ("query" | "passage").
// We're indexing docs, so default to "passage" — close enough for both sides.
function buildBody(p: Provider, text: string): Record<string, unknown> {
  if (p.name === "nvidia") {
    return { model: p.model, input: [text], input_type: "passage", encoding_format: "float", truncate: "END" };
  }
  return { model: p.model, input: text };
}

function padOrTruncate(vec: number[], target: number): number[] {
  if (vec.length === target) return vec;
  if (vec.length > target) return vec.slice(0, target);
  // Pad with zeros — cosine distance still works, just lower magnitude on the tail.
  const out = vec.slice();
  while (out.length < target) out.push(0);
  return out;
}

async function embedOnce(input: string): Promise<number[]> {
  const text = (input ?? "").toString().trim();
  if (!text) throw new EmbeddingError("Cannot embed an empty string.");
  if (text.length > 30000) {
    throw new EmbeddingError("Text is too long to embed — chunk it under 30k chars first.");
  }

  const chain = providers();
  if (chain.length === 0) {
    throw new EmbeddingError(
      "No embedding provider is configured. Add LOVABLE_API_KEY, QUATARLY_API_KEY, or NVIDIA_API_KEY.",
    );
  }

  let lastErr: EmbeddingError | null = null;

  for (const p of chain) {
    let res: Response;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` };
      res = await fetch(p.url, {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(p, text)),
      });
    } catch (e) {
      lastErr = new EmbeddingError(`Couldn't reach the ${p.name} embeddings endpoint.`, undefined, e);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Fall through on anything that another provider could plausibly serve.
      // 404 is recoverable too — it just means this provider doesn't host the route.
      const recoverable =
        res.status === 402 || res.status === 429 || res.status === 401 ||
        res.status === 403 || res.status === 404 || res.status >= 500;
      if (res.status === 402) {
        lastErr = new EmbeddingError(`${p.name}: credits exhausted.`, 402);
      } else if (res.status === 429) {
        lastErr = new EmbeddingError(`${p.name}: rate-limited.`, 429);
      } else if (res.status === 401 || res.status === 403) {
        lastErr = new EmbeddingError(`${p.name}: auth rejected.`, res.status);
      } else {
        lastErr = new EmbeddingError(
          `${p.name} embed failed (${res.status}). ${body.slice(0, 160)}`.trim(),
          res.status,
        );
      }
      if (recoverable) continue;
      throw lastErr;
    }

    let json: { data?: Array<{ embedding?: number[] }> };
    try {
      json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    } catch (e) {
      lastErr = new EmbeddingError(`${p.name} returned an unreadable response.`, res.status, e);
      continue;
    }
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      lastErr = new EmbeddingError(`${p.name} returned an empty embedding.`);
      continue;
    }
    return padOrTruncate(vec, TARGET_DIMS);
  }

  throw lastErr ?? new EmbeddingError("All embedding providers failed.");
}

// In-memory LRU embedding cache. Identical short queries (retrieval prompts,
// repeat indexes) hit a host call otherwise; caching saves ~200–600ms each.
const EMBED_CACHE_TTL_MS = 30 * 60_000;
const EMBED_CACHE_MAX = 512;
const embedCache = new Map<string, { at: number; vec: number[] }>();
function cacheKeyFor(text: string) {
  // Cheap stable key; full text up to 4k is unique enough and avoids hashing cost.
  return text.length > 4096 ? `${text.length}:${text.slice(0, 2048)}…${text.slice(-1024)}` : text;
}

// Public entry: retry with progressively smaller text on transient upstream
// failures (5xx). Many doc chunks fail only because an upstream embed host
// has a momentary 500 on long inputs — a quick retry with a tighter slice
// almost always succeeds.
export async function embedText(input: string): Promise<number[]> {
  const text = (input ?? "").toString();
  const key = cacheKeyFor(text);
  const hit = embedCache.get(key);
  if (hit && Date.now() - hit.at < EMBED_CACHE_TTL_MS) {
    // refresh LRU position
    embedCache.delete(key);
    embedCache.set(key, hit);
    return hit.vec;
  }
  const attempts = [text, text.slice(0, 8000), text.slice(0, 2000)];
  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const vec = await embedOnce(attempts[i]);
      embedCache.set(key, { at: Date.now(), vec });
      if (embedCache.size > EMBED_CACHE_MAX) {
        // delete oldest
        const oldest = embedCache.keys().next().value;
        if (oldest) embedCache.delete(oldest);
      }
      return vec;
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number })?.status ?? 0;
      // Only retry on transient/server-side failures.
      if (!(status === 0 || status === 429 || status >= 500)) throw e;
      // small backoff
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new EmbeddingError("All embedding attempts failed.");
}

// pgvector expects a string literal '[0.1,0.2,...]'
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

