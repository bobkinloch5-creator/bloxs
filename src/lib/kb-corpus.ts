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

  // ── Scripter: Game systems (tycoon, obby, simulator, etc.) ─────────
  {
    topic: "scripter",
    title: "Tycoon system architecture",
    source: "system:tycoon",
    source_hash: "system/tycoon/v1",
    content:
      "Tycoon = plot claim + droppers + collector + purchase buttons + save. " +
      "PLOT CLAIM: SurfaceGui sign, .Touched binds plot.Owner = player.UserId, unclaim on PlayerRemoving. " +
      "DROPPER: task.spawn loop every X seconds, Part cloned with IntValue 'Cash' attribute, .Parent = plot.Drops. " +
      "CONVEYOR: Part with Velocity set on Heartbeat OR AssemblyLinearVelocity for CanCollide=false parts. " +
      "COLLECTOR: .Touched checks IntValue attribute, awards leaderstats.Cash, drop:Destroy(). " +
      "BUTTONS: Part + BillboardGui showing price, .Touched checks Cash >= price, deducts, fires unlock, saves bought list. " +
      "SAVE: DataStore stores {Cash, Bought = {btnId, ...}}. On load, replay bought buttons before showing shop.",
  },
  {
    topic: "scripter",
    title: "Obby stage + checkpoint system",
    source: "system:obby",
    source_hash: "system/obby/v1",
    content:
      "Structure: Stages folder with SpawnLocation named '1','2',...'N'. Enabled=false except Stage 1. " +
      "leaderstats.Stage (IntValue) tracks progress. On SpawnLocation.Touched: " +
      "if tonumber(spawn.Name) > player.leaderstats.Stage.Value then Stage.Value = tonumber(spawn.Name) end. " +
      "On CharacterAdded, teleport HumanoidRootPart.CFrame to Stages[Stage.Value].CFrame + Vector3.new(0,3,0). " +
      "KILL BRICKS: BrickColor.new('Really red'), .Touched -> humanoid:TakeDamage(100). " +
      "Save Stage in DataStore keyed by UserId.",
  },
  {
    topic: "scripter",
    title: "Simulator (click / rebirth) core loop",
    source: "system:simulator",
    source_hash: "system/simulator/v1",
    content:
      "leaderstats: Coins (IntValue), Rebirths (IntValue), Multiplier = 1 + Rebirths. " +
      "Tool with LocalScript: tool.Activated fires ClickRemote:FireServer(). " +
      "Server rate-limits (last-fire table, min 0.05s), then leaderstats.Coins += Multiplier. " +
      "Rebirth pad: requires Coins >= threshold(Rebirths+1), resets Coins to 0, Rebirths += 1. " +
      "Threshold curve: 1000 * (10 ^ Rebirths). Save both to DataStore.",
  },
  {
    topic: "scripter",
    title: "Combat: hitbox + damage RemoteEvent",
    source: "system:combat",
    source_hash: "system/combat/v1",
    content:
      "Client (LocalScript in Tool): tool.Activated fires SwingRemote:FireServer(). " +
      "Server validates cooldown (0.5s per player), creates hitbox: " +
      "OverlapParams + workspace:GetPartBoundsInBox(hrp.CFrame * CFrame.new(0,0,-3), Vector3.new(6,6,6), params). " +
      "For each Part with Humanoid parent != attacker's character, target.Humanoid:TakeDamage(dmg). " +
      "Debounce PER-TARGET to prevent multi-hit within one swing. Never trust client hit reports.",
  },
  {
    topic: "scripter",
    title: "Ranged weapon (raycast gun) pattern",
    source: "system:ranged",
    source_hash: "system/ranged-weapon/v1",
    content:
      "Client fires FireRemote:FireServer(mouseHitPos). Server validates cooldown + line-of-sight. " +
      "local params = RaycastParams.new(); params.FilterDescendantsInstances = {character}; params.FilterType = Enum.RaycastFilterType.Exclude. " +
      "local result = workspace:Raycast(muzzle.Position, (target - muzzle.Position).Unit * range, params). " +
      "If result.Instance's ancestor has Humanoid -> :TakeDamage. Show tracer via Beam on client via FireAllClients.",
  },
  {
    topic: "scripter",
    title: "Shop + gamepass integration",
    source: "system:shop",
    source_hash: "system/shop/v1",
    content:
      "local MPS = game:GetService('MarketplaceService'). " +
      "MPS:PromptGamePassPurchase(player, gamepassId) opens the purchase UI. " +
      "MPS.PromptGamePassPurchaseFinished:Connect(function(player, id, purchased) if purchased then grant() end end). " +
      "To check ownership on join: MPS:UserOwnsGamePassAsync(player.UserId, id) — wrap in pcall, cache the result per session. " +
      "Developer products (consumable): MPS:PromptProductPurchase + MPS.ProcessReceipt callback returns Enum.ProductPurchaseDecision.PurchaseGranted.",
  },
  {
    topic: "scripter",
    title: "Inventory + equip pattern",
    source: "system:inventory",
    source_hash: "system/inventory/v1",
    content:
      "Server owns inventory as a table {[itemId] = count} stored per player, saved in DataStore. " +
      "EquipRemote:FireServer(itemId): server verifies ownership, clones template Tool from ServerStorage.ItemTemplates, parents to player.Backpack. " +
      "Unequip = tool:Destroy() (or move back to StarterGear for persistence across respawn). " +
      "NEVER let the client clone tools directly — always go through the server.",
  },
  {
    topic: "scripter",
    title: "ProximityPrompt for interactions",
    source: "roblox-api:ProximityPrompt",
    source_hash: "api/proximityprompt/v1",
    content:
      "Modern interaction API — replaces ClickDetector for most doors, chests, NPCs. " +
      "local prompt = Instance.new('ProximityPrompt'); prompt.ActionText = 'Open'; prompt.HoldDuration = 0.5; prompt.Parent = part. " +
      "prompt.Triggered:Connect(function(player) ... end). Runs on the server. " +
      "Set MaxActivationDistance (default 10) and RequiresLineOfSight for cover-based interactions.",
  },
  {
    topic: "scripter",
    title: "CollectionService for tagged behavior",
    source: "roblox-api:CollectionService",
    source_hash: "api/collectionservice/v1",
    content:
      "Prefer tags over hierarchy for shared behavior. Set tag in Studio via Tag Editor or CollectionService:AddTag(part, 'KillBrick'). " +
      "Runtime: local CS = game:GetService('CollectionService'); for _, part in CS:GetTagged('KillBrick') do wire(part) end. " +
      "CS:GetInstanceAddedSignal('KillBrick'):Connect(wire) picks up new tagged parts. One handler covers every instance with the tag.",
  },
  {
    topic: "scripter",
    title: "Attributes for lightweight state",
    source: "roblox-api:Attributes",
    source_hash: "api/attributes/v1",
    content:
      "Prefer Attributes over Value objects for simple per-instance state. " +
      "part:SetAttribute('Health', 100); part:GetAttribute('Health'); part:GetAttributeChangedSignal('Health'):Connect(fn). " +
      "Types: string, number, bool, Vector3, Color3, UDim2, BrickColor, and more. Replicates automatically. " +
      "Use for: door open/closed, drop values, item rarity, cooldown timestamps.",
  },
  {
    topic: "scripter",
    title: "PathfindingService for NPC AI",
    source: "roblox-api:PathfindingService",
    source_hash: "api/pathfinding/v1",
    content:
      "local PS = game:GetService('PathfindingService'). " +
      "local path = PS:CreatePath({AgentRadius=2, AgentHeight=5, AgentCanJump=true}); path:ComputeAsync(start, goal). " +
      "if path.Status == Enum.PathStatus.Success then for _, wp in path:GetWaypoints() do humanoid:MoveTo(wp.Position); humanoid.MoveToFinished:Wait() end end. " +
      "Handle path.Blocked signal for dynamic obstacles — recompute the path.",
  },
  {
    topic: "scripter",
    title: "DataStore v2 with UpdateAsync + retries",
    source: "roblox-api:DataStoreV2",
    source_hash: "api/datastore-v2/v1",
    content:
      "UpdateAsync is safer than SetAsync — atomic read-modify-write, prevents overwrite races. " +
      "local ok = false; for attempt = 1, 5 do local success, err = pcall(function() store:UpdateAsync(key, function(old) return merge(old, new) end) end); if success then ok = true; break end; task.wait(2 ^ attempt) end. " +
      "Wrap every DataStore call. Always call in game:BindToClose(function() ... end) with timeout so writes flush before shutdown. " +
      "For high-value saves consider ProfileService (open-source module) which handles session-locking.",
  },
  {
    topic: "scripter",
    title: "BadgeService for achievements",
    source: "roblox-api:BadgeService",
    source_hash: "api/badges/v1",
    content:
      "local BS = game:GetService('BadgeService'). " +
      "Award: pcall(BS.AwardBadge, BS, player.UserId, badgeId) — only awards if not already owned. " +
      "Check: BS:UserHasBadgeAsync(player.UserId, badgeId) (wrap in pcall). " +
      "Badge must be created on the Creator Dashboard for THIS place and have AwardingEnabled=true.",
  },
  {
    topic: "scripter",
    title: "Chat commands (/give, /tp)",
    source: "system:chat-commands",
    source_hash: "system/chat-commands/v1",
    content:
      "Modern chat: TextChatService. Register a TextChatCommand under TextChatService: PrimaryAlias='/tp'. " +
      "cmd.Triggered:Connect(function(source, msg) local player = Players:GetPlayerByUserId(source.UserId); local args = msg:split(' '); handle(player, args) end). " +
      "For admin-only, check has_role (UserId in AdminList). Never let arbitrary players run mutations without a role check.",
  },
  {
    topic: "scripter",
    title: "Server-authoritative rule (read this first)",
    source: "style:server-auth",
    source_hash: "style/server-auth/v1",
    content:
      "GOLDEN RULE: currency, inventory, health, positions-that-matter, and saves live ONLY on the server. " +
      "Clients FIRE intent (RemoteEvent). Server VALIDATES cooldowns, distance, ownership, and cost — then mutates state. " +
      "Never accept 'damage this player by X' from a client. Never accept 'give me item X'. " +
      "Client-side is for INPUT and PRESENTATION (particles, sounds, camera). Anything gameplay-affecting = server.",
  },

  // ── World Builder: environment + game world systems ────────────────
  {
    topic: "world_builder",
    title: "StreamingEnabled for large maps",
    source: "roblox-api:StreamingEnabled",
    source_hash: "api/streaming/v1",
    content:
      "workspace.StreamingEnabled=true streams parts near each player (huge memory + join-time win for open worlds). " +
      "Set ModelStreamingMode=Persistent on gameplay-critical models (bosses, quest NPCs) so they never unload for players who need them. " +
      "StreamingMinRadius (min guaranteed loaded radius), StreamingTargetRadius (target). " +
      "When on, server scripts should use WaitForChild — parts may not exist for a given player yet.",
  },
  {
    topic: "world_builder",
    title: "Rojo-friendly folder layout",
    source: "style:folder-layout",
    source_hash: "style/folder-layout/v1",
    content:
      "Standard project tree: " +
      "ServerScriptService/{Systems, Services}. ServerStorage/{Templates, Modules}. " +
      "ReplicatedStorage/{Remotes (RemoteEvents/Functions), Shared (ModuleScripts), Assets}. " +
      "StarterPlayer/StarterPlayerScripts (LocalScripts). StarterGui (ScreenGuis). " +
      "Workspace/{Map, Spawns, Interactables}. Never dump loose scripts in workspace.",
  },
  {
    topic: "world_builder",
    title: "Zone triggers (invisible region parts)",
    source: "system:zones",
    source_hash: "system/zones/v1",
    content:
      "Invisible Part with CanCollide=false, Transparency=1, tagged 'Zone_Lobby'. " +
      "Server: for tagged zone, connect .Touched -> if partAncestor has Humanoid, enterZone(player, zone). " +
      "Debounce per-player-per-zone to avoid spam. Fire ZoneEntered RemoteEvent to client for music swap / UI change. " +
      "For overlapping zones use a stack: entering pushes zone, leaving pops.",
  },
  {
    topic: "world_builder",
    title: "Day/night cycle",
    source: "system:daynight",
    source_hash: "system/daynight/v1",
    content:
      "Server loop: task.spawn(function() while true do game.Lighting:SetMinutesAfterMidnight(game.Lighting:GetMinutesAfterMidnight() + 1); task.wait(cycleSeconds/1440) end end). " +
      "Full cycle in cycleSeconds real seconds (1440 minutes = 1 in-game day). " +
      "Swap Skybox + Atmosphere.Color at dusk/dawn via ClockTime thresholds for cinematic look.",
  },

  // ── UI Designer: HUDs, menus, notifications ─────────────────────────
  {
    topic: "ui_designer",
    title: "HUD skeleton (Coins + XP)",
    source: "system:hud",
    source_hash: "system/hud/v1",
    content:
      "ScreenGui in StarterGui, ResetOnSpawn=false. Top-right Frame with UIListLayout Horizontal, Padding=8. " +
      "TextLabel bound to leaderstats: player:WaitForChild('leaderstats').Coins:GetPropertyChangedSignal('Value'):Connect(function() label.Text = 'Coins: '..player.leaderstats.Coins.Value end). " +
      "XP bar = Frame with inner Frame Size = UDim2.fromScale(xp/maxXp, 1). Tween size on change for smooth fill.",
  },
  {
    topic: "ui_designer",
    title: "Notification toast system",
    source: "system:toast",
    source_hash: "system/toast/v1",
    content:
      "ScreenGui with a container Frame anchored top-center. NotifyRemote from server: server:FireClient(player, {text, color, duration}). " +
      "Client clones a template TextLabel, parents to container, tweens in (slide down + fade), waits duration, tweens out, :Destroy(). " +
      "Stack multiple toasts using UIListLayout (Vertical, VerticalAlignment=Top).",
  },
  {
    topic: "ui_designer",
    title: "Shop UI grid pattern",
    source: "system:shop-ui",
    source_hash: "system/shop-ui/v1",
    content:
      "ScrollingFrame with UIGridLayout (CellSize = UDim2.fromOffset(140,180), CellPadding = UDim2.fromOffset(10,10)). " +
      "For each item: TextButton template with ImageLabel (icon), TextLabel (name + price), UICorner + UIStroke. " +
      "button.Activated -> BuyRemote:FireServer(itemId). Grey out (BackgroundTransparency=0.7) when Coins < price by listening to leaderstats.",
  },
  {
    topic: "ui_designer",
    title: "Mobile detection + adaptive UI",
    source: "style:mobile-detect",
    source_hash: "style/mobile-detect/v1",
    content:
      "local UIS = game:GetService('UserInputService'); local isMobile = UIS.TouchEnabled and not UIS.KeyboardEnabled. " +
      "Show on-screen action buttons only when isMobile. Larger tap targets (>= 48px). " +
      "Use UIAspectRatioConstraint for square icons and UIScale with a device-based factor so 4K + phone both look right.",
  },
];
