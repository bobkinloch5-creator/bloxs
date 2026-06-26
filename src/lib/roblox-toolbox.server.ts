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
  const q = encodeURIComponent(keyword.trim());
  if (!q) return { source: "none", results: [] };
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
      .filter((r) => r.free !== false && !looksLikeJunk(r.name) && isTrustedCreator(r.creatorName) && (r.relevance ?? 0) > 0.1 && (r.safety ?? 0) >= 0.8)
      .sort((a, b) => (b.relevance! * 0.6 + b.safety! * 0.4) - (a.relevance! * 0.6 + a.safety! * 0.4))
      .slice(0, limit);

  // 1. toolbox-service marketplace endpoint.
  const tbUrl = `https://apis.roblox.com/toolbox-service/v1/marketplace/${catId}?keyword=${q}&limit=${limit * 4}&sortType=2`;
  const tb = (await tryFetch(tbUrl)) as
    | { data?: Array<{ asset?: { id?: number; name?: string; typeId?: number }; creator?: { name?: string; type?: number }; product?: { price?: number; isFree?: boolean } }> }
    | null;
  if (tb?.data && Array.isArray(tb.data) && tb.data.length > 0) {
    const out: ToolboxResult[] = [];
    for (const row of tb.data) {
      const id = row?.asset?.id;
      const name = row?.asset?.name;
      if (typeof id !== "number" || !name) continue;
      const price = row?.product?.price;
      const isFree = row?.product?.isFree ?? (price === 0 || price == null);
      if (!isFree) continue;
      out.push({
        id,
        name,
        creatorName: row?.creator?.name ?? "",
        creatorType: row?.creator?.type === 2 ? "Group" : "User",
        assetType: category,
        free: true,
      });
    }
    const ranked = rank(out);
    if (ranked.length > 0) return { source: "live", results: ranked };
  }

  // 2. catalog search fallback.
  const catUrl = `https://catalog.roblox.com/v1/search/items?category=All&keyword=${q}&limit=${limit * 2}`;
  const cat = (await tryFetch(catUrl)) as { data?: Array<{ id?: number; name?: string; price?: number }> } | null;
  if (cat?.data && Array.isArray(cat.data) && cat.data.length > 0) {
    const out: ToolboxResult[] = cat.data
      .filter((r) => typeof r.id === "number" && r.name && (r.price == null || r.price === 0))
      .map((r) => ({
        id: r.id as number,
        name: r.name as string,
        creatorName: "",
        creatorType: "User",
        assetType: category,
        free: true,
      }));
    const ranked = rank(out);
    if (ranked.length > 0) return { source: "live", results: ranked };
  }

  // 3. curated allowlist.
  const fb = pickFallback(keyword).map(enrich);
  if (fb.length > 0) return { source: "fallback", results: fb.slice(0, limit) };
  return { source: "none", results: [] };
}
