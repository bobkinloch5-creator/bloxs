// BloxSmith UI Builder
// ---------------------------------------------------------------------------
// Generates professional Roblox UI as real Instances (not screenshots).
// Every screen is responsive (UIScale + AspectRatioConstraint), mobile-safe
// (44px minimum touch targets, safe-area inset) and gamepad navigable
// (Selectable buttons + GuiService selection groups).

import { SERVICE_ROUTES } from "./roblox-explorer";

export const UI_SCREENS = [
  "main_menu",
  "hud",
  "inventory",
  "shop",
  "settings",
  "daily_rewards",
  "battle_pass",
  "quests",
  "trading",
  "crafting",
  "skill_tree",
  "pets",
  "rebirth",
  "leaderboard",
  "loading",
  "notifications",
  "dialog",
  "popup",
] as const;

export type UiScreen = (typeof UI_SCREENS)[number];

export type UiTheme = {
  name: string;
  bg: string;
  panel: string;
  card: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  danger: string;
  radius: number;
};

export const UI_THEMES: Record<string, UiTheme> = {
  neon: {
    name: "neon",
    bg: "#07080F",
    panel: "#12142099",
    card: "#1B1F32",
    accent: "#6C5CE7",
    accent2: "#00D5FF",
    text: "#FFFFFF",
    muted: "#9AA3C0",
    danger: "#FF5470",
    radius: 14,
  },
  candy: {
    name: "candy",
    bg: "#1A0F22",
    panel: "#2A1636CC",
    card: "#3A1E4A",
    accent: "#FF6FB5",
    accent2: "#FFD166",
    text: "#FFFFFF",
    muted: "#E0B8D8",
    danger: "#FF4D4D",
    radius: 18,
  },
  clean: {
    name: "clean",
    bg: "#0E1116",
    panel: "#161B22E6",
    card: "#1E252F",
    accent: "#2F81F7",
    accent2: "#3FB950",
    text: "#F0F6FC",
    muted: "#8B949E",
    danger: "#F85149",
    radius: 10,
  },
};

export const SCREEN_LABELS: Record<UiScreen, string> = {
  main_menu: "Main Menu",
  hud: "In-game HUD",
  inventory: "Inventory",
  shop: "Shop",
  settings: "Settings",
  daily_rewards: "Daily Rewards",
  battle_pass: "Battle Pass",
  quests: "Quests",
  trading: "Trading",
  crafting: "Crafting",
  skill_tree: "Skill Tree",
  pets: "Pets",
  rebirth: "Rebirth",
  leaderboard: "Leaderboard",
  loading: "Loading Screen",
  notifications: "Notifications",
  dialog: "Dialog",
  popup: "Popup",
};

const SCREEN_KEYWORDS: Array<[RegExp, UiScreen]> = [
  [/\b(main\s*menu|title\s*screen|start\s*screen)\b/i, "main_menu"],
  [/\b(hud|heads?[-\s]?up)\b/i, "hud"],
  [/\b(inventory|backpack)\b/i, "inventory"],
  [/\b(shop|store)\b/i, "shop"],
  [/\b(settings|options)\b/i, "settings"],
  [/\b(daily\s*reward|login\s*streak)\b/i, "daily_rewards"],
  [/\b(battle\s*pass|season\s*pass)\b/i, "battle_pass"],
  [/\b(quest|mission)\b/i, "quests"],
  [/\b(trad(e|ing))\b/i, "trading"],
  [/\b(craft(ing)?)\b/i, "crafting"],
  [/\b(skill\s*tree|talent)\b/i, "skill_tree"],
  [/\b(pets?)\b/i, "pets"],
  [/\b(rebirth|prestige)\b/i, "rebirth"],
  [/\b(leaderboard|scoreboard)\b/i, "leaderboard"],
  [/\b(loading\s*screen|splash)\b/i, "loading"],
  [/\b(notification|toast)\b/i, "notifications"],
  [/\b(dialog(ue)?\s*(box|ui)?)\b/i, "dialog"],
  [/\b(popup|modal|confirm\s*box)\b/i, "popup"],
];

export function detectScreens(prompt: string): UiScreen[] {
  const found = new Set<UiScreen>();
  for (const [re, screen] of SCREEN_KEYWORDS) if (re.test(prompt)) found.add(screen);
  return [...found];
}

function rgb(hex: string): string {
  const clean = hex.replace("#", "");
  const base = clean.length > 6 ? clean.slice(0, 6) : clean;
  const n = parseInt(base, 16);
  return `Color3.fromRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function alpha(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length <= 6) return 0;
  const a = parseInt(clean.slice(6, 8), 16);
  return Number(((255 - a) / 255).toFixed(2));
}

/** Shared runtime helper module every generated screen requires. */
export function buildUiKitModule(theme: UiTheme): string {
  return `--[[
	BloxSmithUI - shared UI kit used by every generated screen.

	Why this exists:
	  * one place to change the theme
	  * responsive scaling for phone / tablet / desktop / console
	  * 44px minimum touch targets and gamepad Selectable wiring
]]
local GuiService = game:GetService("GuiService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local UI = {}

UI.Theme = {
	bg = ${rgb(theme.bg)},
	panel = ${rgb(theme.panel)},
	panelTransparency = ${alpha(theme.panel)},
	card = ${rgb(theme.card)},
	accent = ${rgb(theme.accent)},
	accent2 = ${rgb(theme.accent2)},
	text = ${rgb(theme.text)},
	muted = ${rgb(theme.muted)},
	danger = ${rgb(theme.danger)},
	radius = ${theme.radius},
	font = Enum.Font.GothamMedium,
	fontBold = Enum.Font.GothamBold,
}

function UI.isTouch()
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

function UI.isConsole()
	return GuiService:IsTenFootInterface()
end

-- Responsive scale: phones get bigger controls, TVs get bigger everything.
function UI.attachScale(root)
	local scale = root:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
	scale.Parent = root
	local function update()
		local viewport = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
		local base = math.min(viewport.X / 1280, viewport.Y / 720)
		local boost = UI.isConsole() and 1.25 or (UI.isTouch() and 1.12 or 1)
		scale.Scale = math.clamp(base * boost, 0.62, 1.6)
	end
	update()
	if workspace.CurrentCamera then
		workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(update)
	end
	return scale
end

function UI.corner(parent, radius)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius or UI.Theme.radius)
	corner.Parent = parent
	return corner
end

function UI.padding(parent, amount)
	local padding = Instance.new("UIPadding")
	local offset = UDim.new(0, amount or 12)
	padding.PaddingTop, padding.PaddingBottom = offset, offset
	padding.PaddingLeft, padding.PaddingRight = offset, offset
	padding.Parent = parent
	return padding
end

function UI.stroke(parent, color, thickness)
	local stroke = Instance.new("UIStroke")
	stroke.Color = color or UI.Theme.accent
	stroke.Thickness = thickness or 1
	stroke.Transparency = 0.4
	stroke.Parent = parent
	return stroke
end

function UI.gradient(parent, from, to, rotation)
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(from or UI.Theme.accent, to or UI.Theme.accent2)
	gradient.Rotation = rotation or 25
	gradient.Parent = parent
	return gradient
end

function UI.screen(name, displayOrder)
	local gui = Instance.new("ScreenGui")
	gui.Name = name
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.DisplayOrder = displayOrder or 10
	gui.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets
	return gui
end

function UI.panel(parent, name, size, position)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.Size = size or UDim2.fromScale(0.6, 0.7)
	frame.Position = position or UDim2.fromScale(0.5, 0.5)
	frame.AnchorPoint = Vector2.new(0.5, 0.5)
	frame.BackgroundColor3 = UI.Theme.panel
	frame.BackgroundTransparency = UI.Theme.panelTransparency
	frame.BorderSizePixel = 0
	frame.Parent = parent
	UI.corner(frame, UI.Theme.radius + 4)
	UI.stroke(frame, UI.Theme.accent, 1.5)
	return frame
end

function UI.label(parent, text, size, position, options)
	options = options or {}
	local label = Instance.new("TextLabel")
	label.Name = options.name or "Label"
	label.Text = text
	label.Size = size
	label.Position = position
	label.BackgroundTransparency = 1
	label.TextColor3 = options.muted and UI.Theme.muted or UI.Theme.text
	label.Font = options.bold and UI.Theme.fontBold or UI.Theme.font
	label.TextScaled = options.scaled ~= false
	label.TextXAlignment = options.align or Enum.TextXAlignment.Left
	label.Parent = parent
	if options.scaled ~= false then
		local constraint = Instance.new("UITextSizeConstraint")
		constraint.MaxTextSize = options.maxTextSize or 28
		constraint.MinTextSize = 10
		constraint.Parent = label
	end
	return label
end

-- Buttons are always at least 44px tall: Roblox mobile guideline.
function UI.button(parent, text, size, position, options)
	options = options or {}
	local button = Instance.new("TextButton")
	button.Name = options.name or (text:gsub("%W", "") .. "Button")
	button.Text = text
	button.Size = size or UDim2.new(1, 0, 0, 48)
	button.Position = position
	button.BackgroundColor3 = options.secondary and UI.Theme.card or UI.Theme.accent
	button.TextColor3 = UI.Theme.text
	button.Font = UI.Theme.fontBold
	button.TextScaled = true
	button.AutoButtonColor = true
	button.BorderSizePixel = 0
	button.Selectable = true
	button.Parent = parent

	local minSize = Instance.new("UISizeConstraint")
	minSize.MinSize = Vector2.new(88, 44)
	minSize.Parent = button

	UI.corner(button, UI.Theme.radius)
	if not options.secondary then
		UI.gradient(button)
	end

	local textConstraint = Instance.new("UITextSizeConstraint")
	textConstraint.MaxTextSize = 24
	textConstraint.MinTextSize = 12
	textConstraint.Parent = button

	button.MouseEnter:Connect(function()
		TweenService:Create(button, TweenInfo.new(0.12), { BackgroundTransparency = 0.15 }):Play()
	end)
	button.MouseLeave:Connect(function()
		TweenService:Create(button, TweenInfo.new(0.12), { BackgroundTransparency = 0 }):Play()
	end)

	if options.onClick then
		button.Activated:Connect(options.onClick)
	end
	return button
end

function UI.list(parent, padding, horizontal)
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, padding or 8)
	layout.FillDirection = horizontal and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = parent
	return layout
end

function UI.grid(parent, cellSize, padding)
	local layout = Instance.new("UIGridLayout")
	layout.CellSize = cellSize or UDim2.fromOffset(96, 96)
	layout.CellPadding = UDim2.fromOffset(padding or 10, padding or 10)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = parent
	return layout
end

function UI.scroller(parent, name, size, position)
	local scroller = Instance.new("ScrollingFrame")
	scroller.Name = name
	scroller.Size = size or UDim2.fromScale(1, 1)
	scroller.Position = position or UDim2.fromScale(0, 0)
	scroller.BackgroundTransparency = 1
	scroller.BorderSizePixel = 0
	scroller.ScrollBarThickness = 6
	scroller.ScrollBarImageTransparency = 0.4
	scroller.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroller.CanvasSize = UDim2.new()
	scroller.Parent = parent
	return scroller
end

-- Gamepad: make the first button the default selection when a panel opens.
function UI.bindGamepad(panel)
	panel:GetPropertyChangedSignal("Visible"):Connect(function()
		if panel.Visible then
			for _, descendant in ipairs(panel:GetDescendants()) do
				if descendant:IsA("GuiButton") and descendant.Visible then
					GuiService.SelectedObject = descendant
					break
				end
			end
		elseif GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(panel) then
			GuiService.SelectedObject = nil
		end
	end)
end

function UI.fade(instance, transparency, seconds)
	TweenService:Create(instance, TweenInfo.new(seconds or 0.25, Enum.EasingStyle.Quad), {
		BackgroundTransparency = transparency,
	}):Play()
end

return UI`;
}

type ScreenBuilder = { title: string; body: string; displayOrder: number };

const SCREEN_BUILDERS: Record<UiScreen, ScreenBuilder> = {
  main_menu: {
    title: "Main Menu",
    displayOrder: 50,
    body: `	local panel = UI.panel(gui, "MainMenu", UDim2.fromScale(0.46, 0.62))
	UI.padding(panel, 18)
	UI.label(panel, GAME_TITLE, UDim2.new(1, 0, 0, 56), UDim2.fromScale(0, 0), { bold = true, align = Enum.TextXAlignment.Center, maxTextSize = 44 })

	local buttons = Instance.new("Frame")
	buttons.Name = "Buttons"
	buttons.BackgroundTransparency = 1
	buttons.Size = UDim2.new(1, 0, 1, -70)
	buttons.Position = UDim2.fromOffset(0, 70)
	buttons.Parent = panel
	UI.list(buttons, 10)

	for index, entry in ipairs({
		{ text = "Play", panel = nil },
		{ text = "Shop", panel = "Shop" },
		{ text = "Inventory", panel = "Inventory" },
		{ text = "Settings", panel = "Settings" },
	}) do
		local button = UI.button(buttons, entry.text, UDim2.new(1, 0, 0, 52), nil, { secondary = index > 1 })
		button.LayoutOrder = index
		button.Activated:Connect(function()
			if entry.panel then
				BloxSmithUI.open(entry.panel)
			else
				panel.Visible = false
			end
		end)
	end
	UI.bindGamepad(panel)`,
  },
  hud: {
    title: "HUD",
    displayOrder: 5,
    body: `	local hud = Instance.new("Frame")
	hud.Name = "HUD"
	hud.Size = UDim2.fromScale(1, 1)
	hud.BackgroundTransparency = 1
	hud.Parent = gui

	local stats = UI.panel(hud, "Stats", UDim2.new(0, 240, 0, 72), UDim2.new(0, 140, 0, 52))
	stats.AnchorPoint = Vector2.new(0.5, 0.5)
	UI.padding(stats, 10)
	local coins = UI.label(stats, "Coins: 0", UDim2.new(1, 0, 0.5, 0), UDim2.fromScale(0, 0), { bold = true, name = "Coins" })
	local level = UI.label(stats, "Level 1", UDim2.new(1, 0, 0.5, 0), UDim2.fromScale(0, 0.5), { muted = true, name = "Level" })

	local quickBar = Instance.new("Frame")
	quickBar.Name = "QuickBar"
	quickBar.AnchorPoint = Vector2.new(0.5, 1)
	quickBar.Position = UDim2.new(0.5, 0, 1, -18)
	quickBar.Size = UDim2.new(0, 380, 0, 56)
	quickBar.BackgroundTransparency = 1
	quickBar.Parent = hud
	UI.list(quickBar, 8, true)

	for _, entry in ipairs({ "Shop", "Inventory", "Quests", "Pets" }) do
		local button = UI.button(quickBar, entry, UDim2.new(0, 88, 1, 0), nil, { secondary = true })
		button.Activated:Connect(function()
			BloxSmithUI.toggle(entry)
		end)
	end

	local leaderstats = player:WaitForChild("leaderstats", 10)
	if leaderstats then
		local coinValue = leaderstats:FindFirstChild("Coins")
		if coinValue then
			local function sync()
				coins.Text = ("Coins: %d"):format(coinValue.Value)
			end
			coinValue.Changed:Connect(sync)
			sync()
		end
	end`,
  },
  inventory: {
    title: "Inventory",
    displayOrder: 40,
    body: `	local panel = UI.panel(gui, "Inventory", UDim2.fromScale(0.62, 0.68))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Inventory", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local grid = UI.scroller(panel, "Slots", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.grid(grid, UDim2.fromOffset(92, 92), 10)

	local function render(items)
		for _, child in ipairs(grid:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
		for index, item in ipairs(items or {}) do
			local slot = Instance.new("TextButton")
			slot.Name = "Slot" .. index
			slot.BackgroundColor3 = UI.Theme.card
			slot.Text = ("%s\\nx%d"):format(tostring(item.id), item.count or 1)
			slot.TextColor3 = UI.Theme.text
			slot.Font = UI.Theme.font
			slot.TextScaled = true
			slot.Selectable = true
			slot.BorderSizePixel = 0
			slot.LayoutOrder = index
			slot.Parent = grid
			UI.corner(slot, 10)
		end
	end

	render({})
	local changed = BloxSmithUI.remote("InventoryChanged")
	if changed then
		changed.OnClientEvent:Connect(render)
	end
	UI.bindGamepad(panel)`,
  },
  shop: {
    title: "Shop",
    displayOrder: 40,
    body: `	local panel = UI.panel(gui, "Shop", UDim2.fromScale(0.62, 0.7))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Shop", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local list = UI.scroller(panel, "Items", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.list(list, 8)

	local CATALOG = {
		{ id = "speed_boost", label = "Speed Boost", price = 250 },
		{ id = "lucky_charm", label = "Lucky Charm", price = 1200 },
		{ id = "starter_pet", label = "Starter Pet", price = 2500 },
	}

	for index, item in ipairs(CATALOG) do
		local row = Instance.new("Frame")
		row.Name = item.id
		row.Size = UDim2.new(1, 0, 0, 64)
		row.BackgroundColor3 = UI.Theme.card
		row.BorderSizePixel = 0
		row.LayoutOrder = index
		row.Parent = list
		UI.corner(row, 10)
		UI.padding(row, 10)
		UI.label(row, item.label, UDim2.new(0.5, 0, 1, 0), UDim2.fromScale(0, 0), { bold = true })
		UI.label(row, ("%d coins"):format(item.price), UDim2.new(0.25, 0, 1, 0), UDim2.fromScale(0.5, 0), { muted = true })
		local buy = UI.button(row, "Buy", UDim2.new(0.22, 0, 0.8, 0), UDim2.fromScale(0.76, 0.1))
		buy.Activated:Connect(function()
			BloxSmithUI.fire("ShopPurchase", item.id)
		end)
	end
	UI.bindGamepad(panel)`,
  },
  settings: {
    title: "Settings",
    displayOrder: 60,
    body: `	local panel = UI.panel(gui, "Settings", UDim2.fromScale(0.44, 0.56))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Settings", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local rows = Instance.new("Frame")
	rows.BackgroundTransparency = 1
	rows.Size = UDim2.new(1, 0, 1, -56)
	rows.Position = UDim2.fromOffset(0, 52)
	rows.Parent = panel
	UI.list(rows, 10)

	local function slider(name, initial, onChange)
		local row = Instance.new("Frame")
		row.Size = UDim2.new(1, 0, 0, 56)
		row.BackgroundColor3 = UI.Theme.card
		row.BorderSizePixel = 0
		row.Parent = rows
		UI.corner(row, 10)
		UI.padding(row, 10)
		UI.label(row, name, UDim2.new(0.4, 0, 1, 0), UDim2.fromScale(0, 0))
		local track = Instance.new("TextButton")
		track.Text = ""
		track.AutoButtonColor = false
		track.Size = UDim2.new(0.55, 0, 0, 14)
		track.Position = UDim2.new(0.42, 0, 0.5, -7)
		track.BackgroundColor3 = UI.Theme.bg
		track.BorderSizePixel = 0
		track.Selectable = true
		track.Parent = row
		UI.corner(track, 7)
		local fill = Instance.new("Frame")
		fill.Size = UDim2.fromScale(initial, 1)
		fill.BackgroundColor3 = UI.Theme.accent
		fill.BorderSizePixel = 0
		fill.Parent = track
		UI.corner(fill, 7)
		track.Activated:Connect(function()
			local mouse = UserInputService:GetMouseLocation()
			local ratio = math.clamp((mouse.X - track.AbsolutePosition.X) / math.max(track.AbsoluteSize.X, 1), 0, 1)
			fill.Size = UDim2.fromScale(ratio, 1)
			onChange(ratio)
		end)
	end

	slider("Music", 0.5, function(value)
		BloxSmithUI.fire("SettingsChanged", "music", value)
	end)
	slider("SFX", 0.7, function(value)
		BloxSmithUI.fire("SettingsChanged", "sfx", value)
	end)

	local quality = UI.button(rows, "Graphics: Auto", UDim2.new(1, 0, 0, 52), nil, { secondary = true })
	local modes = { "auto", "low", "high" }
	local current = 1
	quality.Activated:Connect(function()
		current = current % #modes + 1
		quality.Text = "Graphics: " .. modes[current]:upper()
		BloxSmithUI.fire("SettingsChanged", "quality", modes[current])
	end)
	UI.bindGamepad(panel)`,
  },
  daily_rewards: {
    title: "Daily Rewards",
    displayOrder: 45,
    body: `	local panel = UI.panel(gui, "DailyRewards", UDim2.fromScale(0.6, 0.5))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Daily Rewards", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local strip = Instance.new("Frame")
	strip.BackgroundTransparency = 1
	strip.Size = UDim2.new(1, 0, 0, 110)
	strip.Position = UDim2.fromOffset(0, 56)
	strip.Parent = panel
	UI.list(strip, 8, true)

	for day = 1, 7 do
		local card = Instance.new("Frame")
		card.Size = UDim2.new(0, 92, 1, 0)
		card.BackgroundColor3 = UI.Theme.card
		card.BorderSizePixel = 0
		card.LayoutOrder = day
		card.Parent = strip
		UI.corner(card, 10)
		UI.label(card, ("Day %d"):format(day), UDim2.new(1, 0, 0.4, 0), UDim2.fromScale(0, 0.05), { align = Enum.TextXAlignment.Center, bold = true })
		UI.label(card, ("%d coins"):format(day * 150), UDim2.new(1, 0, 0.4, 0), UDim2.fromScale(0, 0.5), { align = Enum.TextXAlignment.Center, muted = true })
	end

	local claim = UI.button(panel, "Claim", UDim2.new(0.5, 0, 0, 52), UDim2.new(0.25, 0, 1, -68))
	claim.Activated:Connect(function()
		BloxSmithUI.fire("ClaimDailyReward")
	end)
	UI.bindGamepad(panel)`,
  },
  battle_pass: {
    title: "Battle Pass",
    displayOrder: 45,
    body: `	local panel = UI.panel(gui, "BattlePass", UDim2.fromScale(0.72, 0.6))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Battle Pass", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local track = UI.scroller(panel, "Tiers", UDim2.new(1, 0, 0, 160), UDim2.fromOffset(0, 60))
	track.AutomaticCanvasSize = Enum.AutomaticSize.X
	track.ScrollingDirection = Enum.ScrollingDirection.X
	UI.list(track, 8, true)

	for tier = 1, 20 do
		local card = Instance.new("Frame")
		card.Size = UDim2.fromOffset(110, 150)
		card.BackgroundColor3 = UI.Theme.card
		card.BorderSizePixel = 0
		card.LayoutOrder = tier
		card.Parent = track
		UI.corner(card, 10)
		UI.label(card, ("Tier %d"):format(tier), UDim2.new(1, 0, 0, 30), UDim2.fromScale(0, 0.04), { align = Enum.TextXAlignment.Center, bold = true })
		UI.label(card, tier % 5 == 0 and "Legendary" or "Coins", UDim2.new(1, 0, 0, 28), UDim2.fromScale(0, 0.6), { align = Enum.TextXAlignment.Center, muted = true })
	end

	UI.button(panel, "Unlock Premium", UDim2.new(0.45, 0, 0, 52), UDim2.new(0.275, 0, 1, -68))
	UI.bindGamepad(panel)`,
  },
  quests: {
    title: "Quests",
    displayOrder: 40,
    body: `	local panel = UI.panel(gui, "Quests", UDim2.fromScale(0.55, 0.65))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Quests", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local list = UI.scroller(panel, "QuestList", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.list(list, 8)

	local function render(quests)
		for _, child in ipairs(list:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
		for index, quest in ipairs(quests or {}) do
			local row = Instance.new("Frame")
			row.Size = UDim2.new(1, 0, 0, 74)
			row.BackgroundColor3 = UI.Theme.card
			row.BorderSizePixel = 0
			row.LayoutOrder = index
			row.Parent = list
			UI.corner(row, 10)
			UI.padding(row, 10)
			UI.label(row, quest.label or "Quest", UDim2.new(0.7, 0, 0, 24), UDim2.fromScale(0, 0), { bold = true })
			UI.label(row, quest.description or "", UDim2.new(0.7, 0, 0, 22), UDim2.fromScale(0, 0.45), { muted = true })
			local claim = UI.button(row, quest.completed and "Claim" or "Track", UDim2.new(0.24, 0, 0.7, 0), UDim2.fromScale(0.74, 0.15), { secondary = not quest.completed })
			claim.Activated:Connect(function()
				BloxSmithUI.fire("QuestAction", quest.id, quest.completed and "claim" or "track")
			end)
		end
	end

	render({ { id = "welcome", label = "Getting Started", description = "Collect 10 coins" } })
	local updates = BloxSmithUI.remote("QuestsChanged")
	if updates then
		updates.OnClientEvent:Connect(render)
	end
	UI.bindGamepad(panel)`,
  },
  trading: {
    title: "Trading",
    displayOrder: 55,
    body: `	local panel = UI.panel(gui, "Trading", UDim2.fromScale(0.68, 0.6))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Trade", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local function side(name, x)
		local frame = Instance.new("Frame")
		frame.Name = name
		frame.Size = UDim2.new(0.47, 0, 1, -120)
		frame.Position = UDim2.new(x, 0, 0, 56)
		frame.BackgroundColor3 = UI.Theme.card
		frame.BorderSizePixel = 0
		frame.Parent = panel
		UI.corner(frame, 10)
		UI.padding(frame, 10)
		UI.label(frame, name, UDim2.new(1, 0, 0, 26), UDim2.fromScale(0, 0), { bold = true, align = Enum.TextXAlignment.Center })
		local slots = UI.scroller(frame, "Offer", UDim2.new(1, 0, 1, -32), UDim2.fromOffset(0, 30))
		UI.grid(slots, UDim2.fromOffset(70, 70), 8)
		return frame
	end

	side("You", 0.01)
	side("Partner", 0.52)

	local confirm = UI.button(panel, "Confirm Trade", UDim2.new(0.4, 0, 0, 52), UDim2.new(0.05, 0, 1, -64))
	confirm.Activated:Connect(function()
		BloxSmithUI.fire("TradeAction", "confirm")
	end)
	local cancel = UI.button(panel, "Cancel", UDim2.new(0.4, 0, 0, 52), UDim2.new(0.55, 0, 1, -64), { secondary = true })
	cancel.Activated:Connect(function()
		BloxSmithUI.fire("TradeAction", "cancel")
		panel.Visible = false
	end)
	UI.bindGamepad(panel)`,
  },
  crafting: {
    title: "Crafting",
    displayOrder: 40,
    body: `	local panel = UI.panel(gui, "Crafting", UDim2.fromScale(0.6, 0.62))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Crafting", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local list = UI.scroller(panel, "Recipes", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.list(list, 8)

	for index, recipe in ipairs({
		{ id = "bread", label = "Bread", cost = "3x Wheat" },
		{ id = "iron_pickaxe", label = "Iron Pickaxe", cost = "3x Iron, 5x Stone" },
	}) do
		local row = Instance.new("Frame")
		row.Size = UDim2.new(1, 0, 0, 66)
		row.BackgroundColor3 = UI.Theme.card
		row.BorderSizePixel = 0
		row.LayoutOrder = index
		row.Parent = list
		UI.corner(row, 10)
		UI.padding(row, 10)
		UI.label(row, recipe.label, UDim2.new(0.5, 0, 0, 24), UDim2.fromScale(0, 0), { bold = true })
		UI.label(row, recipe.cost, UDim2.new(0.5, 0, 0, 22), UDim2.fromScale(0, 0.5), { muted = true })
		local craft = UI.button(row, "Craft", UDim2.new(0.24, 0, 0.7, 0), UDim2.fromScale(0.74, 0.15))
		craft.Activated:Connect(function()
			BloxSmithUI.fire("CraftItem", recipe.id)
		end)
	end
	UI.bindGamepad(panel)`,
  },
  skill_tree: {
    title: "Skill Tree",
    displayOrder: 45,
    body: `	local panel = UI.panel(gui, "SkillTree", UDim2.fromScale(0.66, 0.66))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Skills", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local board = UI.scroller(panel, "Nodes", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.grid(board, UDim2.fromOffset(120, 120), 12)

	for index, skill in ipairs({
		{ id = "vitality", label = "Vitality" },
		{ id = "swiftness", label = "Swiftness" },
		{ id = "berserk", label = "Berserk" },
	}) do
		local node = Instance.new("TextButton")
		node.Name = skill.id
		node.Text = skill.label
		node.TextColor3 = UI.Theme.text
		node.Font = UI.Theme.fontBold
		node.TextScaled = true
		node.BackgroundColor3 = UI.Theme.card
		node.BorderSizePixel = 0
		node.Selectable = true
		node.LayoutOrder = index
		node.Parent = board
		UI.corner(node, 14)
		UI.stroke(node, UI.Theme.accent2, 1)
		node.Activated:Connect(function()
			BloxSmithUI.fire("UnlockSkill", skill.id)
		end)
	end
	UI.bindGamepad(panel)`,
  },
  pets: {
    title: "Pets",
    displayOrder: 45,
    body: `	local panel = UI.panel(gui, "Pets", UDim2.fromScale(0.6, 0.64))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Pets", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 32 })
	BloxSmithUI.closeButton(panel)

	local grid = UI.scroller(panel, "Owned", UDim2.new(1, 0, 1, -120), UDim2.fromOffset(0, 52))
	UI.grid(grid, UDim2.fromOffset(104, 104), 10)

	local hatch = UI.button(panel, "Hatch Egg (500)", UDim2.new(0.5, 0, 0, 52), UDim2.new(0.25, 0, 1, -62))
	hatch.Activated:Connect(function()
		BloxSmithUI.fire("HatchEgg", "basic")
	end)

	local updates = BloxSmithUI.remote("PetsChanged")
	if updates then
		updates.OnClientEvent:Connect(function(pets)
			for _, child in ipairs(grid:GetChildren()) do
				if child:IsA("GuiObject") then
					child:Destroy()
				end
			end
			for index, pet in ipairs(pets or {}) do
				local card = Instance.new("TextButton")
				card.Text = tostring(pet.id) .. (pet.equipped and "\\n[E]" or "")
				card.TextScaled = true
				card.Font = UI.Theme.font
				card.TextColor3 = UI.Theme.text
				card.BackgroundColor3 = pet.equipped and UI.Theme.accent or UI.Theme.card
				card.BorderSizePixel = 0
				card.Selectable = true
				card.LayoutOrder = index
				card.Parent = grid
				UI.corner(card, 12)
				card.Activated:Connect(function()
					BloxSmithUI.fire("EquipPet", pet.uid)
				end)
			end
		end)
	end
	UI.bindGamepad(panel)`,
  },
  rebirth: {
    title: "Rebirth",
    displayOrder: 50,
    body: `	local panel = UI.panel(gui, "Rebirth", UDim2.fromScale(0.42, 0.42))
	panel.Visible = false
	UI.padding(panel, 18)
	UI.label(panel, "Rebirth", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 34 })
	BloxSmithUI.closeButton(panel)
	UI.label(panel, "Reset your coins for a permanent multiplier.", UDim2.new(1, 0, 0, 48), UDim2.fromOffset(0, 56), { muted = true, scaled = true })
	local confirm = UI.button(panel, "Rebirth Now", UDim2.new(0.7, 0, 0, 54), UDim2.new(0.15, 0, 1, -70))
	confirm.Activated:Connect(function()
		BloxSmithUI.fire("Rebirth")
	end)
	UI.bindGamepad(panel)`,
  },
  leaderboard: {
    title: "Leaderboard",
    displayOrder: 40,
    body: `	local panel = UI.panel(gui, "Leaderboard", UDim2.fromScale(0.4, 0.62))
	panel.Visible = false
	UI.padding(panel, 16)
	UI.label(panel, "Top Players", UDim2.new(1, -48, 0, 40), UDim2.fromScale(0, 0), { bold = true, maxTextSize = 30 })
	BloxSmithUI.closeButton(panel)

	local list = UI.scroller(panel, "Rows", UDim2.new(1, 0, 1, -56), UDim2.fromOffset(0, 52))
	UI.list(list, 6)

	local updates = BloxSmithUI.remote("LeaderboardChanged")
	local function render(rows)
		for _, child in ipairs(list:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
		for _, entry in ipairs(rows or {}) do
			local row = Instance.new("Frame")
			row.Size = UDim2.new(1, 0, 0, 44)
			row.BackgroundColor3 = UI.Theme.card
			row.BorderSizePixel = 0
			row.LayoutOrder = entry.rank or 1
			row.Parent = list
			UI.corner(row, 8)
			UI.padding(row, 8)
			UI.label(row, ("#%d"):format(entry.rank or 0), UDim2.new(0.18, 0, 1, 0), UDim2.fromScale(0, 0), { bold = true })
			UI.label(row, tostring(entry.name or entry.userId or "Player"), UDim2.new(0.5, 0, 1, 0), UDim2.fromScale(0.2, 0))
			UI.label(row, tostring(entry.value or 0), UDim2.new(0.28, 0, 1, 0), UDim2.fromScale(0.72, 0), { muted = true, align = Enum.TextXAlignment.Right })
		end
	end

	render({})
	if updates then
		updates.OnClientEvent:Connect(render)
	end
	UI.bindGamepad(panel)`,
  },
  loading: {
    title: "Loading",
    displayOrder: 100,
    body: `	local ContentProvider = game:GetService("ContentProvider")
	local TweenService = game:GetService("TweenService")

	local cover = Instance.new("Frame")
	cover.Name = "LoadingScreen"
	cover.Size = UDim2.fromScale(1, 1)
	cover.BackgroundColor3 = UI.Theme.bg
	cover.BorderSizePixel = 0
	cover.Parent = gui

	UI.label(cover, GAME_TITLE, UDim2.new(0.8, 0, 0, 70), UDim2.new(0.1, 0, 0.34, 0), { bold = true, align = Enum.TextXAlignment.Center, maxTextSize = 56 })
	local status = UI.label(cover, "Loading assets...", UDim2.new(0.8, 0, 0, 28), UDim2.new(0.1, 0, 0.52, 0), { muted = true, align = Enum.TextXAlignment.Center })

	local track = Instance.new("Frame")
	track.Size = UDim2.new(0.5, 0, 0, 12)
	track.Position = UDim2.new(0.25, 0, 0.6, 0)
	track.BackgroundColor3 = UI.Theme.card
	track.BorderSizePixel = 0
	track.Parent = cover
	UI.corner(track, 6)

	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(0, 1)
	fill.BackgroundColor3 = UI.Theme.accent
	fill.BorderSizePixel = 0
	fill.Parent = track
	UI.corner(fill, 6)
	UI.gradient(fill)

	task.spawn(function()
		local assets = game:GetDescendants()
		local total = math.min(#assets, 300)
		for index = 1, total, 25 do
			local slice = table.move(assets, index, math.min(index + 24, total), 1, {})
			pcall(function()
				ContentProvider:PreloadAsync(slice)
			end)
			fill.Size = UDim2.fromScale(index / total, 1)
			status.Text = ("Loading assets... %d%%"):format(math.floor(index / total * 100))
			task.wait()
		end
		fill.Size = UDim2.fromScale(1, 1)
		status.Text = "Ready"
		task.wait(0.3)
		TweenService:Create(cover, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()
		for _, descendant in ipairs(cover:GetDescendants()) do
			if descendant:IsA("TextLabel") then
				TweenService:Create(descendant, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
			elseif descendant:IsA("Frame") then
				TweenService:Create(descendant, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()
			end
		end
		task.wait(0.6)
		cover:Destroy()
	end)`,
  },
  notifications: {
    title: "Notifications",
    displayOrder: 90,
    body: `	local TweenService = game:GetService("TweenService")

	local stack = Instance.new("Frame")
	stack.Name = "Notifications"
	stack.AnchorPoint = Vector2.new(1, 0)
	stack.Position = UDim2.new(1, -18, 0, 18)
	stack.Size = UDim2.fromOffset(300, 400)
	stack.BackgroundTransparency = 1
	stack.Parent = gui
	UI.list(stack, 8)

	local function notify(text, kind)
		local toast = Instance.new("Frame")
		toast.Size = UDim2.new(1, 0, 0, 56)
		toast.BackgroundColor3 = kind == "error" and UI.Theme.danger or UI.Theme.card
		toast.BackgroundTransparency = 1
		toast.BorderSizePixel = 0
		toast.Parent = stack
		UI.corner(toast, 10)
		UI.padding(toast, 10)
		local label = UI.label(toast, text, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0))
		label.TextTransparency = 1
		TweenService:Create(toast, TweenInfo.new(0.2), { BackgroundTransparency = 0.05 }):Play()
		TweenService:Create(label, TweenInfo.new(0.2), { TextTransparency = 0 }):Play()
		task.delay(3.2, function()
			TweenService:Create(toast, TweenInfo.new(0.25), { BackgroundTransparency = 1 }):Play()
			TweenService:Create(label, TweenInfo.new(0.25), { TextTransparency = 1 }):Play()
			task.wait(0.3)
			toast:Destroy()
		end)
	end

	BloxSmithUI.notify = notify
	local remote = BloxSmithUI.remote("Notify")
	if remote then
		remote.OnClientEvent:Connect(notify)
	end`,
  },
  dialog: {
    title: "Dialog",
    displayOrder: 70,
    body: `	local panel = UI.panel(gui, "Dialog", UDim2.new(0.6, 0, 0, 190), UDim2.new(0.5, 0, 1, -140))
	panel.AnchorPoint = Vector2.new(0.5, 1)
	panel.Visible = false
	UI.padding(panel, 14)
	local speaker = UI.label(panel, "NPC", UDim2.new(1, 0, 0, 26), UDim2.fromScale(0, 0), { bold = true, name = "Speaker" })
	local body = UI.label(panel, "...", UDim2.new(1, 0, 0, 70), UDim2.fromOffset(0, 30), { name = "Body", scaled = true })

	local choices = Instance.new("Frame")
	choices.Name = "Choices"
	choices.BackgroundTransparency = 1
	choices.Size = UDim2.new(1, 0, 0, 56)
	choices.Position = UDim2.new(0, 0, 1, -60)
	choices.Parent = panel
	UI.list(choices, 8, true)

	function BloxSmithUI.dialog(name, text, options)
		speaker.Text = name
		body.Text = text
		for _, child in ipairs(choices:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
		for index, option in ipairs(options or { { label = "Continue" } }) do
			local button = UI.button(choices, option.label, UDim2.new(0, 150, 1, 0), nil, { secondary = index > 1 })
			button.Activated:Connect(function()
				panel.Visible = false
				if option.id then
					BloxSmithUI.fire("DialogChoice", option.id)
				end
			end)
		end
		panel.Visible = true
	end
	UI.bindGamepad(panel)`,
  },
  popup: {
    title: "Popup",
    displayOrder: 80,
    body: `	local shade = Instance.new("Frame")
	shade.Name = "PopupShade"
	shade.Size = UDim2.fromScale(1, 1)
	shade.BackgroundColor3 = Color3.new(0, 0, 0)
	shade.BackgroundTransparency = 0.45
	shade.Visible = false
	shade.BorderSizePixel = 0
	shade.Parent = gui

	local panel = UI.panel(shade, "Popup", UDim2.new(0, 380, 0, 200))
	UI.padding(panel, 16)
	local title = UI.label(panel, "Are you sure?", UDim2.new(1, 0, 0, 32), UDim2.fromScale(0, 0), { bold = true, align = Enum.TextXAlignment.Center })
	local body = UI.label(panel, "", UDim2.new(1, 0, 0, 56), UDim2.fromOffset(0, 40), { muted = true, align = Enum.TextXAlignment.Center })

	local row = Instance.new("Frame")
	row.BackgroundTransparency = 1
	row.Size = UDim2.new(1, 0, 0, 52)
	row.Position = UDim2.new(0, 0, 1, -56)
	row.Parent = panel
	UI.list(row, 10, true)

	local confirmButton = UI.button(row, "Confirm", UDim2.new(0, 160, 1, 0))
	local cancelButton = UI.button(row, "Cancel", UDim2.new(0, 160, 1, 0), nil, { secondary = true })

	function BloxSmithUI.confirm(headline, detail, onConfirm)
		title.Text = headline
		body.Text = detail or ""
		shade.Visible = true
		local connections = {}
		local function close(result)
			shade.Visible = false
			for _, connection in ipairs(connections) do
				connection:Disconnect()
			end
			if result and onConfirm then
				onConfirm()
			end
		end
		table.insert(connections, confirmButton.Activated:Connect(function()
			close(true)
		end))
		table.insert(connections, cancelButton.Activated:Connect(function()
			close(false)
		end))
	end
	UI.bindGamepad(panel)`,
  },
};

export type UiBuildOptions = {
  screens: UiScreen[];
  theme?: string;
  gameTitle?: string;
};

/** The single client controller that builds every requested screen. */
export function buildUiControllerSource(options: UiBuildOptions): string {
  const screens = options.screens.filter((screen) => UI_SCREENS.includes(screen));
  const title = (options.gameTitle || "BloxSmith Game").replace(/["\\]/g, "");

  const sections = screens.map((screen) => {
    const builder = SCREEN_BUILDERS[screen];
    return [
      `-- ${SCREEN_LABELS[screen]} ------------------------------------------------`,
      `do`,
      `\tlocal gui = UI.screen("BloxSmith_${screen}", ${builder.displayOrder})`,
      `\tgui.Parent = playerGui`,
      `\tUI.attachScale(gui)`,
      builder.body,
      `\tBloxSmithUI.register("${SCREEN_LABELS[screen].replace(/\s/g, "")}", gui)`,
      `end`,
      "",
    ].join("\n");
  });

  return [
    "--[[",
    "\tBloxSmith UI Controller",
    `\tScreens: ${screens.map((s) => SCREEN_LABELS[s]).join(", ")}`,
    "",
    "\tEverything here is client-side presentation only. All state changes go",
    "\tthrough RemoteEvents so the server stays authoritative.",
    "]]",
    'local Players = game:GetService("Players")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local UserInputService = game:GetService("UserInputService")',
    "",
    "local player = Players.LocalPlayer",
    'local playerGui = player:WaitForChild("PlayerGui")',
    'local modules = ReplicatedStorage:WaitForChild("BloxSmith"):WaitForChild("Modules")',
    'local UI = require(modules:WaitForChild("BloxSmithUI"))',
    "",
    `local GAME_TITLE = "${title}"`,
    "",
    "local BloxSmithUI = { panels = {} }",
    "",
    "function BloxSmithUI.remote(name)",
    '\tlocal root = ReplicatedStorage:FindFirstChild("BloxSmith")',
    '\tlocal folder = root and root:FindFirstChild("Remotes")',
    "\treturn folder and folder:FindFirstChild(name)",
    "end",
    "",
    "function BloxSmithUI.fire(name, ...)",
    "\tlocal remote = BloxSmithUI.remote(name)",
    '\tif remote and remote:IsA("RemoteEvent") then',
    "\t\tremote:FireServer(...)",
    "\telse",
    '\t\twarn(("[BloxSmith] Missing RemoteEvent: %s"):format(name))',
    "\tend",
    "end",
    "",
    "function BloxSmithUI.register(key, gui)",
    "\tBloxSmithUI.panels[key] = gui",
    "end",
    "",
    "local function panelRoot(key)",
    "\tlocal gui = BloxSmithUI.panels[key]",
    "\tif not gui then",
    "\t\treturn nil",
    "\tend",
    "\tfor _, child in ipairs(gui:GetChildren()) do",
    '\t\tif child:IsA("Frame") then',
    "\t\t\treturn child",
    "\t\tend",
    "\tend",
    "\treturn nil",
    "end",
    "",
    "function BloxSmithUI.open(key)",
    "\tlocal frame = panelRoot(key)",
    "\tif frame then",
    "\t\tframe.Visible = true",
    "\tend",
    "end",
    "",
    "function BloxSmithUI.close(key)",
    "\tlocal frame = panelRoot(key)",
    "\tif frame then",
    "\t\tframe.Visible = false",
    "\tend",
    "end",
    "",
    "function BloxSmithUI.toggle(key)",
    "\tlocal frame = panelRoot(key)",
    "\tif frame then",
    "\t\tframe.Visible = not frame.Visible",
    "\tend",
    "end",
    "",
    "function BloxSmithUI.closeButton(panel)",
    '\tlocal button = UI.button(panel, "X", UDim2.fromOffset(44, 44), UDim2.new(1, -44, 0, 0), { secondary = true, name = "CloseButton" })',
    "\tbutton.Activated:Connect(function()",
    "\t\tpanel.Visible = false",
    "\tend)",
    "\treturn button",
    "end",
    "",
    ...sections,
    "-- Keyboard / gamepad shortcuts -------------------------------------------",
    "UserInputService.InputBegan:Connect(function(input, processed)",
    "\tif processed then",
    "\t\treturn",
    "\tend",
    "\tlocal map = {",
    "\t\t[Enum.KeyCode.E] = \"Inventory\",",
    "\t\t[Enum.KeyCode.P] = \"Shop\",",
    "\t\t[Enum.KeyCode.Q] = \"Quests\",",
    "\t\t[Enum.KeyCode.ButtonY] = \"Inventory\",",
    "\t\t[Enum.KeyCode.ButtonX] = \"Shop\",",
    "\t}",
    "\tlocal key = map[input.KeyCode]",
    "\tif key then",
    "\t\tBloxSmithUI.toggle(key)",
    "\tend",
    "end)",
    "",
    'print(("[BloxSmith] UI ready: %d screen(s)"):format(' + screens.length + "))",
  ].join("\n");
}

export type UiArtifact = {
  className: "ModuleScript" | "LocalScript";
  name: string;
  parentPath: string;
  source: string;
};

/** Full UI build: shared kit module + one controller LocalScript. */
export function buildUiArtifacts(options: UiBuildOptions): UiArtifact[] {
  const theme = UI_THEMES[options.theme ?? "neon"] ?? UI_THEMES.neon;
  return [
    {
      className: "ModuleScript",
      name: "BloxSmithUI",
      parentPath: SERVICE_ROUTES.sharedModule,
      source: buildUiKitModule(theme),
    },
    {
      className: "LocalScript",
      name: "UIController",
      parentPath: SERVICE_ROUTES.clientScript,
      source: buildUiControllerSource(options),
    },
  ];
}

/** Remotes the generated UI expects to exist. */
export function remotesForScreens(screens: UiScreen[]): string[] {
  const map: Partial<Record<UiScreen, string[]>> = {
    inventory: ["InventoryChanged"],
    shop: ["ShopPurchase"],
    settings: ["SettingsChanged"],
    daily_rewards: ["ClaimDailyReward"],
    quests: ["QuestAction", "QuestsChanged"],
    trading: ["TradeAction", "TradeChanged"],
    crafting: ["CraftItem"],
    skill_tree: ["UnlockSkill"],
    pets: ["HatchEgg", "EquipPet", "PetsChanged"],
    rebirth: ["Rebirth"],
    leaderboard: ["LeaderboardChanged"],
    notifications: ["Notify"],
    dialog: ["DialogChoice"],
  };
  const out = new Set<string>();
  for (const screen of screens) for (const remote of map[screen] ?? []) out.add(remote);
  return [...out];
}
