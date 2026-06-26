// Server-only helper: search Roblox's public toolbox/marketplace for free assets
// matching a keyword. Returns a small list of { id, name, creatorName, creatorType }.
// Best-effort — Roblox occasionally changes these endpoints; we try a few and
// fall back to a curated allowlist if the network call fails.

export interface ToolboxResult {
  id: number;
  name: string;
  creatorName: string;
  creatorType: string;
  assetType?: string;
}

// Category numeric ids used by Roblox toolbox-service:
// 10 = Model, 11 = Decal, 12 = Audio, 13 = Mesh, 19 = Plugin,
// 38 = Hat, 40 = Gear, 5 = T-Shirt, 8 = Shirt, 9 = Pants.
// For our purposes the common categories are Model (10) and Audio (12).
export type ToolboxCategory = "Model" | "Audio" | "Decal" | "Mesh";
const CATEGORY_ID: Record<ToolboxCategory, number> = {
  Model: 10,
  Audio: 12,
  Decal: 11,
  Mesh: 13,
};

// Curated, verified-free Roblox-creator fallbacks (creator "Roblox", price 0).
// These are real public asset ids — used when the live search fails or returns
// nothing safe.
const FALLBACK: Record<string, ToolboxResult[]> = {
  tree: [
    { id: 1577043523, name: "Pine Tree", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
    { id: 162039248, name: "Tree Pack", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  npc: [
    { id: 1664543044, name: "Classic Noob NPC", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
    { id: 27112438, name: "R6 Dummy", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  dummy: [
    { id: 27112438, name: "R6 Dummy", creatorName: "Roblox", creatorType: "User", assetType: "Model" },
  ],
  sword: [
    { id: 12221720, name: "Classic Sword", creatorName: "Roblox", creatorType: "User", assetType: "Gear" },
  ],
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
  click: [
    { id: 9117517011, name: "UI Click", creatorName: "Roblox", creatorType: "User", assetType: "Audio" },
  ],
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
      headers: {
        Accept: "application/json",
        "User-Agent": "BloxSmith/1.0",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Search Roblox public toolbox/marketplace for free assets matching `keyword`.
 * Filters to verified-creator, free items. Returns at most `limit` results.
 */
export async function searchRobloxToolbox(
  keyword: string,
  category: ToolboxCategory = "Model",
  limit = 6,
): Promise<{ source: "live" | "fallback" | "none"; results: ToolboxResult[] }> {
  const q = encodeURIComponent(keyword.trim());
  if (!q) return { source: "none", results: [] };
  const catId = CATEGORY_ID[category];

  // 1. Try toolbox-service marketplace endpoint (public reads usually work).
  // sortType=2 = MostTaken. Free filter is implicit for many model results.
  const tbUrl = `https://apis.roblox.com/toolbox-service/v1/marketplace/${catId}?keyword=${q}&limit=${limit * 2}&sortType=2`;
  const tb = (await tryFetch(tbUrl)) as
    | { data?: Array<{ asset?: { id?: number; name?: string; typeId?: number }; creator?: { name?: string; type?: number } }> }
    | null;
  if (tb?.data && Array.isArray(tb.data) && tb.data.length > 0) {
    const out: ToolboxResult[] = [];
    for (const row of tb.data) {
      const id = row?.asset?.id;
      const name = row?.asset?.name;
      if (typeof id !== "number" || !name) continue;
      const creatorName = row?.creator?.name ?? "";
      const creatorType = row?.creator?.type === 2 ? "Group" : "User";
      out.push({ id, name, creatorName, creatorType, assetType: category });
      if (out.length >= limit) break;
    }
    if (out.length > 0) return { source: "live", results: out };
  }

  // 2. Try legacy catalog search as a secondary path.
  const catUrl = `https://catalog.roblox.com/v1/search/items?category=All&keyword=${q}&limit=${limit}`;
  const cat = (await tryFetch(catUrl)) as { data?: Array<{ id?: number; name?: string }> } | null;
  if (cat?.data && Array.isArray(cat.data) && cat.data.length > 0) {
    const out: ToolboxResult[] = cat.data
      .filter((r) => typeof r.id === "number" && r.name)
      .slice(0, limit)
      .map((r) => ({
        id: r.id as number,
        name: r.name as string,
        creatorName: "",
        creatorType: "User",
        assetType: category,
      }));
    if (out.length > 0) return { source: "live", results: out };
  }

  // 3. Fall back to curated allowlist.
  const fb = pickFallback(keyword);
  if (fb.length > 0) return { source: "fallback", results: fb.slice(0, limit) };
  return { source: "none", results: [] };
}
