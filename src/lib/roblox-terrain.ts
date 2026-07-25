// BloxSmith Terrain Builder
// ---------------------------------------------------------------------------
// Procedural terrain/biome generators. Each preset compiles to a run_lua
// action that fills real Roblox Terrain (not parts) inside one
// ChangeHistoryService recording so the whole map is a single undo.

export const TERRAIN_PRESETS = [
  "mountains",
  "river",
  "caves",
  "forest",
  "island",
  "city",
  "village",
  "ocean",
  "volcano",
  "mine",
  "dungeon",
  "floating_islands",
  "procedural_map",
] as const;

export type TerrainPreset = (typeof TERRAIN_PRESETS)[number];

export type TerrainOptions = {
  preset: TerrainPreset;
  /** Square map size in studs. */
  size?: number;
  /** Vertical scale multiplier. */
  height?: number;
  /** Deterministic seed so the same prompt rebuilds the same map. */
  seed?: number;
  /** Clear existing terrain in the region first. */
  clear?: boolean;
};

export const TERRAIN_LABELS: Record<TerrainPreset, string> = {
  mountains: "Mountain range",
  river: "River valley",
  caves: "Cave network",
  forest: "Forest",
  island: "Tropical island",
  city: "City block grid",
  village: "Village",
  ocean: "Open ocean",
  volcano: "Volcano",
  mine: "Underground mine",
  dungeon: "Dungeon",
  floating_islands: "Floating islands",
  procedural_map: "Procedural mixed map",
};

const PRESET_BODY: Record<TerrainPreset, string> = {
  mountains: `local h = noise(x, z, 90) * 120 * HEIGHT + noise(x, z, 25) * 30 * HEIGHT
    fillColumn(x, z, h, h > 70 * HEIGHT and Enum.Material.Snow or Enum.Material.Rock)`,
  river: `local bank = noise(x, z, 70) * 30 * HEIGHT
    local channel = math.abs(z + noise(x, 0, 140) * 120)
    if channel < 40 then
      fillColumn(x, z, -8, Enum.Material.Water)
    else
      fillColumn(x, z, bank + 6, Enum.Material.Grass)
    end`,
  caves: `local h = 40 * HEIGHT + noise(x, z, 80) * 40 * HEIGHT
    fillColumn(x, z, h, Enum.Material.Rock)
    local hollow = noise(x, z, 45)
    if hollow > 0.55 then
      terrain:FillBall(Vector3.new(x, h * 0.35, z), 14 + hollow * 16, Enum.Material.Air)
    end`,
  forest: `local h = 12 * HEIGHT + noise(x, z, 60) * 22 * HEIGHT
    fillColumn(x, z, h, Enum.Material.LeafyGrass)
    if noise(x, z, 12) > 0.72 then table.insert(props, { pos = Vector3.new(x, h, z), kind = "tree" }) end`,
  island: `local d = math.sqrt(x * x + z * z) / (SIZE * 0.5)
    local h = (1 - d) * 70 * HEIGHT + noise(x, z, 55) * 20 * HEIGHT
    if h > 2 then
      fillColumn(x, z, h, h < 10 and Enum.Material.Sand or Enum.Material.Grass)
    else
      fillColumn(x, z, -10, Enum.Material.Water)
    end`,
  city: `fillColumn(x, z, 4, Enum.Material.Asphalt)
    if (math.floor(x / 120) % 2 == 0) and (math.floor(z / 120) % 2 == 0) and noise(x, z, 30) > 0.35 then
      table.insert(props, { pos = Vector3.new(x, 4, z), kind = "building", h = 40 + noise(x, z, 18) * 140 })
    end`,
  village: `local h = 6 * HEIGHT + noise(x, z, 80) * 10 * HEIGHT
    fillColumn(x, z, h, Enum.Material.Grass)
    if noise(x, z, 22) > 0.8 then table.insert(props, { pos = Vector3.new(x, h, z), kind = "house" }) end`,
  ocean: `local h = noise(x, z, 100) * 6
    fillColumn(x, z, -60, Enum.Material.Water)
    if h > 5.2 then fillColumn(x, z, 4, Enum.Material.Sand) end`,
  volcano: `local d = math.sqrt(x * x + z * z)
    local cone = math.max(0, (1 - d / (SIZE * 0.45))) * 200 * HEIGHT
    local crater = d < 80 and (80 - d) * 2.2 or 0
    local h = cone - crater
    fillColumn(x, z, h, d < 90 and Enum.Material.CrackedLava or Enum.Material.Basalt)
    if d < 60 then terrain:FillBall(Vector3.new(x, h - 10, z), 12, Enum.Material.CrackedLava) end`,
  mine: `fillColumn(x, z, 30 * HEIGHT, Enum.Material.Slate)
    local tunnel = noise(x, z, 40)
    if tunnel > 0.6 then
      terrain:FillBlock(CFrame.new(x, 10, z), Vector3.new(RES * 2, 18, RES * 2), Enum.Material.Air)
      if noise(x, z, 9) > 0.85 then table.insert(props, { pos = Vector3.new(x, 6, z), kind = "ore" }) end
    end`,
  dungeon: `fillColumn(x, z, 26 * HEIGHT, Enum.Material.Cobblestone)
    local room = math.max(math.abs(math.sin(x / 260)), math.abs(math.sin(z / 260)))
    if room < 0.75 then
      terrain:FillBlock(CFrame.new(x, 12, z), Vector3.new(RES * 2, 22, RES * 2), Enum.Material.Air)
    end`,
  floating_islands: `local n = noise(x, z, 130)
    if n > 0.62 then
      local y = 120 + noise(x, z, 60) * 90
      terrain:FillBall(Vector3.new(x, y, z), 20 + n * 40, Enum.Material.Grass)
      terrain:FillBall(Vector3.new(x, y - 24, z), 14 + n * 24, Enum.Material.Rock)
    end`,
  procedural_map: `local biome = noise(x, z, 220)
    if biome < 0.33 then
      fillColumn(x, z, 10 * HEIGHT + noise(x, z, 60) * 18 * HEIGHT, Enum.Material.Grass)
    elseif biome < 0.62 then
      fillColumn(x, z, 60 * HEIGHT + noise(x, z, 70) * 70 * HEIGHT, Enum.Material.Rock)
    else
      fillColumn(x, z, -12, Enum.Material.Water)
    end`,
};

/** Compile a terrain preset into deterministic, undo-safe Luau. */
export function compileTerrainLua(options: TerrainOptions): string {
  const preset = TERRAIN_PRESETS.includes(options.preset) ? options.preset : "procedural_map";
  const size = Math.min(4096, Math.max(256, Math.round(options.size ?? 1024)));
  const height = Math.min(4, Math.max(0.25, options.height ?? 1));
  const seed = Math.round(options.seed ?? 1337);
  const clear = options.clear !== false;

  return [
    `-- BloxSmith Terrain Builder: ${TERRAIN_LABELS[preset]} (${size} studs, seed ${seed})`,
    'local ChangeHistoryService = game:GetService("ChangeHistoryService")',
    "local terrain = workspace.Terrain",
    `local SIZE, HEIGHT, SEED = ${size}, ${height}, ${seed}`,
    "local RES = math.max(8, math.floor(SIZE / 64))",
    "local props = {}",
    "",
    "local function noise(x, z, scale)",
    "  return (math.noise(x / scale, z / scale, SEED % 1000 / 10) + 1) * 0.5",
    "end",
    "",
    "local function fillColumn(x, z, h, material)",
    "  if h <= 0 then",
    "    terrain:FillBlock(CFrame.new(x, h / 2, z), Vector3.new(RES * 2, math.abs(h) + 4, RES * 2), material)",
    "    return",
    "  end",
    "  terrain:FillBlock(CFrame.new(x, h / 2, z), Vector3.new(RES * 2, h, RES * 2), material)",
    "end",
    "",
    'local recording = ChangeHistoryService:TryBeginRecording("BloxSmith Terrain")',
    clear
      ? "terrain:FillBlock(CFrame.new(0, 0, 0), Vector3.new(SIZE, 600, SIZE), Enum.Material.Air)"
      : "-- keeping existing terrain",
    "",
    "local budget = 0",
    "for x = -SIZE / 2, SIZE / 2, RES do",
    "  for z = -SIZE / 2, SIZE / 2, RES do",
    `    ${PRESET_BODY[preset]}`,
    "    budget += 1",
    "    if budget % 400 == 0 then task.wait() end",
    "  end",
    "end",
    "",
    "-- Prop pass: trees, buildings, ore veins are cheap parts grouped in one folder.",
    'local folder = workspace:FindFirstChild("BloxSmith_World") or Instance.new("Folder")',
    'folder.Name = "BloxSmith_World"',
    "folder.Parent = workspace",
    'local mapFolder = folder:FindFirstChild("Map") or Instance.new("Folder")',
    'mapFolder.Name = "Map"',
    "mapFolder.Parent = folder",
    "for i, prop in ipairs(props) do",
    "  if i > 400 then break end",
    '  local part = Instance.new("Part")',
    "  part.Anchored = true",
    '  if prop.kind == "tree" then',
    "    part.Size = Vector3.new(4, 22, 4)",
    "    part.Color = Color3.fromRGB(92, 64, 40)",
    "    part.Material = Enum.Material.Wood",
    '    local leaves = Instance.new("Part")',
    "    leaves.Shape = Enum.PartType.Ball",
    "    leaves.Size = Vector3.new(16, 16, 16)",
    "    leaves.Anchored = true",
    "    leaves.Color = Color3.fromRGB(52, 142, 64)",
    "    leaves.Material = Enum.Material.Grass",
    "    leaves.CFrame = CFrame.new(prop.pos + Vector3.new(0, 24, 0))",
    '    leaves.Name = "Canopy"',
    "    leaves.Parent = mapFolder",
    '  elseif prop.kind == "building" then',
    "    part.Size = Vector3.new(60, prop.h or 60, 60)",
    "    part.Color = Color3.fromRGB(120, 128, 140)",
    "    part.Material = Enum.Material.Concrete",
    '  elseif prop.kind == "house" then',
    "    part.Size = Vector3.new(24, 16, 24)",
    "    part.Color = Color3.fromRGB(184, 148, 108)",
    "    part.Material = Enum.Material.WoodPlanks",
    "  else",
    "    part.Size = Vector3.new(6, 6, 6)",
    "    part.Color = Color3.fromRGB(220, 190, 90)",
    "    part.Material = Enum.Material.Metal",
    "  end",
    "  part.CFrame = CFrame.new(prop.pos + Vector3.new(0, part.Size.Y / 2, 0))",
    '  part.Name = ("BloxSmith_%s_%d"):format(prop.kind, i)',
    "  part.Parent = mapFolder",
    "end",
    "",
    "if recording then ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end",
    `print(("[BloxSmith] Terrain built: ${TERRAIN_LABELS[preset]} (%d props)"):format(math.min(#props, 400)))`,
  ].join("\n");
}

/** Ready-to-queue plugin action for a terrain preset. */
export function terrainAction(options: TerrainOptions) {
  return {
    kind: "run_lua" as const,
    parent_path: "Workspace",
    name: `BloxSmith_Terrain_${options.preset}`,
    payload: {
      source: compileTerrainLua(options),
      _bloxsmith: { source: "terrain_builder", preset: options.preset },
    },
  };
}

/** Map free text to the closest terrain preset. */
export function detectTerrainPreset(prompt: string): TerrainPreset | null {
  const p = prompt.toLowerCase();
  const rules: Array<[RegExp, TerrainPreset]> = [
    [/floating\s*island|sky\s*island/, "floating_islands"],
    [/volcano|lava\s*mountain/, "volcano"],
    [/mine|mining\s*tunnel|quarry/, "mine"],
    [/dungeon|catacomb|crypt/, "dungeon"],
    [/cave|cavern/, "caves"],
    [/river|stream|valley/, "river"],
    [/forest|woods|jungle/, "forest"],
    [/island|tropical|beach/, "island"],
    [/city|urban|skyscraper/, "city"],
    [/village|hamlet|town/, "village"],
    [/ocean|sea|underwater/, "ocean"],
    [/mountain|alp|peak/, "mountains"],
    [/procedural|random\s*map|generate\s*a?\s*map/, "procedural_map"],
  ];
  for (const [re, preset] of rules) if (re.test(p)) return preset;
  return null;
}
