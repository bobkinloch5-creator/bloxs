// BloxSmith Genre Blueprints
// ---------------------------------------------------------------------------
// A blueprint maps a genre ("tycoon", "tower defense", ...) to the exact set of
// systems, gameplay features, UI screens, terrain and world objects that a
// production-ready game of that genre needs.

import type { TerrainPreset } from "./roblox-terrain";
import type { UiScreen } from "./roblox-ui-kit";

export type GenreKey =
  | "tycoon"
  | "simulator"
  | "rpg"
  | "obby"
  | "tower_defense"
  | "survival"
  | "horror"
  | "fps"
  | "racing"
  | "idle"
  | "sandbox";

export type GenreBlueprint = {
  key: GenreKey;
  label: string;
  keywords: RegExp;
  pitch: string;
  systems: string[];
  features: string[];
  screens: UiScreen[];
  terrain?: TerrainPreset;
  lighting?: "day" | "night" | "horror" | "sunset";
  worldNotes: string[];
};

const BASE_SCREENS: UiScreen[] = ["hud", "loading", "notifications", "settings"];

export const GENRE_BLUEPRINTS: GenreBlueprint[] = [
  {
    key: "tycoon",
    label: "Tycoon",
    keywords: /\b(tycoon|factory|business|empire|dropper)\b/i,
    pitch: "Plot based income game with droppers, upgrades and rebirths.",
    systems: ["profile_store", "economy", "monetization", "daily_rewards", "leaderboards", "analytics", "settings"],
    features: ["tycoon", "inventory", "quests"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "inventory", "rebirth", "daily_rewards", "leaderboard", "popup"],
    terrain: "island",
    lighting: "day",
    worldNotes: ["Flat plot baseplates per player", "Central spawn plaza with shop prompts"],
  },
  {
    key: "simulator",
    label: "Simulator",
    keywords: /\b(simulator|sim\s*game|clicker|pet\s*sim|hatch)\b/i,
    pitch: "Collect, sell, upgrade and rebirth loop with pets and multipliers.",
    systems: ["profile_store", "economy", "monetization", "daily_rewards", "achievements", "leaderboards", "analytics", "settings"],
    features: ["pets", "gathering", "inventory", "idle", "quests"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "inventory", "pets", "rebirth", "daily_rewards", "leaderboard", "quests", "popup"],
    terrain: "floating_islands",
    lighting: "day",
    worldNotes: ["Zone islands with escalating value", "Egg pedestals with ProximityPrompts"],
  },
  {
    key: "rpg",
    label: "RPG",
    keywords: /\b(rpg|adventure|dungeon\s*crawler|fantasy|questline)\b/i,
    pitch: "Levels, skills, quests, combat, loot and NPC towns.",
    systems: ["profile_store", "economy", "monetization", "achievements", "leaderboards", "analytics", "settings", "trading"],
    features: ["npcs", "combat", "tools", "inventory", "quests", "skills", "gathering", "animations"],
    screens: [...BASE_SCREENS, "main_menu", "inventory", "shop", "quests", "skill_tree", "trading", "crafting", "dialog", "leaderboard", "popup"],
    terrain: "forest",
    lighting: "sunset",
    worldNotes: ["Village hub with quest-giver NPCs", "Dungeon entrance teleporters"],
  },
  {
    key: "obby",
    label: "Obby",
    keywords: /\b(obby|parkour|tower\s*of|difficulty\s*chart)\b/i,
    pitch: "Staged obstacle course with saved checkpoints and skip passes.",
    systems: ["profile_store", "monetization", "leaderboards", "analytics", "settings"],
    features: ["obby"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "leaderboard", "popup"],
    terrain: "floating_islands",
    lighting: "day",
    worldNotes: ["Numbered checkpoint spawns", "Kill bricks and moving platforms"],
  },
  {
    key: "tower_defense",
    label: "Tower Defense",
    keywords: /\b(tower\s*defen|td\b|wave\s*defense)\b/i,
    pitch: "Wave based defense with tower placement economy and base health.",
    systems: ["profile_store", "economy", "monetization", "matchmaking", "leaderboards", "analytics", "settings"],
    features: ["tower_defense", "npcs", "combat", "inventory"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "inventory", "leaderboard", "popup"],
    terrain: "village",
    lighting: "day",
    worldNotes: ["Waypoint path parts for enemy routing", "Tower placement pads"],
  },
  {
    key: "survival",
    label: "Survival",
    keywords: /\b(survival|craft\s*and\s*survive|wilderness|stranded)\b/i,
    pitch: "Gather, craft, build and stay alive through day and night cycles.",
    systems: ["profile_store", "economy", "analytics", "settings", "achievements"],
    features: ["survival", "gathering", "inventory", "combat", "npcs", "tools"],
    screens: [...BASE_SCREENS, "inventory", "crafting", "quests", "popup"],
    terrain: "island",
    lighting: "day",
    worldNotes: ["Resource nodes scattered by biome", "Campfire safe zones"],
  },
  {
    key: "horror",
    label: "Horror",
    keywords: /\b(horror|scary|haunted|nightmare|backrooms)\b/i,
    pitch: "Atmospheric survival horror with sanity, flashlight and a stalker.",
    systems: ["profile_store", "analytics", "settings", "achievements"],
    features: ["horror", "npcs", "animations"],
    screens: [...BASE_SCREENS, "main_menu", "dialog", "popup"],
    terrain: "dungeon",
    lighting: "horror",
    worldNotes: ["Dark corridors with flickering lights", "Hiding spots with ProximityPrompts"],
  },
  {
    key: "fps",
    label: "FPS",
    keywords: /\b(fps|shooter|gun\s*game|deathmatch|battle\s*royale)\b/i,
    pitch: "Round based shooter with teams, weapons and matchmaking.",
    systems: ["profile_store", "economy", "monetization", "matchmaking", "leaderboards", "analytics", "settings"],
    features: ["combat", "tools", "npcs", "animations", "inventory"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "inventory", "leaderboard", "popup"],
    terrain: "city",
    lighting: "day",
    worldNotes: ["Team spawn zones", "Cover geometry and weapon pickups"],
  },
  {
    key: "racing",
    label: "Racing",
    keywords: /\b(racing|race|kart|drift|speedrun\s*track)\b/i,
    pitch: "Lap racing with checkpoints, timers and unlockable vehicles.",
    systems: ["profile_store", "economy", "monetization", "matchmaking", "leaderboards", "analytics", "settings"],
    features: ["racing", "animations"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "leaderboard", "popup"],
    terrain: "mountains",
    lighting: "sunset",
    worldNotes: ["Ordered checkpoint gates", "Vehicle spawn pads at the grid"],
  },
  {
    key: "idle",
    label: "Idle",
    keywords: /\b(idle|afk|incremental|offline\s*earning)\b/i,
    pitch: "Passive income with offline earnings, upgrades and prestige.",
    systems: ["profile_store", "economy", "monetization", "daily_rewards", "leaderboards", "analytics", "settings"],
    features: ["idle", "inventory", "pets"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "rebirth", "daily_rewards", "leaderboard", "popup"],
    terrain: "floating_islands",
    lighting: "night",
    worldNotes: ["Upgrade pedestals with ClickDetectors", "Idle income billboard"],
  },
  {
    key: "sandbox",
    label: "Sandbox / general",
    keywords: /\b(sandbox|hangout|roleplay|showcase|general)\b/i,
    pitch: "Flexible social base with economy, shop, saving and UI.",
    systems: ["profile_store", "economy", "monetization", "analytics", "settings"],
    features: ["inventory", "npcs", "animations"],
    screens: [...BASE_SCREENS, "main_menu", "shop", "inventory", "popup"],
    terrain: "island",
    lighting: "day",
    worldNotes: ["Central spawn plaza", "Interactive props with prompts"],
  },
];

export function getGenre(key: string): GenreBlueprint | undefined {
  return GENRE_BLUEPRINTS.find((genre) => genre.key === key);
}

/** Best-effort genre detection; falls back to sandbox. */
export function detectGenre(prompt: string): GenreBlueprint {
  let best: { genre: GenreBlueprint; score: number } | null = null;
  for (const genre of GENRE_BLUEPRINTS) {
    const matches = prompt.match(new RegExp(genre.keywords.source, "gi"));
    const score = matches ? matches.length : 0;
    if (score > 0 && (!best || score > best.score)) best = { genre, score };
  }
  return best?.genre ?? GENRE_BLUEPRINTS[GENRE_BLUEPRINTS.length - 1];
}

export const LIGHTING_PRESETS: Record<string, Record<string, string | number>> = {
  day: { ClockTime: 14, Brightness: 2.4, Ambient: "140,140,150", FogEnd: 6000 },
  sunset: { ClockTime: 17.4, Brightness: 2, Ambient: "120,100,90", FogEnd: 2400 },
  night: { ClockTime: 0.6, Brightness: 1, Ambient: "40,44,64", FogEnd: 1200 },
  horror: { ClockTime: 0, Brightness: 0.5, Ambient: "12,12,18", FogEnd: 90 },
};

/** Lua that applies the genre lighting preset plus a shared atmosphere. */
export function buildLightingLua(preset: keyof typeof LIGHTING_PRESETS): string {
  const values = LIGHTING_PRESETS[preset] ?? LIGHTING_PRESETS.day;
  const ambient = String(values.Ambient).split(",").map((n) => n.trim());
  return [
    "-- Lighting preset: " + preset,
    'local Lighting = game:GetService("Lighting")',
    `Lighting.ClockTime = ${values.ClockTime}`,
    `Lighting.Brightness = ${values.Brightness}`,
    `Lighting.Ambient = Color3.fromRGB(${ambient.join(", ")})`,
    `Lighting.OutdoorAmbient = Color3.fromRGB(${ambient.join(", ")})`,
    `Lighting.FogEnd = ${values.FogEnd}`,
    "Lighting.GlobalShadows = true",
    "Lighting.Technology = Enum.Technology.Future",
    "",
    'local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")',
    "atmosphere.Density = 0.32",
    "atmosphere.Haze = 1.2",
    "atmosphere.Glare = 0.2",
    "atmosphere.Parent = Lighting",
    "",
    'local bloom = Lighting:FindFirstChildOfClass("BloomEffect") or Instance.new("BloomEffect")',
    "bloom.Intensity = 0.5",
    "bloom.Threshold = 1.1",
    "bloom.Parent = Lighting",
  ].join("\n");
}
