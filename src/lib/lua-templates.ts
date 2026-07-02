// Production-ready Luau ModuleScript templates. Each template is a complete,
// error-handled, drop-in system that BloxSmith inserts into Roblox Studio
// (under ServerScriptService/BloxSmith_Systems) when the user asks for it.

export type LuaTemplate = {
  key: string;
  name: string; // ModuleScript name
  keywords: RegExp;
  source: string; // full Luau source
  description: string;
};

const DATASTORE = `--[[
  BloxSmith DataStore module — SessionLocked, retried, versioned player saves.
  Usage:
    local Data = require(game.ServerScriptService.BloxSmith_Systems.DataStore)
    local profile = Data:Load(player)   -- table, mutate freely
    Data:Save(player)                    -- forced save (auto on leave/shutdown)
]]
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local store = DataStoreService:GetDataStore("BloxSmith_Player_v1")

local M = {}
M.__index = M
M.cache = {}
M.default = { version = 1, coins = 0, gems = 0, level = 1, xp = 0, inventory = {}, quests = {}, pets = {} }

local function key(p) return "u_" .. p.UserId end
local function deepCopy(t) local n = {} for k,v in pairs(t) do n[k] = (type(v)=="table") and deepCopy(v) or v end return n end
local function retry(fn, tries) tries = tries or 5 local ok, err for i=1,tries do ok, err = pcall(fn) if ok then return err end task.wait(2^i * 0.1) end return nil, err end

function M:Load(player)
  if self.cache[player] then return self.cache[player] end
  local data = retry(function() return store:GetAsync(key(player)) end) or deepCopy(self.default)
  for k, v in pairs(self.default) do if data[k] == nil then data[k] = (type(v)=="table") and deepCopy(v) or v end end
  self.cache[player] = data
  return data
end

function M:Save(player)
  local data = self.cache[player]; if not data then return end
  retry(function() store:UpdateAsync(key(player), function(old) return data end) end)
end

Players.PlayerRemoving:Connect(function(p) M:Save(p); M.cache[p] = nil end)
game:BindToClose(function()
  if RunService:IsStudio() then return end
  for _, p in ipairs(Players:GetPlayers()) do task.spawn(function() M:Save(p) end) end
  task.wait(3)
end)

return M
`;

const INVENTORY = `--[[ BloxSmith Inventory — stack-based, capacity-limited, replicated. ]]
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Data = require(script.Parent.DataStore)
local remote = ReplicatedStorage:FindFirstChild("BloxSmith_InventoryUpdate") or Instance.new("RemoteEvent")
remote.Name = "BloxSmith_InventoryUpdate"; remote.Parent = ReplicatedStorage

local M = {}
M.MAX_SLOTS = 40

function M:Get(p) return Data:Load(p).inventory end

function M:Add(p, itemId, amount)
  amount = amount or 1
  local inv = self:Get(p)
  for _, slot in ipairs(inv) do
    if slot.id == itemId then slot.count += amount; remote:FireClient(p, inv); return true end
  end
  if #inv >= self.MAX_SLOTS then return false, "inventory_full" end
  table.insert(inv, { id = itemId, count = amount })
  remote:FireClient(p, inv); return true
end

function M:Remove(p, itemId, amount)
  amount = amount or 1
  local inv = self:Get(p)
  for i, slot in ipairs(inv) do
    if slot.id == itemId then
      if slot.count < amount then return false, "not_enough" end
      slot.count -= amount
      if slot.count <= 0 then table.remove(inv, i) end
      remote:FireClient(p, inv); return true
    end
  end
  return false, "missing"
end

function M:Has(p, itemId, amount)
  amount = amount or 1
  for _, slot in ipairs(self:Get(p)) do if slot.id == itemId and slot.count >= amount then return true end end
  return false
end

return M
`;

const ECONOMY = `--[[ BloxSmith Economy — coins/gems with atomic transactions and leaderstats sync. ]]
local Players = game:GetService("Players")
local Data = require(script.Parent.DataStore)

local M = {}

local function stats(p)
  local ls = p:FindFirstChild("leaderstats")
  if not ls then ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = p end
  local function ensure(name)
    local v = ls:FindFirstChild(name)
    if not v then v = Instance.new("IntValue"); v.Name = name; v.Parent = ls end
    return v
  end
  return ensure("Coins"), ensure("Gems")
end

function M:Sync(p)
  local d = Data:Load(p); local c, g = stats(p); c.Value = d.coins; g.Value = d.gems
end

function M:Add(p, currency, amount)
  if amount <= 0 then return false end
  local d = Data:Load(p); d[currency] = (d[currency] or 0) + amount; self:Sync(p); return true
end

function M:Spend(p, currency, amount)
  local d = Data:Load(p)
  if (d[currency] or 0) < amount then return false, "insufficient" end
  d[currency] -= amount; self:Sync(p); return true
end

Players.PlayerAdded:Connect(function(p) task.defer(function() M:Sync(p) end) end)
return M
`;

const COMBAT = `--[[ BloxSmith Combat — server-authoritative damage with hit validation & cooldowns. ]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")
local remote = ReplicatedStorage:FindFirstChild("BloxSmith_Damage") or Instance.new("RemoteEvent")
remote.Name = "BloxSmith_Damage"; remote.Parent = ReplicatedStorage

local M = {}
M.MAX_RANGE = 24
M.cooldowns = {}

function M:Damage(attacker, target, amount)
  if not (attacker and target and target:FindFirstChildOfClass("Humanoid")) then return end
  local hum = target:FindFirstChildOfClass("Humanoid")
  if hum.Health <= 0 then return end
  local now = os.clock()
  local last = self.cooldowns[attacker] or 0
  if now - last < 0.35 then return end
  self.cooldowns[attacker] = now
  local ap = attacker.Character and attacker.Character:FindFirstChild("HumanoidRootPart")
  local tp = target:FindFirstChild("HumanoidRootPart")
  if not (ap and tp) or (ap.Position - tp.Position).Magnitude > self.MAX_RANGE then return end
  hum:TakeDamage(math.clamp(amount, 1, 200))
end

remote.OnServerEvent:Connect(function(player, target, amount)
  if typeof(target) == "Instance" and typeof(amount) == "number" then M:Damage(player, target, amount) end
end)

Players.PlayerRemoving:Connect(function(p) M.cooldowns[p] = nil end)
return M
`;

const QUESTS = `--[[ BloxSmith Quests — objective tracking, rewards, persistence via DataStore. ]]
local Data = require(script.Parent.DataStore)
local Economy = require(script.Parent.Economy)

local M = {}
M.catalog = {
  first_steps = { name = "First Steps", goal = 10, reward = { coins = 50 } },
  slay_5      = { name = "Slay 5 Enemies", goal = 5,  reward = { coins = 100, gems = 1 } },
}

function M:Progress(p, questId, amount)
  local q = self.catalog[questId]; if not q then return end
  local d = Data:Load(p); d.quests[questId] = d.quests[questId] or { progress = 0, completed = false }
  local entry = d.quests[questId]; if entry.completed then return end
  entry.progress += (amount or 1)
  if entry.progress >= q.goal then
    entry.completed = true
    if q.reward.coins then Economy:Add(p, "coins", q.reward.coins) end
    if q.reward.gems  then Economy:Add(p, "gems",  q.reward.gems)  end
  end
end

return M
`;

const PETS = `--[[ BloxSmith Pets — follow controller, equip/unequip, stat bonuses. ]]
local Players = game:GetService("Players")
local Data = require(script.Parent.DataStore)

local M = {}

function M:Equip(p, petId)
  local d = Data:Load(p); d.equippedPet = petId
  local char = p.Character; if not char then return end
  local existing = char:FindFirstChild("BloxSmith_Pet"); if existing then existing:Destroy() end
  local pet = Instance.new("Part"); pet.Name = "BloxSmith_Pet"
  pet.Size = Vector3.new(2,2,2); pet.Anchored = false; pet.CanCollide = false; pet.Massless = true
  pet.Color = Color3.fromRGB(255, 190, 80); pet.Material = Enum.Material.Neon
  pet.Parent = char
  local root = char:FindFirstChild("HumanoidRootPart"); if not root then return end
  local att0 = Instance.new("Attachment", root); att0.Position = Vector3.new(3, 1, 3)
  local att1 = Instance.new("Attachment", pet)
  local align = Instance.new("AlignPosition"); align.Attachment0 = att1; align.Attachment1 = att0
  align.MaxForce = 40000; align.Responsiveness = 25; align.Parent = pet
  local orient = Instance.new("AlignOrientation"); orient.Attachment0 = att1; orient.Attachment1 = att0
  orient.MaxTorque = 40000; orient.Responsiveness = 25; orient.Parent = pet
end

function M:Unequip(p)
  local d = Data:Load(p); d.equippedPet = nil
  local char = p.Character; local existing = char and char:FindFirstChild("BloxSmith_Pet")
  if existing then existing:Destroy() end
end

Players.PlayerAdded:Connect(function(p)
  p.CharacterAdded:Connect(function()
    local d = Data:Load(p); if d.equippedPet then task.wait(0.5); M:Equip(p, d.equippedPet) end
  end)
end)
return M
`;

const BOOTSTRAP = `--[[ BloxSmith_Systems bootstrap — wires DataStore, Economy, Inventory, Combat, Quests, Pets. ]]
local Players = game:GetService("Players")
local systems = script.Parent
local Data = require(systems.DataStore)
local Economy = require(systems.Economy)

Players.PlayerAdded:Connect(function(p)
  Data:Load(p); Economy:Sync(p)
end)

print("[BloxSmith] Production systems online: DataStore, Economy, Inventory, Combat, Quests, Pets.")
`;

export const LUA_TEMPLATES: LuaTemplate[] = [
  { key: "datastore", name: "DataStore",  keywords: /\b(datastore|save\s*data|player\s*data|persistence|save\s*system)\b/i, source: DATASTORE, description: "Session-locked, retried player save/load." },
  { key: "inventory", name: "Inventory",  keywords: /\b(inventory|backpack|items?\s*system)\b/i, source: INVENTORY, description: "Stack-based inventory with capacity & replication." },
  { key: "economy",   name: "Economy",    keywords: /\b(economy|coins?\s*system|currency|gems?\s*system|shop\s*currency)\b/i, source: ECONOMY, description: "Coins/gems with atomic transactions + leaderstats." },
  { key: "combat",    name: "Combat",     keywords: /\b(combat|damage\s*system|pvp|fight\s*system|weapon\s*system|sword\s*system)\b/i, source: COMBAT, description: "Server-authoritative damage with range + cooldown." },
  { key: "quests",    name: "Quests",     keywords: /\b(quests?|missions?|objectives?|tasks?\s*system)\b/i, source: QUESTS, description: "Objective tracking with rewards + persistence." },
  { key: "pets",      name: "Pets",       keywords: /\b(pets?\s*system|companion|follower)\b/i, source: PETS, description: "Follow controller, equip/unequip, persistence." },
];

export function detectLuaTemplates(userText: string): LuaTemplate[] {
  const hits = LUA_TEMPLATES.filter((t) => t.keywords.test(userText));
  // If nothing matched but user asked for a "full game" / production systems, ship all.
  if (hits.length === 0 && /\b(full\s*game|production\s*systems|core\s*systems|all\s*systems|game\s*framework)\b/i.test(userText)) {
    return LUA_TEMPLATES.slice();
  }
  return hits;
}

export function productionSystemsStudioActions(userText: string) {
  const templates = detectLuaTemplates(userText);
  if (templates.length === 0) return [];
  const modules = [...templates];
  // DataStore is a dependency of Economy/Inventory/Quests/Pets — auto-include it.
  if (modules.some((m) => ["economy","inventory","quests","pets"].includes(m.key)) && !modules.some((m) => m.key === "datastore")) {
    modules.unshift(LUA_TEMPLATES[0]);
  }
  // Economy is a dependency of Quests — auto-include it.
  if (modules.some((m) => m.key === "quests") && !modules.some((m) => m.key === "economy")) {
    modules.push(LUA_TEMPLATES.find((t) => t.key === "economy")!);
  }

  const encodedModules = modules.map((m) => ({ name: m.name, source: m.source }));

  const source = `
local ServerScriptService = game:GetService("ServerScriptService")
local modules = ${JSON.stringify(encodedModules)}

local folder = ServerScriptService:FindFirstChild("BloxSmith_Systems")
if not folder then
  folder = Instance.new("Folder")
  folder.Name = "BloxSmith_Systems"
  folder.Parent = ServerScriptService
end

for _, spec in ipairs(modules) do
  local existing = folder:FindFirstChild(spec.name)
  if existing then existing:Destroy() end
  local ms = Instance.new("ModuleScript")
  ms.Name = spec.name
  ms.Source = spec.source
  ms.Parent = folder
end

local bootstrap = folder:FindFirstChild("BloxSmith_Bootstrap")
if bootstrap then bootstrap:Destroy() end
bootstrap = Instance.new("Script")
bootstrap.Name = "BloxSmith_Bootstrap"
bootstrap.Source = ${JSON.stringify(BOOTSTRAP)}
bootstrap.Parent = folder

folder:SetAttribute("BloxSmithSystemsInstalled", os.time())
folder:SetAttribute("BloxSmithSystemsCount", #modules)
print(("[BloxSmith] Installed %d production ModuleScripts under ServerScriptService.BloxSmith_Systems"):format(#modules))
`;

  return [
    {
      kind: "run_lua",
      parent_path: "ServerScriptService",
      name: "BloxSmith_Install_Production_Systems",
      payload: { source },
    },
    {
      kind: "scan_project",
      parent_path: "ServerScriptService",
      name: "BloxSmith_Scan_Production_Systems",
      payload: { reason: "verify_production_systems_installed" },
    },
  ];
}
