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

  // ── Scripter: advanced systems ──────────────────────────────────────
  {
    topic: "scripter",
    title: "ProfileService (recommended DataStore wrapper)",
    source: "library:ProfileService",
    source_hash: "lib/profileservice/v1",
    content:
      "Prefer ProfileService (loleris) over raw DataStore for real games — session-locking prevents item duplication across servers, auto-reconciles schema, handles GDPR wipes. " +
      "Pattern: ProfileStore = ProfileService.GetProfileStore('PlayerData', TEMPLATE); profile = ProfileStore:LoadProfileAsync('Player_'..userId, 'ForceLoad'); profile:AddUserId(userId); profile:Reconcile(); profile:ListenToRelease(function() Players[userId]:Kick('Profile released') end). " +
      "Write to profile.Data.Coins directly — auto-saves on interval + on leave. Never roll your own datastore for anything with tradeable items.",
  },
  {
    topic: "scripter",
    title: "Anti-exploit: server sanity checks",
    source: "system:anti-exploit",
    source_hash: "system/anti-exploit/v1",
    content:
      "Exploiters can fire any RemoteEvent with any arg. Server MUST: validate types (typeof(x)=='number'), clamp ranges, verify distance (player.Character.HumanoidRootPart.Position - target).Magnitude < MAX_REACH, rate-limit (last[player]=os.clock() checks), verify ownership (item belongs to player), and never trust client-sent damage / position / currency. " +
      "Use Debounce table keyed by player. Kick or log repeated violations. Track suspicious patterns with a Score system before banning.",
  },
  {
    topic: "scripter",
    title: "Remote rate-limiter pattern",
    source: "system:rate-limit",
    source_hash: "system/rate-limit/v1",
    content:
      "local buckets = {}; local function allow(player, key, perSec) local now=os.clock(); local b=buckets[player]; if not b then b={}; buckets[player]=b end; local t=b[key] or 0; if now - t < 1/perSec then return false end; b[key]=now; return true end. " +
      "Players.PlayerRemoving:Connect(function(p) buckets[p]=nil end). Guard every RemoteEvent handler with allow(player,'attack',6) etc.",
  },
  {
    topic: "scripter",
    title: "Zombie / NPC AI with Pathfinding",
    source: "system:npc-ai",
    source_hash: "system/npc-ai/v1",
    content:
      "local PS = game:GetService('PathfindingService'); local path = PS:CreatePath({AgentRadius=2, AgentHeight=5, AgentCanJump=true, WaypointSpacing=4}). " +
      "Loop: find nearest player within aggro radius, path:ComputeAsync(zombie.HRP.Position, target.Position); for _,wp in path:GetWaypoints() do humanoid:MoveTo(wp.Position); if wp.Action==Enum.PathWaypointAction.Jump then humanoid.Jump=true end; humanoid.MoveToFinished:Wait() end. " +
      "Recompute every ~0.5s or when Blocked. Attack when in range via Touched or a magnitude check.",
  },
  {
    topic: "scripter",
    title: "Round / lobby system skeleton",
    source: "system:rounds",
    source_hash: "system/rounds/v1",
    content:
      "ServerScript: while true do WaitForPlayers(2); Intermission(15); local map=LoadMap(); TeleportAll(map.Spawn); StartRound(120); DeclareWinner(); Cleanup(map); end. " +
      "Use ReplicatedStorage.Maps folder cloned in, :Destroy() at end. Broadcast state via RoundStateValue (StringValue) so UI reflects Intermission/InRound/EndRound. " +
      "Track alive players in a set; last-one-standing or timer-elapsed ends the round.",
  },
  {
    topic: "scripter",
    title: "Ragdoll on death",
    source: "system:ragdoll",
    source_hash: "system/ragdoll/v1",
    content:
      "On humanoid.Died: for each Motor6D in character, replace with BallSocketConstraint using its Part0/Part1 + attachments at C0/C1. Set humanoid:ChangeState(Enum.HumanoidStateType.Physics). " +
      "Add HingeConstraints on knees/elbows with LimitsEnabled for realism. Destroy character after 5s or on respawn.",
  },
  {
    topic: "scripter",
    title: "Weapon hit registration with lag compensation",
    source: "system:hitreg",
    source_hash: "system/hitreg/v1",
    content:
      "Client fires HitRemote with {targetPart, hitPos, timestamp}. Server rewinds: check target's HRP position ~ping/2 ago (store a small ring buffer of positions per character). " +
      "Verify (hitPos - rewindedPos).Magnitude < weapon.MaxRadius and (attacker.HRP.Position - hitPos).Magnitude < weapon.Range. Then apply damage server-side. Never trust client-reported damage value.",
  },
  {
    topic: "scripter",
    title: "TweenService for smooth motion + UI",
    source: "roblox-api:TweenService",
    source_hash: "api/tweenservice/v1",
    content:
      "local TS = game:GetService('TweenService'); local info = TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out); TS:Create(instance, info, {Position = target, Transparency = 0}):Play(). " +
      "For UI: tween Size/Position/BackgroundTransparency. For parts: use TweenService, NOT :SetPrimaryPartCFrame in a loop. Tweens are client- OR server-authoritative depending on where you play them.",
  },
  {
    topic: "scripter",
    title: "ContextActionService for cross-platform input",
    source: "roblox-api:ContextActionService",
    source_hash: "api/cas/v1",
    content:
      "local CAS = game:GetService('ContextActionService'); CAS:BindAction('Sprint', handler, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonR2). " +
      "Third arg true = auto-creates a mobile touch button. handler(actionName, inputState, inputObject) — check inputState == Enum.UserInputState.Begin. Use CAS:SetTitle/SetImage for the mobile button.",
  },
  {
    topic: "scripter",
    title: "Camera controllers (first + third person)",
    source: "system:camera",
    source_hash: "system/camera/v1",
    content:
      "LocalScript in StarterPlayerScripts. camera = workspace.CurrentCamera; camera.CameraType = Enum.CameraType.Scriptable. " +
      "Third-person: RunService.RenderStepped:Connect(function(dt) local target = character.HRP.Position; camera.CFrame = CFrame.new(target - lookVec*distance + Vector3.new(0,2,0), target) end). " +
      "First-person: lock mouse (UIS.MouseBehavior = Enum.MouseBehavior.LockCenter), read Delta each frame, apply yaw/pitch, position camera at head attachment.",
  },
  {
    topic: "scripter",
    title: "MessagingService (cross-server events)",
    source: "roblox-api:MessagingService",
    source_hash: "api/messaging/v1",
    content:
      "local MS = game:GetService('MessagingService'); MS:SubscribeAsync('GlobalEvent', function(msg) print(msg.Data) end); MS:PublishAsync('GlobalEvent', {text='hi'}). " +
      "Payload <= 1KB, 150 messages/min per topic. Great for global chat, cross-server leaderboards, global boss timers. Combine with MemoryStoreService for shared counters.",
  },
  {
    topic: "scripter",
    title: "MemoryStoreService (fast shared state)",
    source: "roblox-api:MemoryStoreService",
    source_hash: "api/memorystore/v1",
    content:
      "local MSS = game:GetService('MemoryStoreService'); local queue = MSS:GetQueue('Matchmaking', 60); queue:AddAsync(userId, 30). " +
      "SortedMap for global leaderboards (:SetAsync,:GetRangeAsync). HashMap for shared flags. TTL required, capped throughput per key — use for matchmaking, live event counters, cross-server rooms.",
  },
  {
    topic: "scripter",
    title: "TeleportService + reserved servers",
    source: "roblox-api:TeleportService",
    source_hash: "api/teleport/v1",
    content:
      "local TS = game:GetService('TeleportService'); local code = TS:ReserveServer(placeId); TS:TeleportToPrivateServer(placeId, code, {player1, player2}, nil, teleportData). " +
      "Retrieve on arrival: TS:GetLocalPlayerTeleportData() (client) or player:GetJoinData().TeleportData (server). Wrap in pcall + retry. Use for lobby→match, dungeons, party instances.",
  },
  {
    topic: "scripter",
    title: "MarketplaceService: dev products + subs",
    source: "roblox-api:MarketplaceService",
    source_hash: "api/marketplace/v1",
    content:
      "local MPS = game:GetService('MarketplaceService'); MPS:PromptProductPurchase(player, productId). " +
      "MPS.ProcessReceipt = function(info) local player = Players:GetPlayerByUserId(info.PlayerId); if not player then return Enum.ProductPurchaseDecision.NotProcessedYet end; grant(player, info.ProductId); saveNow(player); return Enum.ProductPurchaseDecision.PurchaseGranted end. " +
      "Only return PurchaseGranted AFTER data is safely saved. Gamepasses: MPS:UserOwnsGamePassAsync(userId, passId).",
  },
  {
    topic: "scripter",
    title: "AnalyticsService (Roblox built-in)",
    source: "roblox-api:AnalyticsService",
    source_hash: "api/analytics/v1",
    content:
      "local AS = game:GetService('AnalyticsService'); AS:LogEconomyEvent(player, Enum.AnalyticsEconomyFlowType.Sink, 'Coins', 100, balance, Enum.AnalyticsEconomyTransactionType.Shop.Name, 'sword'). " +
      "LogFunnelStepEvent for tutorial funnels, LogProgressionEvent for level ups. Shows up in Creator Dashboard analytics — invaluable for tuning drop rates and shop prices.",
  },
  {
    topic: "scripter",
    title: "Signal + Maid patterns (memory-safe events)",
    source: "style:signal-maid",
    source_hash: "style/signal-maid/v1",
    content:
      "Maid = collect connections/instances: maid = {}; function giveTask(t) table.insert(maid,t) end; function cleanup() for _,t in maid do if typeof(t)=='RBXScriptConnection' then t:Disconnect() elseif typeof(t)=='Instance' then t:Destroy() else t() end end end. " +
      "Always :Disconnect() events on PlayerRemoving / Character death / Tool unequip or you leak memory. Prefer Sleitnick's Signal + Trove libraries in production.",
  },
  {
    topic: "scripter",
    title: "Placement / build system (grid snap)",
    source: "system:placement",
    source_hash: "system/placement/v1",
    content:
      "Client: RunService.RenderStepped raycasts from mouse using workspace.CurrentCamera:ViewportPointToRay. Snap: pos = Vector3.new(math.floor(hit.X/g+0.5)*g, hit.Y, math.floor(hit.Z/g+0.5)*g). Show ghost model tinted green/red for valid/overlap. " +
      "On click, fire PlaceRemote with model id + CFrame. Server re-validates ownership, funds, no overlap (Workspace:GetPartsInPart), then clones the real model.",
  },
  {
    topic: "scripter",
    title: "Trading system (safe)",
    source: "system:trading",
    source_hash: "system/trading/v1",
    content:
      "State machine per trade session (ReplicatedStorage session folder): Opened -> Offering -> ConfirmedA -> ConfirmedB -> Committed. Only server mutates state; clients propose changes via remotes. " +
      "On Confirm from both sides, in ONE server tick: verify both players still own offered items, transfer items via ProfileService (both profiles saved atomically), log the trade with trade id + userIds + items. Never allow item transfer outside this committed step.",
  },
  {
    topic: "scripter",
    title: "TextService chat filter (safety)",
    source: "roblox-api:TextService",
    source_hash: "api/textservice/v1",
    content:
      "local TS = game:GetService('TextService'); local ok, filter = pcall(TS.FilterStringAsync, TS, message, fromUserId); if ok then local safe = filter:GetChatForUserAsync(toUserId); label.Text = safe end. " +
      "MUST filter every player-authored string shown to other players: usernames on custom UIs, pet names, sign text, house names. Roblox will moderate your game if you skip this.",
  },
  {
    topic: "scripter",
    title: "Vehicle: raycast suspension car",
    source: "system:vehicle",
    source_hash: "system/vehicle/v1",
    content:
      "Chassis = single Part. 4 Attachments at wheel positions. Each RenderStepped: raycast down suspensionLength, compute compression, apply upward VectorForce = k*compression - c*verticalVelocity. Steering via BodyGyro/AlignOrientation on chassis. Throttle applies forward VectorForce at rear attachments. " +
      "Feels sports-car with k≈40000, c≈3000 on a 4-stud chassis. Grounded raycasts also give surface friction — vary throttle force by hit.Material.",
  },
  {
    topic: "scripter",
    title: "Tower Defense placement + wave system",
    source: "system:td",
    source_hash: "system/td/v1",
    content:
      "Path = Folder of numbered waypoints (Part.Waypoint_1..N). Enemies clone from ReplicatedStorage.Enemies, walk waypoints via humanoid:MoveTo + MoveToFinished:Wait, damage base on reach. " +
      "Towers: Model with RangePart (invisible sphere). Loop finds nearest enemy in range, fires projectile or hitscan every fireRate. Waves defined as {{enemy='Zombie', count=10, delay=0.5}, ...}. Between waves 15s intermission with a Skip button.",
  },
  {
    topic: "scripter",
    title: "Simulator: pets + multipliers",
    source: "system:pets",
    source_hash: "system/pets/v1",
    content:
      "Pet = Model welded to invisible AlignPosition/AlignOrientation follower behind player. Each equipped pet contributes multiplier to Coins (or Strength). Server stores player.equippedPets = {petUUID,...} with max slots. " +
      "Rarity roll: weighted table; log Analytics economy event. Hatch UI: 3-second reveal tween. Cap total equipped multiplier (e.g. 500x) to control inflation.",
  },
  {
    topic: "scripter",
    title: "Quest / objective tracker",
    source: "system:quests",
    source_hash: "system/quests/v1",
    content:
      "Quest def: {id, title, goal={type='kill', target='Zombie', count=10}, reward={coins=100, xp=50}}. Server tracks per-player progress table; increments on relevant events (enemy died, item picked up). " +
      "On complete, grant reward, mark done in profile, fire QuestUpdate to client to update HUD. Support daily quests via os.date('*t').yday reset check.",
  },
  {
    topic: "scripter",
    title: "Dialogue / NPC interaction",
    source: "system:dialogue",
    source_hash: "system/dialogue/v1",
    content:
      "ProximityPrompt on NPC ('Talk'). On Triggered, fire DialogueRemote:FireClient(player, npcId, dialogueId). Client shows portrait + typewriter TextLabel + choice buttons. " +
      "Choices reference next node id or 'end' or 'giveQuest:foo'. Data-driven: define trees in ModuleScripts under ServerStorage.Dialogues so writers don't touch code.",
  },
  {
    topic: "scripter",
    title: "Loot table / drop rolling",
    source: "system:loot",
    source_hash: "system/loot/v1",
    content:
      "Weighted roll: local total=0; for _,e in table do total+=e.weight end; local r=math.random()*total; local acc=0; for _,e in table do acc+=e.weight; if r<=acc then return e end end. " +
      "Publish drop rates to players (regulated in some regions). Log every rare drop with player, item, timestamp for anti-dupe auditing.",
  },

  // ── World Builder: environments ─────────────────────────────────────
  {
    topic: "world_builder",
    title: "Terrain painting + biomes",
    source: "system:terrain",
    source_hash: "system/terrain/v1",
    content:
      "Terrain:FillRegion(region, 4, Enum.Material.Grass) for large fills. Use Terrain Editor for hand-sculpting cliffs, water pools, caves. " +
      "Biome tint: adjust Terrain.WaterColor + Lighting.Atmosphere per zone. For procedural: nested loops over chunks calling Terrain:WriteVoxels with material+occupancy grids derived from Perlin noise (math.noise).",
  },
  {
    topic: "world_builder",
    title: "Post-processing profiles per zone",
    source: "system:lighting-profiles",
    source_hash: "system/lighting-profiles/v1",
    content:
      "Store Lighting effect presets in ModuleScript: {Cave = {Bloom={Intensity=0.2}, ColorCorrection={Tint=Color3.new(0.6,0.7,1)}}}. Zone triggers (Touched on invisible Region parts) tween effects to target values over 1s. " +
      "Enable Bloom + Sunrays + DepthOfField sparingly on mobile — check UserInputService.TouchEnabled and reduce intensity.",
  },
  {
    topic: "world_builder",
    title: "Weather + particle presets",
    source: "system:weather",
    source_hash: "system/weather/v1",
    content:
      "Rain: ParticleEmitter high above map, huge Rate (500), Speed 60, Lifetime 1.5, Texture=streak. Combine with Atmosphere.Density up + Lighting.Ambient down. " +
      "Snow: slower speed, drift via Acceleration.X sine. Fog: increase Lighting.FogEnd inward. Broadcast weather state via StringValue so late joiners sync.",
  },
  {
    topic: "world_builder",
    title: "Procedural map (voxel + noise)",
    source: "system:procgen",
    source_hash: "system/procgen/v1",
    content:
      "for x=1,W do for z=1,D do local h = math.noise(x*0.05, z*0.05)*20 + 30; for y=1,h do fill voxel with Grass; if y<h-3 then Rock end end end end. " +
      "Chunk on demand around each player using StreamingEnabled semantics. Seed with a game-wide constant so the world is deterministic across servers.",
  },

  // ── UI Designer: extra patterns ─────────────────────────────────────
  {
    topic: "ui_designer",
    title: "Menu with tabs (settings pattern)",
    source: "system:tabs",
    source_hash: "system/tabs/v1",
    content:
      "Container Frame + top TabBar (UIListLayout Horizontal). Each tab button toggles Visible on its content Frame. Highlight active tab via BackgroundColor3 + UIStroke. " +
      "For settings: bind toggles/sliders to a client-side Config module, save preferences in a small DataStore key per player (Music volume, camera sensitivity).",
  },
  {
    topic: "ui_designer",
    title: "Loading screen + preload",
    source: "system:loading",
    source_hash: "system/loading/v1",
    content:
      "ReplicatedFirst LocalScript. game:GetService('ReplicatedFirst'):RemoveDefaultLoadingScreen(). Show custom ScreenGui. " +
      "ContentProvider:PreloadAsync({...assets}); player.CharacterAdded:Wait(); tween out ScreenGui and Destroy(). Keeps first paint clean; NEVER auto-add this unless the user asked for a splash screen (violates strict scope rules).",
  },
  {
    topic: "ui_designer",
    title: "Leaderboard (global via OrderedDataStore)",
    source: "system:leaderboard-ui",
    source_hash: "system/leaderboard-ui/v1",
    content:
      "Server: DataStoreService:GetOrderedDataStore('Coins'):GetSortedAsync(false, 100). Push top rows via LeaderboardRemote every 60s. " +
      "Client: ScrollingFrame with rank + username + value rows, tween new entries. Optional per-server ranking via a table sorted every few seconds.",
  },

  // ── Scripter: combat & progression systems ──────────────────────────
  {
    topic: "scripter",
    title: "Skill tree / talent system",
    source: "system:skill-tree",
    source_hash: "system/skill-tree/v1",
    content:
      "Skills defined in ModuleScript: {id, name, cost, requires={'skill_a'}, effect=function(player) end}. Player profile stores unlockedSkills = {[id]=true} and skillPoints. " +
      "UI: nodes with connecting Frames (lines via UIStroke). Click -> UnlockRemote:FireServer(id). Server validates cost, prerequisites unlocked, points available, then applies effect (buffs, new abilities) and saves.",
  },
  {
    topic: "scripter",
    title: "Combo attack system (chained melee)",
    source: "system:combo",
    source_hash: "system/combo/v1",
    content:
      "Track player.comboIndex + player.lastAttack. On attack: if os.clock() - last < 1.2 then combo = (combo % maxCombo) + 1 else combo = 1 end. Play animation swing_1..swing_N, escalating damage + knockback on final hit. " +
      "Reset combo on miss or timeout. Server validates cooldown between hits to prevent spam-click exploits.",
  },
  {
    topic: "scripter",
    title: "Status effects (buff / debuff manager)",
    source: "system:status-effects",
    source_hash: "system/status-effects/v1",
    content:
      "Central ModuleScript with active[player] = {burn={stacks=3, expires=os.clock()+5, tickRate=1}, slow={multiplier=0.5, expires=..}}. Server heartbeat processes ticks (burn damage) and expiry. " +
      "Fire StatusChanged to client for HUD icons. Modifiers stack additively for damage, multiplicatively for speed. Cleanse via items or abilities removes a category.",
  },
  {
    topic: "scripter",
    title: "XP curve + leveling",
    source: "system:leveling",
    source_hash: "system/leveling/v1",
    content:
      "xpForLevel = function(L) return math.floor(100 * L^1.6) end. On XP gain, while player.XP >= xpForLevel(player.Level) do subtract, increment level, grant skill point + heal + level-up VFX end. " +
      "Cap level (e.g. 100) or add prestige reset. Broadcast LevelUp remote so all clients play a shared particle effect on that player.",
  },
  {
    topic: "scripter",
    title: "Achievement / badge system",
    source: "system:achievements",
    source_hash: "system/achievements/v1",
    content:
      "Definitions: {id, name, condition=function(player, event, data) end, badgeId}. On relevant events (EnemyKilled, ItemCollected), iterate unearned achievements and evaluate. " +
      "On unlock: BadgeService:AwardBadge(userId, badgeId), save in profile.achievements, fire toast. Do NOT re-award — check UserHasBadgeAsync or profile flag first.",
  },
  {
    topic: "scripter",
    title: "Crafting / recipe system",
    source: "system:crafting",
    source_hash: "system/crafting/v1",
    content:
      "Recipe: {output='sword_iron', ingredients={iron_ore=3, wood=1}, station='forge', time=5}. Server checks proximity to station part, inventory has ingredients, starts CraftTimer, on complete removes ingredients + adds output. " +
      "Client shows recipe book (ScrollingFrame + item icons + greyed out for missing mats). Cancel returns partial ingredients.",
  },
  {
    topic: "scripter",
    title: "Fishing minigame",
    source: "system:fishing",
    source_hash: "system/fishing/v1",
    content:
      "Cast: raycast from rod tip forward, place bobber at hit water. Random waitTime (2-8s). Bite: bobber wiggles + prompt shows. Player clicks within reaction window (~0.8s). " +
      "Success -> weighted loot roll by biome + rod tier. Failure -> escape. Rare hooking mini-game: hold within moving green zone for 3s. Server tracks last cast time.",
  },
  {
    topic: "scripter",
    title: "Mining / node respawn",
    source: "system:mining",
    source_hash: "system/mining/v1",
    content:
      "Ore Model with Health IntValue + ProximityPrompt. On Triggered: reduce health by pickaxeTier, play particle, if health<=0 grant ore, hide node, task.delay(respawnTime, reset). " +
      "Node types (Copper/Iron/Gold/Diamond) with weighted ore drops. Higher tier pickaxe required for higher nodes — validate server-side.",
  },
  {
    topic: "scripter",
    title: "Farming / crop growth",
    source: "system:farming",
    source_hash: "system/farming/v1",
    content:
      "Plot part with attribute 'occupied'. Plant: server places seed model, schedules growth stages via task.delay (stage1 10s -> stage2 30s -> ripe 60s), swaps mesh at each stage. " +
      "Harvest with ProximityPrompt when ripe. Save growth state with startTime so it resumes after rejoin. Fertilizer halves growth time.",
  },
  {
    topic: "scripter",
    title: "Cooking system",
    source: "system:cooking",
    source_hash: "system/cooking/v1",
    content:
      "Stove part with slots (Attachments). Drag ingredients from inventory UI -> stove slot (server validates). Recipe match check on Cook button. " +
      "Timer bar UI while cooking; if left too long -> burnt result. Different pans unlock different recipe subsets. Bonus stat food buffs on eating.",
  },
  {
    topic: "scripter",
    title: "Housing / plot ownership",
    source: "system:housing",
    source_hash: "system/housing/v1",
    content:
      "PlotService: on join, assign nearest free plot Model to player. plot:SetAttribute('OwnerId', userId). Only owner can Place/Edit within plot bounds. " +
      "Save placements as list of {modelId, cfram-from-plot-origin, rotation, color}. On rejoin, rebuild by cloning from Catalog folder and re-parenting to plot. Persist via ProfileService.",
  },
  {
    topic: "scripter",
    title: "Party / group system",
    source: "system:party",
    source_hash: "system/party/v1",
    content:
      "Party = server table {leader=userId, members={u1,u2}, maxSize=4}. Invite via chat command or right-click menu -> InviteRemote. Accept adds to members, syncs via PartyStateRemote to all members' clients. " +
      "TeleportPartyToServer uses TeleportService:TeleportAsync with members + teleportData={partyId}. Reconstruct party on arrival server.",
  },
  {
    topic: "scripter",
    title: "Matchmaking queue (cross-server)",
    source: "system:matchmaking",
    source_hash: "system/matchmaking/v1",
    content:
      "MemoryStoreService:GetQueue('MatchQueue1v1', 60):AddAsync({userId, placeId, joinedAt=os.time()}, 300). Server periodically :ReadAsync(2) — if 2 entries, ReserveServer + TeleportToPrivateServer both players. " +
      "MMR: use SortedMap keyed by rating band. Timeout after 60s widens rating tolerance.",
  },
  {
    topic: "scripter",
    title: "Gacha / summon system (with legal note)",
    source: "system:gacha",
    source_hash: "system/gacha/v1",
    content:
      "Roll from weighted pool (Common 70 / Rare 20 / Epic 8 / Legendary 2). Pity: track player.rollsSinceLegendary and force Legendary at 90. Display real drop rates on the UI (required by many jurisdictions + Roblox policy). " +
      "Server rolls, never client. Log each pull with player+result for audits.",
  },
  {
    topic: "scripter",
    title: "Boss fight AI (multi-phase)",
    source: "system:boss",
    source_hash: "system/boss/v1",
    content:
      "State machine: Idle -> Aggro -> Attack1 -> Attack2 -> Enrage (<30% hp). Each state a coroutine with attack telegraphs (ground indicator parts) then hitbox check after wind-up. " +
      "Multiple attack patterns cycled with weighted random. Health bar broadcast via NumberValue in ReplicatedStorage. On death: reward table + boss chest + respawn timer.",
  },
  {
    topic: "scripter",
    title: "Wave-based survival (co-op)",
    source: "system:wave-survival",
    source_hash: "system/wave-survival/v1",
    content:
      "Waves table: {[1]={{type='Zombie', count=5, spawnDelay=1}}, [5]={{type='Boss', count=1}}}. Between waves: 30s shop phase where players buy upgrades. " +
      "Scale enemy HP by 1 + 0.1*wave and count by 1.15^wave. Track player kills for MVP screen. All players revive at wave end if any survivor remains.",
  },
  {
    topic: "scripter",
    title: "Stamina / hunger / thirst",
    source: "system:vitals",
    source_hash: "system/vitals/v1",
    content:
      "Player vitals table {stamina=100, hunger=100, thirst=100}. Heartbeat every 5s: hunger -= 1, thirst -= 1.5. If either <= 0, drain HP. Stamina drains while sprinting, regenerates when idle. " +
      "Eat/drink items restore. HUD bars use TweenService for smooth updates. Save vitals in profile for persistence.",
  },
  {
    topic: "scripter",
    title: "Sprint / dash / double-jump",
    source: "system:movement-abilities",
    source_hash: "system/movement-abilities/v1",
    content:
      "Sprint: LeftShift held + stamina>0 -> humanoid.WalkSpeed=24 (normal 16). Dash: on Q, apply LinearVelocity in look direction for 0.15s, then destroy; cooldown 1.5s. " +
      "Double-jump: track jumpCount on JumpRequest; if <2 and airborne, humanoid:ChangeState(Jumping) with extra impulse. All abilities server-validated.",
  },
  {
    topic: "scripter",
    title: "Wall-run / parkour",
    source: "system:parkour",
    source_hash: "system/parkour/v1",
    content:
      "RenderStepped: raycast left and right from HRP. If hit + player airborne + moving forward: attach LinearVelocity along wall + slight upward. Tilt camera 15° toward wall. " +
      "End on JumpRequest (wall-jump: push away + up) or timer 1.5s. Server checks reasonable velocity to prevent flying exploits.",
  },
  {
    topic: "scripter",
    title: "Grappling hook",
    source: "system:grappling",
    source_hash: "system/grappling/v1",
    content:
      "On click: raycast from camera. If hit within maxRange: create RopeConstraint between HRP and hit part with Length = distance*0.6. Optional AlignPosition for pull-in mode. " +
      "Play Beam or Line visual. Release: destroy constraint. Server validates target distance and rate-limits.",
  },
  {
    topic: "scripter",
    title: "Zipline (RopeConstraint pattern)",
    source: "system:zipline",
    source_hash: "system/zipline/v1",
    content:
      "Two Attachments at zipline endpoints. On mount: weld invisible handle Part between player HRP and a slider on the rope. AlignPosition drags slider from A to B over distance/speed seconds. " +
      "Dismount on Jump or arrival. Show hold-space prompt when nearby. Handles decorated with pulley MeshPart for visual polish.",
  },
  {
    topic: "scripter",
    title: "Elevator / sliding door",
    source: "system:elevator",
    source_hash: "system/elevator/v1",
    content:
      "Elevator: Model + PrismaticConstraint to a static anchor. Set constraint.TargetPosition on button press; velocity=6. With StreamingEnabled or R6 issues, weld players to platform on Touched. " +
      "Sliding door: TweenService tween on door.CFrame between closed/open. Open when ProximityPrompt triggered or player in RegionPart.",
  },
  {
    topic: "scripter",
    title: "Vehicle: hovercraft / helicopter",
    source: "system:helicopter",
    source_hash: "system/helicopter/v1",
    content:
      "AlignOrientation keeps chassis level with slight pitch/roll for input. VectorForce upward = mass*gravity + throttleInput*extraLift. Yaw via AngularVelocity around Y. " +
      "Forward tilt applies horizontal component of thrust naturally. Add rotor Motor6D spinning + blur ImageLabel for VFX.",
  },
  {
    topic: "scripter",
    title: "Racing: lap + checkpoint timing",
    source: "system:racing",
    source_hash: "system/racing/v1",
    content:
      "Numbered checkpoint parts (invisible). player.nextCheckpoint = 1. On Touched, if part.Index == nextCheckpoint then increment. Reach last == lap complete. " +
      "Store lap start os.clock() per player, on finish compute delta, compare vs personal best in DataStore + global OrderedDataStore for leaderboard. Ghost car: record positions every 0.1s, replay via TweenService.",
  },
  {
    topic: "scripter",
    title: "Deployable turret / minion",
    source: "system:turret",
    source_hash: "system/turret/v1",
    content:
      "Player throws turret item -> server spawns Model at landing point, sets attribute 'ownerId'=userId, lifetime 30s. Loop: find nearest enemy in range (ignore owner + team), rotate turret head via CFrame lookAt, fire projectile every fireRate. " +
      "Destroy after lifetime or when HP<=0. Cap active turrets per player.",
  },
  {
    topic: "scripter",
    title: "Building destruction (breakable parts)",
    source: "system:destruction",
    source_hash: "system/destruction/v1",
    content:
      "Structure parts have Health attribute. On damage: reduce health, tween BrickColor darker + add cracked Decal at thresholds. On zero: play Sound + Debris:AddItem(part, 3) with :BreakJoints(). " +
      "Optional shattering via pre-authored chunk pieces cloned in place. Explosion instance's :Hit event applies damage to nearby parts + humanoids.",
  },
  {
    topic: "scripter",
    title: "Physics constraints reference",
    source: "roblox-api:Constraints",
    source_hash: "api/constraints/v1",
    content:
      "AlignPosition/AlignOrientation for tweening physics parts. HingeConstraint (ActuatorType=Motor + AngularVelocity) for spinning doors/wheels. PrismaticConstraint for pistons/elevators. " +
      "RopeConstraint (max length) or RodConstraint (fixed). SpringConstraint for suspension/bouncy. LinearVelocity + VectorForce for controlled movement.",
  },
  {
    topic: "scripter",
    title: "Sound design system",
    source: "system:sound",
    source_hash: "system/sound/v1",
    content:
      "3D sounds: Sound parented to a Part (RollOffMode=InverseTapered, EmitterSize=5, MaxDistance=200). Global music: SoundService with SoundGroup for master/music/sfx with independent Volume. " +
      "Play random hit variants (footstep_1..5) via math.random to avoid repetition. Pitch randomize 0.9-1.1 via PlaybackSpeed. Fade in/out via TweenService on Volume.",
  },
  {
    topic: "scripter",
    title: "Animation loading + priorities",
    source: "roblox-api:Animator",
    source_hash: "api/animator/v1",
    content:
      "local animator = character.Humanoid:WaitForChild('Animator'); local track = animator:LoadAnimation(animInstance); track.Priority = Enum.AnimationPriority.Action; track:Play(0.2, 1, 1). " +
      "Cache tracks — don't LoadAnimation every play. Use Idle/Movement/Action/Action4 priorities to avoid overlap bugs. :AdjustSpeed for run-cycle scaling to WalkSpeed.",
  },
  {
    topic: "scripter",
    title: "Emote / cosmetic system",
    source: "system:emotes",
    source_hash: "system/emotes/v1",
    content:
      "EmoteRemote:FireServer(emoteId). Server validates player owns it, then plays via humanoid Animator (replicates to all clients). Stop on movement input or timeout. " +
      "Emote wheel UI: 8-slot radial menu on hold-B, releasing over a slot fires the emote. Cosmetics stored in profile.equippedCosmetics per slot.",
  },
  {
    topic: "scripter",
    title: "Character customization / skin",
    source: "system:customization",
    source_hash: "system/customization/v1",
    content:
      "Save profile.appearance = {shirt=id, pants=id, hair=id, skinTone=color}. On CharacterAdded, remove default accessories, clone selected from ReplicatedStorage.Cosmetics, weld to head/torso. " +
      "Skin tint: character BodyColors, or set Part.Color for R6. UI: preview ViewportFrame with rotating dummy character.",
  },
  {
    topic: "scripter",
    title: "Team & FFA management",
    source: "roblox-api:Teams",
    source_hash: "api/teams/v1",
    content:
      "game:GetService('Teams'):FindFirstChild('Red') or Instance.new('Team', Teams) with TeamColor + AutoAssignable=false. Set player.Team = teamRed and player.TeamColor. " +
      "Force respawn: player:LoadCharacter(). Team-based damage: in damage handler, if attacker.Team == victim.Team and not friendlyFire then return end.",
  },
  {
    topic: "scripter",
    title: "Chat commands framework",
    source: "system:chat-commands",
    source_hash: "system/chat-commands/v1",
    content:
      "player.Chatted:Connect(function(msg) if msg:sub(1,1)=='/' then parseCommand(player, msg:sub(2)) end end). Commands table: {give={args={'itemId','amount'}, adminOnly=true, run=function(player,args) end}}. " +
      "Check admin via whitelist DataStore or user_role table. Never trust client-side admin flag.",
  },
  {
    topic: "scripter",
    title: "Admin panel (safe pattern)",
    source: "system:admin-panel",
    source_hash: "system/admin-panel/v1",
    content:
      "Admin list in server-only ModuleScript (never in ReplicatedStorage). AdminRemote requests filtered by has_admin check. UI shown only after server confirms via AdminCheckRemote:InvokeServer(). " +
      "Actions: kick, teleport player, give item, spawn boss. All actions logged to a webhook (HttpService:PostAsync) with actor + target + action.",
  },
  {
    topic: "scripter",
    title: "HttpService + webhook logging",
    source: "roblox-api:HttpService",
    source_hash: "api/httpservice/v1",
    content:
      "game:GetService('HttpService'):PostAsync(url, HttpService:JSONEncode({content='...'}), Enum.HttpContentType.ApplicationJson). Requires HttpService.HttpEnabled=true (Game Settings). " +
      "Use for Discord webhooks (moderation logs, purchases, errors). Wrap in pcall + rate-limit — external endpoint failures should never break game logic. NEVER call from client-facing paths.",
  },
  {
    topic: "scripter",
    title: "Anti-teleport / anti-fly detection",
    source: "system:anti-cheat",
    source_hash: "system/anti-cheat/v1",
    content:
      "Server Heartbeat: for each player, check (currentPos - lastPos).Magnitude / dt. If > maxSpeed * 1.5 (accounting for legit dashes) log a violation. Repeat >5 within 10s -> Kick. " +
      "Track vertical velocity for fly detection (sustained Y velocity without jump). Whitelist known ability windows to reduce false positives.",
  },
  {
    topic: "scripter",
    title: "Datastore migrations / schema versions",
    source: "system:datastore-migrations",
    source_hash: "system/datastore-migrations/v1",
    content:
      "Every save has profile.schemaVersion. On load: while profile.schemaVersion < CURRENT do migrations[profile.schemaVersion](profile); profile.schemaVersion += 1 end. " +
      "Migrations table: 1=function(p) p.pets = {} end, 2=function(p) p.stats.mana = p.stats.mana or 100 end. Safe forward evolution without wiping players.",
  },

  // ── World Builder: more environment systems ─────────────────────────
  {
    topic: "world_builder",
    title: "Water: buoyancy + swim",
    source: "system:water",
    source_hash: "system/water/v1",
    content:
      "Terrain water auto-swims. For custom: Region3 detect player HRP inside -> set humanoid.WalkSpeed lower, apply upward VectorForce = mass*gravity + drag. Swap animation set to swim cycle. " +
      "Underwater: Lighting.Ambient tint blue, add ColorCorrection blueish, muffled Sound via SoundGroup low-pass.",
  },
  {
    topic: "world_builder",
    title: "Foliage decoration script",
    source: "system:foliage",
    source_hash: "system/foliage/v1",
    content:
      "for i=1,N do local pos = randomPointInRegion(region); local ray = workspace:Raycast(pos + Vector3.new(0,50,0), Vector3.new(0,-100,0)); if ray and ray.Material == Enum.Material.Grass then clone tree/rock with random rotation end end. " +
      "Use PartCache or spawn as MeshParts with StreamingEnabled. Bake as static — never re-run at runtime.",
  },
  {
    topic: "world_builder",
    title: "Dungeon room generator",
    source: "system:dungeon",
    source_hash: "system/dungeon/v1",
    content:
      "Rooms library: models with numbered Door attachments (Door_N, forward vector). Algorithm: start with Entrance room, pick random room, align its Door attachment to open door of current graph, check no overlap via GetPartBoundsInBox. " +
      "Cap depth. Seal unused doors with wall pieces. Populate enemies + loot per room type (combat/puzzle/treasure).",
  },
  {
    topic: "world_builder",
    title: "Skybox / atmosphere presets",
    source: "system:skybox",
    source_hash: "system/skybox/v1",
    content:
      "Lighting.Sky (Skybox) with 6 face textures, or Lighting.Atmosphere for procedural (Density, Offset, Color, Decay, Glare, Haze). " +
      "Presets: Sunset (Density=0.3, Color=(1,0.7,0.5), Glare=1); Night (Density=0.5, Color=(0.05,0.05,0.1)). Cross-fade via TweenService on Atmosphere properties.",
  },
  {
    topic: "world_builder",
    title: "StreamingEnabled tuning",
    source: "system:streaming",
    source_hash: "system/streaming/v1",
    content:
      "Workspace.StreamingEnabled=true. StreamingMinRadius=64, StreamingTargetRadius=384. Set model.ModelStreamingMode=Atomic for characters/vehicles so they never partially load. " +
      "PersistentPerPlayer for player-owned plots. StreamingIntegrityMode for critical gameplay. Essential for large maps + mobile perf.",
  },

  // ── UI Designer: more UI patterns ───────────────────────────────────
  {
    topic: "ui_designer",
    title: "Dialog box with typewriter",
    source: "system:dialog-ui",
    source_hash: "system/dialog-ui/v1",
    content:
      "Frame bottom-center, Portrait ImageLabel left, TextLabel right. Typewriter: for i=1,#text do label.Text = text:sub(1,i); task.wait(0.02) end. Skip on click fills full text. " +
      "Choice buttons appear after full text. Play blip Sound every 3 chars for classic feel.",
  },
  {
    topic: "ui_designer",
    title: "Inventory grid with drag-drop",
    source: "system:inventory-ui",
    source_hash: "system/inventory-ui/v1",
    content:
      "Grid of slot Frames. Item ImageButton parented into slot. MouseButton1Down: set item.Parent = draggingLayer, follow mouse via RenderStepped. On MouseButton1Up: find slot under mouse, swap or move. " +
      "Server MoveItemRemote(fromSlot,toSlot) — server owns truth, client is optimistic-then-corrected.",
  },
  {
    topic: "ui_designer",
    title: "Minimap / compass",
    source: "system:minimap",
    source_hash: "system/minimap/v1",
    content:
      "ScreenGui top-left Frame square with clipped map ImageLabel. Convert player world (X,Z) to UV via (pos - mapOrigin) / mapSize. Center map on player, or fixed with a player dot. " +
      "Compass: horizontal Frame with tick marks + N/E/S/W labels; scroll based on camera.CFrame.LookVector Y-rotation.",
  },
  {
    topic: "ui_designer",
    title: "Damage indicator (hit direction)",
    source: "system:damage-indicator",
    source_hash: "system/damage-indicator/v1",
    content:
      "On hit: fire DamageTaken to victim's client with attacker position. Compute angle between camera.LookVector and (attackerPos - playerPos). Show red arc arrow at that screen angle from center, fade over 1s. " +
      "Also flash a red vignette (ImageLabel full-screen) with tween Transparency 0.5 -> 1.",
  },
  {
    topic: "ui_designer",
    title: "Floating damage numbers",
    source: "system:damage-numbers",
    source_hash: "system/damage-numbers/v1",
    content:
      "BillboardGui adornee to enemy HRP. Clone TextLabel with damage number, random slight X offset, tween Position Y up + TextTransparency to 1 over 0.8s, then Destroy. " +
      "Color by type: white=normal, yellow=crit (2x size), green=heal. Fire from server via Remote to nearby clients for perf.",
  },
  {
    topic: "ui_designer",
    title: "Quest tracker HUD",
    source: "system:quest-hud",
    source_hash: "system/quest-hud/v1",
    content:
      "Top-right pinned quest Frame. TextLabel title + TextLabel objective 'Kill Zombies (3/10)' + progress bar. Update on QuestProgress remote. " +
      "Pin/unpin via quest log. Blink + play chime on step complete. Slide out and 'Complete!' banner on finish.",
  },
  {
    topic: "ui_designer",
    title: "Killfeed",
    source: "system:killfeed",
    source_hash: "system/killfeed/v1",
    content:
      "Top-right Frame with UIListLayout. On kill event (server -> all clients): clone template row 'AttackerName [WeaponIcon] VictimName', team-colored names, tween in from right. " +
      "Auto-destroy after 5s. Cap to 5 rows visible via destroy-oldest.",
  },
  {
    topic: "ui_designer",
    title: "Settings menu (audio / graphics / bindings)",
    source: "system:settings-ui",
    source_hash: "system/settings-ui/v1",
    content:
      "Tabs: Audio (SoundGroup volume sliders), Graphics (quality preset dropdown -> toggles Bloom/DoF/shadows), Controls (rebindable keys via ContextActionService), Gameplay (FOV slider, sensitivity). " +
      "Save prefs per-player in DataStore. Apply on load and on change. Include 'Reset to defaults' button.",
  },
  {
    topic: "ui_designer",
    title: "Battle pass / season progress UI",
    source: "system:battlepass",
    source_hash: "system/battlepass/v1",
    content:
      "Horizontal ScrollingFrame with tier cards. Each: locked (grey) or unlocked (color) with reward icon. Progress bar between cards fills as XP toward next tier accumulates. " +
      "Free vs Premium row. Claim button on unlocked tiers -> ClaimRemote, server validates + grants + marks claimed in profile.",
  },
];
