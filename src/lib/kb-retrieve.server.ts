// Per-agent retrieval over the knowledge base.
// Returns a compact, prompt-ready block of the top-K most relevant chunks.
//
// Retrieval is confidence-gated. The block is introduced to the model as
// "verified Roblox API + examples - prefer these over memory", which is a very
// strong instruction: whatever we put under that header outranks the model's
// own training. Injecting a weak vector match under that header is worse than
// injecting nothing, because it actively steers the model toward an irrelevant
// snippet. So anything below MIN_SIMILARITY is dropped, and if nothing clears
// the bar we return "" and let the model rely on its own knowledge.

import { embedText, toPgVector } from "@/lib/embeddings.server";

type Topic = "scripter" | "world_builder" | "ui_designer";

type RpcRow = { title: string; content: string; source: string | null; similarity: number };

/**
 * Cosine-similarity floor for a chunk to be worth injecting.
 * On the seeded corpus, on-topic Roblox API chunks land around 0.45-0.75,
 * loosely related chunks around 0.30-0.40, and unrelated ones below 0.30.
 * 0.35 keeps genuine partial matches while cutting the noise.
 */
export const MIN_SIMILARITY = 0.35;

/** A chunk this strong is worth trusting over the model's own memory. */
export const STRONG_SIMILARITY = 0.55;

// Small RAG cache: same (topic, query, k) within 5min returns the same prompt
// block without re-embedding or re-querying pgvector.
const KB_CACHE_TTL_MS = 5 * 60_000;
const KB_CACHE_MAX = 256;
const kbCache = new Map<string, { at: number; out: string }>();

const KB_DEBUG = process.env.KB_DEBUG === "1";

export type RetrieveOptions = {
  /** Override the similarity floor (mainly for tests). */
  minSimilarity?: number;
};

/**
 * Fetch the top matching KB chunks, drop anything below the confidence floor,
 * and format the survivors as a prompt block. Returns "" when nothing clears
 * the bar - callers should treat that as "no retrieved knowledge", not an error.
 */
export async function retrieveKnowledge(
  supabase: unknown,
  topic: Topic,
  query: string,
  k = 4,
  options: RetrieveOptions = {},
): Promise<string> {
  const minSimilarity = options.minSimilarity ?? MIN_SIMILARITY;
  const q = query.slice(0, 2000);
  const cacheKey = `${topic}|${k}|${minSimilarity}|${q}`;
  const hit = kbCache.get(cacheKey);
  if (hit && Date.now() - hit.at < KB_CACHE_TTL_MS) {
    kbCache.delete(cacheKey);
    kbCache.set(cacheKey, hit);
    return hit.out;
  }
  try {
    const vec = await embedText(q);
    const sb = supabase as {
      rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: RpcRow[] | null; error: unknown }>;
    };
    // Over-fetch so the confidence filter has something to choose from: asking
    // for exactly k and then dropping half of them wastes the round trip.
    const { data, error } = await sb.rpc("match_kb_chunks", {
      query_embedding: toPgVector(vec),
      match_topic: topic,
      match_count: Math.min(k * 2, 12),
    });
    if (error || !data || data.length === 0) {
      if (KB_DEBUG) {
        console.log(`[kb] topic=${topic} hits=0${error ? ` error=${String((error as { message?: string })?.message ?? error)}` : ""}`);
      }
      kbCache.set(cacheKey, { at: Date.now(), out: "" });
      return "";
    }

    const out = formatKnowledgeBlock(data, k, minSimilarity);
    if (KB_DEBUG) {
      console.log(
        `[kb] topic=${topic} fetched=${data.length} kept=${out ? out.split("\n[").length - 1 : 0} top=${data
          .slice(0, 3)
          .map((r) => `${r.title.slice(0, 40)}(${r.similarity.toFixed(2)})`)
          .join(" | ")}`,
      );
    }

    kbCache.set(cacheKey, { at: Date.now(), out });
    if (kbCache.size > KB_CACHE_MAX) {
      const oldest = kbCache.keys().next().value;
      if (oldest) kbCache.delete(oldest);
    }
    return out;
  } catch {
    // Retrieval is best-effort; never block the agent on it.
    return "";
  }
}

/**
 * Apply the confidence floor and render the prompt block.
 * Exported so the behaviour is testable without a database.
 */
export function formatKnowledgeBlock(
  rows: RpcRow[],
  k = 4,
  minSimilarity = MIN_SIMILARITY,
): string {
  const kept = rows
    .filter((r) => Number.isFinite(r.similarity) && r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);

  if (kept.length === 0) return "";

  // When the best match is only borderline, soften the header. The model should
  // still see the chunk, but it should not be told to prefer it over everything
  // it already knows.
  const strong = kept[0].similarity >= STRONG_SIMILARITY;
  const header = strong
    ? "RETRIEVED KNOWLEDGE (verified Roblox API + examples - prefer these over memory):"
    : "POSSIBLY RELEVANT REFERENCE (partial matches - use only if they fit the request):";

  const lines = kept.map(
    (row, i) => `[${i + 1}] ${row.title}${row.source ? ` (${row.source})` : ""}\n${row.content}`,
  );
  return `${header}\n${lines.join("\n\n")}`;
}
