// BloxSmith Explorer Builder
// ---------------------------------------------------------------------------
// Single source of truth for the Roblox Explorer hierarchy BloxSmith builds.
// Every generated instance is routed to the service Roblox actually expects,
// so a build never ends up with a LocalScript in ServerScriptService or a
// Part inside ReplicatedStorage.

export const ROBLOX_SERVICES = [
  "Workspace",
  "ReplicatedStorage",
  "ReplicatedFirst",
  "ServerStorage",
  "ServerScriptService",
  "StarterPlayer",
  "StarterGui",
  "StarterPack",
  "Lighting",
  "SoundService",
  "Teams",
  "Chat",
  "TextChatService",
] as const;

export type RobloxService = (typeof ROBLOX_SERVICES)[number];

/** Canonical folder layout created before anything else is built. */
export const EXPLORER_SCAFFOLD: Array<{ path: string; why: string }> = [
  { path: "Workspace.BloxSmith_World", why: "All generated geometry, spawns and props" },
  { path: "Workspace.BloxSmith_World.Map", why: "Terrain props, structures, decorations" },
  { path: "Workspace.BloxSmith_World.Spawns", why: "SpawnLocations and teleport pads" },
  { path: "Workspace.BloxSmith_World.NPCs", why: "NPC and enemy rigs placed in the world" },
  { path: "Workspace.BloxSmith_World.Interactables", why: "ProximityPrompts, ClickDetectors, chests" },
  { path: "ReplicatedStorage.BloxSmith", why: "Root namespace shared with the client" },
  { path: "ReplicatedStorage.BloxSmith.Modules", why: "Shared ModuleScripts (config, utils, types)" },
  { path: "ReplicatedStorage.BloxSmith.Remotes", why: "RemoteEvents and RemoteFunctions" },
  { path: "ReplicatedStorage.BloxSmith.Assets", why: "Cloned templates: tools, pets, effects" },
  { path: "ReplicatedStorage.BloxSmith.Animations", why: "Animation objects referenced by id" },
  { path: "ReplicatedFirst.BloxSmith_Boot", why: "Loading screen and preload, runs first" },
  { path: "ServerStorage.BloxSmith_Server", why: "Server-only templates and secrets" },
  { path: "ServerStorage.BloxSmith_Server.Templates", why: "Enemy/NPC/tool source models" },
  { path: "ServerScriptService.BloxSmith_Systems", why: "Server system ModuleScripts" },
  { path: "ServerScriptService.BloxSmith_Runtime", why: "Server Scripts that boot the systems" },
  { path: "StarterPlayer.StarterPlayerScripts.BloxSmith_Client", why: "Client controllers" },
  { path: "StarterGui.BloxSmith_UI", why: "All generated ScreenGuis" },
  { path: "SoundService.BloxSmith_Audio", why: "Music and SFX groups" },
];

/**
 * Where each logical artifact type belongs. Used by the orchestrator and by
 * normalizeParentPath so routing is identical no matter who emits the action.
 */
export const SERVICE_ROUTES = {
  serverScript: "ServerScriptService.BloxSmith_Runtime",
  serverModule: "ServerScriptService.BloxSmith_Systems",
  sharedModule: "ReplicatedStorage.BloxSmith.Modules",
  clientScript: "StarterPlayer.StarterPlayerScripts.BloxSmith_Client",
  characterScript: "StarterPlayer.StarterCharacterScripts",
  bootScript: "ReplicatedFirst.BloxSmith_Boot",
  remotes: "ReplicatedStorage.BloxSmith.Remotes",
  assets: "ReplicatedStorage.BloxSmith.Assets",
  animations: "ReplicatedStorage.BloxSmith.Animations",
  serverTemplates: "ServerStorage.BloxSmith_Server.Templates",
  ui: "StarterGui.BloxSmith_UI",
  tools: "StarterPack",
  world: "Workspace.BloxSmith_World",
  map: "Workspace.BloxSmith_World.Map",
  spawns: "Workspace.BloxSmith_World.Spawns",
  npcs: "Workspace.BloxSmith_World.NPCs",
  interactables: "Workspace.BloxSmith_World.Interactables",
  audio: "SoundService.BloxSmith_Audio",
  lighting: "Lighting",
  teams: "Teams",
  chat: "TextChatService",
} as const;

export type ArtifactSlot = keyof typeof SERVICE_ROUTES;

/** Human-readable reason a path was chosen, surfaced in the build log. */
export function explainRoute(slot: ArtifactSlot): string {
  const reasons: Record<ArtifactSlot, string> = {
    serverScript: "Server Scripts only run inside ServerScriptService.",
    serverModule: "Server systems stay server-side so exploiters cannot read them.",
    sharedModule: "Shared config must replicate to the client.",
    clientScript: "LocalScripts only run from StarterPlayerScripts or StarterGui.",
    characterScript: "Character-bound LocalScripts respawn with the player.",
    bootScript: "ReplicatedFirst runs before the default loading screen is removed.",
    remotes: "Remotes must be visible to both server and client.",
    assets: "Client-cloneable templates live in ReplicatedStorage.",
    animations: "Animation instances need client replication.",
    serverTemplates: "Enemy/NPC sources stay in ServerStorage until spawned.",
    ui: "ScreenGuis are copied to PlayerGui from StarterGui.",
    tools: "StarterPack grants tools on spawn.",
    world: "Physical instances must live under Workspace.",
    map: "Static geometry grouped for streaming and culling.",
    spawns: "SpawnLocations must be in Workspace to be used.",
    npcs: "NPC rigs need Workspace to simulate.",
    interactables: "Prompts and detectors need Workspace to be reachable.",
    audio: "SoundService centralises volume and SoundGroups.",
    lighting: "Sky, Atmosphere and post-effects only work in Lighting.",
    teams: "Team objects are children of the Teams service.",
    chat: "TextChatService owns modern chat customisation.",
  };
  return reasons[slot];
}

const CLASS_SLOT_RULES: Array<{ test: RegExp; slot: ArtifactSlot }> = [
  { test: /^(ScreenGui|BillboardGui|SurfaceGui)$/i, slot: "ui" },
  { test: /^(RemoteEvent|RemoteFunction|UnreliableRemoteEvent|BindableEvent|BindableFunction)$/i, slot: "remotes" },
  { test: /^(Tool|HopperBin)$/i, slot: "tools" },
  { test: /^(Sound|SoundGroup)$/i, slot: "audio" },
  { test: /^(Sky|Atmosphere|Clouds|BloomEffect|BlurEffect|ColorCorrectionEffect|SunRaysEffect|DepthOfFieldEffect)$/i, slot: "lighting" },
  { test: /^(Team)$/i, slot: "teams" },
  { test: /^(SpawnLocation)$/i, slot: "spawns" },
  { test: /^(Animation|KeyframeSequence)$/i, slot: "animations" },
  { test: /^(Part|MeshPart|UnionOperation|WedgePart|TrussPart|Model|Folder|Seat|VehicleSeat)$/i, slot: "map" },
];

/** Best-effort ClassName to Explorer path resolution. */
export function routeForClass(className: string, hint?: string): { path: string; slot: ArtifactSlot } {
  const h = (hint ?? "").toLowerCase();
  if (/^ModuleScript$/i.test(className)) {
    const slot: ArtifactSlot = /server|datastore|profile|purchase|matchmak|analytic|save/.test(h)
      ? "serverModule"
      : "sharedModule";
    return { path: SERVICE_ROUTES[slot], slot };
  }
  if (/^LocalScript$/i.test(className)) {
    if (/character|humanoid|respawn/.test(h)) return { path: SERVICE_ROUTES.characterScript, slot: "characterScript" };
    if (/loading|preload|boot|splash/.test(h)) return { path: SERVICE_ROUTES.bootScript, slot: "bootScript" };
    return { path: SERVICE_ROUTES.clientScript, slot: "clientScript" };
  }
  if (/^Script$/i.test(className)) return { path: SERVICE_ROUTES.serverScript, slot: "serverScript" };
  for (const rule of CLASS_SLOT_RULES) {
    if (rule.test.test(className)) return { path: SERVICE_ROUTES[rule.slot], slot: rule.slot };
  }
  return { path: SERVICE_ROUTES.world, slot: "world" };
}

/** Lua that guarantees the whole scaffold exists (idempotent, undo-safe). */
export function buildExplorerScaffoldLua(paths: string[] = EXPLORER_SCAFFOLD.map((e) => e.path)): string {
  const list = paths.map((p) => `  "${p}",`).join("\n");
  return [
    "-- BloxSmith Explorer Builder: create the canonical service hierarchy.",
    'local ChangeHistoryService = game:GetService("ChangeHistoryService")',
    "local WANTED = {",
    list,
    "}",
    "",
    "local function ensurePath(path)",
    "  local segments = {}",
    '  for seg in string.gmatch(path, "[^%.]+") do table.insert(segments, seg) end',
    "  local ok, node = pcall(function() return game:GetService(segments[1]) end)",
    "  if not ok or not node then return nil end",
    "  for i = 2, #segments do",
    "    local name = segments[i]",
    "    local child = node:FindFirstChild(name)",
    "    if not child then",
    '      child = Instance.new("Folder")',
    "      child.Name = name",
    "      child.Parent = node",
    "    end",
    "    node = child",
    "  end",
    "  return node",
    "end",
    "",
    'local recording = ChangeHistoryService:TryBeginRecording("BloxSmith Explorer Scaffold")',
    "local made = 0",
    "for _, path in ipairs(WANTED) do",
    "  if ensurePath(path) then made += 1 end",
    "end",
    "if recording then ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end",
    'print(("[BloxSmith] Explorer ready - %d service paths verified"):format(made))',
  ].join("\n");
}

/** True when a path points at a service that can only hold code. */
export function isCodeOnlyPath(path: string): boolean {
  return /^(ServerScriptService|ServerStorage|ReplicatedStorage|ReplicatedFirst|StarterPlayer)(\.|$)/i.test(path.trim());
}
