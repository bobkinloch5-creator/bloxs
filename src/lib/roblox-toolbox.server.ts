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

// Short-lived in-memory cache of search results to make repeat AI prompts instant.
const SEARCH_CACHE_TTL_MS = 10 * 60_000; // 10 min — Toolbox results don't churn fast.
type SearchOut = { source: "live" | "fallback" | "none"; results: ToolboxResult[]; searchedTerms: string[]; scanned: number; page: number; hasMore: boolean };
const searchCache = new Map<string, { at: number; value: SearchOut }>();
function pruneRuntimeBlocked(value: SearchOut): SearchOut {
  const allowed = value.results.filter((r) => !isAssetBlacklisted(r.id) && !isLikelyCloudAssetId(r.id));
  const allowedIds = new Set(allowed.map((r) => r.id));
  const results = allowed.map((r) => {
    const fallbackIds = (r.fallbackIds ?? []).filter((id) => allowedIds.has(id) && !isAssetBlacklisted(id));
    return {
      ...r,
      fallbackIds,
      insertPayload: r.insertPayload
        ? { ...r.insertPayload, fallback_ids: fallbackIds }
        : r.insertPayload,
    };
  });
  return { ...value, results };
}
function cacheGet(key: string): SearchOut | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SEARCH_CACHE_TTL_MS) { searchCache.delete(key); return null; }
  return pruneRuntimeBlocked(hit.value);
}
function cacheSet(key: string, value: SearchOut) {
  if (searchCache.size > 200) searchCache.clear();
  searchCache.set(key, { at: Date.now(), value });
}

const STOP_WORDS = new Set([
  "a", "an", "and", "asset", "assets", "for", "free", "game", "kit", "make", "model", "models",
  "of", "pack", "roblox", "safe", "the", "to", "with",
]);

function buildSearchTerms(keyword: string, singleAssetOnly = false): string[] {
  const base = keyword.trim().replace(/\s+/g, " ");
  const terms = new Set<string>();
  if (base) terms.add(base);
  const tokens = base.split(/\s+/).filter((t) => t.length > 2);
  for (const token of tokens.filter((t) => !STOP_WORDS.has(t.toLowerCase())).slice(0, 5)) terms.add(token);
  if (base && !/\broblox\b/i.test(base)) terms.add(`${base} roblox`);
  if (!singleAssetOnly && base && !/\bkit\b/i.test(base)) terms.add(`${base} kit`);
  if (base && !/\bmodel\b/i.test(base)) terms.add(`${base} model`);
  if (singleAssetOnly) return Array.from(terms).slice(0, 8);
  for (const alias of QUERY_ALIASES) {
    if (alias.test.test(base)) {
      for (const term of alias.terms) {
        if (!singleAssetOnly || !/\b(pack|kit|bundle|collection|set|props?|library|showcase|demo|mega|template)\b/i.test(term)) terms.add(term);
      }
    }
  }
  for (const profile of ASSET_LIBRARY_PROFILES) {
    if (profile.test.test(base)) {
      for (const term of profile.searchTerms) {
        if (!singleAssetOnly || !/\b(pack|kit|bundle|collection|set|props?|library|showcase|demo|mega|template)\b/i.test(term)) terms.add(term);
      }
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
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "BloxSmith/1.0",
    };
    // Attach Roblox Open Cloud key when present. Roblox honors `x-api-key` on
    // apis.roblox.com endpoints and lifts anonymous rate limits, so authenticated
    // callers get more stable Creator Store / Toolbox search results.
    const key = process.env.ROBLOX_OPEN_CLOUD_API_KEY;
    if (key) {
      try {
        if (/(^|\.)apis\.roblox\.com$/i.test(new URL(url).hostname)) {
          headers["x-api-key"] = key;
        }
      } catch { /* ignore bad URLs */ }
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
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

// Names that indicate a multi-asset bundle / prop library / showcase scene.
// These are no longer rejected for single-asset requests because real Roblox
// Toolbox uploads are often package containers. The Studio plugin recursively
// selects one usable Model from inside the package and only rejects assets that
// contain no Models at all.
const PACK_PATTERNS = [
  /\bpacks?\b/i,
  /\bkits?\b/i,
  /\bbundles?\b/i,
  /\bcollections?\b/i,
  /\bsets?\b/i,
  /\bprops?\b/i,
  /\bassets?\b/i,
  /\bdecor(ations?)?\b/i,
  /\bfurnitures?\b/i,
  /\blibrary\b/i,
  /\bshowcase\b/i,
  /\bdemo\b/i,
  /\bmega\b/i,
  /\btemplate\b/i,
  /\bstarter\s*(place|game|kit)\b/i,
  // Extra patterns found in real search results:
  /\bsound\s*kit\b/i,
  /\bmusic\s*kit\b/i,
  /\bface\s*pack\b/i,
  /\btexture\s*kit\b/i,
  /\blighting\s*kit\b/i,
  /\begg\s*pets?\s*kit\b/i,
  /\brigs?\s*(kit|pack)\b/i,
  /\bmesh\s*(kit|pack)\b/i,
  /\bclassic\s*build(ing)?\s*kit\b/i,
  /\bstud\s*surface\b/i,
  /\bold\s*roblox\s*(blocks?|kit)\b/i,
];

export function looksLikePack(name: string): boolean {
  if (!name) return false;
  return PACK_PATTERNS.some((re) => re.test(name));
}

// Single-asset intent: user asked for ONE specific object, not a pack.
const SINGLE_ASSET_NOUNS = /\b(house|cabin|hut|mansion|cottage|farmhouse|castle|fortress|keep|citadel|palace|throne|temple|church|windmill|lighthouse|hospital|school|bank|cafe|store|car|truck|vehicle|motorcycle|bike|kart|helicopter|spaceship|hoverboard|tree|rock|boulder|chair|table|couch|sofa|bed|lamp|sword|katana|pistol|gun|rifle|shotgun|bow|weapon|npc|zombie|skeleton|dragon|robot|alien|knight|wizard|guard|dog|cat|pet|door|sign|chest|barrel|crate|building|shop|tower|boat|plane|bench|fence|wall|window|flower|bush|statue|fountain|cannon|hat|coin|gem|part|brick|block|sphere|cube|wedge|ball|spawn|checkpoint|portal|ladder|stair|stairs|bridge|road|path|torch|banner|flag|key|potion|shield|helmet|armor|mask|backpack|bag|box|rocket|missile|bomb|mine|trap|platform|switch|lever)\b/i;
const SINGLE_SCRIPT_NOUNS = /\b(script|serverscript|localscript|modulescript|remote|remoteevent|remotefunction|handler)\b/i;
const SINGLE_UI_NOUNS = /\b(button|label|textlabel|textbox|frame|screengui|gui|panel|hud|menu|popup|notification|dialog|icon|imagelabel|imagebutton|slider|toggle|checkbox|dropdown)\b/i;
const PACK_KEYWORDS = /\b(pack|kit|bundle|collection|set|props?|library|showcase|demo|mega|template|full\s*map|full\s*game|full\s*system|map|world|entire\s+game|whole\s+game|tycoon|obby|simulator|neighborhood|village|city|town|arena|dungeon)\b/i;
const QUANTITY_ONE = /\b(1|one|single|just|only)\b/i;
const ARTICLE_A = /\b(a|an)\s+/i;
const MAX_CLASSIC_INSERTSERVICE_ASSET_ID = 100_000_000_000;

function isLikelyCloudAssetId(id: number): boolean {
  return Number.isFinite(id) && id > MAX_CLASSIC_INSERTSERVICE_ASSET_ID;
}

function hasPositivePackIntent(prompt: string): boolean {
  for (const match of prompt.matchAll(new RegExp(PACK_KEYWORDS.source, "gi"))) {
    const before = prompt.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
    if (/\b(no|not|without|don'?t|do\s+not|never|unless)\b/i.test(before)) continue;
    return true;
  }
  return false;
}

export type NarrowScope = "single_asset" | "single_script" | "single_ui" | null;

// Detects narrow single-item requests so the pipeline builds ONLY that one thing.
// "one house" → single_asset, "add a button" → single_ui, "make me one script that ..." → single_script.
// Broad requests ("build a tycoon", "make a full game") return null → full pipeline.
export function detectNarrowScopeIntent(prompt: string): NarrowScope {
  if (!prompt) return null;
  const p = prompt.toLowerCase().trim();
  if (hasPositivePackIntent(p)) return null;
  const tokens = p.split(/\s+/);
  const short = tokens.length <= 14;
  const hasOne = QUANTITY_ONE.test(p) || ARTICLE_A.test(p);
  // UI takes precedence — "one gui button" is UI, not a physical asset.
  if (SINGLE_UI_NOUNS.test(p) && (hasOne || short)) return "single_ui";
  if (SINGLE_SCRIPT_NOUNS.test(p) && (hasOne || short)) return "single_script";
  if (SINGLE_ASSET_NOUNS.test(p) && (hasOne || short)) return "single_asset";
  if (tokens.length <= 3) {
    if (SINGLE_UI_NOUNS.test(p)) return "single_ui";
    if (SINGLE_SCRIPT_NOUNS.test(p)) return "single_script";
    if (SINGLE_ASSET_NOUNS.test(p)) return "single_asset";
  }
  // Generic single-asset fallback: any short "add/insert/give me/get/spawn/drop
  // a <noun>" phrasing counts as a Toolbox single-asset ask even when the noun
  // isn't in SINGLE_ASSET_NOUNS (spaceships, dragons, hoverboards, mailboxes,
  // arcade machines — anything the user might want from Toolbox).
  const genericSingle = /^(?:please\s+)?(?:add|insert|give\s+me|get\s+me|get|spawn|drop|place|put|bring)\s+(?:me\s+)?(?:a|an|one|1|just\s+one)\s+([a-z][a-z0-9\s'-]{1,40})$/i;
  if (short && genericSingle.test(p)) return "single_asset";
  // Bare noun phrase like "spaceship" or "medieval dragon" (≤4 word tokens,
  // letters only, no script/UI cue) also counts as a single-asset ask.
  if (tokens.length <= 4 && /^[a-z][a-z0-9\s-]*$/i.test(p) && !SINGLE_SCRIPT_NOUNS.test(p) && !SINGLE_UI_NOUNS.test(p)) {
    return "single_asset";
  }
  return null;
}

export function detectSingleAssetIntent(prompt: string): boolean {
  return detectNarrowScopeIntent(prompt) === "single_asset";
}

function looksLikeJunk(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (name.length > 80) return true;
  // mostly symbols / emoji
  const alphanum = name.replace(/[^a-z0-9 ]/gi, "").trim();
  if (alphanum.length < Math.max(3, Math.floor(name.length * 0.4))) return true;
  return JUNK_PATTERNS.some((re) => re.test(name));
}

function rejectionReason(r: ToolboxResult, opts: { strict?: boolean } = {}): string | null {
  if (isLikelyCloudAssetId(r.id)) return "cloud_asset_not_insertservice_compatible";
  if (r.free === false) return "not_free";
  if (looksLikeJunk(r.name)) return "suspicious_name";
  if (!isAllowedCreator(r.creatorName)) return "untrusted_creator";
  // Lowered from 0.18 → 0.10: partial-match results are still usable.
  if ((r.relevance ?? 0) < 0.10) return "low_relevance";
  // Lowered from 0.62 → 0.50: assets with a few helper scripts or lower vote
  // counts are still insertable; the plugin strips scripts server-side anyway.
  if ((r.safety ?? 0) < 0.50) return "low_safety";
  const isRoblox = r.creatorName.trim().toLowerCase() === "roblox";
  // Do not reject pack/kit-style names here. Many valid Toolbox assets are
  // containers, and plugin-side extraction now chooses one nested Model safely.
  // Strict mode (single-asset insert): only reject truly script-heavy models.
  // We do NOT reject on hasScripts alone — many legitimate Roblox Toolbox assets
  // include helper scripts. The plugin-side no_scripts/strip_scripts flags handle them.
  if (opts.strict) {
    if (!isRoblox && (r.scriptCount ?? 0) > 5) return "too_many_scripts";
  }
  // Non-strict: block only clearly script-heavy third-party assets.
  if (!isRoblox && (r.scriptCount ?? 0) > 8) return "script_heavy";
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
  // Fail-open: if the Toolbox API didn't return a creator name, don't block the
  // asset — just let it through. Many valid Creator Store assets omit it.
  if (!c) return true;
  if (looksLikeJunk(c)) return false;
  if (/robux|scam|hack|exploit|admin|loader|virus|infected/i.test(c)) return false;
  return true;
}

function thumbnailFor(id: number): string {
  // Placeholder — resolved to a real CDN URL by resolveThumbnails() before we
  // return results to the client. The old asset-thumbnail endpoint 302s to a
  // sign-in page in some regions, so we no longer link to it directly.
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=420&height=420&format=png`;
}

// Batch-resolve Roblox asset thumbnails to a real CDN image URL. The public
// thumbnails.roblox.com endpoint accepts up to 100 IDs per call and returns
// { data: [{ targetId, state, imageUrl }] }.
const THUMB_CACHE = new Map<number, { url: string; at: number }>();
const THUMB_TTL_MS = 10 * 60 * 1000;
async function resolveThumbnails(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const now = Date.now();
  const need: number[] = [];
  for (const id of ids) {
    const c = THUMB_CACHE.get(id);
    if (c && now - c.at < THUMB_TTL_MS) out.set(id, c.url);
    else if (Number.isFinite(id) && id > 0) need.push(id);
  }
  if (need.length === 0) return out;
  const chunks: number[][] = [];
  for (let i = 0; i < need.length; i += 100) chunks.push(need.slice(i, i + 100));
  await Promise.all(chunks.map(async (chunk) => {
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${chunk.join(",")}&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: Array<{ targetId: number; state: string; imageUrl?: string }> };
      for (const row of json.data ?? []) {
        if (row.state === "Completed" && row.imageUrl) {
          out.set(row.targetId, row.imageUrl);
          THUMB_CACHE.set(row.targetId, { url: row.imageUrl, at: now });
        }
      }
    } catch { /* ignore — thumbnail fetch is best-effort */ }
  }));
  return out;
}


/**
 * Search Roblox public toolbox/marketplace for free assets matching `keyword`.
 * Filters to free/public-looking items, rejects junk, and ranks by relevance Ã— safety.
 */
// ── Runtime blacklist ────────────────────────────────────────────────────
// Asset IDs the Studio plugin has reported as unusable (401 "not authorized",
// InsertService failed, deleted / moderated). We never send them to the
// plugin again — even if the Toolbox search still lists them as public.
const blacklistedAssets = new Map<number, { reason: string; at: number }>();
export function blacklistAssetIds(ids: number[], reason = "insert_failed"): void {
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (blacklistedAssets.size > 5000) blacklistedAssets.clear();
    if (!blacklistedAssets.has(id)) blacklistedAssets.set(id, { reason, at: Date.now() });
  }
}
export function isAssetBlacklisted(id: number): boolean {
  return blacklistedAssets.has(Number(id));
}
export function assetBlacklistReason(id: number): string | undefined {
  return blacklistedAssets.get(Number(id))?.reason;
}

// Roblox's legacy Marketplace ProductInfo endpoint returns `IsPublicDomain`,
// the SINGLE authoritative flag that decides whether InsertService:LoadAsset
// can pull the asset without ownership. A model can be free AND published AND
// public in the Creator Store search yet still have IsPublicDomain=false —
// those are exactly the ones that fail in Studio with "User is not authorized
// to access Asset". We check it here so bad IDs never reach the plugin.
const publicDomainCache = new Map<number, boolean | null>();

type ProductInfo = {
  assetId: number;
  name?: string;
  assetTypeId?: number;
  isPublicDomain: boolean | null;
  isForSale?: boolean | null;
  priceInRobux?: number | null;
  httpStatus?: number;
  error?: string;
};

async function fetchProductInfo(id: number): Promise<ProductInfo> {
  let httpStatus: number | undefined;
  try {
    const res = await fetch(`https://economy.roblox.com/v2/assets/${id}/details`, {
      headers: { Accept: "application/json", "User-Agent": "BloxSmith/1.0" },
      signal: AbortSignal.timeout(2200),
    });
    httpStatus = res.status;
    if (!res.ok) {
      return { assetId: id, isPublicDomain: null, httpStatus, error: `http_${res.status}` };
    }
    const j = (await res.json().catch(() => null)) as any;
    if (!j) return { assetId: id, isPublicDomain: null, httpStatus, error: "bad_json" };
    let isPublicDomain: boolean | null = null;
    if (typeof j.IsPublicDomain === "boolean") isPublicDomain = j.IsPublicDomain;
    else if (typeof j.isPublicDomain === "boolean") isPublicDomain = j.isPublicDomain;
    return {
      assetId: id,
      name: typeof j.Name === "string" ? j.Name : undefined,
      assetTypeId: typeof j.AssetTypeId === "number" ? j.AssetTypeId : undefined,
      isPublicDomain,
      isForSale: typeof j.IsForSale === "boolean" ? j.IsForSale : null,
      priceInRobux: typeof j.PriceInRobux === "number" ? j.PriceInRobux : null,
      httpStatus,
    };
  } catch (e) {
    return { assetId: id, isPublicDomain: null, httpStatus, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

async function isAssetPublicDomain(id: number): Promise<boolean | null> {
  const cached = publicDomainCache.get(id);
  if (cached !== undefined) return cached;

  const info = await fetchProductInfo(id);
  const verdict = info.isPublicDomain;
  if (verdict !== null) {
    if (publicDomainCache.size > 5000) publicDomainCache.clear();
    publicDomainCache.set(id, verdict);
  }
  return verdict;
}

type ToolboxDetailInfo = {
  id: number;
  name?: string;
  assetTypeId?: number;
  assetType?: string;
  creatorName?: string;
  creatorType?: string;
  isVerified?: boolean;
  isEndorsed?: boolean;
  isPublic?: boolean | null;
  isFree?: boolean | null;
  isPublished?: boolean | null;
  isPurchasable?: boolean | null;
  visibilityStatus?: number;
  httpStatus?: number;
  httpResponse?: string;
};

async function fetchToolboxDetailInfo(ids: number[]): Promise<{ details: Map<number, ToolboxDetailInfo>; http: Record<number, string> }> {
  const details = new Map<number, ToolboxDetailInfo>();
  const http: Record<number, string> = {};
  const unique = Array.from(new Set(ids)).filter((id) => Number.isFinite(id) && id > 0).slice(0, 120);
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const url = `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${chunk.join(",")}`;
    try {
      const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "BloxSmith/1.0" };
      const key = process.env.ROBLOX_OPEN_CLOUD_API_KEY;
      if (key) headers["x-api-key"] = key;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(2200) });
      for (const id of chunk) http[id] = `toolbox_${res.status}`;
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as any;
      if (!json?.data || !Array.isArray(json.data)) continue;
      for (const item of json.data) {
        const id = Number(item.asset?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const qty = item.fiatProduct?.purchasePrice?.quantity;
        const fiatPaid = item.fiatProduct?.isFree === false || (qty != null && typeof qty.significand === "number" && qty.significand > 0);
        const classicPaid = item.product?.isFree === false || (typeof item.product?.price === "number" && item.product.price > 0);
        details.set(id, {
          id,
          name: item.asset?.name,
          assetTypeId: item.asset?.typeId,
          assetType: item.asset?.typeId === 10 ? "Model" : String(item.asset?.typeId ?? "unknown"),
          creatorName: item.creator?.name,
          creatorType: item.creator?.type === 2 ? "Group" : "User",
          isVerified: item.creator?.isVerifiedCreator === true,
          isEndorsed: item.asset?.isEndorsed === true,
          isPublic: typeof item.asset?.visibilityStatus === "number" ? item.asset.visibilityStatus < 2 : null,
          isFree: !(fiatPaid || classicPaid),
          isPublished: item.fiatProduct?.published !== false,
          isPurchasable: item.fiatProduct?.purchasable !== false,
          visibilityStatus: item.asset?.visibilityStatus,
          httpStatus: 200,
          httpResponse: "toolbox_200",
        });
      }
    } catch (e) {
      for (const id of chunk) http[id] = e instanceof Error ? e.message : "toolbox_fetch_failed";
    }
  }
  return { details, http };
}

export async function validateAssetIds(ids: number[]): Promise<{ valid: number[]; blocked: number[]; reasons: Record<number, string> }> {
  const valid: number[] = [], blocked: number[] = [], reasons: Record<number, string> = {};
  if (ids.length === 0) return { valid, blocked, reasons };
  const toCheck: number[] = [];
  for (const id of ids) {
    if (isAssetBlacklisted(id)) {
      blocked.push(id);
      reasons[id] = assetBlacklistReason(id) ?? "blacklisted";
    } else {
      toCheck.push(id);
    }
  }
  const { details, http } = await fetchToolboxDetailInfo(toCheck);
  const productInfos = await Promise.all(toCheck.map((id) => fetchProductInfo(id)));
  const productById = new Map(productInfos.map((info) => [info.assetId, info]));

  for (const id of toCheck) {
    const d = details.get(id);
    const p = productById.get(id);
    const assetTypeId = d?.assetTypeId ?? p?.assetTypeId;
    let reason: string | null = null;
    if (isLikelyCloudAssetId(id)) reason = "cloud_asset_not_insertservice_compatible";
    else if (assetTypeId !== 10) reason = assetTypeId ? `not_model_asset_type_${assetTypeId}` : "unknown_asset_type";
    else if (d?.isPublished === false) reason = "not_published";
    else if (d?.isPurchasable === false) reason = "not_purchasable";
    else if (d?.isFree === false) reason = "paid_asset";
    else if (d?.isPublic === false) reason = "visibility_restricted";
    // NOTE: isPublicDomain check intentionally removed. The economy API returns
    // IsPublicDomain=false for virtually all modern free Creator Store assets,
    // causing them to be wrongly blacklisted. The toolbox-details checks above
    // (isFree, isPurchasable, isPublished, isPublic) are the correct authority.
    // Studio's InsertService is the final judge.

    console.info("[toolbox/validate] asset authorization", {
      assetId: id,
      assetName: d?.name ?? p?.name ?? null,
      creator: d?.creatorName ?? null,
      assetType: assetTypeId ?? null,
      isPublic: d?.isPublic ?? null,
      isVerified: d?.isVerified ?? false,
      insertServiceResponse: reason ? "blocked_before_studio" : "metadata_allows_insertservice",
      httpResponse: `${d?.httpResponse ?? http[id] ?? "toolbox_missing"}; economy_${p?.httpStatus ?? "none"}`,
      retryCount: 0,
      reason,
    });

    if (reason) {
      blocked.push(id);
      reasons[id] = reason;
      // "not_public_domain" intentionally excluded — no longer a rejection reason.
      if (["cloud_asset_not_insertservice_compatible", "visibility_restricted", "paid_asset", "not_published", "not_purchasable"].includes(reason) || reason.startsWith("not_model_asset_type")) {
        blacklistAssetIds([id], reason);
      }
    } else {
      valid.push(id);
    }
  }
  return { valid, blocked, reasons };
}

export async function testAssetAuthorization(assetId: number): Promise<{
  assetId: number;
  canInsertServiceAccess: boolean;
  authorizationStatus: "authorized" | "blocked";
  failureReason: string | null;
  assetName: string | null;
  creator: string | null;
  assetType: string | number | null;
  isPublic: boolean | null;
  isVerified: boolean;
  httpResponse: string;
}> {
  const id = Number(assetId);
  if (!Number.isFinite(id) || id <= 0) {
    return { assetId: id, canInsertServiceAccess: false, authorizationStatus: "blocked", failureReason: "invalid_asset_id", assetName: null, creator: null, assetType: null, isPublic: null, isVerified: false, httpResponse: "invalid" };
  }
  const [{ details, http }, product, verdict] = await Promise.all([
    fetchToolboxDetailInfo([id]),
    fetchProductInfo(id),
    validateAssetIds([id]),
  ]);
  const d = details.get(id);
  const reason = verdict.reasons[id] ?? null;
  return {
    assetId: id,
    canInsertServiceAccess: verdict.valid.includes(id),
    authorizationStatus: verdict.valid.includes(id) ? "authorized" : "blocked",
    failureReason: reason,
    assetName: d?.name ?? product.name ?? null,
    creator: d?.creatorName ?? null,
    assetType: d?.assetType ?? product.assetTypeId ?? null,
    isPublic: d?.isPublic ?? (product.isPublicDomain === true ? true : product.isPublicDomain === false ? false : null),
    isVerified: d?.isVerified ?? false,
    httpResponse: `${d?.httpResponse ?? http[id] ?? "toolbox_missing"}; economy_${product.httpStatus ?? "none"}`,
  };
}

// ── Shared insert-asset sanitizer ────────────────────────────────────────
// Validates asset_id + fallback_ids against Roblox's toolbox-details API and
// the runtime blacklist. Promotes surviving fallbacks, then falls back to a
// live search keyed off source_query. Drops the action rather than shipping
// an insert that will 401 in Studio.
export type InsertSanitizeReport = {
  dropped: Array<{ name: string; asset_id: number | null; reason: string }>;
  replaced: Array<{ name: string; original: number | null; replacement: number; reason: string }>;
};

export async function sanitizeInsertAssetActions(
  actions: Array<Record<string, unknown>>,
  report?: InsertSanitizeReport,
): Promise<void> {
  const inserts = actions.filter((a) => (a as { kind?: string }).kind === "insert_asset") as Array<{
    kind: string; name?: string; payload?: Record<string, unknown>;
  }>;
  if (inserts.length === 0) return;


  const allIds = new Set<number>();
  for (const a of inserts) {
    const p = a.payload ?? {};
    const primary = Number(p.asset_id ?? p.assetId);
    if (Number.isFinite(primary) && primary > 0 && !p.asset_id) p.asset_id = primary;
    if (Number.isFinite(primary) && primary > 0) allIds.add(primary);
    const fb = Array.isArray(p.fallback_ids) ? (p.fallback_ids as unknown[]) : Array.isArray(p.fallbackIds) ? (p.fallbackIds as unknown[]) : [];
    for (const f of fb) {
      const n = Number(f);
      if (Number.isFinite(n) && n > 0) allIds.add(n);
    }
  }

  let verdict: { valid: number[]; blocked: number[]; reasons: Record<number, string> };
  if (allIds.size > 0) {
    try { verdict = await validateAssetIds(Array.from(allIds)); }
    catch { verdict = { valid: [], blocked: Array.from(allIds), reasons: Object.fromEntries(Array.from(allIds).map((id) => [id, "validation_unavailable"])) }; }
  } else {
    verdict = { valid: [], blocked: [], reasons: {} };
  }
  const validSet = new Set(verdict.valid);
  const rescueCache = new Map<string, { id: number; fallbacks: number[] } | null>();

  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const a = actions[i] as { kind?: string; name?: string; payload?: Record<string, unknown> };
    if (a.kind !== "insert_asset") continue;
    const p = a.payload ?? (a.payload = {});
    const primary = Number(p.asset_id ?? p.assetId);
    if (Number.isFinite(primary) && primary > 0) p.asset_id = primary;
    const fb = (Array.isArray(p.fallback_ids) ? (p.fallback_ids as unknown[]) : Array.isArray(p.fallbackIds) ? (p.fallbackIds as unknown[]) : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0 && !isAssetBlacklisted(n));

    const cleanFallbacks = fb.filter((id) => validSet.has(id) && id !== primary);
    if (Number.isFinite(primary) && primary > 0 && validSet.has(primary) && !isAssetBlacklisted(primary)) {
      p.fallback_ids = cleanFallbacks.slice(0, 3);
      continue;
    }

    if (cleanFallbacks.length > 0) {
      const promoted = cleanFallbacks[0];
      const reason = verdict.reasons[primary] ?? (isAssetBlacklisted(primary) ? "blacklisted" : "unauthorized");
      p._original_asset_id = primary;
      p._replacement_reason = reason;
      p.asset_id = promoted;
      p.fallback_ids = cleanFallbacks.slice(1, 4);
      report?.replaced.push({ name: String(a.name ?? ""), original: Number.isFinite(primary) ? primary : null, replacement: promoted, reason });
      continue;
    }

    const query = String(p.source_query ?? p.asset_name ?? a.name ?? "").trim();
    const primaryReason = Number.isFinite(primary) && primary > 0
      ? (verdict.reasons[primary] ?? (isAssetBlacklisted(primary) ? "blacklisted" : "unauthorized"))
      : "missing_asset_id";
    if (!query) {
      actions.splice(i, 1);
      report?.dropped.push({ name: String(a.name ?? ""), asset_id: Number.isFinite(primary) ? primary : null, reason: primaryReason });
      continue;
    }
    let rescue = rescueCache.get(query.toLowerCase());
    if (rescue === undefined) {
      try {
        const res = await searchRobloxToolbox(query, "Model", 24, {
          singleAssetOnly: Boolean(p.single_asset_only),
          page: Math.min(8, Math.floor(cleanFallbacks.length / 8)),
        });
        const rescueIds = res.results.map((r) => r.id).filter((id) => !isAssetBlacklisted(id));
        const rescueVerdict = rescueIds.length > 0
          ? await validateAssetIds(rescueIds).catch(() => ({ valid: [], blocked: rescueIds, reasons: {} }))
          : { valid: [], blocked: [], reasons: {} };
        const safeSet = new Set(rescueVerdict.valid);
        const safe = res.results.filter((r) => safeSet.has(r.id));
        const picked = safe[0];
        rescue = picked
          ? { id: picked.id, fallbacks: (picked.fallbackIds ?? []).filter((id) => safeSet.has(id) && !isAssetBlacklisted(id)).slice(0, 3) }
          : null;
      } catch { rescue = null; }
      rescueCache.set(query.toLowerCase(), rescue);
    }
    if (rescue) {
      p._original_asset_id = primary;
      p._replacement_reason = primaryReason;
      p.asset_id = rescue.id;
      p.fallback_ids = rescue.fallbacks;
      report?.replaced.push({ name: String(a.name ?? ""), original: Number.isFinite(primary) ? primary : null, replacement: rescue.id, reason: primaryReason });
    } else {
      actions.splice(i, 1);
      report?.dropped.push({ name: String(a.name ?? ""), asset_id: Number.isFinite(primary) ? primary : null, reason: primaryReason });
    }
  }
}

export async function searchRobloxToolbox(
  keyword: string,
  category: ToolboxCategory = "Model",
  limit = 6,
  options: { singleAssetOnly?: boolean; page?: number } = {},
): Promise<{ source: "live" | "fallback" | "none"; results: ToolboxResult[]; searchedTerms: string[]; scanned: number; page: number; hasMore: boolean }> {
  const singleAssetOnly = options.singleAssetOnly ?? detectSingleAssetIntent(keyword);
  const terms = buildSearchTerms(keyword, singleAssetOnly);
  if (terms.length === 0) return { source: "none", results: [], searchedTerms: [], scanned: 0, page: 0, hasMore: false };
  const catId = CATEGORY_ID[category];
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const page = Math.max(0, Math.min(Math.floor(options.page ?? 0), 200));
  const needed = safeLimit * (page + 1);
  const usageKey = `${category}:${singleAssetOnly ? "single:" : ""}${keyword.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const cacheKey = `${usageKey}::${safeLimit}::p${page}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const recentIds = new Set(recentAssetsByKey.get(usageKey) ?? []);
  // Single-object requests need one good result fast. Keep those searches
  // shallow so “add one tree/button/car” does not wait on dozens of Roblox
  // endpoint calls before the Studio queue is populated.
  const activeTerms = singleAssetOnly ? terms.slice(0, 3) : terms.slice(0, page > 2 ? 12 : 8);
  const perPage = singleAssetOnly ? 40 : 100;
  // Scale page depth with the requested page so users can keep browsing.
  // Each source pages up to ~30 pages of 100 → ~3000 per source per term.
  const maxPagesPerTerm = singleAssetOnly ? 1 : Math.min(3 + page * 2, 30);
  // Track how many distinct expanded terms each asset matched on — strong signal of true relevance.
  const termHitCount = new Map<number, number>();
  const bumpHit = (id: number, term: string, name: string) => {
    if (relevanceScore(term, name) >= 0.4) termHitCount.set(id, (termHitCount.get(id) ?? 0) + 1);
  };

  const enrich = (r: ToolboxResult): ToolboxResult => {
    const relevance = Math.max(relevanceScore(keyword, r.name), relevanceScore(r.sourceQuery ?? keyword, r.name));
    const safety = safetyScore(r.creatorName, r.name, { ...r, relevance });
    const trustedBoost = r.creatorName.trim().toLowerCase() === "roblox" ? 0.08 : 0;
    const classicInsertBoost = isLikelyCloudAssetId(r.id) ? -0.5 : 0.14;
    const recentlyUsed = recentIds.has(r.id);
    const reusePenalty = recentlyUsed ? 0.08 : 0;
    // Cross-term consensus: assets that match multiple expanded queries are nearly always on-topic.
    const hits = termHitCount.get(r.id) ?? 0;
    const multiHitBoost = hits >= 3 ? 0.12 : hits === 2 ? 0.07 : 0;
    const score = Math.max(0, Math.min(1, relevance * 0.5 + safety * 0.36 + trustedBoost + classicInsertBoost + multiHitBoost - reusePenalty));
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
      .filter((r) => !isAssetBlacklisted(r.id))
      .map(enrich)
      .filter((r) => rejectionReason(r, { strict: singleAssetOnly }) === null)
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
    // Rotation ruins pagination stability; only rotate on page 0.
    const rotateEveryFiveMinutes = Math.floor(Date.now() / (5 * 60 * 1000));
    const seed = stableHash(`${keyword}|${category}|${rotateEveryFiveMinutes}`);
    const offset = page === 0 && !singleAssetOnly && topBand.length > 1 ? seed % topBand.length : 0;
    const rotatedTop = topBand.slice(offset).concat(topBand.slice(0, offset));
    const topIds = new Set(topBand.map((row) => row.id));
    const diversifiedAll = [
      ...rotatedTop,
      ...ranked.filter((row) => !topIds.has(row.id)),
    ];
    const start = page * safeLimit;
    const returnEnd = start + safeLimit;
    const validationEnd = start + Math.min(Math.max(safeLimit * 5, safeLimit), 50);
    const end = validationEnd;
    const diversified = diversifiedAll.slice(start, end);
    (rank as unknown as { _hasMore?: boolean })._hasMore = diversifiedAll.length > returnEnd;

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
          ...(singleAssetOnly ? { single_asset_only: true, extract_single: true, max_children: 25 } : {}),
        },
      };
    });
  };

  // 1. Current Creator Store / Toolbox search endpoint observed on
  // create.roblox.com/store/category/3d. It works as an unauthenticated GET
  // when searchCategoryType is present. All terms fetched in parallel.
  const liveRows = new Map<number, ToolboxResult>();
  const idsNeedingDetails: number[] = [];
  const sourceQueryById = new Map<number, string>();

  const v2TermTask = async (term: string) => {
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
        if (typeof id !== "number" || !name) continue;
        if (name) bumpHit(id, term, name);
        if (liveRows.has(id)) continue;
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
  };

  // 2. Older toolbox-service marketplace endpoint.
  const v1TermTask = async (term: string) => {
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
        if (typeof id !== "number") continue;
        if (name) bumpHit(id, term, name);
        if (liveRows.has(id)) continue;
        sourceQueryById.set(id, term);
        if (!name) { idsNeedingDetails.push(id); continue; }
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
  };

  // 3. Legacy public catalog endpoint as a wider backup. Roblox can change this
  // without notice, so failures are ignored.
  const legacyCategory = category === "Audio" ? 9 : category === "Decal" ? 8 : category === "Mesh" ? 4 : 6;
  const legacyTermTask = async (term: string) => {
    const q = encodeURIComponent(term);
    const legacyUrl = `https://search.roblox.com/catalog/json?CatalogContext=2&Category=${legacyCategory}&Keyword=${q}&SortType=3&ResultsPerPage=${perPage}`;
    const legacy = (await tryFetch(legacyUrl)) as
      | Array<{ AssetId?: number; Name?: string; Creator?: string; CreatorName?: string; Price?: number | null; Sales?: number; AssetTypeID?: number }>
      | null;
    if (!Array.isArray(legacy)) return;
    for (const row of legacy) {
      const id = row?.AssetId;
      const name = row?.Name;
      if (typeof id !== "number" || !name) continue;
      bumpHit(id, term, name);
      if (liveRows.has(id)) continue;
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
  };

  // Fan out every term across all three endpoints concurrently. Failures inside
  // tryFetch return null, so a single dead endpoint can't block the others.
  await Promise.all([
    ...activeTerms.map(v2TermTask),
    ...activeTerms.map(v1TermTask),
    ...activeTerms.map(legacyTermTask),
  ]);

  const detailIds = Array.from(new Set([...Array.from(liveRows.keys()), ...idsNeedingDetails])).slice(0, 240);
  for (const detail of await fetchToolboxDetails(detailIds, category, sourceQueryById)) {
    const existing = liveRows.get(detail.id);
    liveRows.set(detail.id, { ...existing, ...detail, sourceQuery: existing?.sourceQuery ?? detail.sourceQuery });
  }


  if (liveRows.size > 0) {
    const ranked = rank(Array.from(liveRows.values()));
    if (ranked.length > 0) {
      const verdict = await validateAssetIds(ranked.map((r) => r.id)).catch(() => ({ valid: [], blocked: ranked.map((r) => r.id), reasons: {} }));
      const validIds = new Set(verdict.valid);
      const insertableRanked = ranked.filter((r) => validIds.has(r.id) && !isAssetBlacklisted(r.id));
      const insertableIds = new Set(insertableRanked.map((r) => r.id));
      for (const r of insertableRanked) {
        r.fallbackIds = (r.fallbackIds ?? []).filter((id) => insertableIds.has(id) && !isAssetBlacklisted(id));
        if (r.insertPayload) r.insertPayload.fallback_ids = r.fallbackIds;
      }
      if (insertableRanked.length === 0) {
        const empty = { source: "none" as const, results: [], searchedTerms: activeTerms, scanned: liveRows.size, page, hasMore: false };
        cacheSet(cacheKey, empty);
        return empty;
      }
      // Swap placeholder thumbnails for real CDN URLs before returning.
      try {
        const thumbs = await resolveThumbnails(insertableRanked.map((r) => r.id));
        for (const r of insertableRanked) {
          const real = thumbs.get(r.id);
          if (real) r.thumbnail = real;
        }
      } catch { /* best-effort */ }
      const hasMore = (rank as unknown as { _hasMore?: boolean })._hasMore ?? false;
      const out = { source: "live" as const, results: insertableRanked.slice(0, safeLimit), searchedTerms: activeTerms, scanned: liveRows.size, page, hasMore };
      cacheSet(cacheKey, out);
      return out;
    }
  }


  const empty = { source: "none" as const, results: [], searchedTerms: activeTerms, scanned: liveRows.size, page, hasMore: false };
  cacheSet(cacheKey, empty);
  return empty;
}

export async function searchRobloxToolboxSet(
  requests: ToolboxSetRequest[],
  defaultLimit = 8,
  opts: { qualityFloor?: "standard" | "strict" } = {},
): Promise<{
  source: "live" | "partial" | "fallback" | "none";
  requests: ToolboxSetResult[];
  readyCount: number;
  missingRequired: string[];
  insertionRule: string;
}> {
  const normalized = requests
    .filter((r) => r && typeof r.keyword === "string" && r.keyword.trim())
    .slice(0, 24)
    .map((r) => ({
      label: String(r.label || r.keyword).trim().slice(0, 60),
      keyword: r.keyword.trim().slice(0, 120),
      category: r.category ?? "Model",
      limit: Math.max(1, Math.min(r.limit ?? defaultLimit, 24)),
      required: r.required !== false,
    }));

  // Strict quality floor for map/city builds: only trusted creators or high
  // upvotes get through, and low-relevance picks are dropped. Verified/endorsed
  // and Roblox-owned assets always pass so we never starve required categories.
  const safetyFloor = opts.qualityFloor === "strict" ? 0.72 : 0.62;
  const relevanceFloor = opts.qualityFloor === "strict" ? 0.28 : 0.18;
  const isTrusted = (r: any) =>
    (r?.creatorName ?? "").trim().toLowerCase() === "roblox"
    || r?.verifiedCreator === true
    || r?.endorsed === true
    || (typeof r?.upVotePercent === "number" && r.upVotePercent >= 85);
  const passesFloor = (r: any) => {
    if (r?.free === false) return false;
    if (isTrusted(r)) return (r.relevance ?? 0) >= Math.max(0.15, relevanceFloor - 0.1);
    return (r.safety ?? 0) >= safetyFloor && (r.relevance ?? 0) >= relevanceFloor;
  };

  const rows = await Promise.all(
    normalized.map(async (request): Promise<ToolboxSetResult> => {
      const out = await searchRobloxToolbox(request.keyword, request.category, request.limit);
      let results = out.results.filter(passesFloor);
      // Rank: trusted creator first, then combined safety*relevance, so the
      // planner picks the best-known assets before iffy ones.
      results = results.sort((a: any, b: any) => {
        const ta = isTrusted(a) ? 1 : 0;
        const tb = isTrusted(b) ? 1 : 0;
        if (ta !== tb) return tb - ta;
        const sa = (a.safety ?? 0) * 0.55 + (a.relevance ?? 0) * 0.45;
        const sb = (b.safety ?? 0) * 0.55 + (b.relevance ?? 0) * 0.45;
        return sb - sa;
      });
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
