// Per-agent retrieval over the knowledge base.
// Returns a compact, prompt-ready block of the top-K most relevant chunks.

import { embedText, toPgVector } from "@/lib/embeddings.server";

type Topic = "scripter" | "world_builder" | "ui_designer";

type RpcRow = { title: string; content: string; source: string | null; similarity: number };

// Small RAG cache: same (topic, query, k) within 5min returns the same prompt
// block without re-embedding or re-querying pgvector.
const KB_CACHE_TTL_MS = 5 * 60_000;
const KB_CACHE_MAX = 256;
const kbCache = new Map<string, { at: number; out: string }>();

export async function retrieveKnowledge(
  supabase: unknown,
  topic: Topic,
  query: string,
  k = 4,
): Promise<string> {
  const q = query.slice(0, 2000);
  const cacheKey = `${topic}|${k}|${q}`;
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
    const { data, error } = await sb.rpc("match_kb_chunks", {
      query_embedding: toPgVector(vec),
      match_topic: topic,
      match_count: k,
    });
    if (error || !data || data.length === 0) {
      kbCache.set(cacheKey, { at: Date.now(), out: "" });
      return "";
    }
    const lines = data.map(
      (row, i) =>
        `[${i + 1}] ${row.title}${row.source ? ` (${row.source})` : ""}\n${row.content}`,
    );
    const out = `RETRIEVED KNOWLEDGE (verified Roblox API + examples — prefer these over memory):\n${lines.join("\n\n")}`;
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
