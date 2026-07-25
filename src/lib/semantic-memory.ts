// Relevance ranking for project_memory rows.
//
// Two rankers live here:
//
//   rerankMemories()         - synchronous, no network, IDF-weighted keyword
//                              overlap. Always available, always fast.
//   rerankMemoriesSemantic() - embedding-based cosine ranking blended with the
//                              keyword score. Falls back to the sync ranker on
//                              any failure, so callers never handle an outage.
//
// Why IDF instead of a stoplist of domain words: the previous version put
// "roblox", "game", "script", "build", "create", "fix", "player" and
// "character" on the stoplist. In a Roblox game builder those are among the
// most load-bearing words a user can type - dropping them meant "fix the shop
// script" and "fix the pet script" scored identically. IDF handles this
// properly: a token appearing in almost every row carries little signal and is
// down-weighted automatically, while a token appearing in one row is treated as
// highly distinctive. No hand-maintained domain list required.

type MemoryRow = {
  key: string;
  value: string;
  kind: string | null;
  importance: number | null;
};

// Generic English function words only. Nothing domain-specific belongs here.
const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","by","is","are","be","this","that","it","its",
  "i","me","my","we","our","you","your","they","their","them","us","was","were","been","being",
  "as","at","from","into","over","up","down","out","off","if","then","than","so","not","no","do","does","did","done",
  "have","has","had","having","will","would","could","should","can","may","might","must","just","also","really","very",
  "please","need","needs","want","wants","get","got","use","using","some","any","all","one","two","like","there","here",
  "what","when","where","which","who","how","why","about","more","most","other","only","now","still","even","back",
]);

function tokens(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Inverse document frequency over the candidate rows themselves.
 * A token in every row scores near 0; a token in one row scores high.
 */
function buildIdf(rows: MemoryRow[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const r of rows) {
    const seen = new Set(tokens(`${r.key} ${r.value} ${r.kind ?? ""}`));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = Math.max(1, rows.length);
  const idf = new Map<string, number>();
  for (const [t, count] of df) {
    // Smoothed IDF, floored at 0 so a universal token contributes nothing
    // rather than going negative.
    idf.set(t, Math.max(0, Math.log((n + 1) / (count + 0.5))));
  }
  return idf;
}

/** Operational rows are imperative instructions, not lore - they ride at the top. */
function operationalBoost(key: string): number {
  if (key === "last_build_failures") return 1000;
  if (key === "last_build") return 500;
  return 0;
}

function keywordScore(row: MemoryRow, qTokens: Set<string>, idf: Map<string, number>): number {
  const rowTokens = tokens(`${row.key} ${row.value} ${row.kind ?? ""}`);
  if (rowTokens.length === 0) return 0;
  let weighted = 0;
  const hit = new Set<string>();
  for (const t of rowTokens) {
    if (!qTokens.has(t)) continue;
    hit.add(t);
    weighted += idf.get(t) ?? 1;
  }
  // Distinct matches matter more than one token repeated many times, and long
  // rows should not win just by being long.
  const distinctWeight = [...hit].reduce((sum, t) => sum + (idf.get(t) ?? 1), 0);
  return distinctWeight * 10 + weighted / Math.sqrt(rowTokens.length);
}

/**
 * Rerank memory rows by relevance to `userText`. Ties broken by importance.
 * Synchronous and dependency-free.
 */
export function rerankMemories<T extends MemoryRow>(
  rows: T[],
  userText: string,
  topN = 10,
): T[] {
  if (!rows || rows.length === 0) return [];
  const qTokens = new Set(tokens(userText));
  if (qTokens.size === 0) return rows.slice(0, topN);

  const idf = buildIdf(rows);
  const scored = rows.map((r) => ({
    row: r,
    score:
      operationalBoost(r.key) +
      keywordScore(r, qTokens, idf) * 2 +
      Number(r.importance ?? 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.row);
}

// ---------------------------------------------------------------------------
// Embedding-based ranking
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Memory rows change rarely but are re-ranked on every turn, so their
// embeddings are cached in-process and keyed by content. A row only costs an
// embedding call the first time it is seen.
const EMBED_CACHE_MAX = 512;
const embedCache = new Map<string, number[]>();

function cacheKeyFor(row: MemoryRow): string {
  return `${row.key}::${String(row.value).slice(0, 500)}`;
}

function cacheGet(key: string): number[] | undefined {
  const hit = embedCache.get(key);
  if (!hit) return undefined;
  embedCache.delete(key);
  embedCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, vec: number[]) {
  embedCache.set(key, vec);
  if (embedCache.size > EMBED_CACHE_MAX) {
    const oldest = embedCache.keys().next().value;
    if (oldest) embedCache.delete(oldest);
  }
}

/** Test helper: drop every cached row embedding. */
export function clearMemoryEmbedCache() {
  embedCache.clear();
}

export type SemanticRerankOptions = {
  /** Injected for tests; defaults to the real embedder. */
  embed?: (text: string) => Promise<number[]>;
  /**
   * Ranking every row with embeddings would cost more than it returns, so the
   * keyword ranker pre-filters to a shortlist and only that gets embedded.
   */
  candidatePool?: number;
  /** How much the embedding score counts relative to the keyword score. */
  semanticWeight?: number;
};

/**
 * Rerank memories using embeddings, blended with the keyword score.
 *
 * Keyword matching is excellent at exact identifiers ("CoinServer",
 * "leaderstats") and useless at paraphrase ("the money thing" vs "currency
 * system"). Embeddings are the reverse. Blending both beats either alone, and
 * the operational boost still wins outright so build failures are never buried.
 *
 * Never throws: any embedding failure degrades to the keyword ranking.
 */
export async function rerankMemoriesSemantic<T extends MemoryRow>(
  rows: T[],
  userText: string,
  topN = 10,
  options: SemanticRerankOptions = {},
): Promise<T[]> {
  if (!rows || rows.length === 0) return [];
  const query = String(userText || "").trim();
  if (!query) return rows.slice(0, topN);

  const candidatePool = options.candidatePool ?? Math.max(topN * 3, 24);
  const semanticWeight = options.semanticWeight ?? 60;

  // Cheap pass first. This is also the fallback result.
  const shortlist = rerankMemories(rows, query, candidatePool);
  if (shortlist.length <= 1) return shortlist.slice(0, topN);

  try {
    const embed = options.embed ?? (await import("@/lib/embeddings.server")).embedText;

    const queryVec = await embed(query);
    if (!Array.isArray(queryVec) || queryVec.length === 0) return shortlist.slice(0, topN);

    const vectors = await Promise.all(
      shortlist.map(async (row) => {
        const key = cacheKeyFor(row);
        const cached = cacheGet(key);
        if (cached) return cached;
        const vec = await embed(`${row.key} ${String(row.value).slice(0, 1000)}`);
        if (Array.isArray(vec) && vec.length > 0) cacheSet(key, vec);
        return vec;
      }),
    );

    const idf = buildIdf(shortlist);
    const qTokens = new Set(tokens(query));

    const scored = shortlist.map((row, i) => {
      const similarity = cosineSimilarity(queryVec, vectors[i] ?? []);
      return {
        row,
        score:
          operationalBoost(row.key) +
          similarity * semanticWeight +
          keywordScore(row, qTokens, idf) +
          Number(row.importance ?? 0) * 0.5,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => s.row);
  } catch {
    // Embeddings are an enhancement, never a dependency.
    return shortlist.slice(0, topN);
  }
}
