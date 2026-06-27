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
  sourceQuery?: string;
  endorsed?: boolean;
  verifiedCreator?: boolean;
  hasScripts?: boolean;
  scriptCount?: number;
  upVotePercent?: number;
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
  { test: /\b(obby|parkour)\b/i, terms: ["obby kit", "parkour kit", "obstacle course", "checkpoint obby"] },
  { test: /\b(tycoon)\b/i, terms: ["tycoon kit", "tycoon building", "conveyor", "dropper"] },
  { test: /\b(city|town|roleplay|rp)\b/i, terms: ["city kit", "city building", "road", "street light", "sidewalk"] },
  { test: /\b(forest|woods|jungle)\b/i, terms: ["tree", "pine tree", "forest", "rock", "bush"] },
  { test: /\b(car|cars|vehicle|vehicles|racing|race)\b/i, terms: ["car", "vehicle", "race car", "sports car", "road"] },
  { test: /\b(road|street|highway)\b/i, terms: ["road", "street", "city road", "asphalt road"] },
  { test: /\b(house|building|shop|store|mall|lobby)\b/i, terms: ["building", "house", "shop", "storefront", "lobby"] },
  { test: /\b(pet|pets|egg|eggs)\b/i, terms: ["pet", "pet simulator", "egg", "dog", "cat"] },
  { test: /\b(zombie|enemy|monster|npc|vendor|quest giver)\b/i, terms: ["npc", "zombie", "monster", "dummy", "vendor"] },
  { test: /\b(sword|weapon|gun|blaster|bow|staff)\b/i, terms: ["weapon", "sword", "gun", "blaster", "bow"] },
  { test: /\b(lobby|spawn|hub)\b/i, terms: ["lobby", "spawn", "hub", "welcome center"] },
  { test: /\b(horror|escape|haunted)\b/i, terms: ["horror house", "haunted house", "dark corridor", "flashlight"] },
  { test: /\b(rpg|dungeon|quest|fantasy)\b/i, terms: ["dungeon", "fantasy house", "rpg npc", "treasure chest"] },
  { test: /\b(tower defense|td)\b/i, terms: ["tower defense", "enemy npc", "path", "turret"] },
  { test: /\b(cafe|restaurant|cooking|kitchen)\b/i, terms: ["cafe", "restaurant", "kitchen", "food"] },
  { test: /\b(beach|island|survival)\b/i, terms: ["island", "beach", "palm tree", "campfire"] },
];

function buildSearchTerms(keyword: string): string[] {
  const base = keyword.trim().replace(/\s+/g, " ");
  const terms = new Set<string>();
  if (base) terms.add(base);
  const tokens = base.split(/\s+/).filter((t) => t.length > 2);
  for (const token of tokens.slice(0, 4)) terms.add(token);
  if (base && !/\broblox\b/i.test(base)) terms.add(`${base} roblox`);
  if (base && !/\bkit\b/i.test(base)) terms.add(`${base} kit`);
  if (base && !/\bmodel\b/i.test(base)) terms.add(`${base} model`);
  for (const alias of QUERY_ALIASES) {
    if (alias.test.test(base)) {
      for (const term of alias.terms) terms.add(term);
    }
  }
  return Array.from(terms).slice(0, 10);
}

async function tryFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BloxSmith/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchToolboxDetails(
  ids: number[],
  category: ToolboxCategory,
  sourceQueryById: Map<number, string>,
): Promise<ToolboxResult[]> {
  const unique = Array.from(new Set(ids)).filter((id) => Number.isFinite(id) && id > 0).slice(0, 120);
  const rows: ToolboxResult[] = [];
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const url = `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${chunk.join(",")}`;
    const json = (await tryFetch(url)) as
      | {
          data?: Array<{
            asset?: {
              id?: number;
              name?: string;
              typeId?: number;
              isEndorsed?: boolean;
              hasScripts?: boolean;
              scriptCount?: number;
              visibilityStatus?: number;
            };
            creator?: { id?: number; name?: string; type?: number; isVerifiedCreator?: boolean };
            voting?: { upVotePercent?: number };
            product?: { price?: number; isFree?: boolean };
            fiatProduct?: {
              published?: boolean;
              purchasable?: boolean;
              isFree?: boolean;
              purchasePrice?: { quantity?: { significand?: number; exponent?: number } };
            };
          }>;
        }
      | null;
    if (!json?.data || !Array.isArray(json.data)) continue;
    for (const item of json.data) {
      const id = item.asset?.id;
      const name = item.asset?.name;
      if (typeof id !== "number" || !name) continue;
      const fiatFree =
        item.fiatProduct?.isFree ??
        (item.fiatProduct?.purchasePrice?.quantity?.significand === 0 || item.fiatProduct?.purchasePrice == null);
      const classicFree = item.product?.isFree ?? (item.product?.price === 0 || item.product?.price == null);
      rows.push({
        id,
        name,
        creatorName: item.creator?.name ?? "",
        creatorType: item.creator?.type === 2 ? "Group" : "User",
        assetType: category,
        free: fiatFree && classicFree && item.fiatProduct?.published !== false && item.fiatProduct?.purchasable !== false,
        sourceQuery: sourceQueryById.get(id),
        endorsed: item.asset?.isEndorsed,
        verifiedCreator: item.creator?.isVerifiedCreator,
        hasScripts: item.asset?.hasScripts,
        scriptCount: item.asset?.scriptCount,
        upVotePercent: item.voting?.upVotePercent,
      });
    }
  }
  return rows;
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
  /\badmin\s*commands?\b/i,
  /\bloader\b/i,
  /\bobfusc/i,
  /\bscript\s*hub\b/i,
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
  if (!isAllowedCreator(r.creatorName)) return "untrusted_creator";
  if ((r.relevance ?? 0) < 0.18) return "low_relevance";
  if ((r.safety ?? 0) < 0.62) return "low_safety";
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

function safetyScore(creatorName: string, name: string, meta?: ToolboxResult): number {
  let s = 0.5;
  const c = (creatorName || "").toLowerCase();
  if (c === "roblox") s += 0.4;
  else if (c) s += 0.18;
  if (meta?.verifiedCreator) s += 0.12;
  if (meta?.endorsed) s += 0.12;
  if (looksLikeJunk(name)) s -= 0.4;
  if (meta?.hasScripts && c !== "roblox") s -= 0.12;
  if (typeof meta?.upVotePercent === "number") {
    if (meta.upVotePercent >= 85) s += 0.08;
    else if (meta.upVotePercent < 60) s -= 0.12;
  }
  if (/\b(pack|kit|low poly|cartoon|classic|mesh|model)\b/i.test(name)) s += 0.08;
  return Math.max(0, Math.min(1, s));
}

function isAllowedCreator(creatorName: string): boolean {
  const c = creatorName.trim();
  if (!c) return false;
  if (looksLikeJunk(c)) return false;
  if (/robux|scam|hack|exploit|admin|loader|virus|infected/i.test(c)) return false;
  return true;
}

function thumbnailFor(id: number): string {
  // Public Roblox thumbnail endpoint — returns a redirect to a CDN image.
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`;
}

/**
 * Search Roblox public toolbox/marketplace for free assets matching `keyword`.
 * Filters to free/public-looking items, rejects junk, and ranks by relevance × safety.
 */
export async function searchRobloxToolbox(
  keyword: string,
  category: ToolboxCategory = "Model",
  limit = 6,
): Promise<{ source: "live" | "fallback" | "none"; results: ToolboxResult[]; searchedTerms: string[]; scanned: number }> {
  const terms = buildSearchTerms(keyword);
  if (terms.length === 0) return { source: "none", results: [], searchedTerms: [], scanned: 0 };
  const catId = CATEGORY_ID[category];
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const activeTerms = terms.slice(0, 8);
  const perPage = Math.max(Math.min(safeLimit * 8, 80), 40);
  const maxPagesPerTerm = safeLimit > 12 ? 3 : 2;

  const enrich = (r: ToolboxResult): ToolboxResult => ({
    ...r,
    thumbnail: r.thumbnail ?? thumbnailFor(r.id),
    relevance: Math.max(relevanceScore(keyword, r.name), relevanceScore(r.sourceQuery ?? keyword, r.name)),
    safety: safetyScore(r.creatorName, r.name, r),
    free: r.free ?? true,
  });

  const rank = (rows: ToolboxResult[]) =>
    rows
      .map(enrich)
      .filter((r) => rejectionReason(r) === null)
      .sort((a, b) => {
        const aTrusted = a.creatorName.trim().toLowerCase() === "roblox" ? 0.12 : 0;
        const bTrusted = b.creatorName.trim().toLowerCase() === "roblox" ? 0.12 : 0;
        return (b.relevance! * 0.58 + b.safety! * 0.42 + bTrusted) - (a.relevance! * 0.58 + a.safety! * 0.42 + aTrusted);
      })
      .slice(0, safeLimit);

  // 1. toolbox-service marketplace endpoint used by Creator Store/Toolbox.
  const liveRows = new Map<number, ToolboxResult>();
  const idsNeedingDetails: number[] = [];
  const sourceQueryById = new Map<number, string>();
  for (const term of activeTerms) {
    const q = encodeURIComponent(term);
    let cursor: string | undefined;
    for (let page = 0; page < maxPagesPerTerm; page += 1) {
      const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const tbUrl = `https://apis.roblox.com/toolbox-service/v1/marketplace/${catId}?keyword=${q}&limit=${perPage}&sortType=2${cursorPart}`;
      const tb = (await tryFetch(tbUrl)) as
        | {
            nextPageCursor?: string;
            data?: Array<{
              id?: number;
              asset?: { id?: number; name?: string; typeId?: number };
              creator?: { name?: string; type?: number };
              product?: { price?: number; isFree?: boolean };
            }>;
          }
        | null;
      if (!tb?.data || !Array.isArray(tb.data)) break;
      for (const row of tb.data) {
        const id = row?.asset?.id ?? row?.id;
        const name = row?.asset?.name;
        if (typeof id !== "number" || liveRows.has(id)) continue;
        sourceQueryById.set(id, term);
        if (!name) {
          idsNeedingDetails.push(id);
          continue;
        }
        const price = row?.product?.price;
        const isFree = row?.product?.isFree ?? (price === 0 || price == null);
        liveRows.set(id, {
          id,
          name,
          creatorName: row?.creator?.name ?? "",
          creatorType: row?.creator?.type === 2 ? "Group" : "User",
          assetType: category,
          free: isFree,
          sourceQuery: term,
        });
      }
      cursor = tb.nextPageCursor;
      if (!cursor) break;
    }
  }

  for (const detail of await fetchToolboxDetails(idsNeedingDetails.slice(0, 240), category, sourceQueryById)) {
    if (!liveRows.has(detail.id)) liveRows.set(detail.id, detail);
  }

  // 2. legacy public catalog endpoint as a wider backup. Roblox can change this
  // without notice, so failures are ignored and the curated fallback still works.
  const legacyCategory = category === "Audio" ? 9 : category === "Decal" ? 8 : category === "Mesh" ? 4 : 6;
  for (const term of activeTerms) {
    const q = encodeURIComponent(term);
    const legacyUrl = `https://search.roblox.com/catalog/json?CatalogContext=2&Category=${legacyCategory}&Keyword=${q}&SortType=3&ResultsPerPage=${perPage}`;
    const legacy = (await tryFetch(legacyUrl)) as
      | Array<{ AssetId?: number; Name?: string; Creator?: string; CreatorName?: string; Price?: number | null; Sales?: number; AssetTypeID?: number }>
      | null;
    if (!Array.isArray(legacy)) continue;
    for (const row of legacy) {
      const id = row?.AssetId;
      const name = row?.Name;
      if (typeof id !== "number" || !name || liveRows.has(id)) continue;
      liveRows.set(id, {
        id,
        name,
        creatorName: row.CreatorName ?? row.Creator ?? "",
        creatorType: "User",
        assetType: category,
        free: row.Price === 0 || row.Price == null,
        sourceQuery: term,
      });
    }
  }

  if (liveRows.size > 0) {
    const ranked = rank(Array.from(liveRows.values()));
    if (ranked.length > 0) return { source: "live", results: ranked, searchedTerms: activeTerms, scanned: liveRows.size };
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
  if (fb.length > 0) return { source: "fallback", results: fb.slice(0, safeLimit), searchedTerms: activeTerms, scanned: liveRows.size };
  return { source: "none", results: [], searchedTerms: activeTerms, scanned: liveRows.size };
}
