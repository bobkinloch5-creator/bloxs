// Server-only helper: search Roblox's public toolbox/marketplace for free assets
// matching a keyword. Returns a small list of { id, name, creatorName, creatorType,
// thumbnail, relevance, safety }.
// Best-effort â€” Roblox occasionally changes these endpoints; we try the public
// Creator Store/Toolbox search paths and return "none" when no safe live result
// is available. We do not invent or silently substitute hardcoded model ids.

export interface ToolboxResult {
  id: number;
  name: string;
  creatorName: string;
  creatorType: string;
  assetType?: string;
  thumbnail?: string;
  relevance?: number; // 0..1 â€” how well the asset name matches the query
  safety?: number;    // 0..1 â€” heuristic safety/quality score (creator, name junk filter)
  reason?: string;
  free?: boolean;
  sourceQuery?: string;
  endorsed?: boolean;
  verifiedCreator?: boolean;
  hasScripts?: boolean;
  scriptCount?: number;
  upVotePercent?: number;
  score?: number;
  qualityTier?: "excellent" | "good" | "usable";
  signals?: string[];
  fallbackIds?: number[];
  verificationStatus?: "search_verified" | "metadata_verified" | "studio_verified_pending";
  librarySource?: "live_creator_store" | "verified_live_search";
  category?: string;
  tags?: string[];
  recentlyUsed?: boolean;
  insertPayload?: {
    asset_id: number;
    fallback_ids?: number[];
    asset_name?: string;
    creator_name?: string;
    source_query?: string;
    category?: string;
    tags?: string[];
    preview?: Record<string, unknown>;
    toolbox_only?: boolean;
    free_only?: boolean;
    no_scripts?: boolean;
    disable_procedural_fallback?: boolean;
  };
}

export type ToolboxCategory = "Model" | "Audio" | "Decal" | "Mesh";
export interface ToolboxSetRequest {
  label: string;
  keyword: string;
  category?: ToolboxCategory;
  limit?: number;
  required?: boolean;
}

export interface ToolboxSetResult extends ToolboxSetRequest {
  source: "live" | "fallback" | "none";
  results: ToolboxResult[];
  searchedTerms: string[];
  scanned: number;
  best?: ToolboxResult;
  status: "ready" | "fallback" | "missing";
}

const CATEGORY_ID: Record<ToolboxCategory, number> = {
  Model: 10,
  Audio: 12,
  Decal: 11,
  Mesh: 13,
};

const V2_SEARCH_CATEGORY: Record<ToolboxCategory, string> = {
  Model: "Model",
  Audio: "Audio",
  Decal: "Image",
  Mesh: "Mesh",
};

const QUERY_ALIASES: Array<{ test: RegExp; terms: string[] }> = [
  { test: /\b(obby|parkour)\b/i, terms: ["obby kit", "parkour kit", "obstacle course", "checkpoint obby"] },
  { test: /\b(tycoon)\b/i, terms: ["tycoon kit", "tycoon building", "conveyor", "dropper", "cash collector"] },
  { test: /\b(city|town|roleplay|rp)\b/i, terms: ["city kit", "city building", "road", "street light", "sidewalk", "storefront", "traffic light"] },
  { test: /\b(forest|woods|jungle)\b/i, terms: ["tree", "pine tree", "forest", "rock", "bush", "log cabin", "campfire"] },
  { test: /\b(car|cars|vehicle|vehicles|racing|race)\b/i, terms: ["car", "vehicle", "race car", "sports car", "kart", "road"] },
  { test: /\b(road|street|highway)\b/i, terms: ["road", "street", "city road", "asphalt road"] },
  { test: /\b(house|building|shop|store|mall|lobby)\b/i, terms: ["building", "house", "shop", "storefront", "lobby", "low poly building"] },
  { test: /\b(pet|pets|egg|eggs)\b/i, terms: ["pet", "pet simulator", "egg", "dog", "cat", "pet egg"] },
  { test: /\b(zombie|enemy|monster|npc|vendor|quest giver)\b/i, terms: ["npc", "zombie", "monster", "dummy", "vendor", "quest npc"] },
  { test: /\b(sword|weapon|gun|blaster|bow|staff)\b/i, terms: ["weapon", "sword", "gun", "blaster", "bow", "classic weapon"] },
  { test: /\b(lobby|spawn|hub)\b/i, terms: ["lobby", "spawn", "hub", "welcome center"] },
  { test: /\b(horror|escape|haunted)\b/i, terms: ["horror house", "haunted house", "dark corridor", "flashlight"] },
  { test: /\b(rpg|dungeon|quest|fantasy)\b/i, terms: ["dungeon", "fantasy house", "rpg npc", "treasure chest", "medieval props"] },
  { test: /\b(tower defense|td)\b/i, terms: ["tower defense", "enemy npc", "path", "turret", "tower"] },
  { test: /\b(cafe|restaurant|cooking|kitchen)\b/i, terms: ["cafe", "restaurant", "kitchen", "food"] },
  { test: /\b(beach|island|survival)\b/i, terms: ["island", "beach", "palm tree", "campfire"] },
  { test: /\b(furniture|chair|table|bed|sofa|couch)\b/i, terms: ["furniture pack", "chair", "table", "sofa", "bed"] },
  { test: /\b(sci[-\s]?fi|space|alien|laser)\b/i, terms: ["sci fi kit", "space station", "laser gun", "alien"] },
  { test: /\b(castle|medieval|village)\b/i, terms: ["castle", "medieval village", "medieval house", "stone wall"] },
  { test: /\b(school|classroom)\b/i, terms: ["school", "classroom", "desk", "locker"] },
  { test: /\b(police|jail|prison)\b/i, terms: ["police car", "police station", "jail", "prison"] },
];

const ASSET_LIBRARY_PROFILES: Array<{ category: string; test: RegExp; tags: string[]; searchTerms: string[] }> = [
  { category: "Weapons", test: /\b(pistol|gun|rifle|sword|bow|weapon|blaster|laser|staff)\b/i, tags: ["weapon", "tool", "combat"], searchTerms: ["pistol", "rifle", "sword", "bow", "laser gun"] },
  { category: "Vehicles", test: /\b(car|truck|vehicle|police car|race|racing|plane|boat|kart)\b/i, tags: ["vehicle", "transport"], searchTerms: ["sports car", "police car", "truck", "plane", "boat"] },
  { category: "Characters", test: /\b(npc|zombie|monster|shopkeeper|pet|enemy|boss|dummy)\b/i, tags: ["character", "npc"], searchTerms: ["npc", "zombie", "monster", "shopkeeper", "pet"] },
  { category: "Buildings", test: /\b(house|building|police station|hospital|shop|store|castle|skyscraper|town)\b/i, tags: ["building", "map"], searchTerms: ["house", "police station", "hospital", "shop building", "castle"] },
  { category: "Nature", test: /\b(tree|forest|rock|grass|mountain|flower|bush|nature)\b/i, tags: ["nature", "environment"], searchTerms: ["tree", "rock", "grass", "mountain", "flowers"] },
  { category: "Maps", test: /\b(city|obby|island|forest|dungeon|arena|map|world|tycoon|simulator)\b/i, tags: ["map", "world"], searchTerms: ["city kit", "obby kit", "island map", "dungeon", "battle arena"] },
  { category: "Props", test: /\b(crate|barrel|sign|furniture|lamp|bench|table|chair|prop)\b/i, tags: ["prop", "decor"], searchTerms: ["crate", "barrel", "sign", "furniture", "lamp"] },
  { category: "Gameplay", test: /\b(checkpoint|coin|door|button|portal|spawn|reward)\b/i, tags: ["gameplay", "interactive"], searchTerms: ["checkpoint", "coin", "door", "button", "portal"] },
  { category: "Effects", test: /\b(fire|smoke|explosion|magic|particle|effect)\b/i, tags: ["effect", "vfx"], searchTerms: ["fire effect", "smoke", "explosion", "magic", "particles"] },
];

const recentAssetsByKey = new Map<string, number[]>();
const RECENT_ASSET_LIMIT = 18;

const STOP_WORDS = new Set([
  "a", "an", "and", "asset", "assets", "for", "free", "game", "kit", "make", "model", "models",
  "of", "pack", "roblox", "safe", "the", "to", "with",
]);

function buildSearchTerms(keyword: string): string[] {
  const base = keyword.trim().replace(/\s+/g, " ");
  const terms = new Set<string>();
  if (base) terms.add(base);
  const tokens = base.split(/\s+/).filter((t) => t.length > 2);
  for (const token of tokens.filter((t) => !STOP_WORDS.has(t.toLowerCase())).slice(0, 5)) terms.add(token);
  if (base && !/\broblox\b/i.test(base)) terms.add(`${base} roblox`);
  if (base && !/\bkit\b/i.test(base)) terms.add(`${base} kit`);
  if (base && !/\bmodel\b/i.test(base)) terms.add(`${base} model`);
  for (const alias of QUERY_ALIASES) {
    if (alias.test.test(base)) {
      for (const term of alias.terms) terms.add(term);
    }
  }
  for (const profile of ASSET_LIBRARY_PROFILES) {
    if (profile.test.test(base)) {
      for (const term of profile.searchTerms) terms.add(term);
    }
  }
  return Array.from(terms).slice(0, 10);
}

function libraryProfileFor(keyword: string, assetName?: string) {
  const haystack = `${keyword} ${assetName ?? ""}`;
  return ASSET_LIBRARY_PROFILES.find((profile) => profile.test.test(haystack)) ?? {
    category: "Models",
    tags: ["toolbox", "model"],
    searchTerms: [],
    test: /\b\B/,
  };
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
  /\breupload\b/i,
  /\bleaked\b/i,
  /[ðŸ’°ðŸ¤‘ðŸ’Ž]/u,
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
  if (r.hasScripts && r.creatorName.trim().toLowerCase() !== "roblox" && (r.scriptCount ?? 1) > 3) return "script_heavy";
  return null;
}

function relevanceScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase();
  if (!q || !n) return 0;
  if (n === q) return 1;
  if (n.includes(q)) return 0.85;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => n.includes(t)).length;
  const orderedBonus = tokens.length > 1 && n.includes(tokens.join(" ")) ? 0.15 : 0;
  return Math.min(1, hits / tokens.length + orderedBonus);
}

function safetyScore(creatorName: string, name: string, meta?: ToolboxResult): number {
  let s = 0.5;
  const c = (creatorName || "").toLowerCase();
  if (c === "roblox") s += 0.4;
  else if (c) s += 0.18;
  if (meta?.verifiedCreator) s += 0.12;
  if (meta?.endorsed) s += 0.12;
  if (looksLikeJunk(name)) s -= 0.4;
  if (meta?.hasScripts && c !== "roblox") s -= meta.scriptCount && meta.scriptCount > 3 ? 0.22 : 0.12;
  if (typeof meta?.upVotePercent === "number") {
    if (meta.upVotePercent >= 85) s += 0.08;
    else if (meta.upVotePercent < 60) s -= 0.12;
  }
  if (/\b(pack|kit|low poly|cartoon|classic|mesh|model)\b/i.test(name)) s += 0.08;
  return Math.max(0, Math.min(1, s));
}

function qualitySignals(r: ToolboxResult): string[] {
  const signals: string[] = [];
  if (r.creatorName.trim().toLowerCase() === "roblox") signals.push("Roblox creator");
  if (r.verifiedCreator) signals.push("verified creator");
  if (r.endorsed) signals.push("endorsed");
  if (r.free !== false) signals.push("free/public");
  if (!r.hasScripts) signals.push("no scripts reported");
  else if ((r.scriptCount ?? 0) <= 3) signals.push("low script count");
  if ((r.relevance ?? 0) >= 0.7) signals.push("strong name match");
  return signals.slice(0, 5);
}

function qualityTier(score: number): "excellent" | "good" | "usable" {
  if (score >= 0.86) return "excellent";
  if (score >= 0.72) return "good";
  return "usable";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isAllowedCreator(creatorName: string): boolean {
  const c = creatorName.trim();
  if (!c) return false;
  if (looksLikeJunk(c)) return false;
  if (/robux|scam|hack|exploit|admin|loader|virus|infected/i.test(c)) return false;
  return true;
}

function thumbnailFor(id: number): string {
  // Public Roblox thumbnail endpoint â€” returns a redirect to a CDN image.
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`;
}

/**
 * Search Roblox public toolbox/marketplace for free assets matching `keyword`.
 * Filters to free/public-looking items, rejects junk, and ranks by relevance Ã— safety.
 */
export async function validateAssetIds(ids: number[]): Promise<{ valid: number[]; blocked: number[]; reasons: Record<number, string> }> {
  const valid: number[] = [], blocked: number[] = [], reasons: Record<number, string> = {};
  if (ids.length === 0) return { valid, blocked, reasons };
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${chunk.join(",")}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const json = res.ok ? (await res.json()) as any : null;
      const returnedIds = new Set<number>();
      if (json?.data && Array.isArray(json.data)) {
        for (const item of json.data) {
          const id = item.asset?.id; if (typeof id !== "number") continue;
          returnedIds.add(id);
          if (typeof item.asset?.visibilityStatus === "number" && item.asset.visibilityStatus !== 0) { blocked.push(id); reasons[id] = "visibility_restricted"; continue; }
          const qty = item.fiatProduct?.purchasePrice?.quantity;
          const fiatFree = item.fiatProduct?.isFree ?? (qty == null || qty.significand === 0);
          const classicFree = item.product?.isFree ?? (item.product?.price === 0 || item.product?.price == null);
          if (!fiatFree || !classicFree) { blocked.push(id); reasons[id] = "paid_asset"; continue; }
          if (item.fiatProduct?.published === false || item.fiatProduct?.purchasable === false) { blocked.push(id); reasons[id] = "not_published"; continue; }
          valid.push(id);
        }
      }
      for (const id of chunk) { if (!returnedIds.has(id)) { blocked.push(id); reasons[id] = "not_found_or_private"; } }
    } catch { for (const id of chunk) valid.push(id); }
  }
  return { valid, blocked, reasons };
}
export async function searchRobloxToolbox(
  keyword: string,
  category: ToolboxCategory = "Model",
  limit = 6,
): Promise<{ source: "live" | "fallback" | "none"; results: ToolboxResult[]; searchedTerms: string[]; scanned: number }> {
  const terms = buildSearchTerms(keyword);
  if (terms.length === 0) return { source: "none", results: [], searchedTerms: [], scanned: 0 };
  const catId = CATEGORY_ID[category];
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const usageKey = `${category}:${keyword.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const recentIds = new Set(recentAssetsByKey.get(usageKey) ?? []);
  const activeTerms = terms.slice(0, 8);
  const perPage = Math.max(Math.min(safeLimit * 8, 80), 40);
  const maxPagesPerTerm = safeLimit > 12 ? 3 : 2;

  const enrich = (r: ToolboxResult): ToolboxResult => {
    const relevance = Math.max(relevanceScore(keyword, r.name), relevanceScore(r.sourceQuery ?? keyword, r.name));
    const safety = safetyScore(r.creatorName, r.name, { ...r, relevance });
    const trustedBoost = r.creatorName.trim().toLowerCase() === "roblox" ? 0.08 : 0;
    const recentlyUsed = recentIds.has(r.id);
    const reusePenalty = recentlyUsed ? 0.08 : 0;
    const score = Math.max(0, Math.min(1, relevance * 0.56 + safety * 0.44 + trustedBoost - reusePenalty));
    const profile = libraryProfileFor(keyword, r.name);
    const row = {
      ...r,
      thumbnail: r.thumbnail ?? thumbnailFor(r.id),
      relevance,
      safety,
      score,
      qualityTier: qualityTier(score),
      free: r.free ?? true,
      category: profile.category,
      tags: Array.from(new Set([...(r.tags ?? []), ...profile.tags, "BloxSmithAsset"])).slice(0, 8),
      verificationStatus: "studio_verified_pending" as const,
      librarySource: "verified_live_search" as const,
      recentlyUsed,
    };
    return { ...row, signals: qualitySignals(row) };
  };

  const rank = (rows: ToolboxResult[]) => {
    const ranked = rows
      .map(enrich)
      .filter((r) => rejectionReason(r) === null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (ranked.length === 0) return [];

    // Avoid returning the exact same top asset forever while staying inside the
    // best safe/free matches. The first result rotates through a small elite
    // band, and fallback_ids still contain the neighboring good candidates.
    const topScore = ranked[0]?.score ?? 0;
    const topBand = ranked
      .slice(0, Math.min(8, ranked.length))
      .filter((row, index) =>
        index < Math.min(4, ranked.length) ||
        ((topScore - (row.score ?? 0)) <= 0.08 && (row.safety ?? 0) >= 0.7 && (row.relevance ?? 0) >= 0.3)
      );
    const rotateEveryFiveMinutes = Math.floor(Date.now() / (5 * 60 * 1000));
    const seed = stableHash(`${keyword}|${category}|${rotateEveryFiveMinutes}`);
    const offset = topBand.length > 1 ? seed % topBand.length : 0;
    const rotatedTop = topBand.slice(offset).concat(topBand.slice(0, offset));
    const topIds = new Set(topBand.map((row) => row.id));
    const diversified = [
      ...rotatedTop,
      ...ranked.filter((row) => !topIds.has(row.id)),
    ].slice(0, safeLimit);

    const chosenIds = diversified.slice(0, Math.min(4, diversified.length)).map((row) => row.id);
    recentAssetsByKey.set(usageKey, Array.from(new Set([...chosenIds, ...(recentAssetsByKey.get(usageKey) ?? [])])).slice(0, RECENT_ASSET_LIMIT));

    return diversified.map((row) => {
      const fallbackIds = diversified
        .filter((candidate) => candidate.id !== row.id && candidate.assetType === row.assetType)
        .slice(0, 4)
        .map((candidate) => candidate.id);
      const preview = {
        id: row.id,
        name: row.name,
        creatorName: row.creatorName,
        category: row.category,
        thumbnail: row.thumbnail,
        qualityTier: row.qualityTier,
        safety: row.safety,
        relevance: row.relevance,
        sourceQuery: row.sourceQuery,
        verificationStatus: row.verificationStatus,
        tags: row.tags,
      };
      return {
        ...row,
        fallbackIds,
        insertPayload: {
          asset_id: row.id,
          ...(fallbackIds.length ? { fallback_ids: fallbackIds } : {}),
          asset_name: row.name,
          creator_name: row.creatorName,
          source_query: row.sourceQuery,
          category: row.category,
          tags: row.tags,
          preview,
          toolbox_only: true,
          free_only: true,
          no_scripts: true,
          disable_procedural_fallback: true,
        },
      };
    });
  };

  // 1. Current Creator Store / Toolbox search endpoint observed on
  // create.roblox.com/store/category/3d. It works as an unauthenticated GET
  // when searchCategoryType is present.
  const liveRows = new Map<number, ToolboxResult>();
  const idsNeedingDetails: number[] = [];
  const sourceQueryById = new Map<number, string>();
  for (const term of activeTerms) {
    const params = new URLSearchParams({
      keyword: term,
      searchCategoryType: V2_SEARCH_CATEGORY[category],
      limit: String(perPage),
      sortCategory: "Relevance",
      sortDirection: "Desc",
    });
    let pageToken: string | undefined;
    for (let page = 0; page < maxPagesPerTerm; page += 1) {
      if (pageToken) params.set("pageToken", pageToken);
      else params.delete("pageToken");
      const v2Url = `https://apis.roblox.com/toolbox-service/v2/assets:search?${params.toString()}`;
      const v2 = (await tryFetch(v2Url)) as
        | {
            nextPageToken?: string;
            creatorStoreAssets?: Array<{
              voting?: { upVotePercent?: number };
              creator?: { creator?: string; name?: string; verified?: boolean };
              creatorStoreProduct?: {
                purchasable?: boolean;
                purchasePrice?: { quantity?: { significand?: number; exponent?: number } };
              };
              asset?: {
                id?: number;
                name?: string;
                assetTypeId?: number;
                hasScripts?: boolean;
                scriptCount?: number;
                instanceCounts?: { script?: number };
                capabilities?: { shouldSandbox?: boolean };
              };
            }>;
          }
        | null;
      if (!v2?.creatorStoreAssets || !Array.isArray(v2.creatorStoreAssets)) break;
      for (const row of v2.creatorStoreAssets) {
        const id = row.asset?.id;
        const name = row.asset?.name;
        if (typeof id !== "number" || !name || liveRows.has(id)) continue;
        const quantity = row.creatorStoreProduct?.purchasePrice?.quantity;
        const isFree = quantity == null || quantity.significand === 0;
        const creatorRef = row.creator?.creator ?? "";
        sourceQueryById.set(id, term);
        liveRows.set(id, {
          id,
          name,
          creatorName: row.creator?.name ?? "",
          creatorType: creatorRef.startsWith("group/") ? "Group" : "User",
          assetType: category,
          free: isFree && row.creatorStoreProduct?.purchasable !== false,
          sourceQuery: term,
          verifiedCreator: row.creator?.verified,
          hasScripts: row.asset?.hasScripts ?? ((row.asset?.instanceCounts?.script ?? 0) > 0),
          scriptCount: row.asset?.scriptCount ?? row.asset?.instanceCounts?.script,
          upVotePercent: row.voting?.upVotePercent,
        });
      }
      pageToken = v2.nextPageToken;
      if (!pageToken) break;
    }
  }

  // 2. Older toolbox-service marketplace endpoint.
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

  const detailIds = Array.from(new Set([...Array.from(liveRows.keys()), ...idsNeedingDetails])).slice(0, 240);
  for (const detail of await fetchToolboxDetails(detailIds, category, sourceQueryById)) {
    const existing = liveRows.get(detail.id);
    liveRows.set(detail.id, { ...existing, ...detail, sourceQuery: existing?.sourceQuery ?? detail.sourceQuery });
  }

  // 3. Legacy public catalog endpoint as a wider backup. Roblox can change this
  // without notice, so failures are ignored.
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

  return { source: "none", results: [], searchedTerms: activeTerms, scanned: liveRows.size };
}

export async function searchRobloxToolboxSet(
  requests: ToolboxSetRequest[],
  defaultLimit = 8,
): Promise<{
  source: "live" | "partial" | "fallback" | "none";
  requests: ToolboxSetResult[];
  readyCount: number;
  missingRequired: string[];
  insertionRule: string;
}> {
  const normalized = requests
    .filter((r) => r && typeof r.keyword === "string" && r.keyword.trim())
    .slice(0, 16)
    .map((r) => ({
      label: String(r.label || r.keyword).trim().slice(0, 60),
      keyword: r.keyword.trim().slice(0, 120),
      category: r.category ?? "Model",
      limit: Math.max(1, Math.min(r.limit ?? defaultLimit, 24)),
      required: r.required !== false,
    }));

  const rows = await Promise.all(
    normalized.map(async (request): Promise<ToolboxSetResult> => {
      const out = await searchRobloxToolbox(request.keyword, request.category, request.limit);
      const results = out.results.filter((r) => r.free !== false && (r.safety ?? 0) >= 0.62 && (r.relevance ?? 0) >= 0.18);
      return {
        ...request,
        source: out.source,
        results,
        searchedTerms: out.searchedTerms,
        scanned: out.scanned,
        best: results[0],
        status: results.length > 0 ? (out.source === "fallback" ? "fallback" : "ready") : "missing",
      };
    }),
  );

  const readyCount = rows.filter((r) => r.results.length > 0).length;
  const missingRequired = rows.filter((r) => r.required && r.results.length === 0).map((r) => r.label);
  const liveCount = rows.filter((r) => r.source === "live" && r.results.length > 0).length;
  const fallbackCount = rows.filter((r) => r.source === "fallback" && r.results.length > 0).length;
  const source =
    readyCount === 0 ? "none" :
    liveCount === rows.length ? "live" :
    fallbackCount === readyCount ? "fallback" :
    "partial";

  return {
    source,
    requests: rows,
    readyCount,
    missingRequired,
    insertionRule:
      "For each asset category, choose request.best or another high score result. The returned list is safely varied among top matches, so do not force the same old asset every time. Emit insert_asset with payload.asset_id from result.id, payload.fallback_ids from result.fallbackIds, and copy result.insertPayload metadata including preview, asset_name, creator_name, category, tags, toolbox_only/free_only/no_scripts. Add folder_name, position, rotation/yaw, and scale. If a required request is missing, do not fake it with parts; ask before fallback geometry.",
  };
}

