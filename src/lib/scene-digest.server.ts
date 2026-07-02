// Compresses a raw Roblox Studio scene scan into a structured, AI-friendly digest.
// The goal: give the model a tight "world model" so it stops duplicating
// things that already exist and references real instance paths.

type SceneNode = {
  name?: string;
  class?: string;
  className?: string;
  ClassName?: string;
  path?: string;
  children?: SceneNode[];
  Children?: SceneNode[];
  attributes?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  sourceLines?: number;
  lineCount?: number;
  scriptLines?: number;
  size?: [number, number, number] | { X?: number; Y?: number; Z?: number };
  anchored?: boolean;
  Anchored?: boolean;
};

const SERVICE_NAMES = new Set([
  "Workspace", "Lighting", "ReplicatedStorage", "ReplicatedFirst",
  "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack",
  "StarterPlayer", "StarterPlayerScripts", "StarterCharacterScripts",
  "SoundService", "Teams", "Chat", "TextChatService", "MaterialService",
  "Players", "RunService",
]);

const SCRIPT_CLASSES = new Set(["Script", "LocalScript", "ModuleScript"]);
const UI_CLASSES = new Set(["ScreenGui", "SurfaceGui", "BillboardGui"]);
const REMOTE_CLASSES = new Set(["RemoteEvent", "RemoteFunction", "BindableEvent", "BindableFunction", "UnreliableRemoteEvent"]);
const PART_CLASSES = new Set(["Part", "MeshPart", "UnionOperation", "TrussPart", "WedgePart", "CornerWedgePart", "SpawnLocation", "SeatPart", "Seat", "VehicleSeat"]);

function getClass(node: SceneNode): string {
  return (node.class || node.className || node.ClassName || "") as string;
}
function getChildren(node: SceneNode): SceneNode[] {
  return (node.children || node.Children || []) as SceneNode[];
}

export interface SceneDigest {
  text: string;
  isEmpty: boolean;
  totals: {
    instances: number;
    parts: number;
    scripts: number;
    uis: number;
    remotes: number;
    services: number;
  };
  scriptPaths: string[];
  spawnLocations: string[];
}

export function summarizeSceneScan(rawScan: unknown): SceneDigest {
  const empty: SceneDigest = {
    text: "(no scene scan available yet)",
    isEmpty: true,
    totals: { instances: 0, parts: 0, scripts: 0, uis: 0, remotes: 0, services: 0 },
    scriptPaths: [],
    spawnLocations: [],
  };
  if (!rawScan) return empty;

  // Normalise: input might be an array of service trees or a single root.
  const roots: SceneNode[] = Array.isArray(rawScan)
    ? (rawScan as SceneNode[])
    : typeof rawScan === "object"
      ? [rawScan as SceneNode]
      : [];
  if (roots.length === 0) return empty;

  const counts: Record<string, number> = {};
  const scriptPaths: string[] = [];
  const uiPaths: string[] = [];
  const remotePaths: { path: string; cls: string }[] = [];
  const spawnLocations: string[] = [];
  const bigParts: string[] = [];
  const unanchoredParts: string[] = [];
  let totalInstances = 0;
  let parts = 0;
  let scripts = 0;
  let uis = 0;
  let remotes = 0;

  const walk = (node: SceneNode, parentPath: string, depth: number) => {
    const cls = getClass(node) || "Instance";
    const name = node.name || cls;
    const path = parentPath ? `${parentPath}.${name}` : name;
    totalInstances++;
    counts[cls] = (counts[cls] ?? 0) + 1;

    if (SCRIPT_CLASSES.has(cls)) {
      scripts++;
      const lines = node.sourceLines ?? node.lineCount ?? node.scriptLines;
      scriptPaths.push(lines ? `${path} (${cls}, ${lines} lines)` : `${path} (${cls})`);
    } else if (UI_CLASSES.has(cls)) {
      uis++;
      uiPaths.push(`${path} (${cls})`);
    } else if (REMOTE_CLASSES.has(cls)) {
      remotes++;
      remotePaths.push({ path, cls });
    } else if (PART_CLASSES.has(cls)) {
      parts++;
      if (cls === "SpawnLocation") spawnLocations.push(path);
      const sz = node.size;
      if (Array.isArray(sz)) {
        const max = Math.max(sz[0] ?? 0, sz[1] ?? 0, sz[2] ?? 0);
        if (max > 600) bigParts.push(`${path} (${Math.round(max)} studs)`);
      }
      const anchored = node.anchored ?? node.Anchored;
      if (anchored === false) unanchoredParts.push(path);
    }

    if (depth > 8) return; // safety
    for (const child of getChildren(node).slice(0, 200)) {
      walk(child, path, depth + 1);
    }
  };

  const servicesSeen = new Set<string>();
  for (const root of roots) {
    const cls = getClass(root) || root.name || "";
    if (SERVICE_NAMES.has(cls) || SERVICE_NAMES.has(root.name ?? "")) {
      servicesSeen.add(root.name ?? cls);
    }
    walk(root, "", 0);
  }

  const lines: string[] = [];
  lines.push(`Services present: ${[...servicesSeen].join(", ") || "(unknown)"}`);
  lines.push(`Totals: ${totalInstances} instances · ${parts} parts · ${scripts} scripts · ${uis} GUIs · ${remotes} remotes`);

  if (scriptPaths.length) {
    lines.push("");
    lines.push(`Existing scripts (${scriptPaths.length}):`);
    for (const sp of scriptPaths.slice(0, 30)) lines.push(`  - ${sp}`);
    if (scriptPaths.length > 30) lines.push(`  …(+${scriptPaths.length - 30} more)`);
  }
  if (uiPaths.length) {
    lines.push("");
    lines.push(`Existing UIs (${uiPaths.length}):`);
    for (const u of uiPaths.slice(0, 20)) lines.push(`  - ${u}`);
  }
  if (remotePaths.length) {
    lines.push("");
    lines.push(`Remotes/Bindables (${remotePaths.length}):`);
    for (const r of remotePaths.slice(0, 25)) lines.push(`  - ${r.path} (${r.cls})`);
  }
  if (spawnLocations.length) {
    lines.push("");
    lines.push(`SpawnLocations: ${spawnLocations.slice(0, 10).join(", ")}${spawnLocations.length > 10 ? ` (+${spawnLocations.length - 10})` : ""}`);
  } else {
    lines.push("");
    lines.push("SpawnLocations: NONE — players will spawn at origin until one is added.");
  }
  if (bigParts.length) {
    lines.push("");
    lines.push(`Oversized parts (>600 studs): ${bigParts.slice(0, 5).join(", ")}`);
  }
  if (unanchoredParts.length) {
    lines.push(`Unanchored parts (may fall): ${unanchoredParts.length}`);
  }

  // Top classes summary
  const topClasses = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c, n]) => `${c}×${n}`)
    .join(" · ");
  lines.push("");
  lines.push(`Top classes: ${topClasses}`);

  return {
    text: lines.join("\n"),
    isEmpty: false,
    totals: {
      instances: totalInstances,
      parts,
      scripts,
      uis,
      remotes,
      services: servicesSeen.size,
    },
    scriptPaths,
    spawnLocations,
  };
}
