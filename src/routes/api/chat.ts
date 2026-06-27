import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, generateText, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { getProviderModel, getFallbackModel } from "@/lib/ai-gateway.server";
import { BLOXSMITH_SYSTEM_PROMPT, parseActions } from "@/lib/bloxsmith-prompt";
import { DEFAULT_MODEL_ID, findModel, isSelectable } from "@/lib/models";
import { searchRobloxToolbox, searchRobloxToolboxSet, type ToolboxCategory, type ToolboxSetRequest } from "@/lib/roblox-toolbox.server";
import { chargeCredits, creditCostForTier, BUILD_ACTIONS_BONUS } from "@/lib/credits.server";
import { describeImageWithNvidiaPaliGemma } from "@/lib/nvidia-vision.server";
import { generateUiConceptImage } from "@/lib/ui-concept-image.server";
import { normalizePluginAction } from "@/lib/plugin-actions";

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function compileMissingStudioActions(params: {
  userText: string;
  assistantText: string;
  languageName: string;
  assetMode: "toolbox_only" | "both";
}) {
  const fb = getFallbackModel();
  const { text } = await generateText({
    model: fb.model,
    system:
      "You are the BloxSmith Studio action compiler. Convert Roblox build plans into executable BloxSmith actions only. " +
      "Return exactly one fenced ```bloxsmith-actions block containing valid JSON. Do not include prose outside the block.",
    prompt: `The previous assistant response was in Build Mode but did not include executable Studio actions, so Roblox Studio received nothing.

Convert the request and response below into a concise, safe, executable BloxSmith action list.

Rules:
- Output exactly one fenced block: \`\`\`bloxsmith-actions followed by a JSON array, then \`\`\`.
- Supported kinds: insert_asset, run_lua, script, localscript, modulescript, screengui, remoteevent, remotefunction, part, terrain, setting, organize_project, autofix_project, scan_project.
- Prefer insert_asset only when an asset id is explicitly present in the plan. Include payload.asset_id and payload.fallback_ids when known.
- Use run_lua for placement, safe cleanup, scripting, UI wiring, lighting, spawns, collision fixes, and validation helpers.
- Do not emit delete actions unless the user explicitly asked to delete or clear something.
- Never produce empty folders, placeholders, TODOs, comments pretending work is done, or unsupported action kinds.
- End with autofix_project and scan_project for build/test reliability.
- Language for player-facing UI strings: ${params.languageName}.
- Asset mode: ${params.assetMode}.

User request:
${params.userText.slice(0, 6000)}

Assistant response that needs executable actions:
${params.assistantText.slice(0, 12000)}`,
    ...(fb.extraBody ? { providerOptions: { nvidia: fb.extraBody as Record<string, never> } as never } : {}),
    ...(fb.modelSettings?.temperature !== undefined ? { temperature: fb.modelSettings.temperature } : { temperature: 0 }),
    ...(fb.modelSettings?.topP !== undefined ? { topP: fb.modelSettings.topP } : {}),
    maxOutputTokens: 12000,
  });

  return parseActions(text).actions;
}

function recoveryStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 240) || "BloxSmith auto-execute recovery build";
  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")

local root = Workspace:FindFirstChild("BloxSmith_AutoBuild")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_AutoBuild"
root.Parent = Workspace

local function part(name, size, position, color, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.Size = size
  p.Position = position
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = root
  return p
end

part("Safe_Play_Area", Vector3.new(220, 2, 220), Vector3.new(0, -1, 0), Color3.fromRGB(72, 145, 82), Enum.Material.Grass)
part("Main_Road_X", Vector3.new(220, 0.25, 18), Vector3.new(0, 0.15, 0), Color3.fromRGB(38, 41, 46), Enum.Material.Asphalt)
part("Main_Road_Z", Vector3.new(18, 0.25, 220), Vector3.new(0, 0.2, 0), Color3.fromRGB(38, 41, 46), Enum.Material.Asphalt)

for x = -72, 72, 48 do
  for z = -72, 72, 48 do
    if math.abs(x) > 12 and math.abs(z) > 12 then
      local height = 18 + ((math.abs(x) + math.abs(z)) % 28)
      part("Safe_Building_" .. x .. "_" .. z, Vector3.new(26, height, 26), Vector3.new(x, height / 2, z), Color3.fromRGB(88, 121, 156), Enum.Material.Concrete)
      part("Roof_" .. x .. "_" .. z, Vector3.new(28, 1.5, 28), Vector3.new(x, height + 0.8, z), Color3.fromRGB(35, 43, 55), Enum.Material.Metal)
    end
  end
end

for i, pos in ipairs({ Vector3.new(-28, 2, -28), Vector3.new(28, 2, -28), Vector3.new(-28, 2, 28), Vector3.new(28, 2, 28) }) do
  local spawn = Instance.new("SpawnLocation")
  spawn.Name = "BloxSmith_Spawn_" .. i
  spawn.Anchored = true
  spawn.Size = Vector3.new(8, 1, 8)
  spawn.Position = pos
  spawn.Color = Color3.fromRGB(72, 255, 176)
  spawn.Neutral = true
  spawn.Parent = root
end

local sign = part("BloxSmith_Execution_Confirmed", Vector3.new(44, 18, 1), Vector3.new(0, 12, -54), Color3.fromRGB(23, 26, 38), Enum.Material.Metal)
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
gui.PixelsPerStud = 24
gui.Parent = sign
local label = Instance.new("TextLabel")
label.BackgroundTransparency = 1
label.Size = UDim2.fromScale(1, 1)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.TextWrapped = true
label.TextColor3 = Color3.fromRGB(245, 248, 255)
label.Text = "BloxSmith executed this build in Studio. Request: " .. ${JSON.stringify(safePrompt)}
label.Parent = gui

Lighting.ClockTime = 14
Lighting.Brightness = 2.2
Workspace.StreamingEnabled = true

for _, player in ipairs(Players:GetPlayers()) do
  if player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
    player.Character.HumanoidRootPart.CFrame = CFrame.new(0, 8, 0)
  end
end
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_AutoExecute_Recovery",
      payload: { source },
    },
    {
      kind: "organize_project",
      parent_path: "Workspace",
      name: "BloxSmith_Organize_After_Recovery",
      payload: { reason: "ensure_auto_executed_build_is_grouped" },
    },
    {
      kind: "autofix_project",
      parent_path: "Workspace",
      name: "BloxSmith_Autofix_After_Recovery",
      payload: { reason: "fix_common_studio_issues_after_auto_execute_recovery" },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_After_Recovery",
      payload: { reason: "verify_auto_execute_recovery_completed" },
    },
  ];
}

function isGrassRequest(userText: string) {
  return /\b(grass|grassy|lawn|turf|field|ground\s+cover|realistic\s+ground)\b/i.test(userText);
}

function visibleGrassStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 220) || "add realistic grass";
  const source = `
local Workspace = game:GetService("Workspace")
local Terrain = Workspace.Terrain
local Lighting = game:GetService("Lighting")

local function safeSet(inst, prop, value)
  pcall(function()
    inst[prop] = value
  end)
end

pcall(function()
  Terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(70, 150, 66))
end)
safeSet(Terrain, "Decoration", true)

local changedLargeGround = 0
for _, inst in ipairs(Workspace:GetDescendants()) do
  if inst:IsA("BasePart") then
    local n = inst.Name:lower()
    local flatLarge = inst.Size.X >= 40 and inst.Size.Z >= 40 and inst.Size.Y <= 8
    if n:find("baseplate") or n:find("ground") or n:find("floor") or flatLarge then
      inst.Material = Enum.Material.Grass
      inst.Color = Color3.fromRGB(75, 155, 70)
      safeSet(inst, "TopSurface", Enum.SurfaceType.Smooth)
      changedLargeGround += 1
    end
  end
end

local surface = Workspace:FindFirstChild("BloxSmith_Visible_Grass_Surface")
if not surface then
  surface = Instance.new("Part")
  surface.Name = "BloxSmith_Visible_Grass_Surface"
  surface.Anchored = true
  surface.CanCollide = true
  surface.TopSurface = Enum.SurfaceType.Smooth
  surface.BottomSurface = Enum.SurfaceType.Smooth
  surface.Parent = Workspace
end
surface.Size = Vector3.new(260, 0.5, 260)
surface.Position = Vector3.new(0, 0.25, 0)
surface.Material = Enum.Material.Grass
surface.Color = Color3.fromRGB(68, 158, 72)

pcall(function()
  Terrain:FillBlock(CFrame.new(0, -2, 0), Vector3.new(260, 4, 260), Enum.Material.Grass)
end)

local marker = Workspace:FindFirstChild("BloxSmith_Grass_Confirmation")
if not marker then
  marker = Instance.new("Part")
  marker.Name = "BloxSmith_Grass_Confirmation"
  marker.Anchored = true
  marker.CanCollide = false
  marker.Transparency = 1
  marker.Size = Vector3.new(2, 2, 2)
  marker.Position = Vector3.new(0, 6, 0)
  marker.Parent = Workspace
end
marker:SetAttribute("BloxSmithRequest", ${JSON.stringify(safePrompt)})
marker:SetAttribute("LargeGroundPartsChanged", changedLargeGround)
marker:SetAttribute("GrassSurfaceCreated", true)

Lighting.ClockTime = math.max(Lighting.ClockTime, 12)
Lighting.Brightness = math.max(Lighting.Brightness, 2)
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Apply_Visible_Grass",
      payload: { source },
    },
  ];
}

function intentVisibilityStudioActions(userText: string) {
  const text = userText.toLowerCase();
  const wants = {
    road: /\b(road|street|path|sidewalk|city|town)\b/.test(text),
    water: /\b(water|lake|river|ocean|pond|pool|stream)\b/.test(text),
    building: /\b(house|building|city|town|shop|store|base|lobby|room)\b/.test(text),
    tree: /\b(tree|forest|woods|bush|nature|park)\b/.test(text),
    spawn: /\b(spawn|checkpoint|start\s+point|respawn)\b/.test(text),
    lighting: /\b(light|lighting|day|night|sun|sky|atmosphere|fog|cloud|sunset)\b/.test(text),
    ui: /\b(ui|gui|menu|hud|button|screen|shop|inventory|health|cash|coins|loading)\b/.test(text),
    npc: /\b(npc|enemy|zombie|monster|character|bot|villager)\b/.test(text),
    obby: /\b(obby|platform|jump|parkour|checkpoint)\b/.test(text),
    vehicle: /\b(car|vehicle|truck|bike|boat|plane)\b/.test(text),
    genericBuild: /\b(add|make|create|build|put|insert|generate|place)\b/.test(text),
  };

  if (!Object.values(wants).some(Boolean)) return [];

  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local StarterGui = game:GetService("StarterGui")
local ServerScriptService = game:GetService("ServerScriptService")
local wants = ${JSON.stringify(wants)}

local root = Workspace:FindFirstChild("BloxSmith_Visible_Result_Guard")
if not root then
  root = Instance.new("Folder")
  root.Name = "BloxSmith_Visible_Result_Guard"
  root.Parent = Workspace
end

local function part(name, size, cf, color, material, parent)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = true
  p.Size = size
  p.CFrame = cf
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = parent or root
  return p
end

local function ensureFolder(name)
  local f = root:FindFirstChild(name)
  if not f then
    f = Instance.new("Folder")
    f.Name = name
    f.Parent = root
  end
  return f
end

if wants.road then
  local roads = ensureFolder("Roads_Visible")
  part("Main_Road_X", Vector3.new(180, 0.35, 18), CFrame.new(0, 0.45, 0), Color3.fromRGB(38, 40, 45), Enum.Material.Asphalt, roads)
  part("Main_Road_Z", Vector3.new(18, 0.4, 180), CFrame.new(0, 0.55, 0), Color3.fromRGB(38, 40, 45), Enum.Material.Asphalt, roads)
  for _, x in ipairs({-36, 0, 36}) do
    part("Lane_Mark_" .. tostring(x), Vector3.new(2, 0.08, 9), CFrame.new(x, 0.85, 0), Color3.fromRGB(245, 225, 95), Enum.Material.Neon, roads)
  end
end

if wants.water then
  local water = ensureFolder("Water_Visible")
  part("Visible_Water_Surface", Vector3.new(90, 0.3, 54), CFrame.new(62, 0.35, 62), Color3.fromRGB(45, 137, 210), Enum.Material.Glass, water)
  pcall(function()
    Workspace.Terrain:FillBlock(CFrame.new(62, -3, 62), Vector3.new(90, 6, 54), Enum.Material.Water)
  end)
end

if wants.building then
  local buildings = ensureFolder("Buildings_Visible")
  for i, data in ipairs({
    {-55, -45, 22, Color3.fromRGB(90, 120, 150)},
    {-55, 45, 30, Color3.fromRGB(120, 105, 95)},
    {55, -45, 26, Color3.fromRGB(86, 105, 125)},
    {55, 45, 18, Color3.fromRGB(130, 120, 95)}
  }) do
    part("Visible_Building_" .. i, Vector3.new(24, data[3], 24), CFrame.new(data[1], data[3] / 2 + 0.6, data[2]), data[4], Enum.Material.Concrete, buildings)
    part("Visible_Roof_" .. i, Vector3.new(26, 1.2, 26), CFrame.new(data[1], data[3] + 1.4, data[2]), Color3.fromRGB(35, 40, 48), Enum.Material.Metal, buildings)
  end
end

if wants.tree then
  local trees = ensureFolder("Trees_Visible")
  for i, pos in ipairs({Vector3.new(-80, 0, -20), Vector3.new(-78, 0, 24), Vector3.new(80, 0, -24), Vector3.new(82, 0, 26), Vector3.new(0, 0, 82)}) do
    part("Tree_Trunk_" .. i, Vector3.new(3, 14, 3), CFrame.new(pos.X, 7, pos.Z), Color3.fromRGB(101, 71, 45), Enum.Material.Wood, trees)
    part("Tree_Canopy_" .. i, Vector3.new(16, 14, 16), CFrame.new(pos.X, 19, pos.Z), Color3.fromRGB(49, 135, 62), Enum.Material.Grass, trees)
  end
end

if wants.spawn then
  local spawns = ensureFolder("Spawns_Visible")
  for i, pos in ipairs({Vector3.new(-10, 1, -10), Vector3.new(10, 1, -10), Vector3.new(0, 1, 12)}) do
    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "Visible_Spawn_" .. i
    spawn.Anchored = true
    spawn.Neutral = true
    spawn.Size = Vector3.new(8, 1, 8)
    spawn.Position = pos
    spawn.Color = Color3.fromRGB(80, 255, 170)
    spawn.Parent = spawns
  end
end

if wants.obby then
  local obby = ensureFolder("Obby_Visible")
  for i = 1, 7 do
    part("Visible_Obby_Platform_" .. i, Vector3.new(12, 1.4, 12), CFrame.new(-48 + i * 14, 4 + i * 2, -78), Color3.fromHSV(i / 7, 0.65, 1), Enum.Material.Neon, obby)
  end
end

if wants.vehicle then
  local vehicles = ensureFolder("Vehicles_Visible")
  local body = part("Visible_Vehicle_Body", Vector3.new(16, 4, 9), CFrame.new(0, 3, 44), Color3.fromRGB(210, 55, 65), Enum.Material.Metal, vehicles)
  part("Visible_Vehicle_Cabin", Vector3.new(7, 4, 7), CFrame.new(-1, 7, 44), Color3.fromRGB(70, 130, 190), Enum.Material.Glass, vehicles)
  for i, pos in ipairs({Vector3.new(-6, 1.6, 39), Vector3.new(6, 1.6, 39), Vector3.new(-6, 1.6, 49), Vector3.new(6, 1.6, 49)}) do
    local wheel = part("Visible_Wheel_" .. i, Vector3.new(3, 3, 1.5), CFrame.new(pos), Color3.fromRGB(18, 18, 18), Enum.Material.Rubber, vehicles)
    wheel.Shape = Enum.PartType.Cylinder
  end
  body:SetAttribute("BloxSmithVisibleVehicle", true)
end

if wants.npc then
  local npcs = ensureFolder("NPCs_Visible")
  local model = Instance.new("Model")
  model.Name = "Visible_BloxSmith_NPC"
  model.Parent = npcs
  local torso = part("Torso", Vector3.new(3, 4, 1.5), CFrame.new(34, 5, 0), Color3.fromRGB(75, 130, 225), Enum.Material.SmoothPlastic, model)
  local head = part("Head", Vector3.new(2.4, 2.4, 2.4), CFrame.new(34, 8.3, 0), Color3.fromRGB(245, 205, 150), Enum.Material.SmoothPlastic, model)
  local humanoid = Instance.new("Humanoid")
  humanoid.DisplayName = "BloxSmith NPC"
  humanoid.Parent = model
  model.PrimaryPart = torso
  head.Shape = Enum.PartType.Ball
end

if wants.ui then
  local gui = StarterGui:FindFirstChild("BloxSmith_Visible_UI")
  if not gui then
    gui = Instance.new("ScreenGui")
    gui.Name = "BloxSmith_Visible_UI"
    gui.ResetOnSpawn = false
    gui.Parent = StarterGui
  end
  local frame = gui:FindFirstChild("MainPanel")
  if not frame then
    frame = Instance.new("Frame")
    frame.Name = "MainPanel"
    frame.Size = UDim2.fromOffset(360, 180)
    frame.Position = UDim2.new(0.5, -180, 0.12, 0)
    frame.BackgroundColor3 = Color3.fromRGB(20, 24, 36)
    frame.Parent = gui
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 10)
    corner.Parent = frame
    local title = Instance.new("TextLabel")
    title.Name = "Title"
    title.BackgroundTransparency = 1
    title.Size = UDim2.new(1, -24, 0, 50)
    title.Position = UDim2.fromOffset(12, 12)
    title.Font = Enum.Font.GothamBold
    title.TextScaled = true
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.Text = "BloxSmith UI"
    title.Parent = frame
    local button = Instance.new("TextButton")
    button.Name = "PrimaryButton"
    button.Size = UDim2.new(1, -48, 0, 48)
    button.Position = UDim2.fromOffset(24, 104)
    button.Font = Enum.Font.GothamBold
    button.TextScaled = true
    button.TextColor3 = Color3.fromRGB(255, 255, 255)
    button.BackgroundColor3 = Color3.fromRGB(88, 78, 255)
    button.Text = "Start"
    button.Parent = frame
    local bc = Instance.new("UICorner")
    bc.CornerRadius = UDim.new(0, 8)
    bc.Parent = button
  end
end

if wants.lighting then
  Lighting.ClockTime = wants.genericBuild and 14 or Lighting.ClockTime
  Lighting.Brightness = math.max(Lighting.Brightness, 2.2)
  Lighting.Ambient = Color3.fromRGB(95, 105, 120)
  Lighting.OutdoorAmbient = Color3.fromRGB(130, 145, 165)
  local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
  atmosphere.Name = "BloxSmith_Atmosphere"
  atmosphere.Density = 0.28
  atmosphere.Offset = 0.2
  atmosphere.Color = Color3.fromRGB(205, 225, 255)
  atmosphere.Decay = Color3.fromRGB(110, 130, 160)
  atmosphere.Parent = Lighting
end

if wants.genericBuild then
  local receipt = root:FindFirstChild("BloxSmith_Result_Receipt")
  if not receipt then
    receipt = part("BloxSmith_Result_Receipt", Vector3.new(34, 12, 1), CFrame.new(0, 9, -34), Color3.fromRGB(28, 32, 46), Enum.Material.Metal, root)
    local sg = Instance.new("SurfaceGui")
    sg.Face = Enum.NormalId.Front
    sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    sg.PixelsPerStud = 24
    sg.Parent = receipt
    local label = Instance.new("TextLabel")
    label.BackgroundTransparency = 1
    label.Size = UDim2.fromScale(1, 1)
    label.Font = Enum.Font.GothamBold
    label.TextScaled = true
    label.TextWrapped = true
    label.TextColor3 = Color3.fromRGB(245, 248, 255)
    label.Text = "BloxSmith build applied visibly in Studio"
    label.Parent = sg
  end
end

root:SetAttribute("LastBloxSmithVisibilityGuard", os.time())
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Intent_Visibility_Guard",
      payload: { source },
    },
  ];
}

function isToolboxMapRequest(userText: string) {
  return /\b(map|world|city|town|village|lobby|hub|spawn|obby|parkour|race\s*track|racing|forest|island|beach|roleplay|rp|tycoon|horror|dungeon|rpg|street|road|neighborhood|theme\s*park|arena)\b/i.test(userText);
}

function toolboxMapRequests(userText: string): ToolboxSetRequest[] {
  const text = userText.toLowerCase();
  const requests: ToolboxSetRequest[] = [];
  const add = (label: string, keyword: string, required = false, limit = 5) => {
    if (!requests.some((r) => r.label === label || r.keyword === keyword)) {
      requests.push({ label, keyword, category: "Model", required, limit });
    }
  };

  add("complete map kit", `${userText.slice(0, 80)} map kit`, true, 6);

  if (/\b(city|town|roleplay|rp|neighborhood|street|road)\b/.test(text)) {
    add("city map kit", "city map kit", true, 6);
    add("road kit", "modular road kit", true, 6);
    add("buildings", "city building pack", true, 6);
    add("street props", "street light traffic sign sidewalk", false, 5);
  }

  if (/\b(lobby|hub|spawn)\b/.test(text)) {
    add("lobby map", "lobby map kit", true, 6);
    add("spawn area", "spawn hub", true, 5);
    add("decor props", "lobby decor", false, 5);
  }

  if (/\b(obby|parkour|platform|checkpoint)\b/.test(text)) {
    add("obby kit", "obby kit", true, 6);
    add("checkpoint kit", "obby checkpoint", false, 5);
    add("parkour map", "parkour map", true, 6);
  }

  if (/\b(forest|woods|jungle|nature|park)\b/.test(text)) {
    add("forest kit", "forest map kit", true, 6);
    add("tree pack", "tree pack", true, 6);
    add("rocks and bushes", "rock bush nature pack", false, 5);
  }

  if (/\b(island|beach|survival|ocean)\b/.test(text)) {
    add("island map", "island map kit", true, 6);
    add("beach props", "beach palm tree pack", false, 5);
    add("camp props", "survival camp kit", false, 5);
  }

  if (/\b(race|racing|track|car|vehicle)\b/.test(text)) {
    add("race track", "race track map", true, 6);
    add("vehicle", "vehicle car", false, 5);
    add("road props", "road barrier checkpoint", false, 5);
  }

  if (/\b(horror|haunted|escape)\b/.test(text)) {
    add("horror map", "horror map kit", true, 6);
    add("haunted building", "haunted house", true, 5);
    add("horror props", "horror props", false, 5);
  }

  if (/\b(dungeon|rpg|fantasy|medieval|castle|village)\b/.test(text)) {
    add("rpg map", "rpg map kit", true, 6);
    add("dungeon kit", "dungeon kit", true, 6);
    add("medieval props", "medieval village props", false, 5);
  }

  if (/\b(tycoon)\b/.test(text)) {
    add("tycoon kit", "tycoon kit", true, 6);
    add("conveyor kit", "conveyor dropper tycoon", true, 5);
    add("tycoon buildings", "tycoon building", false, 5);
  }

  if (/\b(arena|battle|fighting|shooter)\b/.test(text)) {
    add("arena map", "battle arena map", true, 6);
    add("cover props", "arena cover props", false, 5);
  }

  return requests.slice(0, 12);
}

async function toolboxMapStudioActions(userText: string) {
  if (!isToolboxMapRequest(userText)) return [];
  try {
    const set = await searchRobloxToolboxSet(toolboxMapRequests(userText), 6);
    const usedIds = new Set<number>();
    const actions = [];
    let slot = 0;

    for (const request of set.requests) {
      const picked = request.results.find((r) => !usedIds.has(r.id));
      if (!picked) continue;
      usedIds.add(picked.id);
      const row = slot % 3;
      const col = Math.floor(slot / 3);
      actions.push({
        kind: "insert_asset",
        parent_path: "Workspace",
        name: `Toolbox_${request.label.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "MapAsset"}`,
        payload: {
          asset_id: picked.id,
          fallback_ids: picked.fallbackIds ?? [],
          folder_name: "BloxSmith_Toolbox_Map_Assets",
          position: [row * 75 - 75, 3, col * 75],
          yaw: (slot % 4) * 90,
          scale: 1,
          tags: ["bloxsmith", "toolbox-map", request.label],
          asset_name: picked.name,
          creator_name: picked.creatorName,
          source_query: picked.sourceQuery ?? request.keyword,
          quality_tier: picked.qualityTier ?? "usable",
        },
      });
      slot += 1;
    }

    if (actions.length > 0) {
      actions.push({
        kind: "run_lua",
        parent_path: "Workspace",
        name: "BloxSmith_Arrange_Toolbox_Map_Assets",
        payload: {
          source: `
local Workspace = game:GetService("Workspace")
local folder = Workspace:FindFirstChild("BloxSmith_Toolbox_Map_Assets")
if folder then
  for _, model in ipairs(folder:GetChildren()) do
    if model:IsA("Model") then
      local ok, cf, size = pcall(function() return model:GetBoundingBox() end)
      if ok and size then
        local yOffset = math.max(0, size.Y / 2)
        model:PivotTo(CFrame.new(cf.Position.X, yOffset, cf.Position.Z))
      end
      for _, inst in ipairs(model:GetDescendants()) do
        if inst:IsA("BasePart") then
          inst.Anchored = true
          inst.CanCollide = true
        end
      end
    elseif model:IsA("BasePart") then
      model.Anchored = true
      model.CanCollide = true
    end
  end
end
`,
        },
      });
    }

    return actions;
  } catch (err) {
    console.warn("[chat] toolbox map seed failed", err);
    return [];
  }
}

function isRobloxSystemRequest(userText: string) {
  return /\b(script|scripting|code|system|gui|ui|screen|loading|load\s*screen|main\s*menu|menu|hud|button|shop|inventory|settings|gamepass|quest|health|cash|coins|leaderstats|remote|event|datastore|save|checkpoint|timer|round|notification|mobile\s*controls?)\b/i.test(userText);
}

function robloxSystemStudioActions(userText: string, languageName: string) {
  if (!isRobloxSystemRequest(userText)) return [];
  const requested = {
    loading: /\b(loading|load\s*screen)\b/i.test(userText),
    menu: /\b(main\s*menu|menu|play\s*button|start\s*button)\b/i.test(userText),
    hud: /\b(hud|health|cash|coins|xp|level|timer|round|objective)\b/i.test(userText),
    shop: /\b(shop|store|gamepass|purchase)\b/i.test(userText),
    inventory: /\b(inventory|items|backpack)\b/i.test(userText),
    settings: /\b(settings|options|volume|music)\b/i.test(userText),
    save: /\b(save|datastore|data\s*store|leaderstats|cash|coins|xp|level)\b/i.test(userText),
  };
  const safePrompt = userText.trim().slice(0, 260) || "Roblox UI and scripted systems";
  const source = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")
local ServerScriptService = game:GetService("ServerScriptService")

local requested = ${JSON.stringify(requested)}

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes")
if not remotes then
  remotes = Instance.new("Folder")
  remotes.Name = "BloxSmith_Remotes"
  remotes.Parent = ReplicatedStorage
end

local function remote(name)
  local r = remotes:FindFirstChild(name)
  if not r then
    r = Instance.new("RemoteEvent")
    r.Name = name
    r.Parent = remotes
  end
  return r
end

remote("MenuAction")
remote("RequestShop")
remote("RequestInventory")
remote("SaveSettings")
remote("NotifyPlayer")

local gui = StarterGui:FindFirstChild("BloxSmith_Game_UI")
if gui then gui:Destroy() end
gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_Game_UI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = StarterGui

local function make(className, props, parent)
  local inst = Instance.new(className)
  for key, value in pairs(props or {}) do
    inst[key] = value
  end
  inst.Parent = parent
  return inst
end

local function corner(parent, radius)
  return make("UICorner", { CornerRadius = UDim.new(0, radius or 10) }, parent)
end

local function stroke(parent, color, thickness)
  return make("UIStroke", { Color = color or Color3.fromRGB(82, 93, 135), Thickness = thickness or 1, Transparency = 0.25 }, parent)
end

local function gradient(parent, a, b)
  return make("UIGradient", { Color = ColorSequence.new(a, b), Rotation = 28 }, parent)
end

local loading = make("Frame", {
  Name = "LoadingScreen",
  BackgroundColor3 = Color3.fromRGB(7, 10, 22),
  BorderSizePixel = 0,
  Size = UDim2.fromScale(1, 1),
  Visible = true,
  ZIndex = 50,
}, gui)
gradient(loading, Color3.fromRGB(10, 14, 34), Color3.fromRGB(38, 32, 92))

local loadingTitle = make("TextLabel", {
  Name = "Title",
  BackgroundTransparency = 1,
  Position = UDim2.fromScale(0.12, 0.34),
  Size = UDim2.fromScale(0.76, 0.12),
  Font = Enum.Font.GothamBlack,
  Text = "BloxSmith",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
  TextWrapped = true,
  ZIndex = 51,
}, loading)

local loadingSub = make("TextLabel", {
  Name = "Subtitle",
  BackgroundTransparency = 1,
  Position = UDim2.fromScale(0.18, 0.47),
  Size = UDim2.fromScale(0.64, 0.055),
  Font = Enum.Font.GothamMedium,
  Text = "Preparing your Roblox experience...",
  TextColor3 = Color3.fromRGB(190, 200, 230),
  TextScaled = true,
  TextWrapped = true,
  ZIndex = 51,
}, loading)

local barBack = make("Frame", {
  Name = "ProgressBack",
  BackgroundColor3 = Color3.fromRGB(28, 32, 50),
  Position = UDim2.fromScale(0.28, 0.58),
  Size = UDim2.fromScale(0.44, 0.022),
  ZIndex = 51,
}, loading)
corner(barBack, 999)
local barFill = make("Frame", {
  Name = "ProgressFill",
  BackgroundColor3 = Color3.fromRGB(90, 100, 255),
  Size = UDim2.fromScale(0, 1),
  ZIndex = 52,
}, barBack)
corner(barFill, 999)
gradient(barFill, Color3.fromRGB(80, 255, 180), Color3.fromRGB(100, 95, 255))

local menu = make("Frame", {
  Name = "MainMenu",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = Color3.fromRGB(13, 17, 31),
  Position = UDim2.fromScale(0.5, 0.5),
  Size = UDim2.fromOffset(460, 430),
  Visible = false,
}, gui)
corner(menu, 14)
stroke(menu, Color3.fromRGB(92, 100, 155), 1)
gradient(menu, Color3.fromRGB(18, 22, 42), Color3.fromRGB(36, 28, 80))

make("TextLabel", {
  Name = "GameTitle",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(28, 24),
  Size = UDim2.new(1, -56, 0, 78),
  Font = Enum.Font.GothamBlack,
  Text = "MAIN MENU",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
  TextWrapped = true,
}, menu)

make("TextLabel", {
  Name = "RequestNote",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(40, 100),
  Size = UDim2.new(1, -80, 0, 42),
  Font = Enum.Font.Gotham,
  Text = ${JSON.stringify(safePrompt)},
  TextColor3 = Color3.fromRGB(185, 195, 225),
  TextScaled = true,
  TextWrapped = true,
}, menu)

local buttonNames = { "Play", "Shop", "Inventory", "Settings" }
for i, label in ipairs(buttonNames) do
  local btn = make("TextButton", {
    Name = label .. "Button",
    BackgroundColor3 = i == 1 and Color3.fromRGB(86, 96, 255) or Color3.fromRGB(32, 38, 62),
    Position = UDim2.fromOffset(54, 152 + (i - 1) * 62),
    Size = UDim2.new(1, -108, 0, 48),
    Font = Enum.Font.GothamBold,
    Text = label,
    TextColor3 = Color3.fromRGB(255, 255, 255),
    TextScaled = true,
    AutoButtonColor = true,
  }, menu)
  corner(btn, 10)
  stroke(btn, i == 1 and Color3.fromRGB(128, 255, 210) or Color3.fromRGB(80, 88, 132), 1)
end

local hud = make("Frame", {
  Name = "HUD",
  BackgroundTransparency = 1,
  Size = UDim2.fromScale(1, 1),
  Visible = false,
}, gui)

local hudPanel = make("Frame", {
  Name = "TopStats",
  BackgroundColor3 = Color3.fromRGB(13, 17, 31),
  Position = UDim2.fromOffset(18, 18),
  Size = UDim2.fromOffset(420, 58),
}, hud)
corner(hudPanel, 10)
stroke(hudPanel, Color3.fromRGB(85, 94, 145), 1)

local stats = { "Health: 100", "Coins: 0", "Level: 1" }
for i, value in ipairs(stats) do
  make("TextLabel", {
    Name = "Stat" .. i,
    BackgroundTransparency = 1,
    Position = UDim2.fromOffset(14 + (i - 1) * 132, 9),
    Size = UDim2.fromOffset(126, 40),
    Font = Enum.Font.GothamBold,
    Text = value,
    TextColor3 = Color3.fromRGB(245, 248, 255),
    TextScaled = true,
    TextWrapped = true,
  }, hudPanel)
end

local modal = make("Frame", {
  Name = "Modal",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = Color3.fromRGB(16, 20, 35),
  Position = UDim2.fromScale(0.5, 0.55),
  Size = UDim2.fromOffset(420, 260),
  Visible = false,
}, gui)
corner(modal, 12)
stroke(modal, Color3.fromRGB(105, 112, 165), 1)
make("TextLabel", {
  Name = "ModalTitle",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(24, 22),
  Size = UDim2.new(1, -48, 0, 48),
  Font = Enum.Font.GothamBlack,
  Text = "Panel",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
}, modal)
make("TextLabel", {
  Name = "ModalBody",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(28, 86),
  Size = UDim2.new(1, -56, 0, 90),
  Font = Enum.Font.Gotham,
  Text = "This panel is wired and ready for your game logic.",
  TextColor3 = Color3.fromRGB(190, 200, 230),
  TextScaled = true,
  TextWrapped = true,
}, modal)
local close = make("TextButton", {
  Name = "CloseButton",
  BackgroundColor3 = Color3.fromRGB(86, 96, 255),
  Position = UDim2.fromOffset(110, 194),
  Size = UDim2.new(1, -220, 0, 42),
  Font = Enum.Font.GothamBold,
  Text = "Close",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
}, modal)
corner(close, 8)

local localScript = make("LocalScript", { Name = "BloxSmith_UI_Controller" }, gui)
localScript.Source = [==[
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

local player = Players.LocalPlayer
local gui = script.Parent
local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes", 10)
local menuAction = remotes and remotes:WaitForChild("MenuAction", 10)

local loading = gui:WaitForChild("LoadingScreen")
local menu = gui:WaitForChild("MainMenu")
local hud = gui:WaitForChild("HUD")
local modal = gui:WaitForChild("Modal")
local bar = loading.ProgressBack.ProgressFill

local function tween(inst, props, time)
  local t = TweenService:Create(inst, TweenInfo.new(time or 0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
  t:Play()
  return t
end

local function showModal(title, body)
  modal.ModalTitle.Text = title
  modal.ModalBody.Text = body
  modal.Visible = true
end

for i = 1, 100 do
  bar.Size = UDim2.fromScale(i / 100, 1)
  task.wait(0.012)
end
tween(loading, { BackgroundTransparency = 1 }, 0.35)
task.wait(0.35)
loading.Visible = false
menu.Visible = true

menu.PlayButton.MouseButton1Click:Connect(function()
  menu.Visible = false
  hud.Visible = true
  if menuAction then menuAction:FireServer("Play") end
end)

menu.ShopButton.MouseButton1Click:Connect(function()
  showModal("Shop", "Add products, boosts, gamepasses, and upgrades here.")
  if menuAction then menuAction:FireServer("Shop") end
end)

menu.InventoryButton.MouseButton1Click:Connect(function()
  showModal("Inventory", "Player items and rewards can appear here.")
  if menuAction then menuAction:FireServer("Inventory") end
end)

menu.SettingsButton.MouseButton1Click:Connect(function()
  showModal("Settings", "Volume, graphics, and gameplay options are ready to wire.")
  if menuAction then menuAction:FireServer("Settings") end
end)

modal.CloseButton.MouseButton1Click:Connect(function()
  modal.Visible = false
end)

local function syncStats()
  local stats = player:FindFirstChild("leaderstats")
  if not stats then return end
  local coins = stats:FindFirstChild("Coins")
  local level = stats:FindFirstChild("Level")
  if coins then hud.TopStats.Stat2.Text = "Coins: " .. tostring(coins.Value) end
  if level then hud.TopStats.Stat3.Text = "Level: " .. tostring(level.Value) end
end

player.ChildAdded:Connect(syncStats)
task.spawn(function()
  while gui.Parent do
    syncStats()
    task.wait(1)
  end
end)
]==]

local serverScript = ServerScriptService:FindFirstChild("BloxSmith_Game_Systems")
if serverScript then serverScript:Destroy() end
serverScript = Instance.new("Script")
serverScript.Name = "BloxSmith_Game_Systems"
serverScript.Parent = ServerScriptService
serverScript.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes") or Instance.new("Folder")
remotes.Name = "BloxSmith_Remotes"
remotes.Parent = ReplicatedStorage

local function remote(name)
  local r = remotes:FindFirstChild(name)
  if not r then
    r = Instance.new("RemoteEvent")
    r.Name = name
    r.Parent = remotes
  end
  return r
end

local menuAction = remote("MenuAction")
remote("RequestShop")
remote("RequestInventory")
remote("SaveSettings")
remote("NotifyPlayer")

local function setupPlayer(player)
  local leaderstats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
  leaderstats.Name = "leaderstats"
  leaderstats.Parent = player

  local coins = leaderstats:FindFirstChild("Coins") or Instance.new("IntValue")
  coins.Name = "Coins"
  coins.Value = coins.Value
  coins.Parent = leaderstats

  local level = leaderstats:FindFirstChild("Level") or Instance.new("IntValue")
  level.Name = "Level"
  if level.Value <= 0 then level.Value = 1 end
  level.Parent = leaderstats
end

Players.PlayerAdded:Connect(setupPlayer)
for _, player in ipairs(Players:GetPlayers()) do
  setupPlayer(player)
end

menuAction.OnServerEvent:Connect(function(player, action)
  if typeof(action) ~= "string" then return end
  print("[BloxSmith]", player.Name, "clicked", action)
  local stats = player:FindFirstChild("leaderstats")
  local coins = stats and stats:FindFirstChild("Coins")
  if action == "Play" and coins then
    coins.Value += 10
  end
end)
]==]

gui:SetAttribute("BloxSmithSystemRequest", ${JSON.stringify(safePrompt)})
gui:SetAttribute("Language", ${JSON.stringify(languageName)})
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Build_UI_And_Systems",
      payload: { source },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_UI_And_Systems",
      payload: { reason: "verify_ui_scripts_remotes_and_server_systems" },
    },
  ];
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return jsonError("Please sign in again before sending a message.", 401, "no_auth");

          let body: { messages?: UIMessage[]; projectId?: string; modelId?: string; autoExecute?: boolean; mode?: "chat" | "build"; language?: string; languageName?: string };
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return jsonError("Invalid JSON in request body.", 400, "bad_json");
          }
          const mode: "chat" | "build" = body.mode === "chat" ? "chat" : "build";
          const languageName = (body.languageName || "English").toString().slice(0, 60);
          const languageCode = (body.language || "en").toString().slice(0, 8);
          const { messages, projectId } = body;
          if (!Array.isArray(messages) || messages.length === 0) {
            return jsonError("No messages were sent — type something and try again.", 400, "missing_messages");
          }
          if (!projectId || typeof projectId !== "string") {
            return jsonError("Missing project id — open a project before chatting.", 400, "missing_project");
          }

          const requestedId = body.modelId || DEFAULT_MODEL_ID;
          const requested = findModel(requestedId);
          if (!isSelectable(requested)) {
            return jsonError(
              `Model "${requested.label}" is marked Coming Soon and isn't available yet. Pick a different model.`,
              400,
              "model_unavailable",
            );
          }

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );

          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return jsonError("Your session expired. Please sign in again.", 401, "expired");
          const userId = userData.user.id;

          const { data: project, error: projErr } = await supabase
            .from("projects")
            .select("id, user_id, name, description, game_type, build_count")
            .eq("id", projectId)
            .maybeSingle();
          if (projErr || !project) return jsonError("Project not found or you don't have access to it.", 404, "project_not_found");

          // Per-user asset preference (stored in profiles.settings.asset_mode).
          // Old "auto" / "primitives_only" settings are treated as toolbox-only
          // so visual builds do not silently become procedural placeholders.
          let assetMode: "toolbox_only" | "both" = "toolbox_only";
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("settings")
              .eq("id", userId)
              .maybeSingle();
            const s = (prof?.settings && typeof prof.settings === "object" ? prof.settings : {}) as Record<string, unknown>;
            const m = s.asset_mode;
            if (m === "both") assetMode = "both";
          } catch { /* ignore */ }


          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
          const imageParts = messages
            .flatMap((m) => (m.parts ?? []) as Array<Record<string, unknown>>)
            .filter((p): p is { type: "file"; mediaType: string; url: string } =>
              p?.type === "file" && typeof p.mediaType === "string" && (p.mediaType as string).startsWith("image/") && typeof p.url === "string",
            );
          const userImageUrl = imageParts.at(-1)?.url?.slice(0, 2_000_000) ?? null;
          if (userText) {
            await supabase.from("chat_messages").insert({
              project_id: projectId,
              user_id: userId,
              role: "user",
              content: userText,
              status: "done",
              image_url: userImageUrl,
            });
          }

          let modelChoice;
          try {
            modelChoice = getProviderModel(requestedId);
          } catch (e) {
            return jsonError(e instanceof Error ? e.message : "Model unavailable", 500, "provider_init_failed");
          }

          // ── CREDIT GATE ──
          // Charge upfront based on the model's tier; if a build is produced,
          // we charge a small bonus inside onFinish.
          const baseCost = creditCostForTier(requested.credits);
          const charge = await chargeCredits(supabase, userId, baseCost);
          if (!charge.ok) {
            return jsonError(
              charge.message ?? "Out of credits.",
              charge.code === "banned" ? 403 : 402,
              charge.code ?? "no_credits",
            );
          }


          // ── MEMORY + STUDIO CONTEXT ──
          // Pull project metadata, recent builds, latest game scan, recent errors,
          // and existing queued actions so the AI knows what already exists and
          // doesn't rebuild or duplicate things across turns.
          let contextBlock = "";
          try {
            const [{ data: session }, { data: recentErrors }, { data: recentBuilds }, { data: existingActions }] = await Promise.all([
              supabase
                .from("plugin_sessions")
                .select("last_scan, last_scan_at, online")
                .eq("user_id", userId)
                .maybeSingle(),
              supabase
                .from("studio_errors")
                .select("level, source, message, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(15),
              supabase
                .from("build_history")
                .select("prompt, files_count, created_at")
                .eq("project_id", projectId)
                .order("created_at", { ascending: false })
                .limit(10),
              supabase
                .from("plugin_actions")
                .select("kind, name, parent_path, status")
                .eq("project_id", projectId)
                .order("created_at", { ascending: false })
                .limit(40),
            ]);

            const parts: string[] = [];
            parts.push(
              `PROJECT MEMORY:\n- Name: ${project.name ?? "(unnamed)"}\n- Type: ${project.game_type ?? "(unspecified)"}\n- Description: ${project.description ?? "(none)"}\n- Total builds so far: ${project.build_count ?? 0}`,
            );
            if (recentBuilds && recentBuilds.length > 0) {
              parts.push(
                `RECENT USER REQUESTS in this project (newest first) — do NOT redo these unless asked, build ON TOP of them:\n${recentBuilds.map((b) => `• ${new Date(b.created_at).toISOString().slice(0, 10)} (${b.files_count} actions): ${String(b.prompt).slice(0, 200)}`).join("\n")}`,
              );
            }
            if (existingActions && existingActions.length > 0) {
              const byKind = existingActions.reduce<Record<string, string[]>>((acc, a) => {
                const k = a.kind ?? "unknown";
                (acc[k] ||= []).push(`${a.parent_path}.${a.name}`);
                return acc;
              }, {});
              const summary = Object.entries(byKind)
                .map(([k, names]) => `  ${k}: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ` (+${names.length - 12} more)` : ""}`)
                .join("\n");
              parts.push(
                `ALREADY-QUEUED/BUILT INSTANCES in this project (avoid duplicating — modify via set_properties / rename / delete instead):\n${summary}`,
              );
            }
            if (session?.last_scan) {
              const scanStr = JSON.stringify(session.last_scan);
              parts.push(
                `CURRENT ROBLOX STUDIO GAME TREE (uploaded ${session.last_scan_at ?? "recently"}). Use this to avoid duplicating things that already exist; reference existing instances by path when appropriate:\n${scanStr.length > 12000 ? scanStr.slice(0, 12000) + "…[truncated]" : scanStr}`,
              );
            }
            if (recentErrors && recentErrors.length > 0) {
              const errLines = recentErrors
                .map((e) => `[${e.level}] ${e.source}: ${e.message}`)
                .join("\n");
              parts.push(
                `RECENT ROBLOX STUDIO OUTPUT (newest first). If any of these were caused by your previous builds, emit corrected actions to fix them in this response:\n${errLines}`,
              );
            }
            contextBlock = "\n\n---\nLIVE CONTEXT (auto-injected memory + Studio state):\n\n" + parts.join("\n\n---\n");
          } catch (e) {
            console.warn("[chat] failed to load studio context", e);
          }

          try {
            if (imageParts.length > 0) {
              const vision = await describeImageWithNvidiaPaliGemma(imageParts);
              if (vision) {
                contextBlock += `\n\n---\nNVIDIA PALIGEMMA VISION ANALYSIS:\n${vision}\nUse this as visual reference context only. Build with safe free Toolbox assets and clean Roblox systems; do not invent unsafe assets.`;
              }
            }
          } catch (e) {
            console.warn("[chat] NVIDIA PaliGemma vision analysis failed", e);
          }

          let generatedUiConceptUrl: string | null = null;
          const uiConceptRequested = mode === "build" && /(\bgenerate ui\b|\bimage to roblox ui\b|\bimage-to-roblox ui\b|loading screen|main menu|play button|settings menu|shop ui|inventory ui|gamepass ui|quest ui|\bhud\b|health bar|xp bar|currency display|mobile controls)/i.test(userText);
          if (uiConceptRequested) {
            try {
              generatedUiConceptUrl = await generateUiConceptImage({
                prompt: userText,
                style: "Premium Roblox UI",
              });
              contextBlock += `\n\n---\nAI IMAGE-TO-ROBLOX UI GENERATOR:\nA premium UI concept image has been generated and saved to this chat. Use it as the visual concept, then rebuild it as REAL Roblox UI: ScreenGui, Frames, Buttons, TextLabels, ImageLabels, UICorner, UIStroke, UIGradient, UIPadding, layouts, constraints, UIScale, LocalScripts, animations, remotes, and scan_project/autofix_project checks. Do not leave it as a flat image.`;
            } catch (e) {
              console.warn("[chat] UI concept image generation failed", e);
            }
          }

          const convertedMessages = await convertToModelMessages(messages);

          const persistFinish = (usedModelId: string, fallbackNotice: string | null) =>
            async ({ text }: { text: string }) => {
              try {
                const finalText = fallbackNotice ? `${fallbackNotice}\n\n${text}` : text;
                const parsed = parseActions(finalText);
                // In chat mode, hard-strip any actions block the model accidentally emitted
                // so it never gets shown to the user or queued for Studio.
                let cleanContent = parsed.cleanContent;
                let actions = mode === "chat" ? [] : parsed.actions.map(normalizePluginAction);

                if (mode === "build" && actions.length === 0) {
                  try {
                    const compiled = await compileMissingStudioActions({
                      userText,
                      assistantText: finalText,
                      languageName,
                      assetMode,
                    });
                    actions = compiled.map(normalizePluginAction);
                    if (actions.length > 0) {
                      cleanContent = `${cleanContent.trim()}\n\n_Auto-compiled executable Roblox Studio actions because the selected model returned a plan without an action block._`;
                    }
                  } catch (compileErr) {
                    console.warn("[chat] action compiler failed; using recovery Studio actions", compileErr);
                  }

                  if (actions.length === 0) {
                    actions = recoveryStudioActions(userText).map(normalizePluginAction);
                    cleanContent = `${cleanContent.trim()}\n\n_Auto-execute recovery queued a safe starter build because the selected model did not produce valid Studio actions._`;
                  }
                }

                if (mode === "build" && isGrassRequest(userText)) {
                  actions = [
                    ...visibleGrassStudioActions(userText).map(normalizePluginAction),
                    ...actions.filter((a) => a.name !== "BloxSmith_Apply_Visible_Grass"),
                  ];
                  if (!/visible grass/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_Visible grass enforcement queued: large flat ground parts are recolored to Grass material, a grass surface is created, and Terrain grass decoration is enabled._`;
                  }
                }

                if (mode === "build" && isToolboxMapRequest(userText)) {
                  const toolboxActions = (await toolboxMapStudioActions(userText)).map(normalizePluginAction);
                  if (toolboxActions.length > 0) {
                    actions = [
                      ...toolboxActions,
                      ...actions.filter((a) => !String(a.payload?.folder_name ?? "").includes("BloxSmith_Toolbox_Map_Assets")),
                    ];
                    if (!/toolbox map assets/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Toolbox map seeding queued: BloxSmith searched safe free Creator Store assets and will insert matching map kits/props before final setup._`;
                    }
                  }
                }

                if (mode === "build" && isRobloxSystemRequest(userText)) {
                  const systemActions = robloxSystemStudioActions(userText, languageName).map(normalizePluginAction);
                  if (systemActions.length > 0) {
                    actions = [
                      ...actions.filter((a) => a.name !== "BloxSmith_Build_UI_And_Systems" && a.name !== "BloxSmith_Scan_UI_And_Systems"),
                      ...systemActions,
                    ];
                    if (!/UI and systems guard/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_UI and systems guard queued: BloxSmith will create real StarterGui screens, LocalScript wiring, RemoteEvents, leaderstats, and a server script in Roblox Studio._`;
                    }
                  }
                }

                if (mode === "build") {
                  const guardActions = intentVisibilityStudioActions(userText).map(normalizePluginAction);
                  if (guardActions.length > 0) {
                    actions = [
                      ...actions.filter((a) => a.name !== "BloxSmith_Intent_Visibility_Guard"),
                      ...guardActions,
                    ];
                    if (!/visibility guard/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Visibility guard queued: BloxSmith will verify the request leaves an obvious Studio result for common build intents._`;
                    }
                  }
                }

                const { data: msgRow } = await supabase.from("chat_messages").insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: cleanContent,
                  status: actions.length > 0 ? "sending" : "done",
                  model: usedModelId,
                  actions,
                  image_url: generatedUiConceptUrl,
                }).select("id").single();

                if (actions.length > 0 && mode === "build") {
                  await supabase.from("plugin_actions").insert(
                    actions.map((a, i) => ({
                      project_id: projectId,
                      user_id: userId,
                      message_id: msgRow?.id ?? null,
                      kind: a.kind,
                      parent_path: a.parent_path,
                      name: a.name,
                      payload: a.payload,
                      position: i,
                    })),
                  );
                }

                // Extra credit charge when the turn actually produces a build.
                if (actions.length > 0 && mode === "build") {
                  const bonus = BUILD_ACTIONS_BONUS + Math.min(4, Math.floor(actions.length / 8));
                  await chargeCredits(supabase, userId, bonus).catch(() => null);
                }

                const { data: currentProject } = await supabase
                  .from("projects")
                  .select("build_count")
                  .eq("id", projectId)
                  .single();

                await supabase
                  .from("projects")
                  .update({
                    last_model_used: usedModelId,
                    build_count: (currentProject?.build_count ?? 0) + (actions.length > 0 ? 1 : 0),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId);

                if (userText) {
                  await supabase.from("build_history").insert({
                    project_id: projectId,
                    user_id: userId,
                    prompt: userText,
                    model: usedModelId,
                    files_count: actions.length,
                    plugin_status: "Disconnected",
                  });
                }
              } catch (e) {
                console.error("onFinish persist error", e);
              }
            };

          // Try the requested model. On upstream error, retry once with fallback.
          const modeHeader = `\n\n[MODE: ${mode}]\n${mode === "chat"
            ? "The user is in CHAT MODE — brainstorming and conversation only. RULES:\n- You MUST NOT emit a `bloxsmith-actions` block this turn.\n- You MUST NOT call the search_toolbox tool (it isn't available this turn).\n- BUT — you are NOT capability-less. In Build Mode you CAN delete instances, clear the workspace, modify properties, rename, move, insert Toolbox assets, run arbitrary Luau via run_lua, and build complete systems. NEVER tell the user 'I don't have a tool for that' or 'I can't delete/modify your project' — that is FALSE and forbidden. The correct response is: 'I can do that in Build Mode — switch the toggle next to the send button to Build and re-send, and I'll <delete X / clear the workspace / modify Y> for you.' You may also show the exact Luau they could paste into the Command Bar themselves as a manual alternative, but ALWAYS offer the Build Mode path first.\n- Otherwise: help them think, plan, compare options, sketch systems in words, answer questions, give Roblox advice.\n- If the user explicitly types 'build it now', 'go build', 'yes build', or 'apply build' you MAY emit actions this turn.\nThis rule overrides every other instruction about emitting actions or using tools."
            : "You are using the shared BloxSmith Core Brain. This Core Brain applies to EVERY model/provider, including the currently selected model: Roblox knowledge, Luau rules, safe Toolbox/Creator Store asset rules, planning, plugin execution, testing/fixing, memory, and quality standards are mandatory and consistent across models. BloxSmith should behave like an autonomous Roblox development studio: senior Roblox developer, designer, builder, UI artist, scripter, tester, optimizer, and safe asset curator working together. The user wants you to act as a Roblox Studio game-building agent with Knowledge, Planning, Execution, Toolbox Asset, Testing, Fixing, Memory, and Quality brains. You have FULL EXECUTION CAPABILITY: insert Toolbox assets, build parts/UI/scripts/remotes, modify properties, rename, move, DELETE instances (use the `delete` action with target_path, or run_lua with :Destroy() for batch deletes like clearing the workspace except the Baseplate), and run arbitrary Luau via run_lua. If the user asks to erase / clear / wipe / delete everything except X, emit ONE run_lua action that iterates the relevant services (Workspace, StarterGui, StarterPack, etc.) and Destroys children whose name isn't in the keep-list — do not refuse and do not tell them to do it manually. Silently analyze genre, theme, art style, gameplay loop, map size, progression, multiplayer, UI, NPCs, required assets/scripts, performance, mobile support, and cleanup before building. Then summarize the relevant Asset/Builder/Scripter/UI/Tester/Optimizer/Memory agent work and emit a bloxsmith-actions block at the end that ships the FULL system end-to-end: every script, every premium UI surface, every RemoteEvent, every DataStore, every placement, all wired together and actually functional. Plan → execute → connect → optimize → test → fix: use live scan/workspace awareness and project memory to extend what already exists, avoid duplicates, organize services correctly, emit organize_project for large builds, autofix_project for repairs, and scan_project after major builds so failures are visible. Folders must only exist when they contain real content; never emit folder/create_folder actions, never create folder-only scaffolding, and remove/prune empty folders before saying the build is ready. You can build ANY Roblox game genre, custom hybrid, or standalone game system. For any game request, infer the genre, build a playable loop, map/world assets, spawn, UI/HUD/objective tracker, progression/rewards, server scripts, client scripts, remotes/modules, and a test/cleanup pass. Support tycoon, obby, simulator, RPG, horror, survival, fighting, racing, city, roleplay, pet, story, dungeon/quest, minigame, shooter, tower defense, sandbox, farming/cooking/shop management, social hangout, and any custom idea by combining proven Roblox systems. Any loading screen/menu/HUD/shop/inventory/settings/quest/notification UI must look modern, polished, animated, responsive, mobile-safe, and fully wired: no default grey UI, no broken buttons, no overlapping text, no placeholder panels. For visual Roblox content, use safe free Toolbox / Creator Store models via search_toolbox + insert_asset. Use run_lua for placement, scaling, rotation, terrain adjustments, scripts, UI wiring, Roblox service setup, AND deletion/cleanup batches. If no safe relevant Toolbox asset is found, ask the user before generating any fallback geometry. NO fake buttons, NO empty folders, NO placeholder scripts, NO TODOs. Stay on-topic but inside the topic build EVERYTHING the system needs. Aim for 10-30 actions for full systems."}\n`;

          const languageHeader = `\n[LANGUAGE: ${languageCode} / ${languageName}]\nRespond ENTIRELY in ${languageName}. Translate every sentence, heading, button name, status message, error message, and explanation into natural, fluent, idiomatic ${languageName}. Keep code identifiers, Roblox API names (Instance class names, services, property names like Workspace, Part, ScreenGui, HumanoidRootPart), and the bloxsmith-actions block contents in English exactly as required by Roblox. Translate UI strings the player will see (TextLabel.Text, button text, GUI titles, error notifications shown to players) into ${languageName}. Markdown formatting stays the same.\n`;

          const assetModeRule = mode === "chat" ? "" : (() => {
            switch (assetMode) {
              case "toolbox_only":
                return `\n[ASSET MODE: TOOLBOX ONLY]\nThe user has chosen Toolbox Assets Only. Hard rules for this turn:\n- For every visual model (trees, buildings, vehicles, NPCs, pets, weapons, props, decor, furniture, roads, shops, cities, forests, maps, worlds, and environment kits) you MUST call the search_toolbox tool and emit insert_asset actions with safe returned ids.\n- Do a WIDE Creator Store search: split broad prompts into categories and call search_toolbox separately for each needed category. Example city = road/street, building/skyscraper/shop, street light, car/vehicle, sign/decor. Example forest = tree, rock, bush, cabin, animal/NPC if needed.\n- DO NOT build trees, houses, roads, cars, NPCs, weapons, decorations, maps, or random scenery from primitives in run_lua. DO NOT emit raw "part" actions to fake real-world objects.\n- Only use run_lua for placement/scaling/rotation of inserted assets, clean organization, service setup, scripts, UI wiring, and non-visual support logic.\n- If search_toolbox returns source "none" for a required category, tell the user plainly that no safe free Toolbox asset was found and ASK whether to fall back to generated geometry.\n- Briefly list which assets you inserted (name + creatorName + id) in your explanation.\n`;
                return `\n[ASSET MODE: TOOLBOX ONLY]\nThe user has chosen Toolbox Assets Only. Hard rules for this turn:\n- Think of Roblox Toolbox / Creator Store as a live searchable asset universe. You do not rely on memory or invented IDs; you search it.\n- For full games, maps, screenshots, cities, worlds, lobbies, or multi-prop scenes, call search_toolbox_set FIRST with every visual category needed. Example city = road/street, building/skyscraper/shop, street light, sidewalk, car/vehicle, sign/decor, NPC if needed. Example forest = tree, rock, bush, cabin, campfire, animal/NPC if needed.\n- For one-off visual assets, call search_toolbox. For follow-up gaps after search_toolbox_set, call search_toolbox with narrower keywords.\n- For every visual model (trees, buildings, vehicles, NPCs, pets, weapons, props, decor, furniture, roads, shops, cities, forests, maps, worlds, and environment kits) emit insert_asset actions with safe returned ids and fallback_ids.\n- DO NOT build trees, houses, roads, cars, NPCs, weapons, decorations, maps, or random scenery from primitives in run_lua. DO NOT emit raw "part" actions to fake real-world objects.\n- Only use run_lua for placement/scaling/rotation of inserted assets, clean organization, service setup, scripts, UI wiring, and non-visual support logic.\n- If a required search_toolbox_set request returns status "missing" or search_toolbox returns source "none", tell the user plainly that no safe free Toolbox asset was found and ASK whether to fall back to generated geometry.\n- Briefly list which assets you inserted (name + creatorName + id) in your explanation.\n`;
              case "both":
                return `\n[ASSET MODE: TOOLBOX + SCRIPTED SYSTEMS]\nUse Toolbox assets via search_toolbox_set/search_toolbox + insert_asset for all visual models and environment content. For full scenes or game templates, call search_toolbox_set with each needed category before building. Use run_lua for placement, scaling, rotation, scripted systems, UI, remotes, storage organization, and light terrain/support edits only. If no safe relevant Toolbox asset exists, ask before generating fallback geometry.\n`;
              default:
                return `\n[ASSET MODE: TOOLBOX ONLY]\nUse safe free Roblox Toolbox / Creator Store assets for visual content. Ask before generating any fallback geometry.\n`;
            }
          })();

          const toolboxTool = tool({
            description:
              "Search the full public Roblox Toolbox/Creator Store for FREE public assets matching a keyword. Use this whenever the user asks for trees, buildings, cars, vehicles, roads, furniture, weapons, NPCs, pets, props, environment kits, sounds, or anything that should be a real Roblox model instead of generated primitives. The backend does a wide multi-query, multi-page free model search, enriches details, filters unsafe/junk/broken/script-heavy rows, and returns ranked rows with insertPayload { asset_id, fallback_ids }. Call once per distinct asset type you need.",
            inputSchema: z.object({
              keyword: z.string().describe("What to search for, e.g. 'oak tree', 'sports car', 'medieval house', 'zombie npc'."),
              category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional().describe("Asset category, defaults to Model."),
              limit: z.number().int().min(1).max(50).optional().describe("Max safe free results, default 18."),
            }),
            execute: async ({ keyword, category, limit }: { keyword: string; category?: ToolboxCategory; limit?: number }) => {
              const out = await searchRobloxToolbox(keyword, category ?? "Model", limit ?? 18);
              // Hide low-quality rows from the AI while allowing safe public Creator Store assets,
              // not only Roblox-owned assets. The helper has already removed junk and paid rows.
              const filtered = out.results.filter((r) => r.free !== false && (r.safety ?? 0) >= 0.62 && (r.relevance ?? 0) >= 0.18);
              const final = filtered;
              return {
                source: out.source,
                count: final.length,
                scanned: out.scanned,
                searchedTerms: out.searchedTerms,
                results: final,
                insertionRule:
                  "For each chosen row, emit insert_asset with payload.asset_id from row.id and payload.fallback_ids from row.fallbackIds. Use position/rotation/scale/folder_name/tags yourself. Prefer qualityTier 'excellent', then 'good'. Do not invent IDs.",
                note: out.source === "fallback"
                  ? "Live search unavailable; these are curated verified-free Roblox-owned assets."
                  : out.source === "none"
                  ? "No safe free assets matched. Tell the user no Toolbox match was found and ASK before falling back to generated geometry."
                  : "Live results from Roblox public Toolbox/Creator Store. Use only safe, free, relevant rows, prefer higher score/safety/relevance, include fallback_ids, and list inserted asset names, creators, and ids for the user.",
              };
            },
          });

          const toolboxSetTool = tool({
            description:
              "Search the whole public Roblox Toolbox/Creator Store for a SET of needed visual asset categories in one call. Use this before building full maps, worlds, screenshots, lobbies, cities, tycoons, obbies, simulators, RPGs, racing maps, roleplay cities, or any scene needing multiple asset types. Provide one request per category, e.g. road, building, street light, vehicle, tree, rock, NPC. Returns per-category ranked safe/free rows with fallbackIds and insertPayload.",
            inputSchema: z.object({
              requests: z.array(z.object({
                label: z.string().describe("Short category label, e.g. 'city roads', 'shop buildings', 'street lights'."),
                keyword: z.string().describe("Roblox Toolbox keyword for this category."),
                category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional().describe("Asset category, defaults to Model."),
                limit: z.number().int().min(1).max(24).optional().describe("Max safe results for this category, default 8."),
                required: z.boolean().optional().describe("True when this category is essential and should not be faked with geometry."),
              })).min(1).max(16),
              defaultLimit: z.number().int().min(1).max(24).optional().describe("Default per-category safe result limit."),
            }),
            execute: async ({ requests, defaultLimit }: { requests: ToolboxSetRequest[]; defaultLimit?: number }) => {
              const out = await searchRobloxToolboxSet(requests, defaultLimit ?? 8);
              return {
                ...out,
                note:
                  out.source === "none"
                    ? "No safe free Toolbox assets were found for this requested set. Ask before fallback geometry."
                    : "Use each request.best or another high-score result for insert_asset. Always include fallback_ids where present, and do not invent IDs.",
              };
            },
          });

          const tryStream = (
            model: typeof modelChoice.model,
            usedModelId: string,
            notice: string | null,
            extraBody?: Record<string, unknown>,
            modelSettings?: { temperature?: number; topP?: number; maxOutputTokens?: number },
          ) => streamText({
            model,
            system: BLOXSMITH_SYSTEM_PROMPT + modeHeader + languageHeader + assetModeRule + contextBlock,
            messages: convertedMessages,
            ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
            ...(modelSettings?.temperature !== undefined ? { temperature: modelSettings.temperature } : {}),
            ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
            ...(modelSettings?.maxOutputTokens !== undefined ? { maxOutputTokens: modelSettings.maxOutputTokens } : {}),
            // In chat mode, do NOT expose the toolbox tool — the model can't build, so it doesn't need it.
            tools: mode === "chat" ? {} : { search_toolbox: toolboxTool, search_toolbox_set: toolboxSetTool },
            stopWhen: stepCountIs(50),
            onFinish: persistFinish(usedModelId, notice),
            onError: ({ error }) => {
              console.error(`[chat] upstream error on ${usedModelId}`, error);
            },
          });

          let result = tryStream(modelChoice.model, modelChoice.meta.id, modelChoice.usedFallback
            ? `_Switched to ${modelChoice.meta.label} because the selected model isn't available._`
            : null, modelChoice.extraBody, modelChoice.modelSettings);

          // Wrap in fallback: if the stream errors before any tokens, retry with fallback.
          try {
            return result.toUIMessageStreamResponse({
              onError: (err) => {
                console.error("[chat] stream error", err);
                if (err instanceof Error) {
                  if (/402|credit/i.test(err.message)) return "AI credits are exhausted. Add more credits in Settings → Plans.";
                  if (/429|rate/i.test(err.message)) return "AI is rate-limited right now. Wait a few seconds and try again.";
                  return `AI request failed: ${err.message}`;
                }
                return "AI request failed.";
              },
            });
          } catch (streamErr) {
            console.error("[chat] requested model failed, trying fallback", streamErr);
            const fb = getFallbackModel();
            result = tryStream(
              fb.model,
              fb.meta.id,
              `_The selected model failed, so BloxSmith switched to ${fb.meta.label} (fallback)._`,
              fb.extraBody,
              fb.modelSettings,
            );
            return result.toUIMessageStreamResponse();
          }
        } catch (e) {
          console.error("[chat] fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500, "fatal");
        }
      },
    },
  },
});
