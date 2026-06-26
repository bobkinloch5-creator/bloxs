// Server-only helper: search Roblox's public toolbox/marketplace for free assets
// matching a keyword. Returns a small list of { id, name, creatorName, creatorType,
// thumbnail, relevance, safety }.
// Best-effort — Roblox occasionally changes these endpoints; we try a few and
// only fall back to a curated allowlist of verified free Roblox assets.

export interface ToolboxResult {
  id: number;
  name: string;
  creatorName: string;
  creatorType: string;
  assetType?: string;
  thumbnail?: string;
  relevance?: number; // 0..1 — how well the asset name matches the query
  safety?: number;    // 0..1 — heuristic safety/quality score (creator, name junk filter)
  reason?: string;
  free?: boolean;
}

export type ToolboxCategory = "Model" | "Audio" | "Decal" | "Mesh";
const CATEGORY_ID: Record<ToolboxCategory, number> = {
  Model: 10,
  Audio: 12,
  Decal: 11,
  Mesh: 13,
};

// Curated, verified-free Roblox-creator fallbacks (creator "Roblox", price 0).
const FALLBACK: Record<string, ToolboxResult[]> = {
  tree: [
    { id: 1577043523, name: "Pine Tree", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
    { id: 162039248, name: "Tree Pack", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  forest: [
    { id: 1577043523, name: "Pine Tree", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
    { id: 162039248, name: "Tree Pack", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  npc: [
    { id: 1664543044, name: "Classic Noob NPC", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
    { id: 27112438, name: "R6 Dummy", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  dummy: [{ id: 27112438, name: "R6 Dummy", creatorName: "Roblox", creatorType: "User", assetType: "Model" }],
  sword: [{ id: 12221720, name: "Classic Sword", creatorName: "Roblox", creatorType: "User", assetType: "Gear" }],
  weapon: [
    { id: 12221720, name: "Classic Sword", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
    { id: 32356064, name: "Rocket Launcher", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
    { id: 130113146, name: "Paintball Gun", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
    { id: 16895215, name: "Slingshot", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
  ],
  gun: [
    { id: 32356064, name: "Rocket Launcher", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
    { id: 130113146, name: "Paintball Gun", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
  ],
  coil: [
    { id: 17042957, name: "Speed Coil", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
    { id: 16688968, name: "Gravity Coil", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
  ],
  click: [{ id: 9117517011, name: "UI Click", creatorName: "Roblox", creatorType: "User", assetType: "Audio" }],
};

function pickFallback(keyword: string): ToolboxResult[] {
  const k = keyword.toLowerCase();
  for (const [key, list] of Object.entries(FALLBACK)) {
    if (k.includes(key)) return list;
  }
  return [];
}

const QUERY_ALIASES: Array<{ test: RegExp; terms: string[] }> = [
  { test: /\b(obby|parkour)\b/i, terms: ["obby kit", "parkour kit", "obstacle course"] },
  { test: /\b(tycoon)\b/i, terms: ["tycoon kit", "conveyor", "dropper"] },
  { test: /\b(city|town|roleplay)\b/i, terms: ["city kit", "road", "building"] },
  { test: /\b(forest|woods|jungle)\b/i, terms: ["tree", "pine tree", "forest"] },
  { test: /\b(car|cars|vehicle|vehicles)\b/i, terms: ["car", "vehicle", "race car"] },
  { test: /\b(road|street|highway)\b/i, terms: ["road", "street", "city road"] },
  { test: /\b(house|building|shop|store)\b/i, terms: ["building", "house", "shop"] },
  { test: /\b(pet|pets)\b/i, terms: ["pet", "dog", "cat"] },
  { test: /\b(zombie|enemy|monster|npc)\b/i, terms: ["npc", "zombie", "dummy"] },
  { test: /\b(sword|weapon|gun|blaster)\b/i, terms: ["weapon", "sword", "gun"] },
  { test: /\b(lobby|spawn)\b/i, terms: ["lobby", "spawn", "welcome"] },
];

function buildSearchTerms(keyword: string): string[] {
  const base = keyword.trim().replace(/\s+/g, " ");
  const terms = new Set<string>();
  if (base) terms.add(base);
  for (const alias of QUERY_ALIASES) {
    if (alias.test.test(base)) {
      for (const term of alias.terms) terms.add(term);
    }
  }
  return Array.from(terms).slice(0, 4);
}

async function tryFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BloxSmith/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

const JUNK_PATTERNS = [
  /free\s*robux/i,
  /!!!+/,
  /\bnsfw\b/i,
  /\bscam\b/i,
  /\bvirus\b/i,
  /\binfected\b/i,
  /\bbackdoor\b/i,
  /\brequire\s*\(/i,
  /\badmin\b/i,
  /\bhack(ed|s|er)?\b/i,
  /\bexploit\b/i,
  /\bscript\s*builder\b/i,
  /\bhd\s*admin\b/i,
  /[💰🤑💎]/u,
  /\bclick\s*here\b/i,
  /\bgive\s*?away\b/i,
];

function looksLikeJunk(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (name.length > 80) return true;
  // mostly symbols / emoji
  const alphanum = name.replace(/[^a-z0-9 ]/gi, "").trim();
  if (alphanum.length < Math.max(3, Math.floor(name.length * 0.4))) return true;
  return JUNK_PATTERNS.some((re) => re.test(name));
}

function rejectionReason(r: ToolboxResult): string | null {
  if (r.free === false) return "not_free";
  if (looksLikeJunk(r.name)) return "suspicious_name";
  if (!isTrustedCreator(r.creatorName)) return "untrusted_creator";
  if ((r.relevance ?? 0) <= 0.1) return "low_relevance";
  if ((r.safety ?? 0) < 0.8) return "low_safety";
  return null;
}

function relevanceScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase();
  if (!q || !n) return 0;
  if (n === q) return 1;
  if (n.includes(q)) return 0.85;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => n.includes(t)).length;
  return Math.min(1, hits / tokens.length);
}

function safetyScore(creatorName: string, name: string): number {
  let s = 0.5;
  const c = (creatorName || "").toLowerCase();
  if (c === "roblox") s += 0.4;
  else if (c) s += 0.1;
  if (looksLikeJunk(name)) s -= 0.4;
  return Math.max(0, Math.min(1, s));
}

function isTrustedCreator(creatorName: string): boolean {
  return creatorName.trim().toLowerCase() === "roblox";
}

function thumbnailFor(id: number): string {
  // Public Roblox thumbnail endpoint — returns a redirect to a CDN image.
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`;
}

/**
 * Search Roblox public toolbox/marketplace for free assets matching `keyword`.
 * Filters to verified-creator, free items and ranks by relevance × safety.
 */
export async function searchRobloxToolbox(
  keyword: string,
  category: ToolboxCategory = "Model",
  limit = 6,
): Promise<{ source: "live" | "fallback" | "none"; results: ToolboxResult[] }> {
  const terms = buildSearchTerms(keyword);
  if (terms.length === 0) return { source: "none", results: [] };
  const catId = CATEGORY_ID[category];

  const enrich = (r: ToolboxResult): ToolboxResult => ({
    ...r,
    thumbnail: r.thumbnail ?? thumbnailFor(r.id),
    relevance: relevanceScore(keyword, r.name),
    safety: safetyScore(r.creatorName, r.name),
    free: r.free ?? true,
  });

  const rank = (rows: ToolboxResult[]) =>
    rows
      .map(enrich)
      .filter((r) => rejectionReason(r) === null)
      .sort((a, b) => (b.relevance! * 0.6 + b.safety! * 0.4) - (a.relevance! * 0.6 + a.safety! * 0.4))
      .slice(0, limit);

  // 1. toolbox-service marketplace endpoint.
  const liveRows = new Map<number, ToolboxResult>();
  for (const term of terms) {
    const q = encodeURIComponent(term);
    const tbUrl = `https://apis.roblox.com/toolbox-service/v1/marketplace/${catId}?keyword=${q}&limit=${limit * 4}&sortType=2`;
    const tb = (await tryFetch(tbUrl)) as
      | { data?: Array<{ asset?: { id?: number; name?: string; typeId?: number }; creator?: { name?: string; type?: number }; product?: { price?: number; isFree?: boolean } }> }
      | null;
    if (!tb?.data || !Array.isArray(tb.data)) continue;
    for (const row of tb.data) {
      const id = row?.asset?.id;
      const name = row?.asset?.name;
      if (typeof id !== "number" || !name || liveRows.has(id)) continue;
      const price = row?.product?.price;
      const isFree = row?.product?.isFree ?? (price === 0 || price == null);
      liveRows.set(id, {
        id,
        name,
        creatorName: row?.creator?.name ?? "",
        creatorType: row?.creator?.type === 2 ? "Group" : "User",
        assetType: category,
        free: isFree,
      });
    }
  }
  if (liveRows.size > 0) {
    const ranked = rank(Array.from(liveRows.values()));
    if (ranked.length > 0) return { source: "live", results: ranked };
  }

  // 2. curated allowlist.
  const seenFallback = new Set<number>();
  const fb = terms
    .flatMap(pickFallback)
    .filter((r) => {
      if (seenFallback.has(r.id)) return false;
      seenFallback.add(r.id);
      return true;
    })
    .map(enrich);
  if (fb.length > 0) return { source: "fallback", results: fb.slice(0, limit) };
  return { source: "none", results: [] };
}
