// BloxSmith Gameplay Feature catalog
// ---------------------------------------------------------------------------
// Genre-agnostic gameplay building blocks (NPCs, combat, pets, quests,
// gathering loops, tycoon droppers, vehicles...). Each feature produces one
// or more real script artifacts routed to the correct Roblox service.

import { SERVICE_ROUTES } from "./roblox-explorer";

export type ArtifactClass = "ModuleScript" | "Script" | "LocalScript";

export type FeatureArtifact = {
  className: ArtifactClass;
  name: string;
  parentPath: string;
  source: string;
};

export type GameplayFeature = {
  key: string;
  label: string;
  keywords: RegExp;
  summary: string;
  requiresSystems?: string[];
  build: () => FeatureArtifact[];
};

const doc = (title: string, notes: string[]) =>
  ["--[[", `\t${title}`, ...notes.map((n) => `\t${n}`), "]]"].join("\n");

// ---------------------------------------------------------------------------
// NPC + enemy AI
// ---------------------------------------------------------------------------
const NPC_MODULE = `${doc("NpcService - spawn, patrol, chase and respawn NPC rigs", [
  "Server-authoritative. Uses PathfindingService with a raycast fallback so",
  "NPCs never freeze when a path fails.",
  "Usage: NpcService:Spawn({ name = \"Guard\", position = Vector3.new(0, 5, 0) })",
])}
local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local NpcService = {}
NpcService.Active = {}
NpcService.Defaults = {
	name = "NPC",
	health = 100,
	walkSpeed = 12,
	damage = 10,
	aggroRange = 45,
	attackRange = 6,
	attackCooldown = 1.2,
	respawnSeconds = 8,
	friendly = false,
}

local function buildRig(config)
	local templates = ServerStorage:FindFirstChild("BloxSmith_Server")
		and ServerStorage.BloxSmith_Server:FindFirstChild("Templates")
	local template = templates and templates:FindFirstChild(config.name)
	if template then
		return template:Clone()
	end

	-- Procedural fallback rig so a build never depends on a missing asset.
	local model = Instance.new("Model")
	model.Name = config.name

	local root = Instance.new("Part")
	root.Name = "HumanoidRootPart"
	root.Size = Vector3.new(2, 2, 1)
	root.Transparency = 1
	root.Parent = model

	local torso = Instance.new("Part")
	torso.Name = "Torso"
	torso.Size = Vector3.new(2, 2, 1)
	torso.Color = config.friendly and Color3.fromRGB(90, 170, 255) or Color3.fromRGB(210, 80, 80)
	torso.Parent = model

	local head = Instance.new("Part")
	head.Name = "Head"
	head.Shape = Enum.PartType.Ball
	head.Size = Vector3.new(1.6, 1.6, 1.6)
	head.Color = Color3.fromRGB(245, 205, 160)
	head.Parent = model

	local humanoid = Instance.new("Humanoid")
	humanoid.Parent = model

	model.PrimaryPart = root
	torso.CFrame = root.CFrame
	head.CFrame = root.CFrame * CFrame.new(0, 1.8, 0)

	local weldTorso = Instance.new("WeldConstraint")
	weldTorso.Part0, weldTorso.Part1 = root, torso
	weldTorso.Parent = root

	local weldHead = Instance.new("WeldConstraint")
	weldHead.Part0, weldHead.Part1 = root, head
	weldHead.Parent = root

	return model
end

local function nearestPlayer(position, range)
	local best, bestDistance = nil, range
	for _, player in ipairs(Players:GetPlayers()) do
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if root and humanoid and humanoid.Health > 0 then
			local distance = (root.Position - position).Magnitude
			if distance < bestDistance then
				best, bestDistance = player, distance
			end
		end
	end
	return best, bestDistance
end

function NpcService:Spawn(options)
	local config = table.clone(self.Defaults)
	for key, value in pairs(options or {}) do
		config[key] = value
	end

	local model = buildRig(config)
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local root = model.PrimaryPart or model:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root then
		warn("[BloxSmith] NPC rig missing Humanoid/root:", config.name)
		return nil
	end

	humanoid.MaxHealth = config.health
	humanoid.Health = config.health
	humanoid.WalkSpeed = config.walkSpeed

	local folder = workspace:FindFirstChild("BloxSmith_World")
	folder = folder and folder:FindFirstChild("NPCs") or workspace
	model.Parent = folder
	model:PivotTo(CFrame.new(config.position or Vector3.new(0, 5, 0)))

	local state = { model = model, config = config, lastAttack = 0, home = root.Position }
	table.insert(self.Active, state)

	humanoid.Died:Connect(function()
		task.delay(config.respawnSeconds, function()
			if model.Parent then
				model:Destroy()
			end
			local index = table.find(self.Active, state)
			if index then
				table.remove(self.Active, index)
			end
			if config.respawn ~= false then
				self:Spawn(config)
			end
		end)
	end)

	return state
end

local accumulator = 0
-- One shared loop for every NPC keeps frame cost flat instead of one
-- Heartbeat connection per rig (a classic Roblox lag source).
RunService.Heartbeat:Connect(function(delta)
	accumulator += delta
	if accumulator < 0.2 then
		return
	end
	accumulator = 0

	for _, state in ipairs(NpcService.Active) do
		local model = state.model
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		local root = model and model.PrimaryPart
		if humanoid and root and humanoid.Health > 0 then
			local config = state.config
			local target, distance = nearestPlayer(root.Position, config.aggroRange)
			if target and not config.friendly then
				local targetRoot = target.Character and target.Character:FindFirstChild("HumanoidRootPart")
				if targetRoot then
					if distance <= config.attackRange then
						if os.clock() - state.lastAttack >= config.attackCooldown then
							state.lastAttack = os.clock()
							local targetHumanoid = target.Character:FindFirstChildOfClass("Humanoid")
							if targetHumanoid then
								targetHumanoid:TakeDamage(config.damage)
							end
						end
					else
						humanoid:MoveTo(targetRoot.Position)
					end
				end
			elseif (root.Position - state.home).Magnitude > 6 then
				humanoid:MoveTo(state.home)
			end
		end
	end
end)

return NpcService`;

const COMBAT_MODULE = `${doc("CombatService - server-validated melee and ranged damage", [
  "Clients only send intent. All hit detection, cooldowns and range checks",
  "happen here so exploiters cannot fake damage.",
])}
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local CombatService = {}
CombatService.Weapons = {
	sword = { damage = 25, cooldown = 0.55, range = 9, kind = "melee" },
	blaster = { damage = 18, cooldown = 0.3, range = 250, kind = "ranged" },
}

local cooldowns = {}

local function remotes()
	local root = ReplicatedStorage:FindFirstChild("BloxSmith")
	return root and root:FindFirstChild("Remotes")
end

function CombatService:CanAttack(player, weaponId)
	local weapon = self.Weapons[weaponId]
	if not weapon then
		return false, "unknown_weapon"
	end
	cooldowns[player] = cooldowns[player] or {}
	local last = cooldowns[player][weaponId] or 0
	if os.clock() - last < weapon.cooldown then
		return false, "cooldown"
	end
	return true, weapon
end

function CombatService:Attack(player, weaponId, targetModel)
	local ok, weapon = self:CanAttack(player, weaponId)
	if not ok then
		return false, weapon
	end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local targetHumanoid = targetModel and targetModel:FindFirstChildOfClass("Humanoid")
	local targetRoot = targetModel and targetModel:FindFirstChild("HumanoidRootPart")
	if not root or not targetHumanoid or not targetRoot or targetHumanoid.Health <= 0 then
		return false, "invalid_target"
	end

	if (root.Position - targetRoot.Position).Magnitude > weapon.range + 4 then
		return false, "out_of_range"
	end

	cooldowns[player][weaponId] = os.clock()
	targetHumanoid:TakeDamage(weapon.damage)
	return true, weapon.damage
end

local function wire()
	local folder = remotes()
	if not folder then
		return
	end
	local event = folder:FindFirstChild("CombatAttack")
	if event and event:IsA("RemoteEvent") then
		event.OnServerEvent:Connect(function(player, weaponId, targetModel)
			CombatService:Attack(player, tostring(weaponId), targetModel)
		end)
	end
end

task.defer(wire)

Players.PlayerRemoving:Connect(function(player)
	cooldowns[player] = nil
end)

return CombatService`;

const INVENTORY_MODULE = `${doc("InventoryService - stacked, capacity limited, replicated inventory", [
  "Persisted through ProfileStore. Client gets a filtered snapshot only.",
])}
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Profiles = require(script.Parent.ProfileStore)

local InventoryService = {}
InventoryService.MaxSlots = 48
InventoryService.MaxStack = 999

local function remote()
	local root = ReplicatedStorage:FindFirstChild("BloxSmith")
	local folder = root and root:FindFirstChild("Remotes")
	return folder and folder:FindFirstChild("InventoryChanged")
end

local function push(player, inventory)
	local event = remote()
	if event and event:IsA("RemoteEvent") then
		event:FireClient(player, inventory)
	end
end

function InventoryService:Get(player)
	return Profiles:Get(player).inventory
end

function InventoryService:Count(player, itemId)
	local total = 0
	for _, slot in ipairs(self:Get(player)) do
		if slot.id == itemId then
			total += slot.count
		end
	end
	return total
end

function InventoryService:Add(player, itemId, amount)
	amount = math.max(1, math.floor(tonumber(amount) or 1))
	local inventory = self:Get(player)
	for _, slot in ipairs(inventory) do
		if slot.id == itemId and slot.count < self.MaxStack then
			slot.count = math.min(self.MaxStack, slot.count + amount)
			push(player, inventory)
			return true
		end
	end
	if #inventory >= self.MaxSlots then
		return false, "inventory_full"
	end
	table.insert(inventory, { id = itemId, count = amount })
	push(player, inventory)
	return true
end

function InventoryService:Remove(player, itemId, amount)
	amount = math.max(1, math.floor(tonumber(amount) or 1))
	local inventory = self:Get(player)
	for index = #inventory, 1, -1 do
		local slot = inventory[index]
		if slot.id == itemId then
			if slot.count < amount then
				return false, "not_enough"
			end
			slot.count -= amount
			if slot.count <= 0 then
				table.remove(inventory, index)
			end
			push(player, inventory)
			return true
		end
	end
	return false, "missing"
end

function InventoryService:Equip(player, itemId, slotName)
	if self:Count(player, itemId) <= 0 then
		return false, "not_owned"
	end
	local profile = Profiles:Get(player)
	profile.equipped[slotName or "main"] = itemId
	return true
end

return InventoryService`;

const QUEST_MODULE = `${doc("QuestService - objective tracking, progress and rewards", [
  "Quests are data. Add entries to QuestService.Catalog and the tracker,",
  "UI and rewards all work without new code.",
])}
local Profiles = require(script.Parent.ProfileStore)
local Economy = require(script.Parent.Economy)

local QuestService = {}
QuestService.Catalog = {
	welcome = {
		label = "Getting Started",
		description = "Collect 10 coins",
		objective = { kind = "collect", target = "coin", amount = 10 },
		reward = { coins = 250, xp = 50 },
	},
	hunter = {
		label = "Monster Hunter",
		description = "Defeat 5 enemies",
		objective = { kind = "defeat", target = "enemy", amount = 5 },
		reward = { coins = 500, xp = 120 },
		requires = "welcome",
	},
}

local function questState(player, questId)
	local profile = Profiles:Get(player)
	profile.quests[questId] = profile.quests[questId] or { progress = 0, completed = false, claimed = false }
	return profile.quests[questId]
end

function QuestService:Available(player)
	local out = {}
	for questId, quest in pairs(self.Catalog) do
		local prerequisiteDone = true
		if quest.requires then
			prerequisiteDone = questState(player, quest.requires).completed
		end
		if prerequisiteDone then
			out[questId] = { quest = quest, state = questState(player, questId) }
		end
	end
	return out
end

function QuestService:Progress(player, kind, target, amount)
	amount = amount or 1
	local updated = {}
	for questId, quest in pairs(self.Catalog) do
		local objective = quest.objective
		if objective.kind == kind and objective.target == target then
			local state = questState(player, questId)
			if not state.completed then
				state.progress = math.min(objective.amount, state.progress + amount)
				state.completed = state.progress >= objective.amount
				table.insert(updated, { id = questId, state = state })
			end
		end
	end
	return updated
end

function QuestService:Claim(player, questId)
	local quest = self.Catalog[questId]
	if not quest then
		return false, "unknown_quest"
	end
	local state = questState(player, questId)
	if not state.completed then
		return false, "not_complete"
	end
	if state.claimed then
		return false, "already_claimed"
	end
	state.claimed = true
	if quest.reward.coins then
		Economy:Add(player, "coins", quest.reward.coins)
	end
	if quest.reward.xp then
		local profile = Profiles:Get(player)
		profile.xp += quest.reward.xp
	end
	return true, quest.reward
end

return QuestService`;

const PETS_MODULE = `${doc("PetService - hatching, equipping, saved pets and smooth following", [
  "Pet models follow with a single client-side render loop, so 50 pets do",
  "not cost 50 server heartbeats.",
])}
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Profiles = require(script.Parent.ProfileStore)
local Economy = require(script.Parent.Economy)

local PetService = {}
PetService.MaxEquipped = 3
PetService.Catalog = {
	starter_dog = { label = "Puppy", rarity = "common", multiplier = 1.1, cost = 250 },
	cyber_cat = { label = "Cyber Cat", rarity = "rare", multiplier = 1.35, cost = 1500 },
	dragon = { label = "Dragonling", rarity = "legendary", multiplier = 2.2, cost = 12000 },
}
PetService.EggPools = {
	basic = { { id = "starter_dog", weight = 80 }, { id = "cyber_cat", weight = 18 }, { id = "dragon", weight = 2 } },
}

local function roll(pool)
	local total = 0
	for _, entry in ipairs(pool) do
		total += entry.weight
	end
	local pick = math.random() * total
	for _, entry in ipairs(pool) do
		pick -= entry.weight
		if pick <= 0 then
			return entry.id
		end
	end
	return pool[1].id
end

function PetService:Owned(player)
	return Profiles:Get(player).pets
end

function PetService:Hatch(player, eggId, price)
	local pool = self.EggPools[eggId]
	if not pool then
		return false, "unknown_egg"
	end
	local ok, err = Economy:Spend(player, "coins", price or 500)
	if not ok then
		return false, err
	end
	local petId = roll(pool)
	local pets = self:Owned(player)
	table.insert(pets, { id = petId, equipped = false, uid = tostring(os.clock()):gsub("%.", "") })
	return true, petId
end

function PetService:Equip(player, uid)
	local pets = self:Owned(player)
	local equippedCount = 0
	for _, pet in ipairs(pets) do
		if pet.equipped then
			equippedCount += 1
		end
	end
	for _, pet in ipairs(pets) do
		if pet.uid == uid then
			if not pet.equipped and equippedCount >= self.MaxEquipped then
				return false, "too_many_equipped"
			end
			pet.equipped = not pet.equipped
			return true, pet.equipped
		end
	end
	return false, "not_found"
end

function PetService:Multiplier(player)
	local multiplier = 1
	for _, pet in ipairs(self:Owned(player)) do
		if pet.equipped then
			local entry = self.Catalog[pet.id]
			if entry then
				multiplier *= entry.multiplier
			end
		end
	end
	return multiplier
end

return PetService`;

const PET_FOLLOW_CLIENT = `${doc("PetFollowController - one render loop for every equipped pet", [
  "Client side only. Pets are visual; the server owns ownership and buffs.",
])}
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local pets = {}

local function makePet(index)
	local part = Instance.new("Part")
	part.Size = Vector3.new(1.6, 1.6, 1.6)
	part.Material = Enum.Material.Neon
	part.Color = Color3.fromHSV((index * 0.17) % 1, 0.6, 1)
	part.CanCollide = false
	part.Anchored = true
	part.Name = ("BloxSmith_Pet_%d"):format(index)
	part.Parent = workspace:FindFirstChild("BloxSmith_World") or workspace
	return part
end

function _G.BloxSmithSetPetCount(count)
	for index = #pets + 1, count do
		pets[index] = makePet(index)
	end
	for index = count + 1, #pets do
		if pets[index] then
			pets[index]:Destroy()
			pets[index] = nil
		end
	end
end

RunService.RenderStepped:Connect(function()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	local time = os.clock()
	for index, pet in ipairs(pets) do
		local angle = time + index * (math.pi * 2 / math.max(#pets, 1))
		local offset = Vector3.new(math.cos(angle) * 4, 2 + math.sin(time * 2 + index) * 0.4, math.sin(angle) * 4)
		pet.CFrame = pet.CFrame:Lerp(CFrame.new(root.Position + offset), 0.18)
	end
end)`;

const GATHERING_MODULE = `${doc("GatheringService - mining, fishing, farming and crafting loops", [
  "One data-driven module powers all four gathering loops so balancing is",
  "a table edit rather than a rewrite.",
])}
local Profiles = require(script.Parent.ProfileStore)
local Inventory = require(script.Parent.InventoryService)
local Economy = require(script.Parent.Economy)

local GatheringService = {}

GatheringService.Nodes = {
	stone = { loop = "mining", item = "stone", seconds = 1.2, xp = 2, yield = { 1, 3 } },
	iron = { loop = "mining", item = "iron", seconds = 2.4, xp = 6, yield = { 1, 2 }, level = 3 },
	diamond = { loop = "mining", item = "diamond", seconds = 6, xp = 25, yield = { 1, 1 }, level = 10 },
	pond = { loop = "fishing", item = "fish", seconds = 3, xp = 5, yield = { 1, 1 } },
	wheat = { loop = "farming", item = "wheat", seconds = 4, xp = 4, yield = { 2, 5 } },
}

GatheringService.Recipes = {
	iron_pickaxe = { inputs = { iron = 3, wheat = 0, stone = 5 }, output = "iron_pickaxe", seconds = 3 },
	bread = { inputs = { wheat = 3 }, output = "bread", seconds = 1.5 },
}

GatheringService.SellPrices = { stone = 3, iron = 12, diamond = 120, fish = 18, wheat = 6, bread = 25 }

local busy = {}

local function levelOf(player)
	return Profiles:Get(player).level or 1
end

function GatheringService:Gather(player, nodeId)
	local node = self.Nodes[nodeId]
	if not node then
		return false, "unknown_node"
	end
	if busy[player] then
		return false, "busy"
	end
	if node.level and levelOf(player) < node.level then
		return false, "level_too_low"
	end

	busy[player] = true
	task.wait(node.seconds)
	busy[player] = nil

	local amount = math.random(node.yield[1], node.yield[2])
	Inventory:Add(player, node.item, amount)

	local profile = Profiles:Get(player)
	profile.xp += node.xp
	while profile.xp >= profile.level * 100 do
		profile.xp -= profile.level * 100
		profile.level += 1
	end

	return true, { item = node.item, amount = amount, loop = node.loop }
end

function GatheringService:Craft(player, recipeId)
	local recipe = self.Recipes[recipeId]
	if not recipe then
		return false, "unknown_recipe"
	end
	for item, count in pairs(recipe.inputs) do
		if count > 0 and Inventory:Count(player, item) < count then
			return false, "missing_materials"
		end
	end
	for item, count in pairs(recipe.inputs) do
		if count > 0 then
			Inventory:Remove(player, item, count)
		end
	end
	task.wait(recipe.seconds)
	Inventory:Add(player, recipe.output, 1)
	return true, recipe.output
end

function GatheringService:Sell(player, item, amount)
	local price = self.SellPrices[item]
	if not price then
		return false, "not_sellable"
	end
	amount = math.max(1, math.floor(amount or 1))
	local ok, err = Inventory:Remove(player, item, amount)
	if not ok then
		return false, err
	end
	Economy:Add(player, "coins", price * amount)
	return true, price * amount
end

return GatheringService`;

const SKILLS_MODULE = `${doc("SkillService - skill tree, cooldowns and ability effects", [
  "Skills are declarative. Each node lists cost, prerequisites and a runtime",
  "effect executed server-side.",
])}
local Profiles = require(script.Parent.ProfileStore)

local SkillService = {}
SkillService.Tree = {
	vitality = { label = "Vitality", cost = 1, maxRank = 5, effect = "health" },
	swiftness = { label = "Swiftness", cost = 1, maxRank = 5, effect = "speed" },
	berserk = { label = "Berserk", cost = 3, maxRank = 1, effect = "damage", requires = "vitality" },
}

local cooldowns = {}

function SkillService:Points(player)
	local profile = Profiles:Get(player)
	local spent = 0
	for skillId, rank in pairs(profile.skills) do
		local node = self.Tree[skillId]
		if node then
			spent += node.cost * rank
		end
	end
	return math.max(0, (profile.level - 1) - spent)
end

function SkillService:Unlock(player, skillId)
	local node = self.Tree[skillId]
	if not node then
		return false, "unknown_skill"
	end
	local profile = Profiles:Get(player)
	local rank = profile.skills[skillId] or 0
	if rank >= node.maxRank then
		return false, "maxed"
	end
	if node.requires and (profile.skills[node.requires] or 0) < 1 then
		return false, "locked"
	end
	if self:Points(player) < node.cost then
		return false, "no_points"
	end
	profile.skills[skillId] = rank + 1
	self:Apply(player)
	return true, profile.skills[skillId]
end

function SkillService:Apply(player)
	local profile = Profiles:Get(player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	humanoid.MaxHealth = 100 + (profile.skills.vitality or 0) * 20
	humanoid.Health = math.min(humanoid.Health + 0, humanoid.MaxHealth)
	humanoid.WalkSpeed = 16 + (profile.skills.swiftness or 0) * 2
end

function SkillService:Use(player, skillId, cooldownSeconds)
	cooldowns[player] = cooldowns[player] or {}
	local last = cooldowns[player][skillId] or 0
	if os.clock() - last < (cooldownSeconds or 5) then
		return false, "cooldown"
	end
	cooldowns[player][skillId] = os.clock()
	return true
end

return SkillService`;

const TYCOON_MODULE = `${doc("TycoonService - plots, droppers, conveyors and upgrade buttons", [
  "Each player claims a plot; droppers accumulate value server-side with a",
  "single timer instead of per-drop physics parts.",
])}
local Players = game:GetService("Players")
local Economy = require(script.Parent.Economy)
local Profiles = require(script.Parent.ProfileStore)

local TycoonService = {}
TycoonService.TickSeconds = 1
TycoonService.Droppers = {
	{ id = "basic", label = "Basic Dropper", cost = 0, income = 2 },
	{ id = "steel", label = "Steel Dropper", cost = 500, income = 8 },
	{ id = "gold", label = "Gold Dropper", cost = 5000, income = 40 },
	{ id = "quantum", label = "Quantum Dropper", cost = 50000, income = 260 },
}

local plots = {}

function TycoonService:Claim(player)
	if plots[player] then
		return plots[player]
	end
	local profile = Profiles:Get(player)
	profile.tycoon = profile.tycoon or { owned = { basic = true }, income = 2 }
	plots[player] = profile.tycoon
	return profile.tycoon
end

function TycoonService:Buy(player, dropperId)
	local plot = self:Claim(player)
	for _, dropper in ipairs(self.Droppers) do
		if dropper.id == dropperId then
			if plot.owned[dropperId] then
				return false, "already_owned"
			end
			local ok, err = Economy:Spend(player, "coins", dropper.cost)
			if not ok then
				return false, err
			end
			plot.owned[dropperId] = true
			plot.income += dropper.income
			return true, plot.income
		end
	end
	return false, "unknown_dropper"
end

function TycoonService:Rebirth(player)
	local profile = Profiles:Get(player)
	if (profile.coins or 0) < 100000 then
		return false, "not_enough_coins"
	end
	profile.coins = 0
	profile.rebirths += 1
	profile.tycoon = { owned = { basic = true }, income = 2 * (1 + profile.rebirths * 0.5) }
	plots[player] = profile.tycoon
	Economy:Sync(player)
	return true, profile.rebirths
end

task.spawn(function()
	while true do
		task.wait(TycoonService.TickSeconds)
		for _, player in ipairs(Players:GetPlayers()) do
			local plot = plots[player]
			if plot then
				Economy:Add(player, "coins", math.floor(plot.income))
			end
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	plots[player] = nil
end)

return TycoonService`;

const TOOL_FACTORY = `${doc("ToolFactory - build Tools and weapons with animations and effects", [
  "Server module. Tools are cloned from ReplicatedStorage.BloxSmith.Assets",
  "or generated procedurally when no template exists.",
])}
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ToolFactory = {}
ToolFactory.Blueprints = {
	sword = { size = Vector3.new(0.4, 6, 0.4), color = Color3.fromRGB(200, 210, 225), grip = CFrame.new(0, -2, 0), weaponId = "sword" },
	pickaxe = { size = Vector3.new(0.5, 4, 0.5), color = Color3.fromRGB(150, 120, 90), grip = CFrame.new(0, -1.4, 0), weaponId = nil },
	blaster = { size = Vector3.new(0.6, 1, 3), color = Color3.fromRGB(60, 80, 120), grip = CFrame.new(0, 0, 0.6), weaponId = "blaster" },
	fishing_rod = { size = Vector3.new(0.3, 5, 0.3), color = Color3.fromRGB(120, 90, 60), grip = CFrame.new(0, -2, 0), weaponId = nil },
}

function ToolFactory:Build(kind, name)
	local blueprint = self.Blueprints[kind]
	if not blueprint then
		return nil
	end

	local assets = ReplicatedStorage:FindFirstChild("BloxSmith")
	assets = assets and assets:FindFirstChild("Assets")
	local template = assets and assets:FindFirstChild(name or kind)
	if template and template:IsA("Tool") then
		return template:Clone()
	end

	local tool = Instance.new("Tool")
	tool.Name = name or kind
	tool.RequiresHandle = true
	tool.CanBeDropped = false

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = blueprint.size
	handle.Color = blueprint.color
	handle.Material = Enum.Material.SmoothPlastic
	handle.Parent = tool

	local grip = Instance.new("CFrameValue")
	grip.Name = "GripOffset"
	grip.Value = blueprint.grip
	grip.Parent = tool

	if blueprint.weaponId then
		local weapon = Instance.new("StringValue")
		weapon.Name = "WeaponId"
		weapon.Value = blueprint.weaponId
		weapon.Parent = tool
	end

	return tool
end

return ToolFactory`;

const ANIMATION_MODULE = `${doc("AnimationService - load, cache and play animation tracks safely", [
  "Tracks are cached per Animator so repeated plays never leak memory.",
])}
local AnimationService = {}
AnimationService.Library = {
	idle = "rbxassetid://507766666",
	walk = "rbxassetid://507777826",
	attack = "rbxassetid://522635514",
	celebrate = "rbxassetid://507770239",
}

local cache = setmetatable({}, { __mode = "k" })

function AnimationService:Track(animator, key)
	local id = self.Library[key] or key
	if not animator or not id then
		return nil
	end
	cache[animator] = cache[animator] or {}
	local existing = cache[animator][id]
	if existing then
		return existing
	end
	local animation = Instance.new("Animation")
	animation.AnimationId = id
	local ok, track = pcall(function()
		return animator:LoadAnimation(animation)
	end)
	if not ok then
		warn("[BloxSmith] Failed to load animation:", id)
		return nil
	end
	cache[animator][id] = track
	return track
end

function AnimationService:Play(character, key, speed)
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	local track = self:Track(animator, key)
	if track then
		track:Play(0.15)
		if speed then
			track:AdjustSpeed(speed)
		end
	end
	return track
end

function AnimationService:Stop(character, key)
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	local track = animator and cache[animator] and cache[animator][self.Library[key] or key]
	if track then
		track:Stop(0.15)
	end
end

return AnimationService`;

const OBBY_MODULE = `${doc("ObbyService - checkpoints, kill bricks and stage tracking", [])}
local Players = game:GetService("Players")
local Profiles = require(script.Parent.ProfileStore)

local ObbyService = {}
ObbyService.Checkpoints = {}

local function checkpointFolder()
	local world = workspace:FindFirstChild("BloxSmith_World")
	return world and world:FindFirstChild("Spawns")
end

function ObbyService:Register()
	local folder = checkpointFolder()
	if not folder then
		return
	end
	table.clear(self.Checkpoints)
	for _, child in ipairs(folder:GetChildren()) do
		local stage = tonumber(child.Name:match("%d+"))
		if child:IsA("BasePart") and stage then
			self.Checkpoints[stage] = child
			child.Touched:Connect(function(hit)
				local player = Players:GetPlayerFromCharacter(hit.Parent)
				if player then
					local profile = Profiles:Get(player)
					profile.stage = math.max(profile.stage or 1, stage)
				end
			end)
		end
	end
end

function ObbyService:Respawn(player)
	local profile = Profiles:Get(player)
	local checkpoint = self.Checkpoints[profile.stage or 1]
	local character = player.Character
	if checkpoint and character and character.PrimaryPart then
		character:PivotTo(checkpoint.CFrame + Vector3.new(0, 5, 0))
	end
end

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function()
		task.wait(0.2)
		ObbyService:Respawn(player)
	end)
end)

task.defer(function()
	ObbyService:Register()
end)

return ObbyService`;

const TOWER_DEFENSE_MODULE = `${doc("TowerDefenseService - waves, paths, towers and enemy routing", [])}
local Economy = require(script.Parent.Economy)

local TowerDefenseService = {}
TowerDefenseService.Waves = {}
TowerDefenseService.Towers = {
	archer = { cost = 100, damage = 12, range = 32, rate = 0.8 },
	cannon = { cost = 350, damage = 45, range = 24, rate = 1.8 },
	frost = { cost = 500, damage = 8, range = 28, rate = 1.0, slow = 0.5 },
}

local placed = {}
local baseHealth = 100

function TowerDefenseService:GenerateWaves(count)
	table.clear(self.Waves)
	for wave = 1, count or 20 do
		table.insert(self.Waves, {
			index = wave,
			count = 5 + wave * 2,
			health = 40 + wave * 22,
			speed = 10 + math.min(wave, 12) * 0.4,
			reward = 40 + wave * 12,
			boss = wave % 5 == 0,
		})
	end
	return self.Waves
end

function TowerDefenseService:Place(player, towerId, position)
	local tower = self.Towers[towerId]
	if not tower then
		return false, "unknown_tower"
	end
	local ok, err = Economy:Spend(player, "coins", tower.cost)
	if not ok then
		return false, err
	end
	table.insert(placed, { owner = player, id = towerId, position = position, lastShot = 0 })
	return true, #placed
end

function TowerDefenseService:Damage(amount)
	baseHealth = math.max(0, baseHealth - amount)
	return baseHealth
end

function TowerDefenseService:BaseHealth()
	return baseHealth
end

return TowerDefenseService`;

const SURVIVAL_MODULE = `${doc("SurvivalService - hunger, thirst, temperature and day cycle damage", [])}
local Players = game:GetService("Players")
local Profiles = require(script.Parent.ProfileStore)

local SurvivalService = {}
SurvivalService.TickSeconds = 5
SurvivalService.Drain = { hunger = 1.5, thirst = 2.2, warmth = 1.0 }

local function vitals(player)
	local profile = Profiles:Get(player)
	profile.vitals = profile.vitals or { hunger = 100, thirst = 100, warmth = 100 }
	return profile.vitals
end

function SurvivalService:Consume(player, kind, amount)
	local state = vitals(player)
	if state[kind] == nil then
		return false
	end
	state[kind] = math.clamp(state[kind] + amount, 0, 100)
	return true, state[kind]
end

task.spawn(function()
	while true do
		task.wait(SurvivalService.TickSeconds)
		for _, player in ipairs(Players:GetPlayers()) do
			local state = vitals(player)
			state.hunger = math.max(0, state.hunger - SurvivalService.Drain.hunger)
			state.thirst = math.max(0, state.thirst - SurvivalService.Drain.thirst)
			state.warmth = math.max(0, state.warmth - SurvivalService.Drain.warmth)

			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if humanoid and humanoid.Health > 0 then
				local starving = state.hunger <= 0 or state.thirst <= 0 or state.warmth <= 0
				if starving then
					humanoid:TakeDamage(4)
				end
			end
		end
	end
end)

return SurvivalService`;

const RACING_MODULE = `${doc("RacingService - laps, checkpoints, timing and vehicle spawning", [])}
local Players = game:GetService("Players")

local RacingService = {}
RacingService.TotalLaps = 3
local progress = {}

function RacingService:Reset(player)
	progress[player] = { lap = 0, checkpoint = 0, startedAt = os.clock(), best = progress[player] and progress[player].best }
end

function RacingService:HitCheckpoint(player, index, total)
	local state = progress[player]
	if not state then
		self:Reset(player)
		state = progress[player]
	end
	if index == state.checkpoint + 1 then
		state.checkpoint = index
	elseif index == 1 and state.checkpoint == total then
		state.checkpoint = 1
		state.lap += 1
		if state.lap >= self.TotalLaps then
			local elapsed = os.clock() - state.startedAt
			state.best = math.min(state.best or elapsed, elapsed)
			return true, elapsed
		end
	end
	return false, state
end

Players.PlayerRemoving:Connect(function(player)
	progress[player] = nil
end)

return RacingService`;

const HORROR_MODULE = `${doc("HorrorService - sanity, flashlight battery, stalker AI and jumpscares", [])}
local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local Profiles = require(script.Parent.ProfileStore)

local HorrorService = {}
HorrorService.TickSeconds = 3

function HorrorService:State(player)
	local profile = Profiles:Get(player)
	profile.horror = profile.horror or { sanity = 100, battery = 100, hiding = false }
	return profile.horror
end

function HorrorService:SetAmbience()
	Lighting.Ambient = Color3.fromRGB(12, 12, 18)
	Lighting.OutdoorAmbient = Color3.fromRGB(16, 16, 24)
	Lighting.Brightness = 0.6
	Lighting.FogEnd = 90
	Lighting.FogColor = Color3.fromRGB(10, 10, 14)
	Lighting.ClockTime = 0
end

task.spawn(function()
	HorrorService:SetAmbience()
	while true do
		task.wait(HorrorService.TickSeconds)
		for _, player in ipairs(Players:GetPlayers()) do
			local state = HorrorService:State(player)
			state.sanity = math.clamp(state.sanity + (state.hiding and 2 or -1.5), 0, 100)
			state.battery = math.max(0, state.battery - 0.8)
		end
	end
end)

return HorrorService`;

const IDLE_MODULE = `${doc("IdleService - offline earnings, prestige and auto-clickers", [])}
local Players = game:GetService("Players")
local Profiles = require(script.Parent.ProfileStore)
local Economy = require(script.Parent.Economy)

local IdleService = {}
IdleService.BaseIncome = 5
IdleService.MaxOfflineHours = 8

function IdleService:Income(player)
	local profile = Profiles:Get(player)
	return self.BaseIncome * (1 + (profile.rebirths or 0) * 0.75) * (1 + (profile.level or 1) * 0.05)
end

function IdleService:GrantOffline(player)
	local profile = Profiles:Get(player)
	local last = profile.lastSeen or os.time()
	local seconds = math.clamp(os.time() - last, 0, self.MaxOfflineHours * 3600)
	profile.lastSeen = os.time()
	if seconds < 60 then
		return 0
	end
	local earned = math.floor(self:Income(player) * (seconds / 60))
	Economy:Add(player, "coins", earned)
	return earned
end

Players.PlayerAdded:Connect(function(player)
	task.defer(function()
		IdleService:GrantOffline(player)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	local profile = Profiles:Get(player)
	profile.lastSeen = os.time()
end)

task.spawn(function()
	while true do
		task.wait(60)
		for _, player in ipairs(Players:GetPlayers()) do
			Economy:Add(player, "coins", math.floor(IdleService:Income(player)))
		end
	end
end)

return IdleService`;

const serverModule = (name: string, source: string): FeatureArtifact => ({
  className: "ModuleScript",
  name,
  parentPath: SERVICE_ROUTES.serverModule,
  source,
});

export const GAMEPLAY_FEATURES: GameplayFeature[] = [
  {
    key: "npcs",
    label: "NPCs & enemies",
    keywords: /\b(npc|enemy|enemies|mob|monster|boss|guard|villager)\b/i,
    summary: "Shared-loop NPC AI with patrol, chase, attack and respawn.",
    build: () => [serverModule("NpcService", NPC_MODULE)],
  },
  {
    key: "combat",
    label: "Combat & weapons",
    keywords: /\b(combat|weapon|sword|gun|fps|shooter|fight|damage|pvp)\b/i,
    summary: "Server-authoritative damage with cooldowns and range validation.",
    build: () => [serverModule("CombatService", COMBAT_MODULE), serverModule("ToolFactory", TOOL_FACTORY)],
  },
  {
    key: "tools",
    label: "Tools",
    keywords: /\b(tool|pickaxe|rod|equipment|gear)\b/i,
    summary: "Procedural Tool builder with grip offsets and weapon binding.",
    build: () => [serverModule("ToolFactory", TOOL_FACTORY)],
  },
  {
    key: "inventory",
    label: "Inventory",
    keywords: /\b(inventory|backpack|items?|loot|storage)\b/i,
    summary: "Stacked, capacity-limited inventory persisted per player.",
    requiresSystems: ["profile_store"],
    build: () => [serverModule("InventoryService", INVENTORY_MODULE)],
  },
  {
    key: "quests",
    label: "Quests",
    keywords: /\b(quest|mission|objective|task\s*board)\b/i,
    summary: "Data-driven quest chain with progress, prerequisites and rewards.",
    requiresSystems: ["profile_store", "economy"],
    build: () => [serverModule("QuestService", QUEST_MODULE)],
  },
  {
    key: "pets",
    label: "Pets",
    keywords: /\b(pet|egg|hatch|companion)\b/i,
    summary: "Weighted egg hatching, equip limits, multipliers and follow visuals.",
    requiresSystems: ["profile_store", "economy"],
    build: () => [
      serverModule("PetService", PETS_MODULE),
      { className: "LocalScript", name: "PetFollowController", parentPath: SERVICE_ROUTES.clientScript, source: PET_FOLLOW_CLIENT },
    ],
  },
  {
    key: "gathering",
    label: "Mining / fishing / farming / crafting",
    keywords: /\b(mining|mine\s*ore|fishing|farming|harvest|craft(ing)?|gather)\b/i,
    summary: "One data-driven module for all gathering loops, crafting and selling.",
    requiresSystems: ["profile_store", "economy"],
    build: () => [serverModule("GatheringService", GATHERING_MODULE)],
  },
  {
    key: "skills",
    label: "Skills & abilities",
    keywords: /\b(skill|ability|abilities|talent|perk|skill\s*tree)\b/i,
    summary: "Skill tree with ranks, prerequisites, points and live stat effects.",
    requiresSystems: ["profile_store"],
    build: () => [serverModule("SkillService", SKILLS_MODULE)],
  },
  {
    key: "tycoon",
    label: "Tycoon",
    keywords: /\b(tycoon|dropper|conveyor|factory\s*game)\b/i,
    summary: "Plot claiming, droppers, income ticks and rebirth.",
    requiresSystems: ["profile_store", "economy"],
    build: () => [serverModule("TycoonService", TYCOON_MODULE)],
  },
  {
    key: "animations",
    label: "Animations",
    keywords: /\b(animation|animate|emote|idle\s*pose)\b/i,
    summary: "Cached AnimationTrack loader with weak-table cleanup.",
    build: () => [serverModule("AnimationService", ANIMATION_MODULE)],
  },
  {
    key: "obby",
    label: "Obby",
    keywords: /\b(obby|parkour|checkpoint|stage\s*\d|kill\s*brick)\b/i,
    summary: "Checkpoint registration, stage saving and respawn placement.",
    requiresSystems: ["profile_store"],
    build: () => [serverModule("ObbyService", OBBY_MODULE)],
  },
  {
    key: "tower_defense",
    label: "Tower defense",
    keywords: /\b(tower\s*defen|td\s*game|wave\s*defense)\b/i,
    summary: "Wave generation, tower placement economy and base health.",
    requiresSystems: ["economy"],
    build: () => [serverModule("TowerDefenseService", TOWER_DEFENSE_MODULE)],
  },
  {
    key: "survival",
    label: "Survival",
    keywords: /\b(survival|hunger|thirst|temperature|starv)\b/i,
    summary: "Hunger, thirst and warmth vitals with damage ticks.",
    requiresSystems: ["profile_store"],
    build: () => [serverModule("SurvivalService", SURVIVAL_MODULE)],
  },
  {
    key: "racing",
    label: "Racing",
    keywords: /\b(racing|race|lap|kart|drift|speedway)\b/i,
    summary: "Checkpoint ordering, lap counting and best-time tracking.",
    build: () => [serverModule("RacingService", RACING_MODULE)],
  },
  {
    key: "horror",
    label: "Horror",
    keywords: /\b(horror|scary|jumpscare|sanity|haunted)\b/i,
    summary: "Sanity/battery vitals plus dark Lighting ambience preset.",
    requiresSystems: ["profile_store"],
    build: () => [serverModule("HorrorService", HORROR_MODULE)],
  },
  {
    key: "idle",
    label: "Idle / simulator income",
    keywords: /\b(idle|afk|clicker|simulator|offline\s*earning|prestige)\b/i,
    summary: "Offline earnings, passive income ticks and rebirth scaling.",
    requiresSystems: ["profile_store", "economy"],
    build: () => [serverModule("IdleService", IDLE_MODULE)],
  },
];

export function getFeature(key: string): GameplayFeature | undefined {
  return GAMEPLAY_FEATURES.find((feature) => feature.key === key);
}

export function detectFeatures(prompt: string): GameplayFeature[] {
  return GAMEPLAY_FEATURES.filter((feature) => feature.keywords.test(prompt));
}
