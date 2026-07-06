// Fast keyword-based reranker for project_memory rows. No embedding calls —
// runs in-process on the memory set we already fetched. Turns the existing
// importance-sorted list into a relevance-sorted one for the user's turn.
// Cheap, deterministic, and never adds latency.

type MemoryRow = {
  key: string;
  value: string;
  kind: string | null;
  importance: number | null;
};

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","by","is","are","be","this","that","it","its",
  "i","me","my","we","our","you","your","they","their","he","she","him","her","them","us","was","were","been","being",
  "as","at","from","into","over","up","down","out","off","if","then","than","so","not","no","do","does","did","done",
  "have","has","had","having","will","would","could","should","can","may","might","must","just","also","really","very",
  "please","make","made","add","added","need","needs","want","wants","get","got","use","using","some","any","all","one","two",
  "roblox","game","script","player","character","help","fix","build","create","new","like","also",
]);

function tokens(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP.has(t));
}

/**
 * Rerank memory rows by relevance to `userText`. Ties broken by importance.
 * Returns top-N (default 10) after boosting recent last_build / last_build_failures
 * so operational memory always rides at the top.
 */
export function rerankMemories<T extends MemoryRow>(
  rows: T[],
  userText: string,
  topN = 10,
): T[] {
  if (!rows || rows.length === 0) return [];
  const qTokens = new Set(tokens(userText));
  if (qTokens.size === 0) {
    return rows.slice(0, topN);
  }

  const scored = rows.map(r => {
    // Operational rows always come first — they're imperative, not lore.
    const opBoost = r.key === "last_build_failures" ? 1000
                  : r.key === "last_build" ? 500
                  : 0;
    const rowTokens = tokens(`${r.key} ${r.value} ${r.kind ?? ""}`);
    let overlap = 0;
    for (const t of rowTokens) if (qTokens.has(t)) overlap++;
    // Jaccard-ish, but favor rows that hit more query tokens.
    const distinctHits = new Set(rowTokens.filter(t => qTokens.has(t))).size;
    const relevance = distinctHits * 10 + overlap;
    const importance = Number(r.importance ?? 0);
    return { row: r, score: opBoost + relevance * 2 + importance };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(s => s.row);
}
