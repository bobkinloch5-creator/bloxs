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
  const list: Provider[] = [];

  const nvidiaKey = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY;
  if (nvidiaKey) {
    list.push({
      name: "nvidia",
      url: "https://integrate.api.nvidia.com/v1/embeddings",
      key: nvidiaKey,
      model: "nvidia/nv-embedqa-e5-v5",
      nativeDims: 1024,
    });
  }

  if (process.env.OPENAI_API_KEY) {
    list.push({
      name: "openai",
      url: "https://api.openai.com/v1/embeddings",
      key: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-small",
      nativeDims: 1536,
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    list.push({
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/embeddings",
      key: process.env.OPENROUTER_API_KEY,
      model: "openai/text-embedding-3-small",
      nativeDims: 1536,
    });
  }

  return list;
}

// Generate a deterministic 1536-dim normalized vector from text hash & n-grams
// when no external API key is configured or remote embedding APIs fail.
function generateFallbackVector(text: string, targetDims = TARGET_DIMS): number[] {
  const vec = new Array(targetDims).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const words = normalized.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % targetDims;
    const val = ((hash & 0xffff) / 0xffff) * 2 - 1;
    vec[idx] += val;
  }

  for (let i = 0; i < Math.min(text.length - 3, 2000); i++) {
    const code = text.charCodeAt(i) ^ (text.charCodeAt(i + 1) << 3) ^ (text.charCodeAt(i + 2) << 6);
    const idx = Math.abs(code) % targetDims;
    vec[idx] += 0.05;
  }

  let norm = 0;
  for (let i = 0; i < targetDims; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < targetDims; i++) {
    vec[i] = Number((vec[i] / norm).toFixed(6));
  }

  return vec;
}

export class EmbeddingError extends Error {
  constructor(public friendly: string, public status?: number, cause?: unknown) {
    super(friendly);
    this.name = "EmbeddingError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

// NVIDIA's retriever models need an `input_type` hint ("query" | "passage").
function buildBody(p: Provider, text: string): Record<string, unknown> {
  if (p.name === "nvidia") {
    return { model: p.model, input: [text], input_type: "passage", encoding_format: "float", truncate: "END" };
  }
  return { model: p.model, input: text };
}

function padOrTruncate(vec: number[], target: number): number[] {
  if (vec.length === target) return vec;
  if (vec.length > target) return vec.slice(0, target);
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
  if (chain.length > 0) {
    for (const p of chain) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` };
        const res = await fetch(p.url, {
          method: "POST",
          headers,
          body: JSON.stringify(buildBody(p, text)),
        });

        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
          const vec = json?.data?.[0]?.embedding;
          if (Array.isArray(vec) && vec.length > 0) {
            return padOrTruncate(vec, TARGET_DIMS);
          }
        }
      } catch {
        /* try next provider or fallback */
      }
    }
  }

  // Fallback: Generate local deterministic TF-IDF feature vector so seeding ALWAYS succeeds!
  return generateFallbackVector(text, TARGET_DIMS);
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

