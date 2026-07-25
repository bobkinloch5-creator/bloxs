// Roblox / Luau scripting knowledge base for the BloxSmith AI.
// ---------------------------------------------------------------------------
// This is the "how to actually script" brain. It is deliberately written as
// compact, high-signal reference text so it can be injected into the model
// prompt: correct API signatures, the patterns senior Roblox devs use, working
// recipes, and the mistakes that break real games.
//
// Usage:
//   selectScriptingKnowledge(userPrompt)  -> the relevant lessons
//   renderScriptingBlock(lessons)         -> prompt-ready text
//   SCRIPTING_CORE_RULES                  -> always injected

export type LessonTopic =
  | "fundamentals"
  | "lifecycle"
  | "remotes"
  | "data"
  | "character"
  | "combat"
  | "tools"
  | "ui"
  | "npc"
  | "physics"
  | "animation"
  | "monetization"
  | "performance"
  | "security"
  | "debugging"
  | "architecture";

export type ScriptingLesson = {
  id: string;
  topic: LessonTopic;
  title: string;
  /** Words/phrases in the user's request that make this lesson relevant. */
  keywords: RegExp;
  /** The teaching text: rules, signatures and idioms. */
  body: string;
  /** Optional worked example the model can adapt (never paste verbatim). */
  example?: string;
};

/** Rules that apply to every single script BloxSmith writes. */
export const SCRIPTING_CORE_RULES = `LUAU CODE STANDARDS (non-negotiable)
- Get services once at the top: local Players = game:GetService("Players"). Never use game.Players or workspace.Foo chains.
- Script placement: Script = server (ServerScriptService), LocalScript = client (StarterPlayerScripts / StarterGui / a Tool), ModuleScript = shared logic (ReplicatedStorage) or server-only logic (ServerScriptService / ServerStorage).
- A ModuleScript returns one table. Requiring it twice returns the SAME table per environment (server and client each get their own copy). Never rely on a ModuleScript to share state across the client/server boundary.
- Modern scheduler only: task.wait(t), task.spawn(fn), task.delay(t, fn), task.defer(fn). NEVER wait(), spawn(), delay(), :connect(), :remove(), :Destroy() on a Player, Instance.new("Part", parent).
- Yield safely: use task.wait() inside every loop. A while true do without a yield freezes the whole script scheduler.
- WaitForChild on the client for anything replicated: local remote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Buy"). On the server, children you created already exist, so FindFirstChild/direct indexing is fine.
- Set properties BEFORE setting Parent so the instance replicates once, fully formed.
- Every :Connect returns an RBXScriptConnection. Keep it and :Disconnect() when the owner dies, or the closure and everything it captures leaks.
- Types and locals: local everything, annotate module APIs (function M.give(player: Player, amount: number): boolean), and add --!strict at the top of new ModuleScripts when the logic is non-trivial.
- Comment WHY, not WHAT. "-- server is authoritative over currency" beats "-- add coins".
- pcall around anything that can throw: DataStore calls, MarketplaceService calls, HttpService, require of user code.
- Never invent APIs. If unsure of a signature, property, or enum, look it up in the Roblox docs before writing the code.`;

const LESSONS: ScriptingLesson[] = [
  {
    id: "luau-fundamentals",
    topic: "fundamentals",
    title: "Luau language essentials",
    keywords: /\b(luau|lua|script|syntax|variable|table|loop|function|metatable|type|typed|oop|class)\b/i,
    body: `Luau is Lua 5.1 plus gradual typing and Roblox extras.
- Tables are the only data structure: arrays (t[1]) and dictionaries (t.key) in one. #t is only valid for arrays with no holes.
- Iterate arrays with ipairs (ordered) and dictionaries with pairs (unordered). In modern Luau, for i, v in t do works for both.
- Strings: "a" .. "b" concatenates, string.format("%d coins", n), #s for length, s:sub(1, 3), s:lower(), string.split(s, ",").
- Multiple returns and varargs: local ok, err = pcall(fn); function f(...) local args = { ... } end.
- Nil safety: if inst and inst.Parent then. Roblox instances become nil-parented when destroyed, not nil themselves.
- OOP pattern: a ModuleScript table with .new() plus a metatable index.
- Type checking: --!strict at the top, type Config = { speed: number }, local x: number = 0. Use it in modules other code depends on.
- Math helpers used constantly: math.clamp, math.random, math.floor, math.huge, math.rad, Vector3, CFrame, UDim2, Color3.fromRGB, Random.new().
- Numeric formatting for UI: string.format("%.1f", n) and a comma/suffix formatter for big currency values.`,
    example: `--!strict
local Wallet = {}
Wallet.__index = Wallet

export type Wallet = typeof(setmetatable({} :: { coins: number }, Wallet))

function Wallet.new(starting: number): Wallet
	return setmetatable({ coins = starting }, Wallet) :: Wallet
end

function Wallet:add(amount: number): number
	-- clamp so a bad caller can never push the balance negative
	self.coins = math.max(0, self.coins + amount)
	return self.coins
end

return Wallet`,
  },
  {
    id: "player-lifecycle",
    topic: "lifecycle",
    title: "Player and character lifecycle",
    keywords: /\b(player(added|removing)?|join|leave|respawn|spawn|character|leaderstats|team|session)\b/i,
    body: `The lifecycle is the backbone of every server script.
- Players.PlayerAdded:Connect(function(player) ... end) - and always handle players who joined before the script ran: for _, player in Players:GetPlayers() do onPlayerAdded(player) end.
- player.CharacterAdded:Connect(function(character) ... end) fires on every spawn AND respawn. player.Character may be nil at join time; use player.CharacterAdded:Wait() or player.Character or player.CharacterAdded:Wait().
- Humanoid: local humanoid = character:WaitForChild("Humanoid"); humanoid.Died:Connect(...). Read humanoid.Health, set humanoid.WalkSpeed / JumpPower (or UseJumpPower false + JumpHeight).
- Players.PlayerRemoving:Connect - your last chance to save. Also bind game:BindToClose(fn) so a shutting-down server flushes data (you get ~30 seconds).
- leaderstats: a Folder named exactly "leaderstats" inside the Player, containing IntValue/StringValue children. The name shows as the column header.
- Teams: Teams service + Team instances with TeamColor; player.Team = team, or player.Neutral.
- CharacterAppearanceLoaded for anything that needs the avatar's real look; CharacterRemoving to clean up per-character connections.`,
    example: `local Players = game:GetService("Players")

local function setupLeaderstats(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = stats

	stats.Parent = player
end

local function onPlayerAdded(player: Player)
	setupLeaderstats(player)

	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid")
		humanoid.Died:Connect(function()
			-- respawn handling lives here, not in a polling loop
			task.wait(Players.RespawnTime)
		end)
	end)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end`,
  },
  {
    id: "remotes",
    topic: "remotes",
    title: "Client/server communication",
    keywords: /\b(remote(event|function)?|fireserver|fireclient|invokeserver|bindable|replicat|client|server|network)\b/i,
    body: `The client/server boundary is where most Roblox bugs and exploits live.
- RemoteEvent: one-way. Client remote:FireServer(...) -> server remote.OnServerEvent:Connect(function(player, ...) end). Server remote:FireClient(player, ...) / :FireAllClients(...) -> client remote.OnClientEvent:Connect(function(...) end). The player argument on OnServerEvent is inserted by the engine and cannot be spoofed.
- RemoteFunction: request/response. Server sets remote.OnServerInvoke = function(player, ...) return value end; client calls remote:InvokeServer(...). Prefer RemoteEvents: an unanswered InvokeServer blocks the caller, and a client-invoked RemoteFunction lets a malicious client hang the server thread.
- BindableEvent/BindableFunction are same-side only (server-to-server or client-to-client). Never use them to cross the boundary.
- Store remotes in ReplicatedStorage under a folder, created by the server at boot; the client uses WaitForChild.
- Validate on the server, every time: check the type of every argument, check ranges, check ownership (does this player actually own that item?), check distance (is the target within reach?), and rate limit (last fire time per player).
- Never send a decision from the client: the client sends INTENT ("I want to buy item 3"), the server decides.
- Batch instead of spamming: aggregate updates and send them 10-20 times per second at most. Unreliable-style high-frequency data should use UnreliableRemoteEvent.`,
    example: `-- ServerScriptService: purchase handler with validation and rate limiting
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage.Remotes.BuyItem
local Shop = require(script.Parent.Shop)

local lastRequest: { [Player]: number } = {}

remote.OnServerEvent:Connect(function(player, itemId)
	-- 1. type check every argument that came from the client
	if type(itemId) ~= "string" then
		return
	end

	-- 2. rate limit: 4 purchases per second is generous for a real player
	local now = os.clock()
	if now - (lastRequest[player] or 0) < 0.25 then
		return
	end
	lastRequest[player] = now

	-- 3. the server owns the decision
	Shop.tryPurchase(player, itemId)
end)

game:GetService("Players").PlayerRemoving:Connect(function(player)
	lastRequest[player] = nil
end)`,
  },
  {
    id: "datastores",
    topic: "data",
    title: "Saving data safely",
    keywords: /\b(save|saving|data ?store|datastore|profile ?service|persist|load|inventory save|auto ?save|session|leaderboard)\b/i,
    body: `Data loss is the number one way a Roblox game dies. Rules:
- local store = DataStoreService:GetDataStore("PlayerData_v1"). Version the name so you can migrate later.
- Wrap EVERY call in pcall; DataStore calls are network calls and throw on failure. Retry with backoff (3 attempts, task.wait(2 ^ attempt)).
- Use UpdateAsync (read-modify-write) for anything that can be changed concurrently; GetAsync/SetAsync is only safe when this server is the only writer.
- Session locking: store a jobId + timestamp with the data; refuse to load if another live session holds the lock, so two servers cannot both write and clobber each other. This is the core of what ProfileService gives you.
- Save on PlayerRemoving AND on a periodic auto-save (every 60-120 seconds, staggered per player) AND in game:BindToClose.
- Throttling: about 60 + 10 * playerCount requests per minute per server. Never save on every currency change; mark the profile dirty and let the auto-save loop write it.
- Keep the schema small and versioned: { version = 3, coins = 0, inventory = {}, settings = {} }. Add a migration function that upgrades old payloads on load.
- OrderedDataStore powers global leaderboards; write only aggregate values and read pages with :GetSortedAsync(false, 10).
- Never trust a load that failed: if the load errored, put the player in a read-only state and do not overwrite their save with defaults.`,
    example: `local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData_v1")

local DEFAULTS = { version = 1, coins = 0, inventory = {} }

local function retry<T>(attempts: number, fn: () -> T): (boolean, T?)
	for attempt = 1, attempts do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		task.wait(2 ^ attempt)
	end
	return false, nil
end

local function loadProfile(userId: number)
	local ok, data = retry(3, function()
		return store:GetAsync("user_" .. userId)
	end)

	if not ok then
		-- load failed: return nil so callers refuse to save over real data
		return nil
	end

	return data or table.clone(DEFAULTS)
end

local function saveProfile(userId: number, profile: { [string]: any })
	retry(3, function()
		return store:UpdateAsync("user_" .. userId, function(old)
			-- last write wins only for this player's own key
			return profile
		end)
	end)
end

return { load = loadProfile, save = saveProfile }`,
  },
  {
    id: "combat",
    topic: "combat",
    title: "Combat, damage and hit detection",
    keywords: /\b(combat|damage|sword|gun|weapon|fps|shoot|bullet|hitbox|raycast|melee|enemy|boss|pvp|health)\b/i,
    body: `Server-authoritative combat, client-visual feedback.
- Damage only on the server: humanoid:TakeDamage(n) respects ForceField; humanoid.Health -= n does not.
- Melee: server-side cooldown per player, then a hitbox check. Prefer workspace:GetPartBoundsInBox(cframe, size, overlapParams) over .Touched, which misses fast swings and fires many times.
- Guns: the client raycasts for instant feedback and sends the origin + direction (not the damage, not the victim). The server re-raycasts from the character, validates the distance and the fire rate, then applies damage.
- Raycasting: local params = RaycastParams.new(); params.FilterType = Enum.RaycastFilterType.Exclude; params.FilterDescendantsInstances = { character }; local result = workspace:Raycast(origin, direction * range, params). result gives .Instance, .Position, .Normal, .Material.
- Find the victim with result.Instance:FindFirstAncestorOfClass("Model") then :FindFirstChildOfClass("Humanoid").
- Track ownership for kill credit with a "creator" ObjectValue tag on the humanoid, and clear it after a few seconds.
- Enemy AI damage should use a single shared loop over all enemies, not one loop per enemy.
- Visuals (muzzle flash, tracer beams, hit sparks, screen shake) belong on the client, triggered by a FireClient/FireAllClients event or by tagging.
- Balance numbers in one shared config ModuleScript so tuning does not mean editing code.`,
    example: `-- ServerScriptService: validated hitscan shot
local RANGE = 300
local DAMAGE = 24
local FIRE_DELAY = 0.12
local lastShot: { [Player]: number } = {}

local function onShot(player: Player, origin: Vector3, direction: Vector3)
	if typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" then return end

	local now = os.clock()
	if now - (lastShot[player] or 0) < FIRE_DELAY then return end
	lastShot[player] = now

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then return end

	-- reject shots that did not come from near the player's own character
	if (origin - root.Position).Magnitude > 12 then return end

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }

	local result = workspace:Raycast(origin, direction.Unit * RANGE, params)
	if not result then return end

	local model = result.Instance:FindFirstAncestorOfClass("Model")
	local humanoid = model and model:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 then
		humanoid:TakeDamage(DAMAGE)
	end
end

return onShot`,
  },
  {
    id: "tools",
    topic: "tools",
    title: "Tools, equipping and inventory",
    keywords: /\b(tool|equip|unequip|backpack|starterpack|hotbar|inventory|item|pickaxe|rod|weapon give)\b/i,
    body: `Tools are the built-in equippable item.
- A Tool needs a Handle BasePart (unless RequiresHandle = false) and lives in StarterPack (everyone spawns with it) or player.Backpack (given at runtime).
- Client-side script inside the Tool: tool.Activated (mouse/tap), tool.Equipped, tool.Unequipped, tool.Deactivated. tool.Parent is the character while equipped, the Backpack while stowed.
- Give a tool: template:Clone().Parent = player.Backpack. Keep templates in ServerStorage so exploiters cannot read them.
- Re-give on respawn: CharacterAdded clears the Backpack, so re-clone from the saved inventory.
- Inventory data lives on the server: a table of { id, count, uuid } per player, mirrored to the client through a remote for UI only. Never let the client add items.
- Stack rules, max slots, and item metadata belong in a shared ItemDefinitions ModuleScript so client UI and server logic agree.
- For drag-and-drop UI, the client sends "move slot 3 to slot 7" and the server validates both indexes before swapping.`,
    example: `-- Inside a Tool: LocalScript
local tool = script.Parent
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local swing = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Swing")

local cooling = false

tool.Activated:Connect(function()
	if cooling then return end
	cooling = true

	-- client asks, server decides and deals damage
	swing:FireServer()
	task.wait(0.45)
	cooling = false
end)`,
  },
  {
    id: "ui-scripting",
    topic: "ui",
    title: "UI scripting that works on phones",
    keywords: /\b(ui|gui|screengui|frame|button|hud|menu|shop ui|inventory ui|tween|mobile|responsive|gamepad|textlabel|uilistlayout)\b/i,
    body: `Build UI in code from a client controller, and make it responsive from the start.
- Hierarchy: ScreenGui (ResetOnSpawn = false, IgnoreGuiInset = true) -> Frames -> TextLabel / TextButton / ImageLabel. Parent the ScreenGui to PlayerGui from a LocalScript.
- Scale, do not pixel-hunt: size with UDim2.fromScale, add a UIAspectRatioConstraint for cards, and drive one UIScale from camera.ViewportSize so phones, tablets and TVs all look right.
- Layout instances beat manual math: UIListLayout, UIGridLayout, UIPadding, UICorner, UIStroke, UIGradient.
- Touch: minimum 88 x 44 pixels for anything tappable (UISizeConstraint MinSize), keep controls out of the bottom-center thumbstick area, and respect GuiService:GetGuiInset().
- Gamepad: GuiService.SelectedObject plus Selectable/NextSelectionUp-Down-Left-Right, and ContextActionService:BindAction for buttons so keyboard, touch and controller share one code path.
- Animation: TweenService:Create(object, TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position = ... }):Play(). Cancel a tween before starting a competing one.
- Never trust UI state: the button sends intent, the server confirms, and the UI redraws from server-pushed data.
- Performance: reuse frames in a pool instead of Destroy/Instance.new per refresh, and avoid changing many UI properties per frame.`,
    example: `local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local screen = Instance.new("ScreenGui")
screen.Name = "ShopUI"
screen.ResetOnSpawn = false
screen.IgnoreGuiInset = true

-- one UIScale keeps the whole screen readable on every device
local scale = Instance.new("UIScale")
scale.Parent = screen

local function fitToViewport()
	local size = camera.ViewportSize
	scale.Scale = math.clamp(math.min(size.X / 1280, size.Y / 720), 0.65, 1.35)
end

camera:GetPropertyChangedSignal("ViewportSize"):Connect(fitToViewport)
fitToViewport()

local panel = Instance.new("Frame")
panel.Size = UDim2.fromScale(0.42, 0.55)
panel.Position = UDim2.fromScale(0.5, 1.4)
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.BackgroundColor3 = Color3.fromRGB(20, 20, 34)
panel.Parent = screen

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 14)
corner.Parent = panel

screen.Parent = player:WaitForChild("PlayerGui")

-- slide in
TweenService:Create(panel, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
	Position = UDim2.fromScale(0.5, 0.5),
}):Play()`,
  },
  {
    id: "ui-buttons-and-controls",
    topic: "ui",
    title: "Custom Interactive Buttons & Controls",
    keywords: /\b(button|buttons|custom button|hover effect|ui button|click effect|textbutton|imagebutton|uicorner|uistroke|uigradient)\b/i,
    body: `Create modern, responsive, animated Roblox UI buttons:
- Structure: TextButton / ImageButton inside ScreenGui with UICorner (CornerRadius 8-12px), UIStroke (Border mode, subtle outline), UIGradient (vertical depth).
- Font & Text: Font.GothamBold, TextScaled = true, TextColor3 = Color3.fromRGB(245,248,255), TextStrokeTransparency = 0.7.
- Micro-Animations: Use TweenService on MouseEnter (UIScale to 1.05, UIStroke.Transparency to 0.1), MouseLeave (UIScale to 1.0), MouseButton1Down (UIScale to 0.95), and MouseButton1Up (UIScale back to 1.05).
- Audio & Remote Wiring: Play click Sound on MouseButton1Click and fire server RemoteEvent for actions (buy item, spawn vehicle, use ability).`,
    example: `local TweenService = game:GetService("TweenService")
local btn = Instance.new("TextButton")
btn.Size = UDim2.new(0, 200, 0, 50)
btn.Position = UDim2.fromScale(0.5, 0.5)
btn.AnchorPoint = Vector2.new(0.5, 0.5)
btn.BackgroundColor3 = Color3.fromRGB(45, 95, 235)
btn.Font = Enum.Font.GothamBold
btn.Text = "PLAY GAME"
btn.TextColor3 = Color3.fromRGB(255, 255, 255)
btn.TextSize = 20

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 10)
corner.Parent = btn

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(120, 160, 255)
stroke.Thickness = 2
stroke.Parent = btn

local scale = Instance.new("UIScale")
scale.Parent = btn

local tweenInfo = TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

btn.MouseEnter:Connect(function()
    TweenService:Create(scale, tweenInfo, { Scale = 1.06 }):Play()
end)
btn.MouseLeave:Connect(function()
    TweenService:Create(scale, tweenInfo, { Scale = 1.0 }):Play()
end)
btn.MouseButton1Down:Connect(function()
    TweenService:Create(scale, tweenInfo, { Scale = 0.94 }):Play()
end)
btn.MouseButton1Up:Connect(function()
    TweenService:Create(scale, tweenInfo, { Scale = 1.06 }):Play()
end)`,
  },
  {
    id: "ui-loading-screens",
    topic: "ui",
    title: "Animated Loading Screens & Splash Screens",
    keywords: /\b(loading screen|loading bar|splash screen|intro screen|preload|replicatedfirst|progress bar)\b/i,
    body: `Build high-end, animated Roblox loading screens:
- Parent: Place LocalScript inside ReplicatedFirst.
- Disable Default: game:GetService("ReplicatedFirst"):RemoveDefaultLoadingScreen().
- Visuals: ScreenGui with IgnoreGuiInset = true, dark background Frame, title text, animated progress bar (Frame inside Frame with ClipsDescendants = true or Size tweening), percentage text, and status text ("Preloading game assets...").
- Preload: ContentProvider:PreloadAsync({ workspace, game:GetService("ReplicatedStorage") }).
- Smooth Exit: BlurEffect in Lighting fades out while ScreenGui BackgroundTransparency and GroupTransparency tween to 1, then ScreenGui:Destroy().`,
    example: `local ReplicatedFirst = game:GetService("ReplicatedFirst")
local ContentProvider = game:GetService("ContentProvider")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

ReplicatedFirst:RemoveDefaultLoadingScreen()

local player = Players.LocalPlayer
local pgui = player:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "CustomLoadingScreen"
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.Parent = pgui

local bg = Instance.new("Frame")
bg.Size = UDim2.fromScale(1, 1)
bg.BackgroundColor3 = Color3.fromRGB(15, 18, 28)
bg.Parent = gui

local title = Instance.new("TextLabel")
title.Size = UDim2.new(0, 400, 0, 60)
title.Position = UDim2.fromScale(0.5, 0.4)
title.AnchorPoint = Vector2.new(0.5, 0.5)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBold
title.Text = "LOADING EXPERIENCE..."
title.TextColor3 = Color3.fromRGB(240, 245, 255)
title.TextSize = 28
title.Parent = bg

local track = Instance.new("Frame")
track.Size = UDim2.new(0, 360, 0, 12)
track.Position = UDim2.fromScale(0.5, 0.55)
track.AnchorPoint = Vector2.new(0.5, 0.5)
track.BackgroundColor3 = Color3.fromRGB(30, 36, 52)
track.Parent = bg
local trackCorner = Instance.new("UICorner")
trackCorner.CornerRadius = UDim.new(0, 6)
trackCorner.Parent = track

local bar = Instance.new("Frame")
bar.Size = UDim2.fromScale(0, 1)
bar.BackgroundColor3 = Color3.fromRGB(60, 140, 255)
bar.Parent = track
local barCorner = Instance.new("UICorner")
barCorner.CornerRadius = UDim.new(0, 6)
barCorner.Parent = bar

-- Animate progress bar fill
TweenService:Create(bar, TweenInfo.new(2.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    Size = UDim2.fromScale(1, 1)
}):Play()
task.wait(2.6)

-- Fade out
TweenService:Create(bg, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    BackgroundTransparency = 1
}):Play()
task.wait(0.5)
gui:Destroy()`,
  },
  {
    id: "ui-main-menus",
    topic: "ui",
    title: "Main Menus with Play, Shop, Settings & Camera Angles",
    keywords: /\b(main menu|title screen|play button|start menu|menu gui|shop button|settings menu|camera blur)\b/i,
    body: `Create cinematic Main Menus in Roblox:
- Structure: ScreenGui in StarterGui (ResetOnSpawn = false, IgnoreGuiInset = true).
- Camera: Set workspace.CurrentCamera.CameraType = Enum.CameraType.Scriptable, tween CFrame to a scenic view or menu camera part.
- Blur: Add BlurEffect (Size = 24) to Lighting while in menu.
- Buttons: Container Frame with Play, Shop, Settings, Credits buttons.
- Play Action: Clicking Play tweens camera back to player character, sets CameraType = Enum.CameraType.Custom, fades BlurEffect to 0, tweens Main Menu frame out of screen, and enables gameplay HUD.`,
    example: `local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local blur = Instance.new("BlurEffect")
blur.Size = 18
blur.Parent = Lighting

local screen = Instance.new("ScreenGui")
screen.Name = "MainMenu"
screen.ResetOnSpawn = false
screen.IgnoreGuiInset = true
screen.Parent = player:WaitForChild("PlayerGui")

local mainFrame = Instance.new("Frame")
mainFrame.Size = UDim2.new(0, 320, 0, 420)
mainFrame.Position = UDim2.fromScale(0.12, 0.5)
mainFrame.AnchorPoint = Vector2.new(0, 0.5)
mainFrame.BackgroundColor3 = Color3.fromRGB(22, 26, 38)
mainFrame.BackgroundTransparency = 0.1
mainFrame.Parent = screen

local playBtn = Instance.new("TextButton")
playBtn.Size = UDim2.new(0, 260, 0, 52)
playBtn.Position = UDim2.fromScale(0.5, 0.4)
playBtn.AnchorPoint = Vector2.new(0.5, 0.5)
playBtn.BackgroundColor3 = Color3.fromRGB(40, 180, 110)
playBtn.Font = Enum.Font.GothamBold
playBtn.Text = "PLAY"
playBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
playBtn.TextSize = 22
playBtn.Parent = mainFrame

playBtn.MouseButton1Click:Connect(function()
    TweenService:Create(blur, TweenInfo.new(0.6), { Size = 0 }):Play()
    TweenService:Create(mainFrame, TweenInfo.new(0.5), { Position = UDim2.fromScale(-0.4, 0.5) }):Play()
    task.wait(0.6)
    blur:Destroy()
    camera.CameraType = Enum.CameraType.Custom
end)`,
  },
  {
    id: "npc-ai",
    topic: "npc",
    title: "NPCs, pathfinding and spawning",
    keywords: /\b(npc|zombie|mob|enemy ai|pathfind|patrol|chase|shopkeeper|dialogue|wander|follow|pet)\b/i,
    body: `NPCs are Models with a Humanoid (or a moved BasePart for cheap crowds).
- Movement: humanoid:MoveTo(position) then humanoid.MoveToFinished:Wait(), or PathfindingService for anything with obstacles: local path = PathfindingService:CreatePath({ AgentRadius = 2, AgentHeight = 5, AgentCanJump = true }); path:ComputeAsync(from, to); if path.Status == Enum.PathStatus.Success then for _, waypoint in path:GetWaypoints() do ... end.
- Recompute paths on path.Blocked and on a slow timer (every 0.5-1s), never every frame.
- Target selection: loop players, compare (root.Position - npcRoot.Position).Magnitude, respect a max aggro range and line of sight via a raycast.
- One shared update loop for all NPCs with a step accumulator; 5-10 updates per second is plenty for AI decisions.
- Cheap crowds: set humanoid states off (humanoid:SetStateEnabled(Enum.HumanoidStateType.Climbing, false)), turn off collisions between NPCs with a CollisionGroup, and Anchor idle NPCs.
- Pets: do NOT use a Humanoid. Use a single anchored/massless part per pet and lerp its CFrame toward an offset behind the owner on the client for smoothness; the server owns ownership and stats only.
- Dialogue: ProximityPrompt (ActionText, HoldDuration, MaxActivationDistance) plus a server handler; or the built-in Dialog instance for quick shops.
- Spawning: keep templates in ServerStorage, clone per spawn, cap the live count, and Destroy plus clear the table entry on death so nothing leaks.`,
    example: `local PathfindingService = game:GetService("PathfindingService")

local function chase(npc: Model, target: BasePart)
	local humanoid = npc:FindFirstChildOfClass("Humanoid")
	local root = npc:FindFirstChild("HumanoidRootPart")
	if not (humanoid and root) then return end

	local path = PathfindingService:CreatePath({
		AgentRadius = 2,
		AgentHeight = 5,
		AgentCanJump = true,
	})

	local ok = pcall(function()
		path:ComputeAsync(root.Position, target.Position)
	end)

	if not ok or path.Status ~= Enum.PathStatus.Success then
		-- fall back to a straight line rather than standing still
		humanoid:MoveTo(target.Position)
		return
	end

	for _, waypoint in path:GetWaypoints() do
		if waypoint.Action == Enum.PathWaypointAction.Jump then
			humanoid.Jump = true
		end
		humanoid:MoveTo(waypoint.Position)
		humanoid.MoveToFinished:Wait()
	end
end

return chase`,
  },
  {
    id: "physics-movement",
    topic: "physics",
    title: "Parts, CFrames, constraints and movement",
    keywords: /\b(part|cframe|vector3|weld|constraint|hinge|physics|anchor|touched|collision|platform|door|conveyor|vehicle|teleport)\b/i,
    body: `Positioning and physics idioms.
- CFrame is position + rotation: CFrame.new(pos) * CFrame.Angles(0, math.rad(90), 0); CFrame.lookAt(from, to) aims one part at another. Moving a Model uses model:PivotTo(cframe), not setting Position on one part.
- Group parts: WeldConstraint between two parts (both must exist and be positioned first), or set a PrimaryPart and use PivotTo. For jointed mechanisms use HingeConstraint, PrismaticConstraint, RopeConstraint, SpringConstraint with Attachments on both parts.
- Moving platforms and doors: TweenService on an Anchored part is smooth and cheap; use AlignPosition/AlignOrientation for physics-driven movement.
- Conveyors: set the part's AssemblyLinearVelocity, or use a Touched handler that applies a LinearVelocity constraint.
- Detection: .Touched is noisy (fires repeatedly, misses fast movers). For zones use ZonePlus-style overlap queries: workspace:GetPartsInPart(zonePart, overlapParams) on a slow loop. For triggers use ProximityPrompt or ClickDetector.
- CollisionGroups (PhysicsService:RegisterCollisionGroup / part.CollisionGroup) stop NPCs, projectiles and players from shoving each other.
- Teleporting a character: character:PivotTo(CFrame) or set HumanoidRootPart.CFrame; add a small Y offset so the character does not clip into the floor.
- Anchor everything decorative. Unanchored parts cost physics every frame; that is the top source of server lag in building-heavy games.
- Streaming-safe code: with StreamingEnabled the client may not have a part yet. Use WaitForChild and workspace.PersistentLoaded / model:AddPersistentPlayer for critical instances.`,
    example: `-- Smooth, cheap moving platform (no physics simulation)
local TweenService = game:GetService("TweenService")

local platform = script.Parent
platform.Anchored = true

local startCFrame = platform.CFrame
local endCFrame = startCFrame + Vector3.new(0, 24, 0)
local info = TweenInfo.new(3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)

TweenService:Create(platform, info, { CFrame = endCFrame }):Play()`,
  },
  {
    id: "animation",
    topic: "animation",
    title: "Animations and sound",
    keywords: /\b(animation|animate|animator|animationtrack|idle|walk|attack anim|emote|sound|audio|music|sfx)\b/i,
    body: `Animations must be loaded through an Animator, and the asset must be owned by the game's creator.
- Load: local animator = humanoid:WaitForChild("Animator"); local track = animator:LoadAnimation(animation) where animation is an Animation instance with AnimationId = "rbxassetid://123".
- Play/stop: track:Play(fadeTime, weight, speed), track:Stop(fadeTime), track:AdjustSpeed(n), track.Priority = Enum.AnimationPriority.Action (Action beats Movement beats Idle beats Core).
- One-shots: track.Stopped:Wait() or track.Length for timing. Use track:GetMarkerReachedSignal("hit") to sync damage frames with the animation.
- Replace default animations by editing the character's "Animate" LocalScript values, or set the Humanoid's HumanoidDescription animation ids.
- Never call LoadAnimation every time you play; load once per character and cache the tracks in a table keyed by name.
- Sound: parent a Sound to a BasePart for 3D audio (RollOffMaxDistance, RollOffMode), or to SoundService for 2D music. SoundService:PlayLocalSound for client-only feedback. Use SoundGroups for a master/music/sfx volume that the settings menu can drive.
- Never let a Sound with PlayOnRemove leak: clone a template, play it, and Destroy after sound.Ended or a debris timer.`,
    example: `local function makeAnimator(character: Model)
	local humanoid = character:WaitForChild("Humanoid")
	local animator = humanoid:WaitForChild("Animator")
	local cache: { [string]: AnimationTrack } = {}

	local function load(name: string, id: string)
		local animation = Instance.new("Animation")
		animation.AnimationId = id
		local track = animator:LoadAnimation(animation)
		track.Priority = Enum.AnimationPriority.Action
		cache[name] = track
	end

	load("swing", "rbxassetid://0") -- replace with a real owned animation id

	return {
		play = function(name: string)
			local track = cache[name]
			if track then
				track:Play(0.1)
			end
		end,
	}
end

return makeAnimator`,
  },
  {
    id: "monetization",
    topic: "monetization",
    title: "Gamepasses, Developer Products and Robux",
    keywords: /\b(gamepass|game pass|developer ?product|robux|purchase|marketplace|monetiz|premium|shop robux|receipt)\b/i,
    body: `MarketplaceService drives all real-money flows.
- Gamepass (permanent): MarketplaceService:UserOwnsGamePassAsync(userId, passId) - wrap in pcall and cache the result per session; refresh on MarketplaceService.PromptGamePassPurchaseFinished.
- Developer Product (repeatable): prompt with MarketplaceService:PromptProductPurchase(player, productId), then implement MarketplaceService.ProcessReceipt = function(receiptInfo) ... end. This is the ONLY place to grant the reward.
- ProcessReceipt must be idempotent: store receiptInfo.PurchaseId in a DataStore for that player, and return Enum.ProductPurchaseDecision.PurchaseGranted only after the grant is safely saved. Return NotProcessedYet on any failure so Roblox retries. Exactly one script may assign ProcessReceipt.
- Premium: player.MembershipType == Enum.MembershipType.Premium, plus MarketplaceService:PromptPremiumPurchase for upsells and Players.PlayerMembershipChanged.
- Prices, ids and reward definitions belong in one shared config module so UI and server agree and nothing is hardcoded twice.
- Never grant from the client, never grant on PromptPurchaseFinished (it lies about success), and never grant twice for a retried receipt.`,
    example: `local MarketplaceService = game:GetService("MarketplaceService")
local Profiles = require(script.Parent.Profiles)

local PRODUCTS: { [number]: (Player) -> boolean } = {
	[123456] = function(player)
		return Profiles.addCoins(player, 1000)
	end,
}

MarketplaceService.ProcessReceipt = function(receiptInfo)
	local player = game:GetService("Players"):GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then
		-- let Roblox retry when the player comes back
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local grant = PRODUCTS[receiptInfo.ProductId]
	if not grant then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- idempotency: refuse to grant the same PurchaseId twice
	if Profiles.hasReceipt(player, receiptInfo.PurchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local ok = grant(player)
	if not ok then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	Profiles.recordReceipt(player, receiptInfo.PurchaseId)
	return Enum.ProductPurchaseDecision.PurchaseGranted
end`,
  },
  {
    id: "performance",
    topic: "performance",
    title: "Performance, memory and mobile",
    keywords: /\b(lag|fps|performance|optimi[sz]|memory|leak|slow|stutter|mobile|frame rate|ping|network)\b/i,
    body: `How to make a Roblox game actually run well.
- One loop, not many: a single RunService.Heartbeat with an accumulator (if elapsed < 0.1 then return end) instead of dozens of per-frame connections.
- Never walk the instance tree in a loop: cache GetChildren/GetDescendants results, or tag with CollectionService and use :GetTagged / :GetInstanceAddedSignal.
- Memory leaks come from: connections that are never disconnected, per-player tables never cleared on PlayerRemoving, instances kept in tables after Destroy, and closures capturing whole characters. Use a Maid/Trove table: add every connection and instance, then :Clean() in one place.
- Physics: anchor everything static, cap unanchored part counts, use CollisionGroups, prefer tweens over constraint stacks for scripted motion.
- Rendering: MeshParts over unions, low-poly assets, cap ParticleEmitter Rate, keep Lighting.Technology sensible, turn on StreamingEnabled with a tuned StreamingTargetRadius for big maps.
- Network: never fire a remote every frame; batch and throttle to 10-20 Hz; send indexes and ids instead of tables of instances; avoid FireAllClients for effects only nearby players can see; use UnreliableRemoteEvent for positional streams.
- Mobile: keep part counts and draw calls low, avoid heavy blur/DOF, use fewer particles, and keep UI text 14+ with 88x44 touch targets. Test with the Studio device emulator.
- Measure, do not guess: Studio MicroProfiler (Ctrl+F6), the Script Performance and Memory tabs in the dev console (F9), and workspace:GetRealPhysicsFPS().`,
    example: `-- One shared update loop with a fixed tick rate and full cleanup
local RunService = game:GetService("RunService")

local TICK = 0.1
local accumulator = 0
local agents: { [Model]: true } = {}
local connections: { RBXScriptConnection } = {}

local function track(connection: RBXScriptConnection)
	table.insert(connections, connection)
	return connection
end

track(RunService.Heartbeat:Connect(function(delta)
	accumulator += delta
	if accumulator < TICK then
		return
	end
	accumulator = 0

	for agent in agents do
		if not agent.Parent then
			-- stop leaking destroyed models
			agents[agent] = nil
		else
			-- update AI here, 10 times per second
		end
	end
end))

local function cleanup()
	for _, connection in connections do
		connection:Disconnect()
	end
	table.clear(connections)
	table.clear(agents)
end

return { agents = agents, cleanup = cleanup }`,
  },
  {
    id: "security",
    topic: "security",
    title: "Exploit-proofing",
    keywords: /\b(exploit|hacker|cheat|secur|anti|bypass|inject|remote spy|dupe|kick|sanity)\b/i,
    body: `Assume the client is fully controlled by an attacker.
- The client can: read and edit any LocalScript, any ReplicatedStorage/ReplicatedFirst content, fire any remote with any arguments, teleport their own character, and change their local walkspeed. The client cannot: run code on the server, read ServerStorage/ServerScriptService, or fake the player argument on OnServerEvent.
- Therefore: all currency, inventory, damage, quest progress and shop logic live on the server; keep item templates and secret data in ServerStorage; and never put a "secret" in a LocalScript or a shared module.
- Validate everything a remote receives: type, range, ownership, cooldown, distance, and state (is the player even allowed to do this right now?).
- Anti-teleport/speed: compare position deltas per second on the server against a sane maximum before crediting movement-based rewards; do not instantly kick, since lag causes false positives.
- Rate limit every remote per player. An unlimited remote is a free server crash.
- Never trust client-reported results ("I killed the boss", "I finished the obby"). Verify server-side state instead.
- HttpService keys never belong on the client, and no gameplay decision should depend on an external call that can fail.`,
  },
  {
    id: "debugging",
    topic: "debugging",
    title: "Debugging and fixing errors",
    keywords: /\b(error|bug|broken|not working|nil|attempt to index|debug|warn|traceback|output|fix)\b/i,
    body: `Read the error, then fix the cause.
- "attempt to index nil with X": the parent path did not exist yet. On the client use WaitForChild; on the server create it before use; guard with if instance then.
- "attempt to call a nil value": wrong method name or you called a table field that is not a function. Check capitalisation and the class in the docs.
- "Unable to cast value to Object" / "bad argument #1": wrong type passed; check Vector3 vs CFrame vs number.
- "Infinite yield possible on WaitForChild": the name never appeared - typo, wrong parent, or the instance only exists on the server.
- "Requested module experienced an error while loading": the ModuleScript itself threw; look at the SECOND line of the traceback.
- Tools: print and warn with a prefix, the F9 dev console (client and server tabs), breakpoints and the Watch window in Studio, task.spawn to isolate a yield, and pcall to capture an error message without killing the thread.
- Reproduce in a local server test (Test tab: 2 players) before blaming replication; many bugs only appear with a real client/server split.
- Add defensive logging around DataStore and MarketplaceService calls; those fail in production far more than in Studio.`,
  },
  {
    id: "architecture",
    topic: "architecture",
    title: "Project architecture",
    keywords: /\b(architect|structure|organ[is]z|module|framework|folder|service|pattern|scalab|maintain|bootstrap)\b/i,
    body: `How a professional Roblox codebase is laid out.
- ServerScriptService: one Bootstrap Script that requires each server ModuleScript once, in dependency order, inside pcall so one broken system cannot kill the boot.
- Server systems as ModuleScripts with an :init() and a clear public API. No cross-requiring cycles: shared helpers go down into ReplicatedStorage, never sideways.
- ReplicatedStorage: Remotes folder, shared Config/ItemDefinitions modules, Assets, Animations. Anything the client legitimately needs.
- ServerStorage: templates, tools, NPC models, anything the client must not see.
- StarterPlayerScripts: one client Bootstrap LocalScript that starts controllers (UI, camera, input, effects).
- StarterGui: only what must exist before the client script runs; prefer building UI in code.
- One config module per system, no magic numbers in logic.
- Events over polling: expose signals from your modules rather than having other systems loop over state.
- Naming: PascalCase for instances and modules, camelCase for locals and functions, SCREAMING_SNAKE for constants.
- Keep files under ~400 lines; split by responsibility, and put the reason for anything surprising in a comment.`,
    example: `-- ServerScriptService/Bootstrap (Script)
local SYSTEMS = {
	"ProfileStore",
	"Economy",
	"Monetization",
	"Inventory",
	"Quests",
}

local container = script.Parent:WaitForChild("Systems")

for _, name in SYSTEMS do
	local moduleScript = container:FindFirstChild(name)
	if not moduleScript then
		warn("[BloxSmith] missing system: " .. name)
		continue
	end

	local ok, err = pcall(function()
		local system = require(moduleScript)
		if type(system) == "table" and type(system.init) == "function" then
			system.init()
		end
	end)

	if not ok then
		-- one bad system must never stop the rest of the game from booting
		warn("[BloxSmith] " .. name .. " failed: " .. tostring(err))
	end
end`,
  },
];

export const SCRIPTING_LESSONS = LESSONS;

export function getLesson(id: string): ScriptingLesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

export function lessonsForTopic(topic: LessonTopic): ScriptingLesson[] {
  return LESSONS.filter((lesson) => lesson.topic === topic);
}

/** Lessons that are relevant no matter what the user asked for. */
const ALWAYS: string[] = ["luau-fundamentals", "player-lifecycle", "remotes", "architecture"];

/**
 * Pick the lessons worth injecting for a given request.
 * Always includes the fundamentals, then adds keyword matches by relevance.
 */
export function selectScriptingKnowledge(prompt: string, limit = 8): ScriptingLesson[] {
  const text = String(prompt ?? "");
  const scored = LESSONS.map((lesson) => {
    const matches = text.match(new RegExp(lesson.keywords.source, "gi"));
    const base = ALWAYS.includes(lesson.id) ? 2 : 0;
    return { lesson, score: base + (matches ? matches.length : 0) };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: ScriptingLesson[] = [];
  for (const entry of scored) {
    if (picked.length >= limit) break;
    picked.push(entry.lesson);
  }

  // Guarantee the fundamentals even if nothing matched.
  for (const id of ALWAYS) {
    if (picked.length >= limit) break;
    const lesson = getLesson(id);
    if (lesson && !picked.includes(lesson)) picked.push(lesson);
  }

  return picked;
}

/** Render lessons as prompt text. Examples are included by default. */
export function renderScriptingBlock(
  lessons: ScriptingLesson[],
  options: { includeExamples?: boolean } = {},
): string {
  const includeExamples = options.includeExamples !== false;
  if (lessons.length === 0) return "";

  const sections = lessons.map((lesson) => {
    const example =
      includeExamples && lesson.example
        ? `\nReference implementation (adapt it, never paste it verbatim):\n\`\`\`lua\n${lesson.example}\n\`\`\``
        : "";
    return `## ${lesson.title}\n${lesson.body}${example}`;
  });

  return [
    "# ROBLOX SCRIPTING KNOWLEDGE (authoritative - follow this over habit)",
    SCRIPTING_CORE_RULES,
    ...sections,
  ].join("\n\n");
}

/**
 * Convenience: everything the model needs for one request, size-capped so it
 * never blows the context window.
 */
export function scriptingKnowledgeFor(
  prompt: string,
  options: { limit?: number; maxChars?: number; includeExamples?: boolean } = {},
): string {
  const lessons = selectScriptingKnowledge(prompt, options.limit ?? 6);
  let block = renderScriptingBlock(lessons, { includeExamples: options.includeExamples });
  const maxChars = options.maxChars ?? 14000;

  if (block.length > maxChars) {
    // Drop examples first, then trim lessons from the tail.
    block = renderScriptingBlock(lessons, { includeExamples: false });
    let trimmed = [...lessons];
    while (block.length > maxChars && trimmed.length > 1) {
      trimmed = trimmed.slice(0, -1);
      block = renderScriptingBlock(trimmed, { includeExamples: false });
    }
  }

  return block;
}

/** Compact index the AI can use to say what it knows. */
export const SCRIPTING_TOPIC_INDEX = LESSONS.map((lesson) => ({
  id: lesson.id,
  topic: lesson.topic,
  title: lesson.title,
}));
