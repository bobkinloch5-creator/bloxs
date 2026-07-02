// Curated knowledge base seed. Small, focused, high-signal.
// Each chunk is scoped to a single agent so retrieval stays on-topic.
// `source_hash` is the idempotency key — re-running the seeder is safe.

export type KbSeedChunk = {
  topic: "scripter" | "world_builder" | "ui_designer";
  title: string;
  content: string;
  source: string;
  source_hash: string;
};

export const KB_CORPUS: KbSeedChunk[] = [
  // ── Scripter: Roblox API references ─────────────────────────────────
  {
    topic: "scripter",
    title: "Players.PlayerAdded / PlayerRemoving",
    source: "roblox-api:Players",
    source_hash: "api/players-events/v1",
    content:
      "game:GetService('Players').PlayerAdded:Connect(function(player) ... end). " +
      "PlayerRemoving fires before the player leaves — use it to flush DataStore writes. " +
      "player.CharacterAdded:Connect(function(character) ... end) fires every spawn including respawns. " +
      "Never assume player.Character exists immediately; use player.CharacterAdded:Wait() or check nil.",
  },
  {
    topic: "scripter",
    title: "RemoteEvent / RemoteFunction wiring",
    source: "roblox-api:RemoteEvent",
    source_hash: "api/remotes/v1",
    content:
      "Create RemoteEvents under ReplicatedStorage. Server: remote.OnServerEvent:Connect(function(player, ...) end). " +
      "Client (LocalScript): remote:FireServer(...). RemoteFunctions use OnServerInvoke and :InvokeServer(). " +
      "ALWAYS validate the player argument server-side — never trust client input. Sanity-check types and ranges.",
  },
  {
    topic: "scripter",
    title: "leaderstats pattern",
    source: "luau-example:leaderstats",
    source_hash: "example/leaderstats/v1",
    content:
      "Server script in ServerScriptService:\n" +
      "local Players = game:GetService('Players')\n" +
      "Players.PlayerAdded:Connect(function(player)\n" +
      "  local stats = Instance.new('Folder')\n" +
      "  stats.Name = 'leaderstats'; stats.Parent = player\n" +
      "  local coins = Instance.new('IntValue')\n" +
      "  coins.Name = 'Coins'; coins.Value = 0; coins.Parent = stats\n" +
      "end)\n" +
      "Folder MUST be named exactly 'leaderstats' for the in-game leaderboard.",
  },
  {
    topic: "scripter",
    title: "DataStoreService save/load with pcall",
    source: "roblox-api:DataStoreService",
    source_hash: "api/datastore/v1",
    content:
      "local DSS = game:GetService('DataStoreService'); local store = DSS:GetDataStore('PlayerData_v1').\n" +
      "Always wrap in pcall — DataStore calls can fail/throttle:\n" +
      "local ok, data = pcall(function() return store:GetAsync(player.UserId) end)\n" +
      "On PlayerRemoving, pcall(store.SetAsync, store, player.UserId, payload). " +
      "Use BindToClose to flush remaining writes before server shutdown.",
  },
  {
    topic: "scripter",
    title: "Humanoid + Tool combat basics",
    source: "roblox-api:Humanoid",
    source_hash: "api/humanoid/v1",
    content:
      "tool.Activated:Connect(function() ... end) fires when player clicks while holding a Tool. " +
      "Damage: humanoid:TakeDamage(amount) (respects ForceField). humanoid.Died:Connect(...) for kill events. " +
      "Track combat server-side only. Use Touched + debounce table keyed by attacker for melee hit detection.",
  },
  {
    topic: "scripter",
    title: "TweenService for smooth motion",
    source: "roblox-api:TweenService",
    source_hash: "api/tweenservice/v1",
    content:
      "local TS = game:GetService('TweenService')\n" +
      "local info = TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)\n" +
      "TS:Create(instance, info, {Position = Vector3.new(0,10,0)}):Play()\n" +
      "Works on any Instance property that's tweenable (Position, CFrame, Transparency, Color3, UDim2, etc).",
  },
  {
    topic: "scripter",
    title: "RunService heartbeat vs stepped",
    source: "roblox-api:RunService",
    source_hash: "api/runservice/v1",
    content:
      "RunService.Heartbeat fires after physics each frame (dt arg). Best for general per-frame logic. " +
      "RenderStepped fires before render — LOCAL only, use for camera. " +
      "Stepped fires before physics. Prefer Heartbeat unless you need camera sync.",
  },
  {
    topic: "scripter",
    title: "Common Luau pitfalls",
    source: "luau-style:pitfalls",
    source_hash: "style/luau-pitfalls/v1",
    content:
      "Methods use COLON not dot: instance:Destroy(), workspace:WaitForChild('X'). " +
      "There is no :GetChild — use :FindFirstChild(name) or :WaitForChild(name). " +
      "workspace.Player is WRONG — players live in game.Players, characters in workspace by name. " +
      "Use task.wait() not wait() (deprecated). task.spawn() for fire-and-forget threads.",
  },

  // ── World Builder ───────────────────────────────────────────────────
  {
    topic: "world_builder",
    title: "Terrain via Terrain:FillBlock",
    source: "roblox-api:Terrain",
    source_hash: "api/terrain/v1",
    content:
      "workspace.Terrain:FillBlock(CFrame.new(0,-5,0), Vector3.new(512,10,512), Enum.Material.Grass). " +
      "For water: Enum.Material.Water. Use FillRegion for axis-aligned, FillBall for hills. " +
      "Always Anchor=true on environment Parts to avoid physics drift.",
  },
  {
    topic: "world_builder",
    title: "Lighting / atmosphere setup",
    source: "roblox-api:Lighting",
    source_hash: "api/lighting/v1",
    content:
      "game.Lighting.ClockTime = 14; game.Lighting.Brightness = 2. " +
      "Add Atmosphere instance for haze: Atmosphere.Density=0.3, Decay=Color3.new(0.5,0.6,0.8). " +
      "Add Sky instance for skybox. PostFX: Bloom, SunRays, ColorCorrection under Lighting for stylized looks.",
  },
  {
    topic: "world_builder",
    title: "SpawnLocation rules",
    source: "roblox-api:SpawnLocation",
    source_hash: "api/spawn/v1",
    content:
      "SpawnLocation must be Anchored=true and have CanCollide=true. " +
      "Set TeamColor for team-based spawns. Multiple SpawnLocations: players pick one randomly. " +
      "NEVER add a duplicate spawn if one already exists in workspace — check the scene digest first.",
  },
  {
    topic: "world_builder",
    title: "InsertService for Toolbox assets",
    source: "roblox-api:InsertService",
    source_hash: "api/insertservice/v1",
    content:
      "local IS = game:GetService('InsertService'); local model = IS:LoadAsset(assetId).\n" +
      "Returns a Model containing the asset. Always pcall + Parent the returned children to workspace, " +
      "then :Destroy() the wrapper model. Asset id must be the Marketplace product id of a Model/Mesh.",
  },

  // ── UI Designer ─────────────────────────────────────────────────────
  {
    topic: "ui_designer",
    title: "ScreenGui + Frame skeleton",
    source: "roblox-api:ScreenGui",
    source_hash: "api/screengui/v1",
    content:
      "ScreenGui goes under StarterGui (replicates to each player's PlayerGui on join). " +
      "ResetOnSpawn=false to persist across deaths. IgnoreGuiInset=true for full-screen overlays. " +
      "Frame.AnchorPoint + Position with UDim2.fromScale gives resolution-independent layout.",
  },
  {
    topic: "ui_designer",
    title: "Mobile-safe button sizing",
    source: "ui-style:mobile",
    source_hash: "style/ui-mobile/v1",
    content:
      "Buttons should be at least UDim2.fromOffset(120, 44) — 44px is Apple/Roblox touch min. " +
      "Text >= 14pt. Add UICorner (CornerRadius=UDim.new(0,8)) + UIStroke for modern look. " +
      "Wrap groups in UIPadding (16px) and UIListLayout for clean stacks. UIAspectRatioConstraint for square buttons.",
  },
  {
    topic: "ui_designer",
    title: "Wire button to RemoteEvent",
    source: "luau-example:button-remote",
    source_hash: "example/button-remote/v1",
    content:
      "LocalScript inside the button:\n" +
      "local remote = game:GetService('ReplicatedStorage'):WaitForChild('BuyItem')\n" +
      "script.Parent.Activated:Connect(function() remote:FireServer('sword') end)\n" +
      "Use Activated (works on touch + click) — NOT MouseButton1Click which is desktop-only.",
  },
  {
    topic: "ui_designer",
    title: "TweenService for UI animation",
    source: "ui-style:tweens",
    source_hash: "style/ui-tweens/v1",
    content:
      "Tween UDim2 Size/Position for slide-ins, BackgroundTransparency for fades. " +
      "Hover example: button.MouseEnter:Connect(function() TS:Create(button, TweenInfo.new(0.15), {Size = UDim2.fromOffset(132, 48)}):Play() end). " +
      "Always provide a MouseLeave inverse tween so the button returns to rest.",
  },
];
