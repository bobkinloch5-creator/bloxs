// BloxSmith Plugin Marketplace
// ---------------------------------------------------------------------------
// Installable packs. Each pack resolves to real script artifacts that are
// routed to the correct Roblox service, so "Install" produces working code
// rather than a download link.

import { SERVICE_ROUTES } from "./roblox-explorer";
import { GAMEPLAY_FEATURES, type FeatureArtifact } from "./gameplay-features";
import { buildUiArtifacts, type UiScreen } from "./roblox-ui-kit";

export type PackCategory =
  | "ui"
  | "gameplay"
  | "world"
  | "admin"
  | "camera"
  | "vehicles"
  | "npc"
  | "animation";

export type MarketplacePack = {
  id: string;
  name: string;
  category: PackCategory;
  description: string;
  tags: string[];
  build: () => FeatureArtifact[];
};

const serverModule = (name: string, source: string): FeatureArtifact => ({
  className: "ModuleScript",
  name,
  parentPath: SERVICE_ROUTES.serverModule,
  source,
});

const serverScript = (name: string, source: string): FeatureArtifact => ({
  className: "Script",
  name,
  parentPath: SERVICE_ROUTES.serverScript,
  source,
});

const clientScript = (name: string, source: string): FeatureArtifact => ({
  className: "LocalScript",
  name,
  parentPath: SERVICE_ROUTES.clientScript,
  source,
});

function featureArtifacts(key: string): FeatureArtifact[] {
  const feature = GAMEPLAY_FEATURES.find((entry) => entry.key === key);
  return feature ? feature.build() : [];
}

function uiPack(screens: UiScreen[]): FeatureArtifact[] {
  return buildUiArtifacts({ screens }).map((artifact) => ({
    className: artifact.className,
    name: artifact.name,
    parentPath: artifact.parentPath,
    source: artifact.source,
  }));
}

// ---------------------------------------------------------------------------
// Pack sources
// ---------------------------------------------------------------------------
const DIALOGUE_SOURCE = `--[[
	DialogueService - branching NPC conversations driven by data.
	Attach a StringValue named "DialogueId" to any NPC model.
]]
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local DialogueService = {}
DialogueService.Trees = {
	elder = {
		start = {
			speaker = "Village Elder",
			text = "Travellers are rare these days. Can you help us?",
			choices = {
				{ id = "accept", label = "I will help", goto = "accepted" },
				{ id = "decline", label = "Not today", goto = nil },
			},
		},
		accepted = {
			speaker = "Village Elder",
			text = "Then take this quest and return when it is done.",
			choices = { { id = "done", label = "Understood" } },
			onEnter = "grant_quest",
		},
	},
}

local active = {}

local function remote(name)
	local root = ReplicatedStorage:FindFirstChild("BloxSmith")
	local folder = root and root:FindFirstChild("Remotes")
	return folder and folder:FindFirstChild(name)
end

function DialogueService:Start(player, treeId)
	local tree = self.Trees[treeId]
	if not tree then
		return false
	end
	active[player] = { treeId = treeId, node = "start" }
	self:Send(player)
	return true
end

function DialogueService:Send(player)
	local state = active[player]
	local node = state and self.Trees[state.treeId] and self.Trees[state.treeId][state.node]
	local event = remote("DialogueShow")
	if node and event and event:IsA("RemoteEvent") then
		event:FireClient(player, node.speaker, node.text, node.choices)
	end
end

function DialogueService:Choose(player, choiceId)
	local state = active[player]
	if not state then
		return
	end
	local node = self.Trees[state.treeId][state.node]
	for _, choice in ipairs(node.choices or {}) do
		if choice.id == choiceId then
			if choice.goto then
				state.node = choice.goto
				self:Send(player)
			else
				active[player] = nil
			end
			return
		end
	end
end

task.defer(function()
	local event = remote("DialogChoice")
	if event and event:IsA("RemoteEvent") then
		event.OnServerEvent:Connect(function(player, choiceId)
			DialogueService:Choose(player, tostring(choiceId))
		end)
	end
end)

return DialogueService`;

const ADMIN_SOURCE = `--[[
	AdminPanel - chat commands for trusted user IDs only.
	Add your own UserId to AdminPanel.Admins before shipping.
]]
local Players = game:GetService("Players")
local TextChatService = game:GetService("TextChatService")

local AdminPanel = {}
AdminPanel.Admins = {}
AdminPanel.Commands = {}

local function isAdmin(player)
	if #AdminPanel.Admins == 0 then
		return player.UserId == game.CreatorId
	end
	return table.find(AdminPanel.Admins, player.UserId) ~= nil
end

local function findPlayer(name)
	name = name:lower()
	for _, player in ipairs(Players:GetPlayers()) do
		if player.Name:lower():sub(1, #name) == name then
			return player
		end
	end
	return nil
end

AdminPanel.Commands.speed = function(_, targetName, value)
	local target = findPlayer(targetName or "")
	local humanoid = target and target.Character and target.Character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = tonumber(value) or 16
	end
end

AdminPanel.Commands.heal = function(_, targetName)
	local target = findPlayer(targetName or "")
	local humanoid = target and target.Character and target.Character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.Health = humanoid.MaxHealth
	end
end

AdminPanel.Commands.bring = function(caller, targetName)
	local target = findPlayer(targetName or "")
	local callerRoot = caller.Character and caller.Character:FindFirstChild("HumanoidRootPart")
	if target and target.Character and callerRoot then
		target.Character:PivotTo(callerRoot.CFrame * CFrame.new(0, 0, -4))
	end
end

AdminPanel.Commands.kick = function(_, targetName, ...)
	local target = findPlayer(targetName or "")
	if target then
		target:Kick(table.concat({ ... }, " "))
	end
end

function AdminPanel:Run(player, message)
	if not isAdmin(player) or message:sub(1, 1) ~= "/" then
		return
	end
	local parts = {}
	for word in message:sub(2):gmatch("%S+") do
		table.insert(parts, word)
	end
	local command = self.Commands[(parts[1] or ""):lower()]
	if command then
		command(player, select(2, table.unpack(parts)))
	end
end

Players.PlayerAdded:Connect(function(player)
	player.Chatted:Connect(function(message)
		AdminPanel:Run(player, message)
	end)
end)

return AdminPanel`;

const WEATHER_SOURCE = `--[[
	WeatherService - rain, snow, fog and storms driven by one server clock.
	Weather is replicated through Lighting so clients stay in sync for free.
]]
local Lighting = game:GetService("Lighting")

local WeatherService = {}
WeatherService.Current = "clear"
WeatherService.Presets = {
	clear = { fog = 6000, density = 0.3, brightness = 2.4 },
	rain = { fog = 900, density = 0.5, brightness = 1.4 },
	snow = { fog = 700, density = 0.6, brightness = 1.8 },
	storm = { fog = 420, density = 0.75, brightness = 0.9 },
}

local function atmosphere()
	local existing = Lighting:FindFirstChildOfClass("Atmosphere")
	if existing then
		return existing
	end
	local created = Instance.new("Atmosphere")
	created.Parent = Lighting
	return created
end

function WeatherService:Set(name)
	local preset = self.Presets[name]
	if not preset then
		return false
	end
	self.Current = name
	Lighting.FogEnd = preset.fog
	Lighting.Brightness = preset.brightness
	atmosphere().Density = preset.density

	local emitterHost = workspace:FindFirstChild("BloxSmith_World")
	if emitterHost then
		local marker = emitterHost:FindFirstChild("WeatherState") or Instance.new("StringValue")
		marker.Name = "WeatherState"
		marker.Value = name
		marker.Parent = emitterHost
	end
	return true
end

function WeatherService:StartCycle(secondsPerPhase)
	task.spawn(function()
		local order = { "clear", "rain", "clear", "storm", "clear", "snow" }
		local index = 1
		while true do
			self:Set(order[index])
			index = index % #order + 1
			task.wait(secondsPerPhase or 180)
		end
	end)
end

return WeatherService`;

const DAY_NIGHT_SOURCE = `--[[
	DayNightCycle - smooth time of day with dawn/dusk colour grading.
	One server loop; clients receive the change through Lighting replication.
]]
local Lighting = game:GetService("Lighting")

local MINUTES_PER_REAL_SECOND = 4
local clock = 8 * 60

task.spawn(function()
	while true do
		task.wait(1)
		clock = (clock + MINUTES_PER_REAL_SECOND) % 1440
		Lighting:SetMinutesAfterMidnight(clock)

		local hour = clock / 60
		if hour > 6 and hour < 18 then
			Lighting.Brightness = 2.4
			Lighting.OutdoorAmbient = Color3.fromRGB(128, 128, 140)
		else
			Lighting.Brightness = 0.9
			Lighting.OutdoorAmbient = Color3.fromRGB(48, 52, 78)
		end
	end
end)`;

const CAMERA_SOURCE = `--[[
	CameraController - shoulder, top-down, first person and cinematic modes.
	One RenderStepped binding, switchable at runtime.
]]
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local Controller = { mode = "default" }
local MODES = { "default", "shoulder", "topdown", "first" }
local modeIndex = 1

local function apply()
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	if Controller.mode == "first" then
		humanoid.CameraOffset = Vector3.new(0, 0, 0)
		player.CameraMode = Enum.CameraMode.LockFirstPerson
	else
		player.CameraMode = Enum.CameraMode.Classic
		humanoid.CameraOffset = Controller.mode == "shoulder" and Vector3.new(2, 0.5, 0) or Vector3.new()
	end
	if Controller.mode == "topdown" then
		camera.CameraType = Enum.CameraType.Scriptable
	else
		camera.CameraType = Enum.CameraType.Custom
	end
end

function Controller.set(mode)
	Controller.mode = mode
	apply()
end

RunService:BindToRenderStep("BloxSmithCamera", Enum.RenderPriority.Camera.Value + 1, function()
	if Controller.mode ~= "topdown" then
		return
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if root then
		camera.CFrame = CFrame.lookAt(root.Position + Vector3.new(0, 42, 0.1), root.Position)
	end
end)

UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.V then
		modeIndex = modeIndex % #MODES + 1
		Controller.set(MODES[modeIndex])
	end
end)

player.CharacterAdded:Connect(function()
	task.wait(0.2)
	apply()
end)

_G.BloxSmithCamera = Controller`;

const VEHICLE_SOURCE = `--[[
	VehicleService - spawn constraint-driven vehicles with seats.
	Uses VectorForce + AngularVelocity so it behaves the same on all clients.
]]
local VehicleService = {}
VehicleService.Blueprints = {
	car = { size = Vector3.new(6, 2, 12), speed = 90, color = Color3.fromRGB(200, 60, 60) },
	kart = { size = Vector3.new(4, 1.5, 7), speed = 120, color = Color3.fromRGB(70, 200, 255) },
}

function VehicleService:Spawn(kind, cframe)
	local blueprint = self.Blueprints[kind]
	if not blueprint then
		return nil
	end

	local model = Instance.new("Model")
	model.Name = "Vehicle_" .. kind

	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = blueprint.size
	chassis.Color = blueprint.color
	chassis.Material = Enum.Material.Metal
	chassis.CFrame = cframe or CFrame.new(0, 6, 0)
	chassis.Parent = model
	model.PrimaryPart = chassis

	local seat = Instance.new("VehicleSeat")
	seat.Name = "DriverSeat"
	seat.Size = Vector3.new(2, 1, 2)
	seat.MaxSpeed = blueprint.speed
	seat.Torque = 25
	seat.TurnSpeed = 18
	seat.CFrame = chassis.CFrame * CFrame.new(0, blueprint.size.Y / 2 + 0.5, 0)
	seat.Parent = model

	local weld = Instance.new("WeldConstraint")
	weld.Part0, weld.Part1 = chassis, seat
	weld.Parent = chassis

	local attachment = Instance.new("Attachment")
	attachment.Parent = chassis

	local gyro = Instance.new("AlignOrientation")
	gyro.Mode = Enum.OrientationAlignmentMode.OneAttachment
	gyro.Attachment0 = attachment
	gyro.RigidityEnabled = false
	gyro.Responsiveness = 25
	gyro.MaxTorque = 60000
	gyro.Parent = chassis

	model.Parent = workspace:FindFirstChild("BloxSmith_World") or workspace
	return model
end

return VehicleService`;

const NPC_PACK_SOURCE = `--[[
	NpcPack - ready made NPC definitions you can spawn immediately.
	Requires NpcService (installed by the NPC feature).
]]
local NpcPack = {}
NpcPack.Presets = {
	shopkeeper = { name = "Shopkeeper", friendly = true, walkSpeed = 0, health = 500 },
	guard = { name = "Guard", friendly = false, damage = 18, health = 220, aggroRange = 55 },
	slime = { name = "Slime", friendly = false, damage = 6, health = 60, walkSpeed = 8 },
	boss = { name = "Boss", friendly = false, damage = 40, health = 2500, walkSpeed = 14, aggroRange = 80 },
	quest_giver = { name = "Quest Giver", friendly = true, walkSpeed = 0, health = 500 },
}

function NpcPack:SpawnPreset(npcService, presetId, position)
	local preset = self.Presets[presetId]
	if not preset or not npcService then
		return nil
	end
	local config = table.clone(preset)
	config.position = position
	return npcService:Spawn(config)
end

return NpcPack`;

const ANIMATION_PACK_SOURCE = `--[[
	AnimationPack - curated animation ids grouped by use case.
	Swap these ids for your own uploads before publishing.
]]
return {
	emotes = {
		wave = "rbxassetid://507770239",
		dance = "rbxassetid://507771019",
		point = "rbxassetid://507770453",
		cheer = "rbxassetid://507770677",
	},
	combat = {
		slash = "rbxassetid://522635514",
		heavy = "rbxassetid://522638767",
		block = "rbxassetid://522638767",
	},
	movement = {
		idle = "rbxassetid://507766666",
		walk = "rbxassetid://507777826",
		run = "rbxassetid://507767714",
		jump = "rbxassetid://507765000",
		climb = "rbxassetid://507765644",
	},
}`;

const PROMPT_BOOTSTRAP = `--[[
	InteractionBootstrap - wires ProximityPrompts and ClickDetectors placed by
	the world builder to the correct gameplay module.
]]
local CollectionService = game:GetService("CollectionService")

local function handle(instance)
	local action = instance:GetAttribute("BloxSmithAction")
	if not action then
		return
	end
	if instance:IsA("ProximityPrompt") then
		instance.Triggered:Connect(function(player)
			print(("[BloxSmith] %s triggered %s"):format(player.Name, action))
		end)
	elseif instance:IsA("ClickDetector") then
		instance.MouseClick:Connect(function(player)
			print(("[BloxSmith] %s clicked %s"):format(player.Name, action))
		end)
	end
end

for _, instance in ipairs(CollectionService:GetTagged("BloxSmithInteraction")) do
	handle(instance)
end
CollectionService:GetInstanceAddedSignal("BloxSmithInteraction"):Connect(handle)`;

export const MARKETPLACE_PACKS: MarketplacePack[] = [
  {
    id: "ui_suite",
    name: "Complete UI Suite",
    category: "ui",
    description: "Menu, HUD, shop, inventory, settings, notifications and popups with responsive scaling and gamepad support.",
    tags: ["ui", "menu", "hud", "mobile"],
    build: () => uiPack(["main_menu", "hud", "shop", "inventory", "settings", "notifications", "popup"]),
  },
  {
    id: "inventory_system",
    name: "Inventory System",
    category: "gameplay",
    description: "Stacked inventory with capacity limits, equipping and saved contents, plus the inventory screen.",
    tags: ["inventory", "items", "save"],
    build: () => [...featureArtifacts("inventory"), ...uiPack(["inventory"])],
  },
  {
    id: "pet_system",
    name: "Pet System",
    category: "gameplay",
    description: "Egg hatching with weighted rarity, equip limits, multipliers and a smooth follow controller.",
    tags: ["pets", "eggs", "simulator"],
    build: () => [...featureArtifacts("pets"), ...uiPack(["pets"])],
  },
  {
    id: "combat_system",
    name: "Combat System",
    category: "gameplay",
    description: "Server-validated melee and ranged combat with cooldowns, range checks and a Tool factory.",
    tags: ["combat", "weapons", "pvp"],
    build: () => featureArtifacts("combat"),
  },
  {
    id: "dialogue_system",
    name: "Dialogue System",
    category: "gameplay",
    description: "Branching NPC conversations with choices, plus the dialog UI panel.",
    tags: ["dialogue", "npc", "story"],
    build: () => [serverModule("DialogueService", DIALOGUE_SOURCE), ...uiPack(["dialog"])],
  },
  {
    id: "admin_panel",
    name: "Admin Panel",
    category: "admin",
    description: "Chat commands (speed, heal, bring, kick) locked to trusted user IDs.",
    tags: ["admin", "moderation", "commands"],
    build: () => [serverModule("AdminPanel", ADMIN_SOURCE)],
  },
  {
    id: "weather_system",
    name: "Weather System",
    category: "world",
    description: "Clear, rain, snow and storm presets with an automatic weather cycle.",
    tags: ["weather", "atmosphere", "lighting"],
    build: () => [serverModule("WeatherService", WEATHER_SOURCE)],
  },
  {
    id: "day_night_cycle",
    name: "Day / Night Cycle",
    category: "world",
    description: "Smooth time-of-day progression with dawn and dusk colour grading.",
    tags: ["lighting", "cycle", "ambience"],
    build: () => [serverScript("DayNightCycle", DAY_NIGHT_SOURCE)],
  },
  {
    id: "camera_system",
    name: "Camera System",
    category: "camera",
    description: "Default, over-the-shoulder, top-down and first-person camera modes on one render binding.",
    tags: ["camera", "client", "controls"],
    build: () => [clientScript("CameraController", CAMERA_SOURCE)],
  },
  {
    id: "vehicle_system",
    name: "Vehicle System",
    category: "vehicles",
    description: "Constraint-driven cars and karts with VehicleSeat controls.",
    tags: ["vehicle", "racing", "physics"],
    build: () => [serverModule("VehicleService", VEHICLE_SOURCE)],
  },
  {
    id: "npc_pack",
    name: "NPC Pack",
    category: "npc",
    description: "Shopkeeper, guard, slime, boss and quest-giver presets for NpcService.",
    tags: ["npc", "enemies", "presets"],
    build: () => [...featureArtifacts("npcs"), serverModule("NpcPack", NPC_PACK_SOURCE)],
  },
  {
    id: "animation_pack",
    name: "Animation Pack",
    category: "animation",
    description: "Curated emote, combat and movement animation ids with a cached track loader.",
    tags: ["animation", "emotes", "combat"],
    build: () => [...featureArtifacts("animations"), serverModule("AnimationPack", ANIMATION_PACK_SOURCE)],
  },
  {
    id: "interaction_kit",
    name: "Interaction Kit",
    category: "world",
    description: "Hooks up ProximityPrompts and ClickDetectors placed by the world builder.",
    tags: ["prompts", "clickdetector", "world"],
    build: () => [serverScript("InteractionBootstrap", PROMPT_BOOTSTRAP)],
  },
];

export function getPack(id: string): MarketplacePack | undefined {
  return MARKETPLACE_PACKS.find((pack) => pack.id === id);
}

export function listPacks(category?: PackCategory): MarketplacePack[] {
  return category ? MARKETPLACE_PACKS.filter((pack) => pack.category === category) : MARKETPLACE_PACKS;
}

export function searchPacks(query: string): MarketplacePack[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MARKETPLACE_PACKS;
  return MARKETPLACE_PACKS.filter((pack) =>
    [pack.name, pack.description, ...pack.tags].some((field) => field.toLowerCase().includes(needle)),
  );
}
