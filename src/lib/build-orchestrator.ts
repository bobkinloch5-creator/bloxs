// BloxSmith Build Orchestrator
// ---------------------------------------------------------------------------
// Turns one natural language brief into a complete, ordered build plan:
// Explorer scaffold -> remotes -> systems -> gameplay -> UI -> world -> boot.
//
// The same plan powers full builds, selective regeneration and
// improve-in-place (merge) runs.

import { SERVICE_ROUTES, EXPLORER_SCAFFOLD, buildExplorerScaffoldLua } from "./roblox-explorer";
import { detectGenre, getGenre, buildLightingLua, type GenreBlueprint } from "./game-genres";
import {
  detectSystems,
  resolveSystemOrder,
  systemParentPath,
  buildSystemsBootstrap,
  type GameSystem,
} from "./game-systems";
import { detectFeatures, getFeature, type FeatureArtifact } from "./gameplay-features";
import {
  buildUiArtifacts,
  detectScreens,
  remotesForScreens,
  type UiScreen,
} from "./roblox-ui-kit";
import { detectTerrainPreset, terrainAction, type TerrainPreset } from "./roblox-terrain";
import { objectsAction, type ObjectSpec } from "./roblox-objects";
import { getPack } from "./plugin-marketplace";
import { autoFixLuau, validateLuau, type LuauIssue } from "./luau-validator";
import { mergeScript, formatLua, type MergeStrategy } from "./lua-format";

export type BuildArtifact = {
  /** Stable id used for selective regeneration. */
  id: string;
  className: "Script" | "LocalScript" | "ModuleScript";
  name: string;
  parentPath: string;
  source: string;
  group: "system" | "gameplay" | "ui" | "boot" | "pack" | "world";
  why: string;
};

export type BuildAction = {
  kind: string;
  parent_path: string;
  name: string;
  payload: Record<string, unknown>;
};

export type BuildPlan = {
  title: string;
  genre: GenreBlueprint;
  systems: GameSystem[];
  features: string[];
  screens: UiScreen[];
  terrain: TerrainPreset | null;
  remotes: string[];
  artifacts: BuildArtifact[];
  actions: BuildAction[];
  summary: string[];
  issues: Array<{ artifactId: string; issues: LuauIssue[] }>;
};

export type BuildRequest = {
  prompt: string;
  title?: string;
  genre?: string;
  /** Explicit overrides; anything omitted is inferred from the prompt. */
  systems?: string[];
  features?: string[];
  screens?: UiScreen[];
  terrain?: TerrainPreset | null;
  packs?: string[];
  objects?: ObjectSpec[];
  theme?: string;
  includeTerrain?: boolean;
  includeWorld?: boolean;
};

function titleFromPrompt(prompt: string): string {
  const quoted = prompt.match(/["']([^"']{3,48})["']/);
  if (quoted) return quoted[1];
  const called = prompt.match(/\bcalled\s+([A-Za-z0-9 ',!-]{3,48})/i);
  if (called) return called[1].trim();
  const first = prompt.split(/[.\n]/)[0]?.trim() ?? "";
  return (first.length > 3 && first.length <= 48 ? first : "BloxSmith Game").replace(/\s+/g, " ");
}

const DEFAULT_REMOTES = ["Notify", "DataReady"];

/** Remotes that must exist for the chosen features. */
function remotesForFeatures(features: string[]): string[] {
  const map: Record<string, string[]> = {
    combat: ["CombatAttack"],
    inventory: ["InventoryChanged"],
    quests: ["QuestAction", "QuestsChanged"],
    pets: ["HatchEgg", "EquipPet", "PetsChanged"],
    gathering: ["GatherNode", "CraftItem", "SellItem"],
    skills: ["UnlockSkill"],
    tycoon: ["BuyDropper", "Rebirth"],
    npcs: ["DialogueShow", "DialogChoice"],
    tower_defense: ["PlaceTower", "WaveChanged"],
    racing: ["RaceCheckpoint"],
    survival: ["ConsumeItem"],
    idle: ["OfflineEarnings"],
  };
  const out = new Set<string>();
  for (const feature of features) for (const remote of map[feature] ?? []) out.add(remote);
  return [...out];
}

function remoteFolderLua(remotes: string[]): string {
  return [
    "-- Creates every RemoteEvent the generated code expects.",
    "-- Idempotent: re-running never duplicates instances.",
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    "",
    "local function folder(parent, name)",
    "\tlocal existing = parent:FindFirstChild(name)",
    "\tif existing then",
    "\t\treturn existing",
    "\tend",
    '\tlocal created = Instance.new("Folder")',
    "\tcreated.Name = name",
    "\tcreated.Parent = parent",
    "\treturn created",
    "end",
    "",
    'local root = folder(ReplicatedStorage, "BloxSmith")',
    'local remotes = folder(root, "Remotes")',
    "",
    "local names = {",
    ...remotes.map((remote) => `\t"${remote}",`),
    "}",
    "",
    "for _, name in ipairs(names) do",
    "\tif not remotes:FindFirstChild(name) then",
    '\t\tlocal event = Instance.new("RemoteEvent")',
    "\t\tevent.Name = name",
    "\t\tevent.Parent = remotes",
    "\tend",
    "end",
    "",
    'print(("[BloxSmith] %d remote(s) ready"):format(#names))',
  ].join("\n");
}

function leaderstatsLua(): string {
  return [
    "-- Mirrors saved currency onto leaderstats so the Roblox player list works.",
    'local Players = game:GetService("Players")',
    'local systems = game:GetService("ServerScriptService"):WaitForChild("BloxSmith_Systems")',
    'local Profiles = require(systems:WaitForChild("ProfileStore"))',
    "",
    "Players.PlayerAdded:Connect(function(player)",
    '\tlocal stats = Instance.new("Folder")',
    '\tstats.Name = "leaderstats"',
    "\tstats.Parent = player",
    "",
    '\tlocal coins = Instance.new("IntValue")',
    '\tcoins.Name = "Coins"',
    "\tcoins.Parent = stats",
    "",
    '\tlocal level = Instance.new("IntValue")',
    '\tlevel.Name = "Level"',
    "\tlevel.Value = 1",
    "\tlevel.Parent = stats",
    "",
    "\ttask.spawn(function()",
    "\t\tlocal profile = Profiles:Get(player)",
    "\t\twhile player.Parent do",
    "\t\t\tcoins.Value = math.floor(profile.coins or 0)",
    "\t\t\tlevel.Value = math.floor(profile.level or 1)",
    "\t\t\ttask.wait(1)",
    "\t\tend",
    "\tend)",
    "end)",
  ].join("\n");
}

function worldObjectsFor(genre: GenreBlueprint): ObjectSpec[] {
  const specs: ObjectSpec[] = [
    {
      kind: "spawn",
      name: "MainSpawn",
      position: [0, 6, 0],
      size: [24, 1, 24],
      color: "#4C6FFF",
      anchored: true,
    },
    {
      kind: "light",
      name: "PlazaLight",
      position: [0, 18, 0],
      color: "#FFE9A8",
      properties: { Brightness: 2, Range: 60 },
    },
    {
      kind: "billboard",
      name: "WelcomeSign",
      position: [0, 14, -18],
      text: genre.label + " - built with BloxSmith",
    },
  ];

  if (genre.key === "tycoon" || genre.key === "simulator" || genre.key === "idle") {
    specs.push(
      { kind: "part", name: "ShopPad", position: [26, 5, 0], size: [12, 1, 12], color: "#F2B705", anchored: true },
      { kind: "proximityprompt", name: "OpenShop", parentPath: "Workspace.BloxSmith_World.Interactables", text: "Open Shop" },
      { kind: "clickdetector", name: "CollectIncome", parentPath: "Workspace.BloxSmith_World.Interactables", text: "Collect" },
    );
  }
  if (genre.key === "rpg" || genre.key === "survival") {
    specs.push(
      { kind: "model", name: "QuestHut", position: [-30, 6, 10], size: [16, 12, 16], color: "#8D6E63" },
      { kind: "proximityprompt", name: "TalkToElder", parentPath: "Workspace.BloxSmith_World.Interactables", text: "Talk" },
      { kind: "particle", name: "CampfireEmbers", position: [-30, 7, 20], color: "#FF8A3D" },
    );
  }
  if (genre.key === "obby") {
    for (let stage = 1; stage <= 6; stage += 1) {
      specs.push({
        kind: "spawn",
        name: `Checkpoint${stage}`,
        position: [stage * 40, 6 + stage * 4, 0],
        size: [10, 1, 10],
        color: stage % 2 ? "#3FB950" : "#2F81F7",
        anchored: true,
      });
    }
  }
  if (genre.key === "racing") {
    specs.push(
      { kind: "part", name: "StartGrid", position: [0, 5, -60], size: [40, 1, 20], color: "#EEEEEE", anchored: true },
      { kind: "beam", name: "FinishBeam", position: [0, 8, -60], color: "#FF4D4D" },
    );
  }
  if (genre.key === "fps" || genre.key === "tower_defense") {
    specs.push(
      { kind: "part", name: "TeamRedSpawn", position: [-80, 6, 0], size: [20, 1, 20], color: "#E5484D", anchored: true },
      { kind: "part", name: "TeamBlueSpawn", position: [80, 6, 0], size: [20, 1, 20], color: "#3E63DD", anchored: true },
    );
  }
  if (genre.key === "horror") {
    specs.push(
      { kind: "light", name: "FlickerLamp", position: [0, 10, -20], color: "#88AACC", properties: { Brightness: 1.4, Range: 24 } },
      { kind: "sound", name: "AmbientDrone", parentPath: SERVICE_ROUTES.audio, properties: { Looped: true, Volume: 0.4 } },
    );
  }
  return specs;
}

function cleanSource(source: string): { source: string; issues: LuauIssue[] } {
  const fixed = autoFixLuau(source);
  const formatted = fixed.source;
  return { source: formatted, issues: validateLuau(formatted) };
}

/** Build the complete plan. Deterministic: same request, same plan. */
export function planBuild(request: BuildRequest): BuildPlan {
  const prompt = request.prompt ?? "";
  const genre = (request.genre ? getGenre(request.genre) : undefined) ?? detectGenre(prompt);
  const title = request.title?.trim() || titleFromPrompt(prompt);

  const systemKeys = new Set<string>([...genre.systems, ...(request.systems ?? [])]);
  for (const system of detectSystems(prompt)) systemKeys.add(system.key);
  const systems = resolveSystemOrder([...systemKeys]);

  const featureKeys = new Set<string>([...genre.features, ...(request.features ?? [])]);
  for (const feature of detectFeatures(prompt)) featureKeys.add(feature.key);
  const features = [...featureKeys];

  const screenSet = new Set<UiScreen>([...genre.screens, ...(request.screens ?? []), ...detectScreens(prompt)]);
  const screens = [...screenSet];

  const terrain =
    request.terrain !== undefined
      ? request.terrain
      : detectTerrainPreset(prompt) ?? (request.includeTerrain === false ? null : genre.terrain ?? null);

  const remotes = [
    ...new Set([...DEFAULT_REMOTES, ...remotesForFeatures(features), ...remotesForScreens(screens)]),
  ].sort();

  const artifacts: BuildArtifact[] = [];
  const issues: BuildPlan["issues"] = [];

  const push = (artifact: Omit<BuildArtifact, "source"> & { source: string }) => {
    const cleaned = cleanSource(artifact.source);
    if (cleaned.issues.length > 0) issues.push({ artifactId: artifact.id, issues: cleaned.issues });
    artifacts.push({ ...artifact, source: cleaned.source });
  };

  // 1. Systems ---------------------------------------------------------------
  for (const system of systems) {
    push({
      id: `system:${system.key}`,
      className: "ModuleScript",
      name: system.name,
      parentPath: systemParentPath(system),
      source: system.source,
      group: "system",
      why: system.description,
    });
  }

  // 2. Gameplay features -----------------------------------------------------
  const seenArtifact = new Set<string>();
  for (const key of features) {
    const feature = getFeature(key);
    if (!feature) continue;
    for (const artifact of feature.build() as FeatureArtifact[]) {
      const id = `feature:${key}:${artifact.name}`;
      const dedupe = `${artifact.parentPath}.${artifact.name}`;
      if (seenArtifact.has(dedupe)) continue;
      seenArtifact.add(dedupe);
      push({
        id,
        className: artifact.className,
        name: artifact.name,
        parentPath: artifact.parentPath,
        source: artifact.source,
        group: "gameplay",
        why: feature.summary,
      });
    }
  }

  // 3. Marketplace packs -----------------------------------------------------
  for (const packId of request.packs ?? []) {
    const pack = getPack(packId);
    if (!pack) continue;
    for (const artifact of pack.build()) {
      const dedupe = `${artifact.parentPath}.${artifact.name}`;
      if (seenArtifact.has(dedupe)) continue;
      seenArtifact.add(dedupe);
      push({
        id: `pack:${packId}:${artifact.name}`,
        className: artifact.className,
        name: artifact.name,
        parentPath: artifact.parentPath,
        source: artifact.source,
        group: "pack",
        why: pack.description,
      });
    }
  }

  // 4. UI --------------------------------------------------------------------
  for (const artifact of buildUiArtifacts({ screens, theme: request.theme, gameTitle: title })) {
    const dedupe = `${artifact.parentPath}.${artifact.name}`;
    if (seenArtifact.has(dedupe)) continue;
    seenArtifact.add(dedupe);
    push({
      id: `ui:${artifact.name}`,
      className: artifact.className,
      name: artifact.name,
      parentPath: artifact.parentPath,
      source: artifact.source,
      group: "ui",
      why: `UI screens: ${screens.join(", ")}`,
    });
  }

  // 5. Boot / glue -----------------------------------------------------------
  push({
    id: "boot:remotes",
    className: "Script",
    name: "RemoteBootstrap",
    parentPath: SERVICE_ROUTES.serverScript,
    source: remoteFolderLua(remotes),
    group: "boot",
    why: "Creates the RemoteEvents every generated script expects",
  });

  if (systems.some((system) => system.key === "profile_store")) {
    push({
      id: "boot:leaderstats",
      className: "Script",
      name: "LeaderstatsBridge",
      parentPath: SERVICE_ROUTES.serverScript,
      source: leaderstatsLua(),
      group: "boot",
      why: "Mirrors saved data onto the Roblox player list",
    });
  }

  push({
    id: "boot:systems",
    className: "Script",
    name: "BloxSmithBootstrap",
    parentPath: SERVICE_ROUTES.serverScript,
    source: buildSystemsBootstrap(systems),
    group: "boot",
    why: "Starts every generated server system exactly once",
  });

  if (genre.lighting) {
    push({
      id: "world:lighting",
      className: "Script",
      name: "LightingSetup",
      parentPath: SERVICE_ROUTES.serverScript,
      source: buildLightingLua(genre.lighting),
      group: "world",
      why: `Genre lighting preset: ${genre.lighting}`,
    });
  }

  // 6. World actions (terrain + objects) -------------------------------------
  const actions: BuildAction[] = [];

  actions.push({
    kind: "run_lua",
    parent_path: "Workspace",
    name: "BloxSmith_Explorer",
    payload: { source: buildExplorerScaffoldLua(), _bloxsmith: { source: "explorer_builder" } },
  });

  if (terrain) {
    actions.push(terrainAction({ preset: terrain, clear: true }));
  }

  const objects = request.objects ?? (request.includeWorld === false ? [] : worldObjectsFor(genre));
  if (objects.length > 0) {
    actions.push(objectsAction(objects, "BloxSmith_World_Objects"));
  }

  for (const artifact of artifacts) {
    actions.push({
      kind:
        artifact.className === "ModuleScript"
          ? "modulescript"
          : artifact.className === "LocalScript"
            ? "localscript"
            : "script",
      parent_path: artifact.parentPath,
      name: artifact.name,
      payload: {
        source: artifact.source,
        _bloxsmith: { artifactId: artifact.id, group: artifact.group, why: artifact.why },
      },
    });
  }

  const summary = [
    `Genre: ${genre.label} - ${genre.pitch}`,
    `Systems (${systems.length}): ${systems.map((system) => system.label).join(", ")}`,
    `Gameplay (${features.length}): ${features.join(", ")}`,
    `UI screens (${screens.length}): ${screens.join(", ")}`,
    terrain ? `Terrain: ${terrain}` : "Terrain: none",
    `Remotes: ${remotes.length}`,
    `Explorer folders: ${EXPLORER_SCAFFOLD.length}`,
    `Scripts: ${artifacts.length}`,
  ];

  return { title, genre, systems, features, screens, terrain, remotes, artifacts, actions, summary, issues };
}

export type RegenerateRequest = {
  plan: BuildPlan;
  /** Artifact ids, script names or "group:ui" selectors. */
  selectors: string[];
  existingSources?: Record<string, string>;
  strategy?: MergeStrategy;
};

export type RegenerateResult = {
  actions: BuildAction[];
  regenerated: Array<{ id: string; name: string; note: string }>;
  skipped: string[];
};

/**
 * Rebuild only the scripts the user selected, merging into whatever is already
 * in the project so hand-written edits survive.
 */
export function regenerateSelected(request: RegenerateRequest): RegenerateResult {
  const { plan, selectors, existingSources = {}, strategy = "append_section" } = request;
  const wanted = new Set(selectors.map((selector) => selector.trim().toLowerCase()));

  const matches = (artifact: BuildArtifact) =>
    wanted.has(artifact.id.toLowerCase()) ||
    wanted.has(artifact.name.toLowerCase()) ||
    wanted.has(`group:${artifact.group}`) ||
    wanted.has(`${artifact.parentPath}.${artifact.name}`.toLowerCase());

  const actions: BuildAction[] = [];
  const regenerated: RegenerateResult["regenerated"] = [];
  const skipped: string[] = [];

  for (const artifact of plan.artifacts) {
    if (!matches(artifact)) {
      skipped.push(artifact.name);
      continue;
    }
    const key = `${artifact.parentPath}.${artifact.name}`;
    const merged = mergeScript(existingSources[key] ?? existingSources[artifact.name], artifact.source, strategy);
    if (!merged.changed) {
      skipped.push(artifact.name);
      continue;
    }
    regenerated.push({ id: artifact.id, name: artifact.name, note: merged.note });
    actions.push({
      kind:
        artifact.className === "ModuleScript"
          ? "modulescript"
          : artifact.className === "LocalScript"
            ? "localscript"
            : "script",
      parent_path: artifact.parentPath,
      name: artifact.name,
      payload: {
        source: formatLua(merged.source),
        _bloxsmith: { artifactId: artifact.id, regenerated: true, note: merged.note },
      },
    });
  }

  return { actions, regenerated, skipped };
}

/** Human-readable build log for the chat panel. */
export function describePlan(plan: BuildPlan): string {
  const lines = [`**${plan.title}**`, "", ...plan.summary.map((entry) => `- ${entry}`), "", "**Scripts**"];
  const grouped = plan.artifacts.reduce<Record<string, BuildArtifact[]>>((acc, artifact) => {
    (acc[artifact.group] ??= []).push(artifact);
    return acc;
  }, {});
  for (const [group, list] of Object.entries(grouped)) {
    lines.push(`- ${group}: ${list.map((artifact) => artifact.name).join(", ")}`);
  }
  if (plan.issues.length > 0) {
    lines.push("", "**Validator notes**");
    for (const entry of plan.issues) {
      lines.push(`- ${entry.artifactId}: ${entry.issues.map((issue) => issue.message).join("; ")}`);
    }
  }
  return lines.join("\n");
}
