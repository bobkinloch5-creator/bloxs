-- ============================================================
-- BloxSmith Ultimate Plugin v2.1.2
-- Fully connected to bloxsmith.pro backend API.
--
-- API endpoints used:
--   POST /api/public/plugin/pair/start  → get pairing code + link
--   POST /api/public/plugin/pair/poll   → poll until user approves
--   POST /api/public/plugin/poll        → heartbeat + fetch actions
--   POST /api/public/plugin/scan        → upload workspace snapshot
--   POST /api/public/plugin/complete    → report action results
--   POST /api/public/plugin/clear       → clear stuck queue
--
-- Install: Plugins > Open Plugins Folder, drop this file in, restart Studio.
-- ============================================================

local HttpService          = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection            = game:GetService("Selection")
local Lighting             = game:GetService("Lighting")
local Workspace            = game:GetService("Workspace")
local ServerScriptService  = game:GetService("ServerScriptService")
local ServerStorage        = game:GetService("ServerStorage")
local ReplicatedStorage    = game:GetService("ReplicatedStorage")
local ReplicatedFirst      = game:GetService("ReplicatedFirst")
local StarterPlayer        = game:GetService("StarterPlayer")
local StarterGui           = game:GetService("StarterGui")
local StarterPack          = game:GetService("StarterPack")
local SoundService         = game:GetService("SoundService")
local Teams                = game:GetService("Teams")
local RunService           = game:GetService("RunService")
local TweenService         = game:GetService("TweenService")
local InsertService        = game:GetService("InsertService")
local CollectionService    = game:GetService("CollectionService")
local Terrain              = Workspace.Terrain

if plugin == nil then
	warn("[BloxSmith] Must be installed as a Local Plugin.")
	return
end

----------------------------------------------------------------
-- CONFIG
----------------------------------------------------------------
local PLUGIN_VERSION  = "2.1.2"
local API_BASE        = "https://bloxsmith.pro"
local POLL_SECONDS    = 1        -- how often to call /poll for actions
local PAIR_POLL_SEC   = 2        -- how often to poll for pair approval
local PAIR_TIMEOUT    = 180      -- seconds before giving up on pair
local SCAN_TIMEOUT    = 30
local MAX_INSTANCES   = 600
local MAX_DEPTH       = 8
local APPLY_YIELD_N   = 6
local REPORT_FLUSH_N  = 8
local LIVE_FOCUS_N    = 10

print(string.format("[BloxSmith] Loading Ultimate v%s — check the PLUGINS tab.", PLUGIN_VERSION))

----------------------------------------------------------------
-- SETTINGS helpers
----------------------------------------------------------------
local function getSetting(k)      return plugin:GetSetting(k) end
local function setSetting(k, v)   plugin:SetSetting(k, v) end
local function getToken()         return getSetting("bs_token") or "" end
local function setToken(v)        setSetting("bs_token", v) end
local function getProjectId()     return getSetting("bs_project_id") or "" end
local function setProjectId(v)    setSetting("bs_project_id", v) end
local function getPaused()        return getSetting("bs_paused") == true end
local function setPaused(v)       setSetting("bs_paused", v) end
local function getPreviewMode()   return getSetting("bs_preview") == true end
local function setPreviewMode(v)  setSetting("bs_preview", v) end
local function getIgnoresRaw()    return getSetting("bs_ignores") or "" end
local function setIgnoresRaw(v)   setSetting("bs_ignores", tostring(v or "")) end

local function getIgnoreList()
	local out = {}
	for token in string.gmatch(getIgnoresRaw(), "([^,]+)") do
		local t = token:gsub("^%s+", ""):gsub("%s+$", "")
		if t ~= "" then table.insert(out, string.lower(t)) end
	end
	return out
end
local function pathIsIgnored(path)
	if not path or path == "" then return false end
	local list = getIgnoreList()
	if #list == 0 then return false end
	local lower = string.lower(path)
	for _, pat in ipairs(list) do
		if string.find(lower, pat, 1, true) then return true end
	end
	return false
end

----------------------------------------------------------------
-- STATE
----------------------------------------------------------------
local connected           = false
local shouldBeConnected   = false
local pairingInProgress   = false
local pairingCancelled    = false
local activeProjectId     = nil    -- set after pair approval
local statsApplied        = 0
local statsSkipped        = 0
local statsErrors         = 0
local lastSyncAt          = 0
local pendingPreview      = {}
local previewSeenIds      = {}
local scanInProgress      = false
local scanCancelRequested = false

-- forward declarations
local appendLog; local logLine
local setPill;   local updateButtonState
local refreshStatsInfo; local refreshHealthInfo
local postPlugin; local postPluginRaw
local openPreviewOverlay; local closePreviewOverlay
local refreshReviewBtnLabel
local resolvePath; local dispatch; local applyActions
local instancePath; local fullPath; local focusOn
local buildSnapshot; local pushSnapshot
local doPairing; local doReconnect; local disconnect

----------------------------------------------------------------
-- TOOLBAR / WIDGET
----------------------------------------------------------------
local toolbar = plugin:CreateToolbar("BloxSmith AI")
local button  = toolbar:CreateButton(
	"BloxSmith_Open",
	"Open / close BloxSmith AI",
	"rbxasset://textures/StudioToolbox/Search.png",
	"BloxSmith"
)
button.Enabled = true
pcall(function() button.ClickableWhenViewportHidden = true end)

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right, false, false, 380, 600, 300, 460
)
local widget = plugin:CreateDockWidgetPluginGui("BloxSmith_Ultimate_v211", widgetInfo)
widget.Title = "BloxSmith AI v" .. PLUGIN_VERSION

local function toggleWidget()
	widget.Enabled = not widget.Enabled
	pcall(function() button:SetActive(widget.Enabled) end)
end
button.Click:Connect(toggleWidget)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	pcall(function() button:SetActive(widget.Enabled) end)
end)

----------------------------------------------------------------
-- UI COLORS
----------------------------------------------------------------
local C = {
	bg        = Color3.fromRGB(10, 11, 16),
	panel     = Color3.fromRGB(18, 19, 26),
	panelHi   = Color3.fromRGB(24, 26, 36),
	stroke    = Color3.fromRGB(30, 32, 44),
	strokeHi  = Color3.fromRGB(56, 58, 78),
	primary   = Color3.fromRGB(124, 110, 248),
	primaryHi = Color3.fromRGB(146, 132, 255),
	disconnect= Color3.fromRGB(34, 36, 46),
	text      = Color3.fromRGB(245, 246, 252),
	textDim   = Color3.fromRGB(170, 174, 192),
	textMute  = Color3.fromRGB(110, 114, 132),
	accent    = Color3.fromRGB(180, 170, 255),
	success   = Color3.fromRGB(16, 185, 129),
	warn      = Color3.fromRGB(245, 158, 11),
	idle      = Color3.fromRGB(100, 116, 139),
	error     = Color3.fromRGB(239, 68, 68),
}

----------------------------------------------------------------
-- UI HELPERS
----------------------------------------------------------------
local function corner(p, r)
	local c = Instance.new("UICorner", p); c.CornerRadius = UDim.new(0, r or 6); return c
end
local function uiStroke(p, col, t)
	local s = Instance.new("UIStroke", p)
	s.Color = col or C.stroke; s.Thickness = t or 1
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	return s
end
local function padAll(p, n)
	local u = Instance.new("UIPadding", p)
	u.PaddingTop = UDim.new(0,n); u.PaddingBottom = UDim.new(0,n)
	u.PaddingLeft = UDim.new(0,n); u.PaddingRight = UDim.new(0,n)
end
local function tweenStroke(s, color, thickness)
	TweenService:Create(s, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ Color = color, Thickness = thickness or 1 }):Play()
end

----------------------------------------------------------------
-- BUILD SCROLLABLE ROOT
----------------------------------------------------------------
local scroll = Instance.new("ScrollingFrame", widget)
scroll.Size = UDim2.fromScale(1,1)
scroll.BackgroundColor3 = C.bg
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 3
scroll.ScrollBarImageColor3 = C.strokeHi
scroll.ScrollBarImageTransparency = 0.3
scroll.CanvasSize = UDim2.fromScale(0,0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
padAll(scroll, 12)

local root = Instance.new("Frame", scroll)
root.Size = UDim2.new(1,0,0,0)
root.AutomaticSize = Enum.AutomaticSize.Y
root.BackgroundTransparency = 1
local rootList = Instance.new("UIListLayout", root)
rootList.Padding = UDim.new(0,8)
rootList.SortOrder = Enum.SortOrder.LayoutOrder

-- ---- Header row ----
local header = Instance.new("Frame", root)
header.LayoutOrder = 1; header.BackgroundTransparency = 1; header.Size = UDim2.new(1,0,0,32)

local titleLabel = Instance.new("TextLabel", header)
titleLabel.BackgroundTransparency = 1; titleLabel.Position = UDim2.new(0,0,0,0)
titleLabel.Size = UDim2.new(1,-110,1,0)
titleLabel.Font = Enum.Font.BuilderSansBold; titleLabel.TextSize = 15
titleLabel.TextColor3 = C.text; titleLabel.Text = "BloxSmith AI"
titleLabel.TextXAlignment = Enum.TextXAlignment.Left

-- Status pill
local pill = Instance.new("Frame", header)
pill.AnchorPoint = Vector2.new(1,0.5); pill.Position = UDim2.new(1,0,0.5,0)
pill.Size = UDim2.fromOffset(104,24); pill.BackgroundColor3 = C.panel; pill.BorderSizePixel = 0
corner(pill, 12)
local pillStroke = uiStroke(pill, C.stroke, 1)

local pillDot = Instance.new("Frame", pill)
pillDot.Size = UDim2.fromOffset(6,6); pillDot.Position = UDim2.new(0,12,0.5,-3)
pillDot.BackgroundColor3 = C.idle; pillDot.BorderSizePixel = 0; corner(pillDot, 3)
local pillDotGlow = uiStroke(pillDot, C.idle, 2)
pillDotGlow.Transparency = 0.55

local pillText = Instance.new("TextLabel", pill)
pillText.BackgroundTransparency = 1; pillText.Position = UDim2.new(0,24,0,0)
pillText.Size = UDim2.new(1,-30,1,0); pillText.Font = Enum.Font.BuilderSansMedium; pillText.TextSize = 11
pillText.TextColor3 = C.textDim; pillText.Text = "Offline"
pillText.TextXAlignment = Enum.TextXAlignment.Left

local activePulse = nil
local function stopPulse()
	if activePulse then task.cancel(activePulse); activePulse = nil end
	pillDot.BackgroundTransparency = 0; pillDotGlow.Transparency = 0.55; pillStroke.Transparency = 0
end
local function startPulse()
	stopPulse()
	activePulse = task.spawn(function()
		while true do
			TweenService:Create(pillDot, TweenInfo.new(0.6, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { BackgroundTransparency = 0.6 }):Play()
			task.wait(0.6)
			TweenService:Create(pillDot, TweenInfo.new(0.6, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { BackgroundTransparency = 0 }):Play()
			task.wait(0.6)
		end
	end)
end

setPill = function(state)
	stopPulse()
	if state == "connected" then
		pillDot.BackgroundColor3 = C.success; pillDotGlow.Color = C.success
		pillStroke.Color = C.success; pillText.Text = "Connected"; pillText.TextColor3 = C.success
		startPulse()
	elseif state == "pairing" then
		pillDot.BackgroundColor3 = C.primary; pillDotGlow.Color = C.primary
		pillStroke.Color = C.primary; pillText.Text = "Pairing…"; pillText.TextColor3 = C.primary
		startPulse()
	elseif state == "connecting" then
		pillDot.BackgroundColor3 = C.warn; pillDotGlow.Color = C.warn
		pillStroke.Color = C.warn; pillText.Text = "Connecting…"; pillText.TextColor3 = C.warn
		startPulse()
	elseif state == "scanning" then
		pillDot.BackgroundColor3 = C.warn; pillDotGlow.Color = C.warn
		pillStroke.Color = C.warn; pillText.Text = "Scanning…"; pillText.TextColor3 = C.warn
		startPulse()
	elseif state == "executing" then
		pillDot.BackgroundColor3 = C.warn; pillDotGlow.Color = C.warn
		pillStroke.Color = C.warn; pillText.Text = "Building…"; pillText.TextColor3 = C.warn
		startPulse()
	elseif state == "error" then
		pillDot.BackgroundColor3 = C.error; pillDotGlow.Color = C.error
		pillStroke.Color = C.error; pillText.Text = "Error"; pillText.TextColor3 = C.error
	elseif state == "complete" then
		pillDot.BackgroundColor3 = C.success; pillStroke.Color = C.success
		pillText.Text = "Done ✓"; pillText.TextColor3 = C.success
	elseif state == "idle" then
		pillDot.BackgroundColor3 = C.primary; pillStroke.Color = C.primary
		pillText.Text = "Pending"; pillText.TextColor3 = C.primary
	else -- offline
		pillDot.BackgroundColor3 = C.idle; pillDotGlow.Color = C.idle
		pillStroke.Color = C.stroke; pillText.Text = "Offline"; pillText.TextColor3 = C.textDim
	end
end

-- ---- Version subtitle ----
local sub = Instance.new("TextLabel", root)
sub.LayoutOrder = 2; sub.BackgroundTransparency = 1; sub.Size = UDim2.new(1,0,0,13)
sub.Font = Enum.Font.BuilderSans; sub.TextSize = 10; sub.TextColor3 = C.textMute
sub.Text = "Build anything in Roblox with AI  ·  v" .. PLUGIN_VERSION
sub.TextXAlignment = Enum.TextXAlignment.Left

-- ---- Pairing link box (hidden until pairing) ----
local pairCard = Instance.new("Frame", root)
pairCard.LayoutOrder = 3; pairCard.AutomaticSize = Enum.AutomaticSize.Y
pairCard.Size = UDim2.new(1,0,0,0); pairCard.BackgroundColor3 = C.panelHi
pairCard.BorderSizePixel = 0; pairCard.Visible = false
corner(pairCard, 10); uiStroke(pairCard, C.primary, 1.5); padAll(pairCard, 10)
local pairList = Instance.new("UIListLayout", pairCard)
pairList.Padding = UDim.new(0,6); pairList.SortOrder = Enum.SortOrder.LayoutOrder

local pairInstr = Instance.new("TextLabel", pairCard)
pairInstr.LayoutOrder = 1; pairInstr.BackgroundTransparency = 1
pairInstr.Size = UDim2.new(1,0,0,0); pairInstr.AutomaticSize = Enum.AutomaticSize.Y
pairInstr.Font = Enum.Font.BuilderSansBold; pairInstr.TextSize = 11
pairInstr.TextColor3 = C.accent; pairInstr.TextWrapped = true
pairInstr.Text = "1. Copy the link below and open it in your browser.\n2. Sign in to BloxSmith and click \"Approve & connect\".\n3. Come back here — status flips to Connected automatically."
pairInstr.TextXAlignment = Enum.TextXAlignment.Left

local pairLinkBox = Instance.new("TextBox", pairCard)
pairLinkBox.LayoutOrder = 2; pairLinkBox.Size = UDim2.new(1,0,0,26)
pairLinkBox.BackgroundColor3 = C.bg; pairLinkBox.TextColor3 = C.text
pairLinkBox.Font = Enum.Font.Code; pairLinkBox.TextSize = 10
pairLinkBox.Text = ""; pairLinkBox.ClearTextOnFocus = false
pairLinkBox.TextXAlignment = Enum.TextXAlignment.Left
corner(pairLinkBox, 6); uiStroke(pairLinkBox, C.strokeHi, 1)
local pairLinkPad = Instance.new("UIPadding", pairLinkBox)
pairLinkPad.PaddingLeft = UDim.new(0,8); pairLinkPad.PaddingRight = UDim.new(0,8)

local pairCodeLabel = Instance.new("TextLabel", pairCard)
pairCodeLabel.LayoutOrder = 3; pairCodeLabel.BackgroundTransparency = 1
pairCodeLabel.Size = UDim2.new(1,0,0,14)
pairCodeLabel.Font = Enum.Font.BuilderSansMedium; pairCodeLabel.TextSize = 10
pairCodeLabel.TextColor3 = C.textMute; pairCodeLabel.Text = "Code: —"
pairCodeLabel.TextXAlignment = Enum.TextXAlignment.Left

local cancelPairBtn = Instance.new("TextButton", pairCard)
cancelPairBtn.LayoutOrder = 4; cancelPairBtn.Size = UDim2.new(1,0,0,24)
cancelPairBtn.BackgroundColor3 = C.disconnect; cancelPairBtn.TextColor3 = C.error
cancelPairBtn.Font = Enum.Font.BuilderSansMedium; cancelPairBtn.TextSize = 11
cancelPairBtn.Text = "Cancel pairing"; cancelPairBtn.BorderSizePixel = 0
corner(cancelPairBtn, 6); uiStroke(cancelPairBtn, C.error, 1)

-- ---- Info card ----
local infoCard = Instance.new("Frame", root)
infoCard.LayoutOrder = 4; infoCard.AutomaticSize = Enum.AutomaticSize.Y
infoCard.Size = UDim2.new(1,0,0,0); infoCard.BackgroundColor3 = C.panel
infoCard.BorderSizePixel = 0
corner(infoCard, 10); uiStroke(infoCard, C.stroke, 1); padAll(infoCard, 12)
local infoList = Instance.new("UIListLayout", infoCard)
infoList.Padding = UDim.new(0,6); infoList.SortOrder = Enum.SortOrder.LayoutOrder

local function infoRow(order, lbl)
	local row = Instance.new("Frame", infoCard)
	row.LayoutOrder = order; row.BackgroundTransparency = 1; row.Size = UDim2.new(1,0,0,18)
	local lt = Instance.new("TextLabel", row); lt.BackgroundTransparency = 1
	lt.Size = UDim2.new(0,68,1,0); lt.Font = Enum.Font.BuilderSansBold; lt.TextSize = 9
	lt.TextColor3 = C.textMute; lt.Text = lbl; lt.TextXAlignment = Enum.TextXAlignment.Left
	local vt = Instance.new("TextLabel", row); vt.BackgroundTransparency = 1
	vt.Position = UDim2.new(0,72,0,0); vt.Size = UDim2.new(1,-72,1,0)
	vt.Font = Enum.Font.BuilderSans; vt.TextSize = 10; vt.TextColor3 = C.text
	vt.Text = "—"; vt.TextXAlignment = Enum.TextXAlignment.Left
	vt.TextTruncate = Enum.TextTruncate.AtEnd
	return vt
end

local statusVal   = infoRow(1, "STATUS")
local projectVal  = infoRow(2, "PROJECT")
local syncVal     = infoRow(3, "BUILDS")
local statsVal    = infoRow(4, "STATS")
local healthVal   = infoRow(5, "HEALTH")
local creditsVal  = infoRow(6, "CREDITS")
creditsVal.Text = "—"

refreshStatsInfo = function()
	local agoText
	if lastSyncAt == 0 then agoText = "never"
	else
		local d = os.time() - lastSyncAt
		if d < 2 then agoText = "just now"
		elseif d < 60 then agoText = d .. "s ago"
		elseif d < 3600 then agoText = math.floor(d/60) .. "m ago"
		else agoText = math.floor(d/3600) .. "h ago" end
	end
	statsVal.Text = ("Applied %d · Skipped %d · Errors %d · Last: %s"):format(
		statsApplied, statsSkipped, statsErrors, agoText)
end
refreshStatsInfo()

refreshHealthInfo = function(extra)
	local conn = connected and "online" or (pairingInProgress and "pairing" or (shouldBeConnected and "reconnecting" or "offline"))
	healthVal.Text = conn .. (extra and (" · " .. extra) or "")
end
refreshHealthInfo()

task.spawn(function()
	while true do task.wait(2); pcall(refreshStatsInfo); pcall(refreshHealthInfo) end
end)

-- ---- Connect button ----
local connectBtn = Instance.new("TextButton", root)
connectBtn.LayoutOrder = 5; connectBtn.Size = UDim2.new(1,0,0,36)
connectBtn.BackgroundColor3 = C.primary; connectBtn.TextColor3 = Color3.new(1,1,1)
connectBtn.Font = Enum.Font.BuilderSansBold; connectBtn.TextSize = 14
connectBtn.Text = "Connect"; connectBtn.BorderSizePixel = 0; connectBtn.AutoButtonColor = false
corner(connectBtn, 10)
local connectStroke = uiStroke(connectBtn, C.stroke, 1)

updateButtonState = function()
	if connected or pairingInProgress then
		connectBtn.Text = "Disconnect"; connectBtn.BackgroundColor3 = C.disconnect
		connectStroke.Color = C.error; connectBtn.TextColor3 = C.error
	else
		connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = C.primary
		connectStroke.Color = C.stroke; connectBtn.TextColor3 = Color3.new(1,1,1)
	end
end

-- ---- Utility buttons grid ----
local function makeBtnGrid()
	local grid = Instance.new("Frame", root)
	grid.LayoutOrder = 6; grid.Size = UDim2.new(1,0,0,0); grid.AutomaticSize = Enum.AutomaticSize.Y
	grid.BackgroundTransparency = 1
	local gl = Instance.new("UIGridLayout", grid)
	gl.CellPadding = UDim2.new(0,5,0,5)
	gl.CellSize = UDim2.new(0.5,-3,0,28)
	gl.SortOrder = Enum.SortOrder.LayoutOrder

	local function btn(text, order)
		local b = Instance.new("TextButton")
		b.BackgroundColor3 = C.panel; b.TextColor3 = C.textDim
		b.Font = Enum.Font.BuilderSansMedium; b.TextSize = 11
		b.Text = text; b.BorderSizePixel = 0; b.LayoutOrder = order; b.Parent = grid
		corner(b, 6); uiStroke(b, C.stroke, 1)
		return b
	end
	return grid,
		btn("Sync Now",    1),
		btn("Scan Project",2),
		btn("Clear Queue", 3),
		btn("Reconnect",   4),
		btn("Organize",    5),
		btn("Auto-Fix",    6)
end

local btnGrid, syncNowBtn, scanBtn, clearQueueBtn, reconnectBtn, organizeBtn, autoFixBtn = makeBtnGrid()

-- ---- Toggles ----
local function makeToggleBtn(order, label)
	local b = Instance.new("TextButton", root)
	b.LayoutOrder = order; b.Size = UDim2.new(1,0,0,28)
	b.BackgroundColor3 = C.panel; b.TextColor3 = C.textDim
	b.Font = Enum.Font.BuilderSansMedium; b.TextSize = 11
	b.Text = label; b.BorderSizePixel = 0; b.AutoButtonColor = false
	corner(b, 8); uiStroke(b, C.stroke, 1)
	return b
end

local pauseBtn   = makeToggleBtn(7, getPaused()      and "▶  Resume sync"       or "⏸  Pause sync")
local previewBtn = makeToggleBtn(8, getPreviewMode() and "🔍  Preview Mode: ON" or "🔍  Preview Mode: OFF")
local reviewBtn  = makeToggleBtn(9, "Review Pending (0)")

refreshReviewBtnLabel = function()
	reviewBtn.Text = ("Review Pending (%d)"):format(#pendingPreview)
end

-- ---- Ignore filters ----
local igLabel = Instance.new("TextLabel", root)
igLabel.LayoutOrder = 10; igLabel.BackgroundTransparency = 1; igLabel.Size = UDim2.new(1,0,0,13)
igLabel.Font = Enum.Font.BuilderSansBold; igLabel.TextSize = 9; igLabel.TextColor3 = C.textMute
igLabel.Text = "Ignore filters (comma-separated folder names to exclude from scans)"
igLabel.TextXAlignment = Enum.TextXAlignment.Left

local igWrap = Instance.new("Frame", root)
igWrap.LayoutOrder = 11; igWrap.Size = UDim2.new(1,0,0,28); igWrap.BackgroundColor3 = C.panel
igWrap.BorderSizePixel = 0; corner(igWrap, 8)
local igStroke = uiStroke(igWrap, C.stroke, 1)
local igBox = Instance.new("TextBox", igWrap)
igBox.Size = UDim2.new(1,-24,1,0); igBox.Position = UDim2.new(0,12,0,0)
igBox.BackgroundTransparency = 1; igBox.TextColor3 = C.textDim
igBox.Font = Enum.Font.Code; igBox.TextSize = 10; igBox.ClearTextOnFocus = false
igBox.Text = getIgnoresRaw(); igBox.PlaceholderText = "StarterPlayer, Archive, _wip"
igBox.PlaceholderColor3 = C.textMute; igBox.TextXAlignment = Enum.TextXAlignment.Left
igBox.Focused:Connect(function() tweenStroke(igStroke, C.primary, 1.5) end)
igBox.FocusLost:Connect(function() tweenStroke(igStroke, C.stroke, 1); setIgnoresRaw(igBox.Text or "") end)

-- ---- Footer ----
local footer = Instance.new("TextLabel", root)
footer.LayoutOrder = 12; footer.BackgroundTransparency = 1; footer.Size = UDim2.new(1,0,0,30)
footer.Font = Enum.Font.BuilderSans; footer.TextSize = 9; footer.TextColor3 = C.textMute
footer.TextWrapped = true; footer.TextXAlignment = Enum.TextXAlignment.Left
footer.Text = "bloxsmith.pro · Sends script source + workspace snapshot to BloxSmith AI. All changes are undoable (Ctrl+Z)."

-- ---- Activity Log ----
local logHeaderRow = Instance.new("Frame", root)
logHeaderRow.LayoutOrder = 13; logHeaderRow.BackgroundTransparency = 1; logHeaderRow.Size = UDim2.new(1,0,0,20)
local logTitle2 = Instance.new("TextLabel", logHeaderRow)
logTitle2.BackgroundTransparency = 1; logTitle2.Size = UDim2.new(1,-130,1,0)
logTitle2.Font = Enum.Font.BuilderSansBold; logTitle2.TextSize = 11; logTitle2.TextColor3 = C.textDim
logTitle2.Text = "Activity Log"; logTitle2.TextXAlignment = Enum.TextXAlignment.Left

local function miniBtn2(text, xOff)
	local b = Instance.new("TextButton")
	b.AnchorPoint = Vector2.new(1,0.5); b.Position = UDim2.new(1,xOff,0.5,0)
	b.Size = UDim2.new(0,58,0,18); b.BackgroundColor3 = C.panel; b.TextColor3 = C.textDim
	b.Font = Enum.Font.BuilderSans; b.TextSize = 10; b.Text = text; b.BorderSizePixel = 0
	b.Parent = logHeaderRow; corner(b, 4); return b
end
local clearLogBtn  = miniBtn2("Clear",   0)
local copyLogBtn   = miniBtn2("Copy", -64)
local verboseBtn   = miniBtn2("Verbose", -128)

local logFrame = Instance.new("ScrollingFrame", root)
logFrame.LayoutOrder = 14; logFrame.Size = UDim2.new(1,0,0,130); logFrame.BackgroundColor3 = C.bg
logFrame.BorderSizePixel = 0; logFrame.CanvasSize = UDim2.new(0,0,0,0)
logFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y; logFrame.ScrollBarThickness = 3
corner(logFrame, 6)
local lp = Instance.new("UIPadding", logFrame)
lp.PaddingTop = UDim.new(0,4); lp.PaddingBottom = UDim.new(0,4)
lp.PaddingLeft = UDim.new(0,6); lp.PaddingRight = UDim.new(0,6)
local lll = Instance.new("UIListLayout", logFrame)
lll.SortOrder = Enum.SortOrder.LayoutOrder; lll.Padding = UDim.new(0,1)

local LOG_COLORS = {
	info    = Color3.fromRGB(160,200,255),
	success = Color3.fromRGB(140,220,160),
	warn    = Color3.fromRGB(255,200,120),
	error   = Color3.fromRGB(255,120,120),
	action  = Color3.fromRGB(190,175,255),
	debug   = Color3.fromRGB(140,145,160),
}
local logLines = {}
local logLineCount = 0
local VERBOSE = false

logLine = function(text, level)
	local color = LOG_COLORS[level or "info"] or LOG_COLORS.info
	local ts = os.date("%H:%M:%S")
	local prefix = (level == "error" and "ERR " or level == "warn" and "WARN" or level == "action" and "ACT " or "INFO")
	local full = ("[%s] %s | %s"):format(ts, prefix, tostring(text))
	if level == "debug" and not VERBOSE then return end
	logLineCount += 1
	local lbl = Instance.new("TextLabel", logFrame)
	lbl.AutomaticSize = Enum.AutomaticSize.Y; lbl.Size = UDim2.new(1,-4,0,0)
	lbl.BackgroundTransparency = 1; lbl.Font = Enum.Font.Code; lbl.TextSize = 10
	lbl.TextColor3 = color; lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.TextYAlignment = Enum.TextYAlignment.Top; lbl.TextWrapped = true
	lbl.Text = full; lbl.LayoutOrder = logLineCount
	lbl.Parent = logFrame
	table.insert(logLines, lbl)
	if #logLines > 300 then
		local old = table.remove(logLines, 1)
		if old then old:Destroy() end
	end
	if level == "error" or level == "warn" then warn("[BloxSmith] " .. tostring(text))
	else print("[BloxSmith] " .. tostring(text)) end
end

appendLog = function(msg)
	logLine(tostring(msg), "info")
end

clearLogBtn.MouseButton1Click:Connect(function()
	for _, c in ipairs(logLines) do c:Destroy() end
	table.clear(logLines); logLine("Log cleared.", "debug")
end)
copyLogBtn.MouseButton1Click:Connect(function()
	pcall(function()
		local lines = {}
		for _, l in ipairs(logLines) do table.insert(lines, l.Text) end
		;(setclipboard or function() end)(table.concat(lines, "\n"))
		logLine("Copied log to clipboard.", "info")
	end)
end)
verboseBtn.MouseButton1Click:Connect(function()
	VERBOSE = not VERBOSE
	verboseBtn.BackgroundColor3 = VERBOSE and C.primary or C.panel
	logLine("Verbose " .. (VERBOSE and "ON" or "OFF"), "debug")
end)

----------------------------------------------------------------
-- HTTP — all calls route through /api/public/plugin/* endpoints
----------------------------------------------------------------

-- Helper to POST to a plugin endpoint with the token in the header
postPlugin = function(path, body)
	local url = API_BASE .. path
	local tok = getToken()
	if tok == "" then return nil, "no token" end
	body = body or {}
	if body.token == nil then body.token = tok end
	local started = os.clock()
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = url, Method = "POST",
			Headers = {
				["Content-Type"]        = "application/json",
				["x-bloxsmith-token"]   = tok,
				["authorization"]       = "Bearer " .. tok,
			},
			Body = HttpService:JSONEncode(body),
		})
	end)
	local elapsed = math.floor((os.clock() - started) * 1000)
	if not ok then
		local e = tostring(res)
		logLine("Network error (" .. path .. ", " .. tostring(elapsed) .. "ms): " .. e, "warn")
		return nil, e
	end
	if not res.Success then
		local e = "HTTP " .. tostring(res.StatusCode)
		local short = tostring(res.Body or "")
		if #short > 220 then short = string.sub(short, 1, 220) .. "…" end
		if res.StatusCode == 401 or res.StatusCode == 403 then
			connected = false; shouldBeConnected = false
			setPill("offline"); updateButtonState()
			statusVal.Text = "Token rejected — reconnect"
			pairCard.Visible = false; pairingInProgress = false
			logLine("Token invalid (HTTP " .. res.StatusCode .. ") — use Connect to re-pair. " .. short, "error")
			return nil, e
		end
		logLine("Server error (" .. path .. ", " .. tostring(elapsed) .. "ms): " .. e .. " " .. short, "warn")
		return nil, e
	end
	local okJ, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not okJ then return nil, "Bad JSON from " .. path end
	if VERBOSE then logLine(("POST %s OK in %dms"):format(path, elapsed), "debug") end
	return decoded
end

-- Variant without auth header for pair/start (no token yet)
postPluginRaw = function(path, body)
	local url = API_BASE .. path
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = url, Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = HttpService:JSONEncode(body or {}),
		})
	end)
	if not ok then return nil, tostring(res) end
	if not res.Success then return nil, "HTTP " .. tostring(res.StatusCode) end
	local okJ, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not okJ then return nil, "Bad JSON" end
	return decoded
end

----------------------------------------------------------------
-- SERVICE RESOLVER
----------------------------------------------------------------
local SERVICE_MAP = {
	workspace               = "Workspace",
	replicatedstorage       = "ReplicatedStorage",
	replicatedfirst         = "ReplicatedFirst",
	serverscriptservice     = "ServerScriptService",
	serverstorage           = "ServerStorage",
	startergui              = "StarterGui",
	starterpack             = "StarterPack",
	starterplayer           = "StarterPlayer",
	starterplayerscripts    = "StarterPlayer/StarterPlayerScripts",
	startercharacterscripts = "StarterPlayer/StarterCharacterScripts",
	lighting                = "Lighting",
	soundservice            = "SoundService",
	teams                   = "Teams",
}
local function getService(name)
	local ok, svc = pcall(function() return game:GetService(name) end)
	if ok and svc then return svc end
	return nil
end

resolvePath = function(path, create)
	if not path or path == "" then return nil end
	path = tostring(path):gsub("%.", "/")
	local segments = string.split(path, "/")
	local alias = SERVICE_MAP[string.lower(segments[1])]
	if alias then
		local aliasSegs = string.split(alias, "/")
		local rest = {}
		for i = 2, #segments do rest[#rest+1] = segments[i] end
		segments = {}
		for _, s in ipairs(aliasSegs) do segments[#segments+1] = s end
		for _, s in ipairs(rest)      do segments[#segments+1] = s end
	end
	local node = getService(segments[1]) or game:FindFirstChild(segments[1])
	if not node then return nil end
	for i = 2, #segments do
		local seg = segments[i]
		if seg ~= "" then
			local child = node:FindFirstChild(seg)
			if not child then
				if not create then return nil end
				if node == StarterPlayer and (seg == "StarterPlayerScripts" or seg == "StarterCharacterScripts") then
					local ok2, w = pcall(function() return node:WaitForChild(seg, 5) end)
					if ok2 and w then child = w else child = node:FindFirstChild(seg) end
				end
				if not child then
					child = Instance.new("Folder"); child.Name = seg; child.Parent = node
				end
			end
			node = child
		end
	end
	return node
end

instancePath = function(inst)
	local parts = {}; local cur = inst
	while cur and cur ~= game do
		table.insert(parts, 1, cur.Name); cur = cur.Parent
	end
	return "game." .. table.concat(parts, ".")
end

fullPath = function(inst)
	local ok, p = pcall(function() return inst:GetFullName() end)
	return ok and p or tostring(inst)
end

local function instanceId(inst)
	local ok, id = pcall(function() return inst:GetDebugId(0) end)
	return (ok and id) or instancePath(inst)
end

local function ensureFolder(parent, name)
	local ex = parent:FindFirstChild(name)
	if ex and ex:IsA("Folder") then return ex end
	local f = Instance.new("Folder"); f.Name = name; f.Parent = parent; return f
end

----------------------------------------------------------------
-- PROPERTY COERCION
----------------------------------------------------------------
local function tableLooksLikeXYZ(t)
	return type(t) == "table" and (t.x ~= nil or t.X ~= nil or t[1] ~= nil)
end
local function toVector3(v, def)
	if typeof(v) == "Vector3" then return v end
	if type(v) == "table" then
		return Vector3.new(v.x or v.X or v[1] or 0, v.y or v.Y or v[2] or 0, v.z or v.Z or v[3] or 0)
	end
	return def or Vector3.zero
end
local function toColor3(v, def)
	if typeof(v) == "Color3" then return v end
	if type(v) == "table" then
		local r = v.r or v.R or v[1] or 255
		local g = v.g or v.G or v[2] or 255
		local b = v.b or v.B or v[3] or 255
		if r > 1 or g > 1 or b > 1 then
			return Color3.fromRGB(math.floor(r), math.floor(g), math.floor(b))
		end
		return Color3.new(r, g, b)
	end
	return def or Color3.fromRGB(200,200,200)
end

local VECTOR3_PROPS = { Size=true, Position=true, Velocity=true, Orientation=true }
local COLOR3_PROPS  = { Color=true, BackgroundColor3=true, TextColor3=true, BorderColor3=true, ImageColor3=true }

local function coerceValue(raw)
	if type(raw) ~= "table" then return raw end
	local t = raw.__t or raw.type or raw.Type
	if t == "Vector3" or tableLooksLikeXYZ(raw) then return toVector3(raw) end
	if t == "Color3" then return toColor3(raw) end
	if t == "CFrame" then
		local p = toVector3(raw)
		if raw.rx ~= nil or raw.RX ~= nil then
			return CFrame.new(p) * CFrame.Angles(raw.rx or raw.RX or 0, raw.ry or raw.RY or 0, raw.rz or raw.RZ or 0)
		end
		return CFrame.new(p)
	end
	if t == "UDim2" then
		return UDim2.new(raw.xs or 0, raw.xo or 0, raw.ys or 0, raw.yo or 0)
	end
	if t == "UDim" then return UDim.new(raw.Scale or 0, raw.Offset or 0) end
	if t == "BrickColor" then return BrickColor.new(raw.name or "Medium stone grey") end
	if t == "Enum" and raw.enum and raw.value then
		local ok, e = pcall(function() return Enum[raw.enum][raw.value] end)
		if ok then return e end
	end
	return raw
end

local function applyProps(inst, props)
	if not props then return end
	for k, raw in pairs(props) do
		if k == "Parent" and type(raw) == "string" then
			local p = resolvePath(raw, true)
			if p then pcall(function() inst.Parent = p end) end
		else
			local ok, val = pcall(coerceValue, raw)
			if not ok then val = raw end
			if type(val) == "table" then
				if VECTOR3_PROPS[k] and tableLooksLikeXYZ(val) then val = toVector3(val)
				elseif COLOR3_PROPS[k] then val = toColor3(val)
				elseif k == "CFrame" and tableLooksLikeXYZ(val) then val = CFrame.new(toVector3(val)) end
			end
			pcall(function() inst[k] = val end)
		end
	end
end

local function applyVisibleDefaults(inst, props)
	if not inst:IsA("BasePart") then return end
	local p = props or {}
	if p.Anchored == nil and not inst.Anchored then inst.Anchored = true end
	if p.Transparency == nil and inst.Transparency >= 1 then inst.Transparency = 0 end
	if p.CanCollide == nil then inst.CanCollide = true end
	if p.Size == nil and inst.Size.Magnitude < 0.5 then inst.Size = Vector3.new(4,4,4) end
	if p.Position == nil and p.CFrame == nil and inst.Position.Magnitude < 0.01 then
		inst.CFrame = CFrame.new(0, 10, 0)
	end
end

----------------------------------------------------------------
-- ACTION HANDLERS
-- The website sends actions with these kinds (from plugin-actions.ts):
-- script, localscript, modulescript, gui, screengui, frame, textlabel,
-- textbutton, imagelabel, part, model, terrain, tool, sound, team,
-- remoteevent, remotefunction, bindableevent, leaderstats, insert_asset,
-- set_properties, rename, move, delete, setting, run, run_lua,
-- organize_project, autofix_project, scan_project, playtest
-- Each action has: kind, name, parent_path, payload, position
----------------------------------------------------------------
local Actions = {}

local function normParent(kind, parentPath, payload)
	-- honour the server's already-normalized parent_path first
	if parentPath and parentPath ~= "" then return parentPath end
	-- sensible fallbacks
	if kind == "script"          then return "ServerScriptService" end
	if kind == "localscript"     then return "StarterPlayer/StarterPlayerScripts" end
	if kind == "modulescript"    then return "ReplicatedStorage/Modules" end
	if kind == "remoteevent" or kind == "remotefunction" or kind == "bindableevent" then
		return "ReplicatedStorage/Remotes"
	end
	if kind == "screengui" or kind == "gui" or kind == "frame"
		or kind == "textlabel" or kind == "textbutton" or kind == "imagelabel" then
		return "StarterGui"
	end
	if kind == "tool"  then return "StarterPack" end
	if kind == "sound" then return "SoundService" end
	if kind == "team"  then return "Teams" end
	return "Workspace"
end

-- Build a unified action table from the server's format
local function normalizeAction(a)
	-- server sends: { kind, name, parent_path, payload, position }
	local kind    = tostring(a.kind or ""):lower():gsub("[%s%-]+", "_")
	local name    = tostring(a.name or "BloxSmithAction")
	local parent  = normParent(kind, tostring(a.parent_path or ""), a.payload or {})
	local payload = type(a.payload) == "table" and a.payload or {}
	return kind, name, parent, payload
end

function Actions.script(a)
	local kind, name, parent, payload = normalizeAction(a)
	local scriptParent = resolvePath(parent, true)
	if not scriptParent then return false, "bad parent: " .. parent end
	local className = "Script"
	if kind == "localscript" then className = "LocalScript"
	elseif kind == "modulescript" then className = "ModuleScript" end
	local existing = scriptParent:FindFirstChild(name)
	if existing and not existing:IsA(className) then existing:Destroy(); existing = nil end
	if not existing then
		existing = Instance.new(className); existing.Name = name; existing.Parent = scriptParent
	end
	existing.Source = tostring(payload.source or payload.content or a.source or "")
	return true, nil, existing
end
Actions.localscript   = Actions.script
Actions.modulescript  = Actions.script

function Actions.part(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local part = p:FindFirstChild(name) or Instance.new("Part")
	part.Name = name
	if payload.size     then part.Size     = toVector3(payload.size, Vector3.new(4,4,4)) end
	if payload.position then part.Position = toVector3(payload.position, Vector3.new(0,5,0)) end
	if payload.color    then part.Color    = toColor3(payload.color) end
	if payload.material then pcall(function() part.Material = Enum.Material[payload.material] end) end
	part.Anchored = payload.anchored ~= false
	part.CanCollide = true; part.Transparency = 0
	applyProps(part, payload.properties or {})
	applyVisibleDefaults(part, payload)
	part.Parent = p
	return true, nil, part
end
Actions.create_part = Actions.part

function Actions.model(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local model = p:FindFirstChild(name)
	if not model or not model:IsA("Model") then
		model = Instance.new("Model"); model.Name = name
	end
	applyProps(model, payload.properties or {})
	model.Parent = p
	return true, nil, model
end
Actions.create_model = Actions.model

function Actions.screengui(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local gui = p:FindFirstChild(name)
	if not gui or not gui:IsA("ScreenGui") then
		gui = Instance.new("ScreenGui"); gui.Name = name
	end
	applyProps(gui, payload.properties or {})
	gui.Parent = p
	return true, nil, gui
end
Actions.gui = Actions.screengui

function Actions.frame(a)
	local kind, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local cls = "Frame"
	if kind == "textlabel"  then cls = "TextLabel" end
	if kind == "textbutton" then cls = "TextButton" end
	if kind == "imagelabel" then cls = "ImageLabel" end
	local inst = p:FindFirstChild(name)
	if not inst or not inst:IsA(cls) then
		inst = Instance.new(cls); inst.Name = name
	end
	applyProps(inst, payload.properties or {})
	inst.Parent = p
	return true, nil, inst
end
Actions.textlabel  = Actions.frame
Actions.textbutton = Actions.frame
Actions.imagelabel = Actions.frame

function Actions.remoteevent(a)
	local kind, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local cls = "RemoteEvent"
	if kind == "remotefunction"  then cls = "RemoteFunction" end
	if kind == "bindableevent"   then cls = "BindableEvent" end
	local inst = p:FindFirstChild(name)
	if not inst or not inst:IsA(cls) then
		inst = Instance.new(cls); inst.Name = name
	end
	applyProps(inst, payload.properties or {})
	inst.Parent = p
	return true, nil, inst
end
Actions.remotefunction = Actions.remoteevent
Actions.bindableevent  = Actions.remoteevent

function Actions.tool(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local t = p:FindFirstChild(name)
	if not t or not t:IsA("Tool") then
		t = Instance.new("Tool"); t.Name = name
	end
	applyProps(t, payload.properties or {})
	t.Parent = p
	return true, nil, t
end

function Actions.sound(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end
	local s = p:FindFirstChild(name)
	if not s or not s:IsA("Sound") then
		s = Instance.new("Sound"); s.Name = name
	end
	if payload.assetId then s.SoundId = "rbxassetid://" .. tostring(payload.assetId) end
	s.Volume = payload.volume or 0.5
	s.Looped = payload.looped == true
	applyProps(s, payload.properties or {})
	s.Parent = p
	return true, nil, s
end

function Actions.team(a)
	local _, name, _, payload = normalizeAction(a)
	local t = Teams:FindFirstChild(name)
	if not t or not t:IsA("Team") then
		t = Instance.new("Team"); t.Name = name
	end
	if payload.teamColor then pcall(function() t.TeamColor = BrickColor.new(payload.teamColor) end) end
	applyProps(t, payload.properties or {})
	t.Parent = Teams
	return true, nil, t
end

function Actions.leaderstats(a)
	local _, name, _, payload = normalizeAction(a)
	-- Inject leaderstats via a Script in ServerScriptService
	local sss = ServerScriptService
	local scriptName = "LeaderstatsSetup_" .. (name or "Stats")
	local existing = sss:FindFirstChild(scriptName)
	if not existing then
		existing = Instance.new("Script"); existing.Name = scriptName
	end
	local stats = payload.stats or payload.items or { "Cash", "XP" }
	local lines = { "local Players = game:GetService('Players')" }
	lines[#lines+1] = "Players.PlayerAdded:Connect(function(player)"
	lines[#lines+1] = "\tlocal ls = Instance.new('Folder')"
	lines[#lines+1] = "\tls.Name = 'leaderstats'; ls.Parent = player"
	for _, stat in ipairs(stats) do
		local statName = type(stat) == "string" and stat or tostring(stat.name or "Stat")
		local startVal = type(stat) == "table" and (stat.default or stat.value or 0) or 0
		lines[#lines+1] = ("\tlocal %s = Instance.new('IntValue')"):format(statName)
		lines[#lines+1] = ("\t%s.Name = '%s'"):format(statName, statName)
		lines[#lines+1] = ("\t%s.Value = %d"):format(statName, startVal)
		lines[#lines+1] = ("\t%s.Parent = ls"):format(statName)
	end
	lines[#lines+1] = "end)"
	existing.Source = table.concat(lines, "\n")
	existing.Parent = sss
	return true, nil, existing
end

-- ===== Toolbox asset insertion =====
-- Session-scoped cache of successful LoadAsset results — re-cloning is far
-- cheaper than another HTTP round-trip, and Roblox rate-limits InsertService.
local _assetCache = {}
local _assetDenylist = {}
local _SUSPICIOUS_SCRIPT = {
	"require%s*%(%s*%d+", "getfenv", "setfenv", "loadstring%s*%(", "HttpGet",
	"HttpService", "MarketplaceService:PromptPurchase", "BindToClose",
	"game:GetObjects", "game%.HttpGet", "_G%[", "shared%[", "syn%.", "hookfunction",
}
local function looksSuspicious(src)
	if type(src) ~= "string" or #src == 0 then return false end
	local low = src:lower()
	for _, pat in ipairs(_SUSPICIOUS_SCRIPT) do
		if low:find(pat) then return true end
	end
	return false
end

local function quarantineScripts(root, mode)
	-- mode: "disable" (default), "strip" removes the script entirely.
	local count, suspicious = 0, 0
	for _, d in ipairs(root:GetDescendants()) do
		if d:IsA("LuaSourceContainer") then
			count = count + 1
			local src = ""
			pcall(function() src = d.Source end)
			local bad = looksSuspicious(src)
			if bad then suspicious = suspicious + 1 end
			if mode == "strip" or bad then
				pcall(function() d:Destroy() end)
			elseif d:IsA("Script") or d:IsA("LocalScript") then
				pcall(function() d.Disabled = true end)
			end
		end
	end
	return count, suspicious
end

local function tryLoadAsset(numId)
	if _assetDenylist[numId] then
		return false, "blocked in current BloxSmith session: " .. tostring(_assetDenylist[numId])
	end
	if _assetCache[numId] then
		local ok, clone = pcall(function() return _assetCache[numId]:Clone() end)
		if ok and clone then return true, clone end
	end
	local ok, model = pcall(function() return InsertService:LoadAsset(numId) end)
	if ok and model then
		local snap = model:Clone()
		snap.Parent = nil
		_assetCache[numId] = snap
		return true, model
	end
	local err = tostring(model)
	local low = string.lower(err)
	if low:find("not authorized") or low:find("unauthorized") or low:find("permission") or low:find("403") or low:find("private") or low:find("moderated") then
		_assetDenylist[numId] = err
	end
	return false, err
end

local function jsonSafe(v)
	local ok, encoded = pcall(function() return HttpService:JSONEncode(v) end)
	return ok and encoded or tostring(v)
end

-- Names that almost always indicate a multi-asset bundle / showcase scene.
-- Single-asset inserts must reject these to avoid dumping a whole prop pack
-- into Workspace when the user asked for one object.
local _PACK_NAME_PATTERNS = {
	"pack", "kit", "bundle", "collection", "props", "prop set",
	"showcase", "demo", "library", "mega", "template", "fashion",
	"mannequin", "decorations?", "furniture pack", "assets pack",
}
local function looksLikePackName(name)
	if type(name) ~= "string" or name == "" then return false end
	local low = name:lower()
	for _, pat in ipairs(_PACK_NAME_PATTERNS) do
		if low:find(pat) then return true end
	end
	return false
end

-- Walk a container's top-level children and pick the one whose name best
-- matches the source query. Returns that child plus the rest as discard list.
local function pickBestChild(container, queryWord)
	local q = (queryWord or ""):lower()
	if q == "" then return nil, {} end
	local best, bestScore
	local discard = {}
	for _, c in ipairs(container:GetChildren()) do
		local n = (c.Name or ""):lower()
		local score = 0
		if n == q then score = 100
		elseif n:find(q, 1, true) then score = 60 + math.min(20, #q)
		end
		-- bonus for Model with mostly parts (more "object-like" than folder of props)
		if c:IsA("Model") then score = score + 5 end
		if score > 0 and (not bestScore or score > bestScore) then
			if best then table.insert(discard, best) end
			best, bestScore = c, score
		else
			table.insert(discard, c)
		end
	end
	return best, discard
end


function Actions.insert_asset(a)
	local _, name, parent, payload = normalizeAction(a)
	local p = resolvePath(parent, true)
	if not p then return false, "bad parent" end

	-- Build the candidate chain: primary asset_id, then fallback_ids.
	local candidates = {}
	local primary = tonumber(tostring(payload.asset_id or payload.assetId or ""):match("%d+"))
	if primary then table.insert(candidates, primary) end
	local fallbacks = payload.fallback_ids or payload.fallbackIds or {}
	if type(fallbacks) == "table" then
		for _, fid in ipairs(fallbacks) do
			local n = tonumber(tostring(fid):match("%d+"))
			if n and n ~= primary then table.insert(candidates, n) end
		end
	end
	if #candidates == 0 then return false, "missing assetId" end

	local model, usedId, lastErr
	local attempts = {}
	for _, cid in ipairs(candidates) do
		appendLog(("InsertService attempt assetId=%d name=%s creator=%s type=%s public=%s verified=%s retry=%d"):format(
			cid,
			tostring(payload.asset_name or payload.name or name or "unknown"),
			tostring(payload.creator_name or "unknown"),
			tostring(payload.asset_type or payload.requested_asset_type or "Model"),
			tostring(payload.is_public or payload.free_only or payload.toolbox_only or "unknown"),
			tostring(payload.is_verified or (payload.preview and payload.preview.verifiedCreator) or false),
			#attempts
		), "debug")
		local ok, res = tryLoadAsset(cid)
		table.insert(attempts, {
			asset_id = cid,
			asset_name = tostring(payload.asset_name or payload.name or name or "unknown"),
			creator = tostring(payload.creator_name or "unknown"),
			asset_type = tostring(payload.asset_type or payload.requested_asset_type or "Model"),
			is_public = payload.is_public or payload.free_only or payload.toolbox_only,
			is_verified = payload.is_verified or (payload.preview and payload.preview.verifiedCreator) or false,
			insertservice_response = ok and "ok" or tostring(res),
			http_response = tostring(res),
			retry_count = #attempts,
		})
		if ok then model = res; usedId = cid; break end
		lastErr = res
	end
	if not model then
		return false, ("InsertService failed for %d candidates: %s | attempted_ids=%s | diagnostics=%s"):format(
			#candidates,
			tostring(lastErr or "unknown"),
			table.concat(candidates, ","),
			jsonSafe(attempts)
		)
	end

	-- Script quarantine — honor toolbox_only / no_scripts / strict modes.
	local scriptMode = "disable"
	if payload.no_scripts or payload.toolbox_only or payload.strip_scripts then
		scriptMode = "strip"
	end
	local scriptCount, suspiciousCount = quarantineScripts(model, scriptMode)

	-- Hard cap on script count for single-asset inserts: an object with 100+
	-- scripts is almost always a backdoored asset dump, not the one model the
	-- user asked for. Refuse and let the planner pick a fallback.
	local singleAsset = payload.single_asset_only or payload.extract_single
	local maxScripts = tonumber(payload.max_scripts) or (singleAsset and 5 or 50)
	if scriptCount > maxScripts then
		pcall(function() model:Destroy() end)
		return false, ("rejected: %d scripts (limit %d) — likely a pack or backdoored asset"):format(scriptCount, maxScripts)
	end

	local safetyStatus = "clean"
	if suspiciousCount > 0 then safetyStatus = "quarantined"
	elseif scriptCount > 0 and scriptMode == "disable" then safetyStatus = "scripts_disabled" end

	-- Pull instances out of the LoadAsset wrapper model. In single-asset mode,
	-- NEVER dump every top-level child from a package into Workspace: pick one
	-- matching child, move only that child, and destroy/reject the rest.
	local children = model:GetChildren()
	local placed
	local queryWord = tostring(payload.requested_asset_type or payload.source_query or payload.asset_name or name or ""):lower():match("[%a]+") or ""
	if singleAsset then
		if #children == 1 then
			placed = children[1]
			if name then placed.Name = name end
			placed.Parent = p
		else
			local best, discard = pickBestChild(model, queryWord)
			if not best then
				pcall(function() model:Destroy() end)
				return false, ("rejected package asset (%d top-level children) — no single \"%s\" found"):format(#children, queryWord)
			end
			for _, d in ipairs(discard) do pcall(function() d:Destroy() end) end
			placed = best
			if name then placed.Name = name end
			placed.Parent = p
			appendLog(("Single-asset mode kept 1/%d top-level children for %s"):format(#children, queryWord), "info")
		end
	else
		for _, c in ipairs(children) do
			if name and #children == 1 then c.Name = name end
			c.Parent = p
			if not placed then placed = c end
		end
	end
	model:Destroy()
	if not placed then return false, "asset contained no instances" end

	-- Single-asset extraction: if the loaded model looks like a pack (by name
	-- or by descendant count), try to extract the requested object and discard
	-- the rest. If nothing extractable matches, reject entirely.
	if singleAsset then
		local maxChildren = tonumber(payload.max_children) or 25
		local descendantCount = #placed:GetDescendants()
		local topChildren = #placed:GetChildren()
		local nameLooksPack = looksLikePackName(placed.Name)
		local tooMany = topChildren > maxChildren or descendantCount > 400
		if nameLooksPack or tooMany then
			local best, discard = pickBestChild(placed, queryWord)
			if best then
				best.Parent = p
				if name then best.Name = name end
				for _, d in ipairs(discard) do pcall(function() d:Destroy() end) end
				pcall(function() placed:Destroy() end)
				placed = best
				appendLog(("Extracted single %s from pack-like container (saved 1/%d children)"):format(queryWord, topChildren), "info")
			else
				pcall(function() placed:Destroy() end)
				return false, ("rejected pack-like asset \"%s\" (%d children) — no single \"%s\" found inside"):format(
					tostring(placed and placed.Name or "?"), topChildren, queryWord)
			end
		end
	end

	-- Tag for traceability + future cleanup.
	pcall(function()
		CollectionService:AddTag(placed, "BloxSmithAsset")
		placed:SetAttribute("BloxSmithAssetId", usedId)
		if payload.source_query then placed:SetAttribute("BloxSmithQuery", tostring(payload.source_query)) end
		if payload.creator_name then placed:SetAttribute("BloxSmithCreator", tostring(payload.creator_name)) end
		placed:SetAttribute("BloxSmithSafety", safetyStatus)
	end)

	-- Positioning: payload.position {x,y,z}, payload.cframe, payload.yaw (deg), payload.rotation {x,y,z deg}.
	local targetCF
	if payload.cframe then
		targetCF = CFrame.new(toVector3(payload.cframe))
	elseif payload.position then
		targetCF = CFrame.new(toVector3(payload.position))
	end
	if targetCF then
		local rot = payload.rotation
		local yaw = tonumber(payload.yaw)
		if type(rot) == "table" then
			targetCF = targetCF * CFrame.Angles(
				math.rad(tonumber(rot.x) or 0),
				math.rad(tonumber(rot.y) or 0),
				math.rad(tonumber(rot.z) or 0)
			)
		elseif yaw then
			targetCF = targetCF * CFrame.Angles(0, math.rad(yaw), 0)
		end
		pcall(function()
			if placed.PivotTo then placed:PivotTo(targetCF)
			elseif placed:IsA("BasePart") then placed.CFrame = targetCF
			elseif placed:IsA("Model") and placed.PrimaryPart then placed:SetPrimaryPartCFrame(targetCF) end
		end)
	end

	-- Scale (Model:ScaleTo on Open Cloud-era models; fallback per-part scaling).
	local scale = tonumber(payload.scale)
	if scale and scale > 0 and math.abs(scale - 1) > 0.001 then
		pcall(function()
			if placed:IsA("Model") and placed.ScaleTo then placed:ScaleTo(scale)
			elseif placed:IsA("BasePart") then placed.Size = placed.Size * scale end
		end)
	end

	-- Anchor parts last so PivotTo / ScaleTo can finish first.
	if payload.anchor ~= false then
		for _, d in ipairs(placed:GetDescendants()) do
			if d:IsA("BasePart") then d.Anchored = true end
		end
		if placed:IsA("BasePart") then placed.Anchored = true end
	end

	appendLog(("Inserted asset %d → %s (safety:%s, scripts:%d, sus:%d)"):format(
		usedId, fullPath(placed), safetyStatus, scriptCount, suspiciousCount
	))
	return true, nil, placed, { asset_id = usedId, attempted_ids = candidates, insert_attempts = attempts, safety_status = safetyStatus, script_count = scriptCount, suspicious_count = suspiciousCount, fallback_used = usedId ~= primary }
end

function Actions.set_properties(a)
	local _, _, _, payload = normalizeAction(a)
	local path = tostring(payload.path or a.name or "")
	local inst = resolvePath(path, false)
	if not inst then return true, "skipped (not found): " .. path end
	applyProps(inst, payload.properties or {})
	return true
end

function Actions.rename(a)
	local _, _, _, payload = normalizeAction(a)
	local inst = resolvePath(tostring(payload.path or a.name or ""), false)
	if not inst then return true, "skipped" end
	local n = tostring(payload.new_name or payload.newName or "")
	if n == "" then return false, "missing name" end
	inst.Name = n
	return true
end

function Actions.move(a)
	local _, _, _, payload = normalizeAction(a)
	local inst = resolvePath(tostring(payload.path or a.name or ""), false)
	if not inst then return true, "skipped" end
	local par = resolvePath(tostring(payload.new_parent or payload.parent or "Workspace"), true)
	if not par then return false, "bad target" end
	inst.Parent = par
	return true
end

function Actions.delete(a)
	local _, _, _, payload = normalizeAction(a)
	local inst = resolvePath(tostring(payload.path or a.name or ""), false)
	if not inst then return true, "skipped" end
	appendLog("Deleting " .. fullPath(inst))
	inst:Destroy()
	return true
end

function Actions.terrain(a)
	local _, _, _, payload = normalizeAction(a)
	local subKind = tostring(payload.sub or "fill")
	if subKind == "clear" then
		Terrain:Clear(); return true
	end
	local matName = tostring(payload.material or "Grass")
	local mat = Enum.Material[matName] or Enum.Material.Grass
	local cf = CFrame.new(toVector3(payload.cframe or {}))
	local sz = toVector3(payload.size or {x=512,y=8,z=512}, Vector3.new(512,8,512))
	Terrain:FillBlock(cf, sz, mat)
	return true
end

function Actions.setting(a)
	local _, _, _, payload = normalizeAction(a)
	-- Apply a service-level setting (e.g. Workspace.Gravity)
	local svcName = tostring(payload.service or "Workspace")
	local svc = getService(svcName)
	if not svc then return false, "no service: " .. svcName end
	applyProps(svc, payload.properties or {})
	return true
end

function Actions.run_lua(a)
	-- Execute arbitrary Lua via loadstring (Studio only)
	local _, _, _, payload = normalizeAction(a)
	local src = tostring(payload.source or payload.code or "")
	if src == "" then return false, "empty source" end
	local fn, err = loadstring(src)
	if not fn then return false, "syntax error: " .. tostring(err) end
	local ok2, e2 = pcall(fn)
	if not ok2 then return false, "runtime error: " .. tostring(e2) end
	local result = nil
	local verify = type(payload.verification) == "table" and payload.verification or nil
	if verify then
		result = {}
		local rootPath = tostring(verify.root_path or verify.path or "")
		if rootPath ~= "" then
			local rootInst = resolvePath(rootPath, false)
			if not rootInst then return false, "verification failed: missing " .. rootPath end
			local count = 1 + #rootInst:GetDescendants()
			local minCreated = tonumber(verify.min_created or verify.min_instances or 1) or 1
			if count < minCreated then return false, "verification failed: only " .. tostring(count) .. " instance(s) found at " .. rootPath end
			result.path = instancePath(rootInst)
			result.name = rootInst.Name
			result.verified_instances = count
		end
	end
	return true, nil, nil, result
end
Actions.run = Actions.run_lua

function Actions.organize_project(a)
	-- Move Workspace loose parts into organised folders
	local moved = {}
	local protected = { Terrain=true, Camera=true, Map=true, NPCs=true, Props=true, Vehicles=true, Gameplay=true }
	local function wf(n) return ensureFolder(Workspace, n) end
	for _, inst in ipairs(Workspace:GetChildren()) do
		if not protected[inst.Name] then
			local lname = inst.Name:lower()
			local target
			if inst:IsA("SpawnLocation") or lname:find("checkpoint") then target = wf("Gameplay")
			elseif inst:FindFirstChildOfClass("Humanoid") or lname:find("npc") or lname:find("enemy") then target = wf("NPCs")
			elseif lname:find("car") or lname:find("vehicle") or lname:find("boat") then target = wf("Vehicles")
			elseif inst:IsA("Model") or inst:IsA("Folder") then target = wf("Map")
			elseif inst:IsA("BasePart") then target = wf("Props")
			end
			if target then local from = fullPath(inst); inst.Parent = target; table.insert(moved, from) end
		end
	end
	appendLog(("Organized: moved %d items"):format(#moved))
	return true
end

function Actions.autofix_project(a)
	Actions.organize_project(a)
	local fixed = 0
	for _, inst in ipairs(game:GetDescendants()) do
		if inst:IsA("BasePart") and inst.Parent == Workspace and not inst.Anchored then
			inst.Anchored = true; fixed += 1
		end
	end
	appendLog(("Auto-fix: anchored %d loose parts"):format(fixed))
	return true
end

function Actions.scan_project()
	task.spawn(pushSnapshot)
	return true
end

----------------------------------------------------------------
-- AI PLAYTEST — deep static + light-runtime audit of the project
-- Runs entirely in Edit mode, never enters Play. Produces a structured
-- list of findings (severity, category, suggested_fix) plus metrics
-- (memory, part/script counts, mobile readiness) and POSTs to the
-- /playtest/report endpoint where chat + UI surface it.
----------------------------------------------------------------
local SUSPICIOUS_LUA = {
	"require%s*%(%s*%d+", "getfenv", "setfenv", "loadstring%s*%(",
	"HttpService:GetAsync", "HttpService:PostAsync", "game:HttpGet",
	"_G%[", "shared%[", "hookfunction", "antiaa", "fe%s*=%s*false",
}

local function _addFinding(list, severity, category, title, detail, path, suggested_fix, auto_fixable)
	table.insert(list, {
		severity = severity, category = category, title = title,
		detail = detail, path = path or "",
		suggested_fix = suggested_fix or "", auto_fixable = auto_fixable == true,
	})
end

local function _ancestryName(inst)
	local names, cur, depth = {}, inst, 0
	while cur and depth < 8 do
		table.insert(names, 1, cur.Name)
		cur = cur.Parent
		depth = depth + 1
	end
	return table.concat(names, ".")
end

function Actions.playtest()
	local findings = {}
	local metrics = {
		started_at = os.time(),
		part_count = 0, anchored_parts = 0, unanchored_parts = 0,
		script_count = 0, local_script_count = 0, module_count = 0,
		empty_script_count = 0, suspicious_script_count = 0,
		mesh_count = 0, decal_count = 0, sound_count = 0,
		gui_count = 0, button_count = 0, small_text_count = 0, tiny_button_count = 0,
		remote_event_count = 0, remote_function_count = 0,
		spawn_count = 0, humanoid_count = 0, tool_count = 0,
		oversized_part_count = 0, massive_model_count = 0,
		memory_mb = 0, place_id = tostring(game.PlaceId or 0),
	}

	-- Memory snapshot (best-effort).
	pcall(function()
		local s = game:GetService("Stats")
		metrics.memory_mb = math.floor(s:GetTotalMemoryUsageMb() or 0)
	end)
	if metrics.memory_mb > 1500 then
		_addFinding(findings, "high", "performance",
			"High memory usage", ("Studio is using ~%d MB. Heavy assets, meshes, or scripts may cause lag on low-end devices."):format(metrics.memory_mb),
			"game", "Replace high-poly meshes, compress textures, or remove unused assets.", false)
	end

	-- Workspace / map audit.
	local workspaceParts = 0
	for _, d in ipairs(Workspace:GetDescendants()) do
		if d:IsA("BasePart") then
			workspaceParts = workspaceParts + 1
			metrics.part_count = metrics.part_count + 1
			if d.Anchored then metrics.anchored_parts = metrics.anchored_parts + 1
			else metrics.unanchored_parts = metrics.unanchored_parts + 1 end
			local sz = d.Size
			if sz.X > 2048 or sz.Y > 2048 or sz.Z > 2048 then
				metrics.oversized_part_count = metrics.oversized_part_count + 1
				_addFinding(findings, "medium", "performance",
					"Oversized part", ("%s is %dx%dx%d studs."):format(d.Name, sz.X, sz.Y, sz.Z),
					_ancestryName(d), "Split or rescale to keep parts under 2048 studs.", false)
			end
		elseif d:IsA("MeshPart") or d:IsA("SpecialMesh") then
			metrics.mesh_count = metrics.mesh_count + 1
		elseif d:IsA("Decal") or d:IsA("Texture") then
			metrics.decal_count = metrics.decal_count + 1
		elseif d:IsA("Sound") then
			metrics.sound_count = metrics.sound_count + 1
			if (d.SoundId or "") == "" then
				_addFinding(findings, "low", "audio", "Empty Sound", "Sound has no SoundId.",
					_ancestryName(d), "Set a valid rbxassetid.", false)
			end
		elseif d:IsA("Humanoid") then
			metrics.humanoid_count = metrics.humanoid_count + 1
		elseif d:IsA("Tool") then
			metrics.tool_count = metrics.tool_count + 1
			if not d:FindFirstChild("Handle") then
				_addFinding(findings, "high", "tools", "Tool missing Handle",
					"Tool '" .. d.Name .. "' has no Handle; it won't equip.",
					_ancestryName(d), "Add a BasePart named 'Handle' inside the Tool.", true)
			end
		elseif d:IsA("SpawnLocation") then
			metrics.spawn_count = metrics.spawn_count + 1
			if d.CanCollide == false and d.Anchored == false then
				_addFinding(findings, "critical", "spawn", "Floating spawn",
					"SpawnLocation is unanchored and non-collidable; players will fall through.",
					_ancestryName(d), "Anchor the SpawnLocation and enable CanCollide.", true)
			end
		end
	end

	if metrics.spawn_count == 0 then
		_addFinding(findings, "critical", "spawn", "No SpawnLocation",
			"Workspace has no SpawnLocation. Players cannot spawn into the game.",
			"Workspace", "Insert at least one SpawnLocation at a safe ground position.", false)
	end
	if metrics.part_count > 60000 then
		_addFinding(findings, "high", "performance", "Very high part count",
			("Workspace has %d parts; Roblox struggles past ~50k."):format(metrics.part_count),
			"Workspace", "Enable StreamingEnabled, merge static parts, or remove unused detail.", false)
	end

	-- Script audit — server, local, module, inside Workspace/ServerScriptService/StarterPlayer/etc.
	local function scanScript(s)
		metrics.script_count = metrics.script_count + 1
		if s:IsA("LocalScript") then metrics.local_script_count = metrics.local_script_count + 1 end
		if s:IsA("ModuleScript") then metrics.module_count = metrics.module_count + 1 end
		local src = ""
		pcall(function() src = s.Source end)
		if not src or #src < 4 then
			metrics.empty_script_count = metrics.empty_script_count + 1
			_addFinding(findings, "medium", "scripts", "Empty script",
				s.ClassName .. " '" .. s.Name .. "' has no code.",
				_ancestryName(s), "Add real Luau code or delete the script.", true)
			return
		end
		local low = src:lower()
		for _, pat in ipairs(SUSPICIOUS_LUA) do
			if low:find(pat) then
				metrics.suspicious_script_count = metrics.suspicious_script_count + 1
				_addFinding(findings, "critical", "security", "Suspicious script",
					s.ClassName .. " '" .. s.Name .. "' uses a pattern often found in backdoors/exploits.",
					_ancestryName(s), "Review or remove this script; quarantine on insert.", false)
				break
			end
		end
		-- Luau syntax sanity (loadstring is Studio-only, runs in plugin context).
		local fn, err = loadstring(src, s.Name)
		if not fn then
			_addFinding(findings, "high", "scripts", "Script syntax error",
				err or "syntax error", _ancestryName(s),
				"Fix the syntax error; queue Fix Scripts to auto-repair common issues.", false)
		end
	end
	for _, svcName in ipairs({"Workspace","ServerScriptService","ReplicatedStorage","StarterPlayer","StarterGui","StarterPack","Lighting"}) do
		local svc = game:FindFirstChild(svcName)
		if svc then
			for _, d in ipairs(svc:GetDescendants()) do
				if d:IsA("LuaSourceContainer") then scanScript(d) end
			end
		end
	end

	-- Remote audit.
	local rs = game:FindFirstChild("ReplicatedStorage")
	if rs then
		for _, d in ipairs(rs:GetDescendants()) do
			if d:IsA("RemoteEvent") then metrics.remote_event_count = metrics.remote_event_count + 1
			elseif d:IsA("RemoteFunction") then metrics.remote_function_count = metrics.remote_function_count + 1 end
		end
	end

	-- UI / mobile audit.
	local sg = game:FindFirstChild("StarterGui")
	if sg then
		for _, d in ipairs(sg:GetDescendants()) do
			if d:IsA("ScreenGui") then metrics.gui_count = metrics.gui_count + 1
			elseif d:IsA("GuiButton") then
				metrics.button_count = metrics.button_count + 1
				local sz = d.AbsoluteSize
				if sz.X > 0 and sz.Y > 0 and (sz.X < 44 or sz.Y < 44) then
					metrics.tiny_button_count = metrics.tiny_button_count + 1
				end
			elseif d:IsA("TextLabel") or d:IsA("TextButton") then
				if (d.TextSize or 0) > 0 and d.TextSize < 14 and not d.TextScaled then
					metrics.small_text_count = metrics.small_text_count + 1
				end
			end
		end
	end
	if metrics.tiny_button_count > 0 then
		_addFinding(findings, "medium", "mobile",
			"Mobile-unfriendly buttons", ("%d button(s) are smaller than 44px; mobile players will mis-tap."):format(metrics.tiny_button_count),
			"StarterGui", "Increase button size or enable UIScale/UIAspectRatioConstraint.", false)
	end
	if metrics.small_text_count > 0 then
		_addFinding(findings, "low", "mobile",
			"Small text", ("%d text labels are under 14pt and not TextScaled; hard to read on phones."):format(metrics.small_text_count),
			"StarterGui", "Enable TextScaled or raise TextSize.", false)
	end
	if metrics.gui_count == 0 then
		_addFinding(findings, "low", "ui", "No ScreenGui",
			"StarterGui has no ScreenGui — the game has no UI yet.",
			"StarterGui", "Generate UI from chat or add a ScreenGui.", false)
	end

	-- Lighting / atmosphere sanity.
	local lighting = game:FindFirstChild("Lighting")
	if lighting then
		if lighting.Brightness < 0.1 then
			_addFinding(findings, "low", "lighting", "Very dark lighting",
				"Lighting.Brightness is near zero; the map may render pitch black.",
				"Lighting", "Raise Brightness to ~2 or add Atmosphere.", true)
		end
	end

	-- Summary scoring.
	local sevWeights = { critical = 8, high = 4, medium = 2, low = 1, info = 0 }
	local score = 100
	for _, f in ipairs(findings) do score = score - (sevWeights[f.severity] or 0) end
	if score < 0 then score = 0 end
	local summary = {
		score = score,
		grade = (score >= 90 and "A") or (score >= 75 and "B") or (score >= 60 and "C") or (score >= 40 and "D") or "F",
		ready_to_publish = score >= 80 and metrics.spawn_count > 0,
		highlights = {
			("%d parts / %d scripts / %d UIs"):format(metrics.part_count, metrics.script_count, metrics.gui_count),
			("memory ~%d MB"):format(metrics.memory_mb),
		},
	}

	-- Persist + log so chat picks it up next turn.
	local payload = {
		token = getToken(),
		place_id = tostring(game.PlaceId or 0),
		summary = summary, findings = findings, metrics = metrics,
	}
	local data, err = postPlugin("/api/public/plugin/playtest/report", payload)
	if err then appendLog("Playtest report POST failed: " .. tostring(err), "warn")
	else appendLog(("AI Playtest: grade %s · %d findings · score %d"):format(summary.grade, #findings, summary.score)) end

	-- Mirror compact summary into the activity log for instant feedback.
	for i = 1, math.min(6, #findings) do
		local f = findings[i]
		appendLog(("[%s] %s — %s"):format(f.severity, f.title, f.detail), f.severity == "critical" and "warn" or "info")
	end
	return true, nil, nil, { report_id = data and data.id, score = summary.score, finding_count = #findings }
end


----------------------------------------------------------------
-- AI BUILD TIMELINE — capture & restore named milestones
-- snapshot:          walks a curated set of services, serializes the
--                    instance tree into JSON, and POSTs it as a new
--                    build_milestone. Bounded by depth/instance caps.
-- restore_snapshot:  pulls a saved milestone, clears the captured roots,
--                    and rebuilds the instance tree class-by-class.
----------------------------------------------------------------
-- Forward-declare the two helpers that are needed by Actions.restore_snapshot
-- (defined later, outside the do-block). Wrapping the rest of this section in
-- `do ... end` keeps the ~30 timeline helpers OUT of the top-level scope so
-- we stay under Luau's 200 local-register limit per function.
local tlClearRoot
local tlRebuild
;(function()
local TIMELINE_ROOTS = {
	"Workspace","ServerScriptService","ServerStorage","ReplicatedStorage",
	"ReplicatedFirst","StarterPlayer","StarterGui","StarterPack",
	"Lighting","SoundService",
}
local TIMELINE_MAX_INSTANCES = 4000
local TIMELINE_MAX_DEPTH     = 12
-- Top-level children we must never delete during restore. Roblox treats
-- some of these as singleton services or built-ins.
local TIMELINE_PROTECTED = {
	Terrain=true, Camera=true,
	StarterPlayerScripts=true, StarterCharacterScripts=true, StarterPlayerHumanoid=true,
}
-- Class whitelist + per-class property capture for restore.
local function _v3(v) return { v.X, v.Y, v.Z } end
local function _cf(c) return { c:GetComponents() } end
local function _col(c) return { math.floor(c.R*255), math.floor(c.G*255), math.floor(c.B*255) } end
local function _udim2(u) return { u.X.Scale, u.X.Offset, u.Y.Scale, u.Y.Offset } end
local function _udim(u) return { u.Scale, u.Offset } end

local function readVector3(t) return t and Vector3.new(t[1] or 0, t[2] or 0, t[3] or 0) end
local function readCFrame(t)
	if not t or #t < 12 then return nil end
	return CFrame.new(t[1],t[2],t[3],t[4],t[5],t[6],t[7],t[8],t[9],t[10],t[11],t[12])
end
local function readColor(t) if not t then return nil end
	return Color3.fromRGB(t[1] or 0, t[2] or 0, t[3] or 0)
end
local function readUDim2(t) if not t then return nil end
	return UDim2.new(t[1] or 0, t[2] or 0, t[3] or 0, t[4] or 0)
end
local function readUDim(t) if not t then return nil end
	return UDim.new(t[1] or 0, t[2] or 0)
end

local TIMELINE_CAPTURE = {}
local function capPart(inst)
	return {
		Size=_v3(inst.Size), CFrame=_cf(inst.CFrame), Color=_col(inst.Color),
		Material=inst.Material.Name, Anchored=inst.Anchored, CanCollide=inst.CanCollide,
		Transparency=inst.Transparency, Reflectance=inst.Reflectance,
		Shape = inst:IsA("Part") and inst.Shape.Name or nil,
	}
end
TIMELINE_CAPTURE.Part = capPart
TIMELINE_CAPTURE.WedgePart = capPart
TIMELINE_CAPTURE.TrussPart = capPart
TIMELINE_CAPTURE.CornerWedgePart = capPart
TIMELINE_CAPTURE.SpawnLocation = function(inst)
	local p = capPart(inst); p.Neutral = inst.Neutral; p.Duration = inst.Duration; return p
end
TIMELINE_CAPTURE.Script = function(inst) return { Source = inst.Source or "", Disabled = inst.Disabled } end
TIMELINE_CAPTURE.LocalScript = TIMELINE_CAPTURE.Script
TIMELINE_CAPTURE.ModuleScript = function(inst) return { Source = inst.Source or "" } end
TIMELINE_CAPTURE.ScreenGui = function(inst)
	return { ResetOnSpawn = inst.ResetOnSpawn, IgnoreGuiInset = inst.IgnoreGuiInset, Enabled = inst.Enabled, DisplayOrder = inst.DisplayOrder }
end
local function capGuiBase(inst)
	return {
		Size=_udim2(inst.Size), Position=_udim2(inst.Position),
		BackgroundColor3=_col(inst.BackgroundColor3), BackgroundTransparency=inst.BackgroundTransparency,
		BorderSizePixel=inst.BorderSizePixel, ZIndex=inst.ZIndex, Visible=inst.Visible,
		AnchorPoint = { inst.AnchorPoint.X, inst.AnchorPoint.Y },
	}
end
TIMELINE_CAPTURE.Frame = capGuiBase
TIMELINE_CAPTURE.ScrollingFrame = function(inst)
	local p = capGuiBase(inst); p.CanvasSize = _udim2(inst.CanvasSize); return p
end
local function capText(inst)
	local p = capGuiBase(inst)
	p.Text = inst.Text; p.TextColor3 = _col(inst.TextColor3); p.TextScaled = inst.TextScaled
	p.TextSize = inst.TextSize; p.Font = inst.Font.Name; p.TextWrapped = inst.TextWrapped
	p.TextXAlignment = inst.TextXAlignment.Name; p.TextYAlignment = inst.TextYAlignment.Name
	return p
end
TIMELINE_CAPTURE.TextLabel = capText
TIMELINE_CAPTURE.TextButton = capText
TIMELINE_CAPTURE.TextBox = capText
local function capImage(inst)
	local p = capGuiBase(inst)
	p.Image = inst.Image; p.ImageColor3 = _col(inst.ImageColor3); p.ImageTransparency = inst.ImageTransparency
	p.ScaleType = inst.ScaleType.Name
	return p
end
TIMELINE_CAPTURE.ImageLabel = capImage
TIMELINE_CAPTURE.ImageButton = capImage
TIMELINE_CAPTURE.UICorner = function(inst) return { CornerRadius = _udim(inst.CornerRadius) } end
TIMELINE_CAPTURE.UIStroke = function(inst)
	return { Color = _col(inst.Color), Thickness = inst.Thickness, Transparency = inst.Transparency, ApplyStrokeMode = inst.ApplyStrokeMode.Name }
end
TIMELINE_CAPTURE.UIPadding = function(inst)
	return { PaddingTop=_udim(inst.PaddingTop), PaddingBottom=_udim(inst.PaddingBottom),
		PaddingLeft=_udim(inst.PaddingLeft), PaddingRight=_udim(inst.PaddingRight) }
end
TIMELINE_CAPTURE.UIListLayout = function(inst)
	return { FillDirection=inst.FillDirection.Name, HorizontalAlignment=inst.HorizontalAlignment.Name,
		VerticalAlignment=inst.VerticalAlignment.Name, Padding=_udim(inst.Padding), SortOrder=inst.SortOrder.Name }
end
TIMELINE_CAPTURE.UIGridLayout = function(inst)
	return { CellSize=_udim2(inst.CellSize), CellPadding=_udim2(inst.CellPadding), SortOrder=inst.SortOrder.Name,
		FillDirection=inst.FillDirection.Name, HorizontalAlignment=inst.HorizontalAlignment.Name,
		VerticalAlignment=inst.VerticalAlignment.Name }
end
TIMELINE_CAPTURE.UIAspectRatioConstraint = function(inst)
	return { AspectRatio = inst.AspectRatio, AspectType = inst.AspectType.Name, DominantAxis = inst.DominantAxis.Name }
end
TIMELINE_CAPTURE.UIScale = function(inst) return { Scale = inst.Scale } end
TIMELINE_CAPTURE.UIGradient = function(inst)
	return { Color = nil, Transparency = nil, Rotation = inst.Rotation, Enabled = inst.Enabled }
end
TIMELINE_CAPTURE.Folder = function(_) return {} end
TIMELINE_CAPTURE.Model = function(_) return {} end
TIMELINE_CAPTURE.Configuration = function(_) return {} end
TIMELINE_CAPTURE.RemoteEvent = function(_) return {} end
TIMELINE_CAPTURE.RemoteFunction = function(_) return {} end
TIMELINE_CAPTURE.BindableEvent = function(_) return {} end
TIMELINE_CAPTURE.BindableFunction = function(_) return {} end
TIMELINE_CAPTURE.StringValue = function(i) return { Value = i.Value } end
TIMELINE_CAPTURE.IntValue = function(i) return { Value = i.Value } end
TIMELINE_CAPTURE.NumberValue = function(i) return { Value = i.Value } end
TIMELINE_CAPTURE.BoolValue = function(i) return { Value = i.Value } end
TIMELINE_CAPTURE.Decal = function(i) return { Texture=i.Texture, Color3=_col(i.Color3), Transparency=i.Transparency, Face=i.Face.Name } end
TIMELINE_CAPTURE.Texture = TIMELINE_CAPTURE.Decal
TIMELINE_CAPTURE.Sound = function(i) return { SoundId=i.SoundId, Volume=i.Volume, Looped=i.Looped, Playing=i.Playing, PlaybackSpeed=i.PlaybackSpeed } end
TIMELINE_CAPTURE.SpecialMesh = function(i) return { MeshId=i.MeshId, TextureId=i.TextureId, MeshType=i.MeshType.Name, Scale=_v3(i.Scale) } end
TIMELINE_CAPTURE.Attachment = function(i) return { CFrame=_cf(i.CFrame) } end
TIMELINE_CAPTURE.PointLight = function(i) return { Color=_col(i.Color), Brightness=i.Brightness, Range=i.Range, Enabled=i.Enabled } end
TIMELINE_CAPTURE.SurfaceLight = TIMELINE_CAPTURE.PointLight
TIMELINE_CAPTURE.SpotLight = TIMELINE_CAPTURE.PointLight
TIMELINE_CAPTURE.ParticleEmitter = function(i) return { Rate=i.Rate, Lifetime={i.Lifetime.Min,i.Lifetime.Max}, Speed={i.Speed.Min,i.Speed.Max}, Texture=i.Texture, Enabled=i.Enabled } end

local function tlCapture(inst, depth, counter, out)
	if counter[1] >= TIMELINE_MAX_INSTANCES then return end
	if depth > TIMELINE_MAX_DEPTH then return end
	local fn = TIMELINE_CAPTURE[inst.ClassName]
	if not fn then return end
	counter[1] += 1
	local node = { c = inst.ClassName, n = inst.Name }
	local okP, props = pcall(fn, inst)
	if okP and type(props) == "table" then node.p = props end
	local children = inst:GetChildren()
	if #children > 0 then
		local kids = {}
		for _, child in ipairs(children) do
			tlCapture(child, depth + 1, counter, kids)
			if counter[1] >= TIMELINE_MAX_INSTANCES then break end
		end
		if #kids > 0 then node.k = kids end
	end
	table.insert(out, node)
end

local function tlCountByKind(node, acc)
	local cls = node.c or ""
	if cls:find("Script") then acc.scripts += 1
	elseif cls == "Part" or cls == "WedgePart" or cls == "TrussPart" or cls == "CornerWedgePart" or cls == "MeshPart" or cls == "SpawnLocation" then
		acc.parts += 1
	elseif cls == "ScreenGui" or cls == "Frame" or cls == "TextLabel" or cls == "TextButton" or cls == "ImageLabel" or cls == "ImageButton" then
		acc.gui += 1
	end
	if node.k then for _, c in ipairs(node.k) do tlCountByKind(c, acc) end end
end

function Actions.snapshot(a)
	local payload = (a and a.payload) or {}
	local label = tostring(payload.label or a.name or "Milestone")
	local summary = tostring(payload.summary or "")
	local kind = tostring(payload.kind or "manual")
	local counter = { 0 }
	local rootsOut = {}
	for _, rootName in ipairs(TIMELINE_ROOTS) do
		local svc = getService(rootName)
		if svc then
			local kids = {}
			for _, child in ipairs(svc:GetChildren()) do
				if not TIMELINE_PROTECTED[child.Name] then
					tlCapture(child, 1, counter, kids)
					if counter[1] >= TIMELINE_MAX_INSTANCES then break end
				end
			end
			table.insert(rootsOut, { c = "_Root", n = rootName, k = kids })
		end
	end
	local acc = { parts = 0, scripts = 0, gui = 0 }
	for _, root in ipairs(rootsOut) do
		if root.k then for _, c in ipairs(root.k) do tlCountByKind(c, acc) end end
	end
	local snapshot = { version = 1, roots = rootsOut, captured_at = os.time(), instance_count = counter[1] }
	local body = {
		token = getToken(),
		project_id = activeProjectId or (a and a.project_id) or nil,
		place_id = tostring(game.PlaceId),
		label = label, summary = summary, kind = kind,
		snapshot = snapshot,
		counts = acc,
	}
	local res, err = postPlugin("/api/public/plugin/snapshot/upload", body)
	if err then
		appendLog("Snapshot upload failed: " .. tostring(err), "warn")
		return false, "upload failed: " .. tostring(err)
	end
	appendLog(("📸 Milestone saved: %s · %d parts · %d scripts · %d UI"):format(label, acc.parts, acc.scripts, acc.gui))
	return true, nil, nil, { milestone_id = res and res.id, instance_count = counter[1] }
end

tlClearRoot = function(svc)
	for _, child in ipairs(svc:GetChildren()) do
		if not TIMELINE_PROTECTED[child.Name] then
			pcall(function() child:Destroy() end)
		end
	end
end

local function tlSet(inst, name, value)
	pcall(function() inst[name] = value end)
end
local function tlEnum(inst, name, enumType, value)
	if value == nil then return end
	pcall(function() inst[name] = enumType[value] end)
end

local tlApply = {}

tlApply.BasePart = function(inst, cls, p)
	if p.Size then tlSet(inst, "Size", readVector3(p.Size)) end
	if p.CFrame then tlSet(inst, "CFrame", readCFrame(p.CFrame)) end
	if p.Color then tlSet(inst, "Color", readColor(p.Color)) end
	tlEnum(inst, "Material", Enum.Material, p.Material)
	tlSet(inst, "Transparency", p.Transparency); tlSet(inst, "Reflectance", p.Reflectance)
	tlSet(inst, "Anchored", p.Anchored); tlSet(inst, "CanCollide", p.CanCollide)
	if cls == "Part" then tlEnum(inst, "Shape", Enum.PartType, p.Shape) end
	if cls == "SpawnLocation" then tlSet(inst, "Neutral", p.Neutral); tlSet(inst, "Duration", p.Duration) end
end

tlApply.Script = function(inst, _, p) tlSet(inst, "Source", p.Source); tlSet(inst, "Disabled", p.Disabled) end
tlApply.ModuleScript = function(inst, _, p) tlSet(inst, "Source", p.Source) end

tlApply.ScreenGui = function(inst, _, p)
	tlSet(inst, "ResetOnSpawn", p.ResetOnSpawn); tlSet(inst, "IgnoreGuiInset", p.IgnoreGuiInset)
	tlSet(inst, "Enabled", p.Enabled); tlSet(inst, "DisplayOrder", p.DisplayOrder)
end

tlApply.GuiObject = function(inst, cls, p)
	if p.Size then tlSet(inst, "Size", readUDim2(p.Size)) end
	if p.Position then tlSet(inst, "Position", readUDim2(p.Position)) end
	if p.BackgroundColor3 then tlSet(inst, "BackgroundColor3", readColor(p.BackgroundColor3)) end
	tlSet(inst, "BackgroundTransparency", p.BackgroundTransparency); tlSet(inst, "BorderSizePixel", p.BorderSizePixel)
	tlSet(inst, "ZIndex", p.ZIndex); tlSet(inst, "Visible", p.Visible)
	if p.AnchorPoint then tlSet(inst, "AnchorPoint", Vector2.new(p.AnchorPoint[1] or 0, p.AnchorPoint[2] or 0)) end
	if cls == "ScrollingFrame" and p.CanvasSize then tlSet(inst, "CanvasSize", readUDim2(p.CanvasSize)) end
	if cls == "TextLabel" or cls == "TextButton" or cls == "TextBox" then
		tlSet(inst, "Text", p.Text); if p.TextColor3 then tlSet(inst, "TextColor3", readColor(p.TextColor3)) end
		tlSet(inst, "TextScaled", p.TextScaled); tlSet(inst, "TextSize", p.TextSize); tlSet(inst, "TextWrapped", p.TextWrapped)
		tlEnum(inst, "Font", Enum.Font, p.Font)
		tlEnum(inst, "TextXAlignment", Enum.TextXAlignment, p.TextXAlignment)
		tlEnum(inst, "TextYAlignment", Enum.TextYAlignment, p.TextYAlignment)
	end
	if cls == "ImageLabel" or cls == "ImageButton" then
		tlSet(inst, "Image", p.Image); if p.ImageColor3 then tlSet(inst, "ImageColor3", readColor(p.ImageColor3)) end
		tlSet(inst, "ImageTransparency", p.ImageTransparency)
		tlEnum(inst, "ScaleType", Enum.ScaleType, p.ScaleType)
	end
end

tlApply.UICorner = function(inst, _, p) if p.CornerRadius then tlSet(inst, "CornerRadius", readUDim(p.CornerRadius)) end end
tlApply.UIStroke = function(inst, _, p)
	if p.Color then tlSet(inst, "Color", readColor(p.Color)) end
	tlSet(inst, "Thickness", p.Thickness); tlSet(inst, "Transparency", p.Transparency)
end
tlApply.UIPadding = function(inst, _, p)
	if p.PaddingTop then tlSet(inst, "PaddingTop", readUDim(p.PaddingTop)) end
	if p.PaddingBottom then tlSet(inst, "PaddingBottom", readUDim(p.PaddingBottom)) end
	if p.PaddingLeft then tlSet(inst, "PaddingLeft", readUDim(p.PaddingLeft)) end
	if p.PaddingRight then tlSet(inst, "PaddingRight", readUDim(p.PaddingRight)) end
end
tlApply.UIListLayout = function(inst, _, p)
	tlEnum(inst, "FillDirection", Enum.FillDirection, p.FillDirection)
	tlEnum(inst, "HorizontalAlignment", Enum.HorizontalAlignment, p.HorizontalAlignment)
	tlEnum(inst, "VerticalAlignment", Enum.VerticalAlignment, p.VerticalAlignment)
	if p.Padding then tlSet(inst, "Padding", readUDim(p.Padding)) end
	tlEnum(inst, "SortOrder", Enum.SortOrder, p.SortOrder)
end
tlApply.UIGridLayout = function(inst, _, p)
	if p.CellSize then tlSet(inst, "CellSize", readUDim2(p.CellSize)) end
	if p.CellPadding then tlSet(inst, "CellPadding", readUDim2(p.CellPadding)) end
end
tlApply.UIAspectRatioConstraint = function(inst, _, p) tlSet(inst, "AspectRatio", p.AspectRatio) end
tlApply.UIScale = function(inst, _, p) tlSet(inst, "Scale", p.Scale) end
tlApply.Value = function(inst, _, p) tlSet(inst, "Value", p.Value) end
tlApply.Decal = function(inst, _, p)
	tlSet(inst, "Texture", p.Texture); if p.Color3 then tlSet(inst, "Color3", readColor(p.Color3)) end
	tlSet(inst, "Transparency", p.Transparency)
	tlEnum(inst, "Face", Enum.NormalId, p.Face)
end
tlApply.Sound = function(inst, _, p)
	tlSet(inst, "SoundId", p.SoundId); tlSet(inst, "Volume", p.Volume)
	tlSet(inst, "Looped", p.Looped); tlSet(inst, "PlaybackSpeed", p.PlaybackSpeed)
end
tlApply.SpecialMesh = function(inst, _, p)
	tlSet(inst, "MeshId", p.MeshId); tlSet(inst, "TextureId", p.TextureId)
	tlEnum(inst, "MeshType", Enum.MeshType, p.MeshType)
	if p.Scale then tlSet(inst, "Scale", readVector3(p.Scale)) end
end
tlApply.Attachment = function(inst, _, p) if p.CFrame then tlSet(inst, "CFrame", readCFrame(p.CFrame)) end end
tlApply.Light = function(inst, _, p)
	if p.Color then tlSet(inst, "Color", readColor(p.Color)) end
	tlSet(inst, "Brightness", p.Brightness); tlSet(inst, "Range", p.Range); tlSet(inst, "Enabled", p.Enabled)
end
tlApply.ParticleEmitter = function(inst, _, p)
	tlSet(inst, "Texture", p.Texture); tlSet(inst, "Enabled", p.Enabled); tlSet(inst, "Rate", p.Rate)
end

local TL_CLASS_GROUP = {
	Part = "BasePart", WedgePart = "BasePart", TrussPart = "BasePart",
	CornerWedgePart = "BasePart", SpawnLocation = "BasePart",
	Script = "Script", LocalScript = "Script",
	Frame = "GuiObject", ScrollingFrame = "GuiObject", TextLabel = "GuiObject",
	TextButton = "GuiObject", TextBox = "GuiObject", ImageLabel = "GuiObject", ImageButton = "GuiObject",
	StringValue = "Value", IntValue = "Value", NumberValue = "Value", BoolValue = "Value",
	Decal = "Decal", Texture = "Decal",
	PointLight = "Light", SpotLight = "Light", SurfaceLight = "Light",
}

local function tlApplyProps(inst, cls, p)
	if not p then return end
	local fn = tlApply[cls] or tlApply[TL_CLASS_GROUP[cls] or ""]
	if fn then fn(inst, cls, p) end
end


tlRebuild = function(parent, node, stats)
	local cls = node.c
	local ok, inst = pcall(function() return Instance.new(cls) end)
	if not ok or not inst then stats.skipped += 1; return end
	pcall(function() inst.Name = tostring(node.n or cls) end)
	tlApplyProps(inst, cls, node.p)
	pcall(function() inst.Parent = parent end)
	stats.created += 1
	if node.k then
		for _, child in ipairs(node.k) do tlRebuild(inst, child, stats) end
	end
end
end)() -- close IIFE opened at the TIMELINE section start; isolates its ~200 locals from the main chunk register frame (Luau limit)

function Actions.restore_snapshot(a)
	local payload = (a and a.payload) or {}
	local id = tostring(payload.milestone_id or payload.id or "")
	if id == "" then return false, "missing milestone_id" end
	local tok = getToken()
	if tok == "" then return false, "no token" end

	-- Fetch the snapshot via GET.
	local url = API_BASE .. "/api/public/plugin/snapshot/fetch?id=" .. HttpService:UrlEncode(id)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = url, Method = "GET",
			Headers = {
				["x-bloxsmith-token"] = tok,
				["authorization"]     = "Bearer " .. tok,
			},
		})
	end)
	if not ok then return false, "network: " .. tostring(res) end
	if not res.Success then return false, "HTTP " .. tostring(res.StatusCode) end
	local okJ, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not okJ or not decoded or not decoded.milestone then return false, "bad fetch payload" end
	local ms = decoded.milestone
	local snap = ms.snapshot_data
	if type(snap) ~= "table" or type(snap.roots) ~= "table" then
		return false, "snapshot has no restorable roots"
	end

	ChangeHistoryService:SetWaypoint("BloxSmith: restore " .. tostring(ms.label or ""))
	local stats = { created = 0, skipped = 0 }
	for _, root in ipairs(snap.roots) do
		local svc = getService(tostring(root.n or ""))
		if svc then
			tlClearRoot(svc)
			if root.k then
				for _, child in ipairs(root.k) do tlRebuild(svc, child, stats) end
			end
		end
	end
	ChangeHistoryService:SetWaypoint("BloxSmith: restored " .. tostring(ms.label or ""))
	appendLog(("↩ Restored milestone '%s' · rebuilt %d instances"):format(tostring(ms.label or ""), stats.created))
	task.spawn(pushSnapshot)
	return true, nil, nil, { created = stats.created, skipped = stats.skipped }
end


----------------------------------------------------------------
-- DISPATCH
----------------------------------------------------------------
dispatch = function(action)
	-- action from server: { id, kind, name, parent_path, payload }
	local kind = tostring(action.kind or ""):lower():gsub("[%s%-]+", "_")
	if pathIsIgnored(tostring(action.parent_path or "")) then
		statsSkipped += 1; appendLog("Skipped " .. kind .. " (ignore filter)")
		return true
	end
	local fn = Actions[kind]
	if not fn then
		appendLog("Unknown action kind: " .. kind, "warn")
		return false, "unknown: " .. kind
	end
	return fn(action)
end

----------------------------------------------------------------
-- FOCUS CAMERA
----------------------------------------------------------------
focusOn = function(instances)
	if not instances or #instances == 0 then return end
	pcall(function() Selection:Set(instances) end)
	local target
	for _, inst in ipairs(instances) do
		if inst and inst.Parent and (inst:IsA("Model") or inst:IsA("BasePart")) then
			target = inst; break
		end
	end
	if not target then return end
	pcall(function()
		local cam = Workspace.CurrentCamera
		if not cam then return end
		local cf
		if target:IsA("Model") then
			local ok, piv = pcall(function() return target:GetPivot() end)
			if ok then cf = piv end
		else cf = target.CFrame end
		if cf then cam.CFrame = CFrame.new(cf.Position + Vector3.new(20,15,20), cf.Position) end
	end)
end

----------------------------------------------------------------
-- SMART EXECUTION ENGINE (Release 1)
--   * canonical dependency-safe ordering
--   * pre-flight validation + auto-repair
--   * retry-once on recoverable failures
--   * detailed execution_report POST at end
----------------------------------------------------------------

-- Canonical execution order — lower runs first.
local KIND_PRIORITY = {
	folder            = 1,
	organize_project  = 1,
	terrain           = 2,
	setting           = 3,   -- lighting / services config
	lighting          = 3,
	service           = 4,
	part              = 5,
	model             = 5,
	insert_asset      = 6,
	remoteevent       = 7,
	remotefunction    = 7,
	bindableevent     = 7,
	modulescript      = 9,
	script            = 10,
	localscript       = 11,
	screengui         = 12,
	gui               = 12,
	frame             = 12,
	textlabel         = 12,
	textbutton        = 12,
	imagelabel        = 12,
	animation         = 13,
	sound             = 14,
	effect            = 15,
	tool              = 16,
	team              = 16,
	leaderstats       = 16,
	npc               = 16,
	set_properties    = 17,
	rename            = 17,
	move              = 17,
	delete            = 17,
	run_lua           = 18,
	playtest          = 19,
	autofix_project   = 20,
	scan_project      = 21,
}

local function kindPriority(kind)
	return KIND_PRIORITY[kind] or 15
end

-- Strip ```lua fences an LLM may have left inside script source.
local function stripFences(src)
	if type(src) ~= "string" or src == "" then return src, false end
	local trimmed = src:match("^%s*(.-)%s*$") or src
	if trimmed:sub(1, 3) == "```" then
		local body = trimmed:gsub("^```[%w]*\n?", ""):gsub("\n?```%s*$", "")
		return body, true
	end
	return src, false
end

-- Pre-flight validator + auto-repair. Returns { ok, reason, repairs = {} }.
local function preflight(action)
	local repairs = {}
	local kind = tostring(action.kind or ""):lower():gsub("[%s%-]+", "_")
	action.kind = kind

	-- normalize parent_path fallback
	if not action.parent_path or action.parent_path == "" then
		local fallback = normParent(kind, "", action.payload or {})
		if fallback and fallback ~= "" then
			action.parent_path = fallback
			table.insert(repairs, "parent-defaulted")
		end
	end

	-- strip code fences from script bodies
	if kind == "script" or kind == "localscript" or kind == "modulescript" then
		local payload = action.payload or {}
		local src = payload.source or payload.content
		if type(src) == "string" then
			local cleaned, changed = stripFences(src)
			if changed then
				payload.source = cleaned
				action.payload = payload
				table.insert(repairs, "stripped-fences")
			end
		end
	end

	-- insert_asset: reject clearly invalid ids
	if kind == "insert_asset" then
		local aid = (action.payload or {}).asset_id
		if type(aid) ~= "number" or aid <= 0 then
			return false, "invalid asset_id", repairs
		end
	end

	-- unknown kind → fail fast
	if not Actions[kind] then
		return false, "unknown kind: " .. kind, repairs
	end

	return true, nil, repairs
end

-- Recoverable-failure classifier: parent-not-found + transient asset load.
local function isRecoverable(errMsg)
	if type(errMsg) ~= "string" then return false end
	local e = errMsg:lower()
	if e:find("not authorized") or e:find("unauthorized") or e:find("permission") or e:find("403") or e:find("private") or e:find("moderated") then return false end
	if e:find("bad parent") then return true end
	if e:find("timeout") or e:find("rate") or e:find("temporar") then return true end
	if e:find("loadasset") or e:find("insertservice") then return true end
	return false
end

-- Stable sort by (priority, original index).
local function sortSmart(actions)
	local indexed = {}
	for i, a in ipairs(actions) do
		indexed[i] = { a = a, i = i, p = kindPriority(tostring(a.kind or ""):lower():gsub("[%s%-]+", "_")) }
	end
	table.sort(indexed, function(x, y)
		if x.p ~= y.p then return x.p < y.p end
		return x.i < y.i
	end)
	local out = {}
	for i, entry in ipairs(indexed) do out[i] = entry.a end
	return out
end

----------------------------------------------------------------
-- APPLY ACTIONS (build engine)
----------------------------------------------------------------
applyActions = function(actions, sourceLabel)
	if #actions == 0 then return end

	if not RunService:IsEdit() then
		syncVal.Text = "Stop Play mode to apply BloxSmith builds permanently."
		setPill("error"); warn("[BloxSmith] Play mode active — stop it first.")
		local reports = {}
		for _, a in ipairs(actions) do
			if a.id then table.insert(reports, { action_id=a.id, status="failed", error="Play mode active" }) end
		end
		if #reports > 0 then
			pcall(function() postPlugin("/api/public/plugin/complete", { token=getToken(), results=reports }) end)
		end
		statsErrors += #actions
		return
	end

	setPill("executing")
	local startedAt = os.clock()
	local projectIdForReport = nil
	for _, a in ipairs(actions) do
		if a.project_id then projectIdForReport = a.project_id; break end
	end

	-- Smart-plan phase: pre-flight everything, drop unrecoverable up-front.
	local planned, invalidSteps = {}, {}
	local repairCount = 0
	for _, a in ipairs(actions) do
		local okPre, reason, repairs = preflight(a)
		if repairs and #repairs > 0 then repairCount = repairCount + #repairs end
		if okPre then
			table.insert(planned, a)
		else
			table.insert(invalidSteps, {
				action_id = a.id, kind = a.kind, name = a.name,
				status = "skipped", error = reason, repairs = repairs or {},
			})
			if a.id then
				pcall(function()
					postPlugin("/api/public/plugin/complete", {
						token = getToken(),
						results = { { action_id = a.id, status = "failed", error = reason } },
					})
				end)
			end
			logLine(("Skipped invalid action [%s %s]: %s"):format(
				tostring(a.kind or "?"), tostring(a.name or ""), tostring(reason)), "warn")
		end
	end

	local sorted = sortSmart(planned)

	local recId
	if ChangeHistoryService.TryBeginRecording then
		recId = ChangeHistoryService:TryBeginRecording("BloxSmith " .. (sourceLabel or "build"), "AI generation")
	else
		ChangeHistoryService:SetWaypoint("BloxSmith pre-build")
	end

	local ok, fail = 0, 0
	local skip = #invalidSteps
	local retries = 0
	local reports, created = {}, {}
	local stepRecords = {}
	for _, s in ipairs(invalidSteps) do table.insert(stepRecords, s) end

	local function flushReports()
		if #reports == 0 then return end
		local payload = reports; reports = {}
		pcall(function()
			postPlugin("/api/public/plugin/complete", {
				token   = getToken(),
				results = payload,
			})
		end)
	end

	local total = #sorted
	appendLog(("Smart-executing %d/%d action(s) (%d skipped, %d repairs)…"):format(
		total, total + skip, skip, repairCount))
	syncVal.Text = ("Building 0/%d…"):format(total)

	for idx, a in ipairs(sorted) do
		if idx == 1 or idx % APPLY_YIELD_N == 0 or idx == total then
			syncVal.Text = ("Building %d/%d: %s"):format(idx, total,
				tostring(a.kind or "?") .. " " .. tostring(a.name or a.parent_path or ""))
		end

		local attemptStart = os.clock()
		local pcOk, success, errOrInst, createdOrResult, extraResult = pcall(dispatch, a)
		local executed = pcOk and success and success ~= false
		local createdInst, resultPayload, errMsg = nil, nil, nil
		if executed then
			if typeof(errOrInst) == "Instance" then createdInst = errOrInst
			elseif typeof(createdOrResult) == "Instance" then createdInst = createdOrResult end
			if type(extraResult) == "table" then resultPayload = extraResult
			elseif type(createdOrResult) == "table" then resultPayload = createdOrResult end
		else
			errMsg = pcOk and tostring(errOrInst or "failed") or tostring(success or "error")
		end

		local didRetry = false
		if not executed and isRecoverable(errMsg) then
			didRetry = true; retries = retries + 1
			task.wait(0.15)
			pcOk, success, errOrInst, createdOrResult, extraResult = pcall(dispatch, a)
			executed = pcOk and success and success ~= false
			if executed then
				createdInst = nil; resultPayload = nil
				if typeof(errOrInst) == "Instance" then createdInst = errOrInst
				elseif typeof(createdOrResult) == "Instance" then createdInst = createdOrResult end
				if type(extraResult) == "table" then resultPayload = extraResult
				elseif type(createdOrResult) == "table" then resultPayload = createdOrResult end
				errMsg = nil
			else
				errMsg = pcOk and tostring(errOrInst or "failed") or tostring(success or "error")
			end
		end

		local dur = math.floor((os.clock() - attemptStart) * 1000)
		if executed then
			ok += 1
			if createdInst then
				table.insert(created, createdInst)
				if idx == 1 or idx % LIVE_FOCUS_N == 0 then pcall(focusOn, {createdInst}) end
			end
			if a.id then
				local r = { action_id=a.id, status="done" }
				if createdInst then
					r.result = resultPayload or {}
					r.result.path = instancePath(createdInst)
					r.result.name = createdInst.Name
				elseif resultPayload then
					r.result = resultPayload
				end
				table.insert(reports, r)
			end
			table.insert(stepRecords, {
				action_id = a.id, kind = a.kind, name = a.name,
				status = "done", retried = didRetry, duration_ms = dur,
				path = createdInst and instancePath(createdInst) or nil,
			})
		else
			fail += 1
			logLine(("Action failed [%s %s]: %s"):format(tostring(a.kind or "?"), tostring(a.name or ""), tostring(errMsg or "")), "error")
			if a.id then
				table.insert(reports, { action_id=a.id, status="failed", error=errMsg })
			end
			table.insert(stepRecords, {
				action_id = a.id, kind = a.kind, name = a.name,
				status = "failed", retried = didRetry, duration_ms = dur, error = errMsg,
			})
		end
		if #reports >= REPORT_FLUSH_N then flushReports() end
		if idx % APPLY_YIELD_N == 0 then task.wait(0.03) end
	end

	flushReports()

	if recId then
		pcall(function() ChangeHistoryService:FinishRecording(recId, Enum.FinishRecordingOperation.Commit) end)
	else
		ChangeHistoryService:SetWaypoint(("BloxSmith built %d (%d failed)"):format(ok, fail))
	end

	if #created > 0 then pcall(focusOn, created) end

	statsApplied += ok; statsErrors += fail; lastSyncAt = os.time()
	pcall(refreshStatsInfo)

	if fail > 0 then setPill("error") else setPill("complete") end
	appendLog(("Build done: %d ok, %d failed, %d skipped, %d repairs, %d retries"):format(
		ok, fail, skip, repairCount, retries))

	syncVal.Text = (("[%s] Built %d action(s)%s — undoable (Ctrl+Z)")):format(
		activeProjectId and "proj" or "?", ok, (fail>0 and (", "..fail.." failed") or ""))

	-- POST execution report (best-effort, non-blocking).
	local durationMs = math.floor((os.clock() - startedAt) * 1000)
	pcall(function()
		postPlugin("/api/public/plugin/execution/report", {
			token        = getToken(),
			project_id   = projectIdForReport or activeProjectId,
			source       = sourceLabel or "build",
			total        = total + skip,
			ok_count     = ok,
			fail_count   = fail,
			skip_count   = skip,
			repair_count = repairCount,
			retry_count  = retries,
			duration_ms  = durationMs,
			steps        = stepRecords,
			summary      = ("%d ok, %d failed, %d skipped, %d repairs, %d retries in %dms"):format(
				ok, fail, skip, repairCount, retries, durationMs),
		})
	end)

	-- Release 2 — Project Awareness: refresh scene digest so the next
	-- chat turn sees the freshly-built world instead of the pre-build one.
	task.spawn(function() task.wait(0.2); pcall(pushSnapshot) end)

	task.delay(3, function() if connected then setPill("connected") end end)
end

----------------------------------------------------------------
-- WORKSPACE SNAPSHOT
----------------------------------------------------------------
local function snapshotInst(inst)
	local node = {
		id = instanceId(inst), name = inst.Name, className = inst.ClassName,
		path = instancePath(inst),
	}
	if inst:IsA("BasePart") then
		node.size     = { x = inst.Size.X,     y = inst.Size.Y,     z = inst.Size.Z }
		node.position = { x = inst.Position.X, y = inst.Position.Y, z = inst.Position.Z }
		node.material = inst.Material.Name; node.anchored = inst.Anchored
		node.color    = { r = math.floor(inst.Color.R*255), g = math.floor(inst.Color.G*255), b = math.floor(inst.Color.B*255) }
	elseif inst:IsA("LuaSourceContainer") then
		local src = inst.Source or ""
		node.sourcePreview = string.sub(src, 1, 2000); node.sourceLength = #src
	end
	return node
end

local function snapshotChildren(parent, depth, counter)
	local out = {}
	if depth > MAX_DEPTH then return out end
	for _, child in ipairs(parent:GetChildren()) do
		if counter[1] >= MAX_INSTANCES then break end
		counter[1] += 1
		local node = snapshotInst(child)
		local kids = snapshotChildren(child, depth+1, counter)
		if #kids > 0 then node.children = kids end
		table.insert(out, node)
	end
	return out
end

local function getAssetId(inst)
	local id = nil
	if inst:IsA("MeshPart") then
		pcall(function() id = inst.MeshId end)
	elseif inst:IsA("Decal") or inst:IsA("Texture") then
		pcall(function() id = inst.Texture end)
	elseif inst:IsA("Sound") then
		pcall(function() id = inst.SoundId end)
	elseif inst:IsA("SpecialMesh") then
		pcall(function() id = inst.MeshId or inst.TextureId end)
	elseif inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
		pcall(function() id = inst.Image end)
	end
	if id and type(id) == "string" then
		local num = string.match(id, "%d+")
		if num then return num end
	end
	return nil
end

local function getImportantAttributes(inst)
	local attrs = inst:GetAttributes()
	local cleaned = nil
	for k, v in pairs(attrs) do
		if type(v) == "string" or type(v) == "number" or type(v) == "boolean" then
			if not cleaned then cleaned = {} end
			cleaned[k] = v
		end
	end
	return cleaned
end

local function computeHash(str)
	local h = 5381
	for i = 1, #str do h = ((h*33) + string.byte(str,i)) % 2147483648 end
	return string.format("%08x", h)
end

local function scanFiles(timeout)
	local files = {}; local deadline = os.clock() + (timeout or SCAN_TIMEOUT)
	local scanned = 0; local timedOut, cancelled = false, false
	local partCount = 0
	
	local function shouldStop()
		if scanCancelRequested then cancelled = true; return true end
		if os.clock() > deadline then timedOut = true; return true end
		if #files >= MAX_INSTANCES then return true end
		return false
	end
	
	local function traverse(inst, parentPath)
		if shouldStop() then return end
		scanned += 1
		local curPath = parentPath == "" and inst.Name or (parentPath .. "/" .. inst.Name)
		if pathIsIgnored(curPath) then return end
		
		local include = inst:IsA("LuaSourceContainer") or inst:IsA("Folder") or inst:IsA("Model")
			or inst:IsA("BasePart") or inst:IsA("Sound") or inst:IsA("RemoteEvent")
			or inst:IsA("RemoteFunction") or inst:IsA("GuiObject") or inst:IsA("Tool")
			
		if include then
			local isPart = inst:IsA("BasePart")
			if not (isPart and partCount >= 150) then
				if isPart then
					partCount = partCount + 1
				end
				
				local node = {
					id = instanceId(inst),
					name = inst.Name,
					className = inst.ClassName,
					path = curPath,
					studioPath = instancePath(inst),
					childrenCount = #inst:GetChildren(),
				}
				
				local assetId = getAssetId(inst)
				if assetId then
					node.assetId = assetId
				end
				
				local attributes = getImportantAttributes(inst)
				if attributes then
					node.attributes = attributes
				end
				
				if inst:IsA("LuaSourceContainer") then
					local src = inst.Source or ""
					node.scriptLength = #src
					node.hash = computeHash(src)
					node.sourcePreview = string.sub(src, 1, 200)
				end
				
				table.insert(files, node)
			end
		end
		
		for _, child in ipairs(inst:GetChildren()) do
			traverse(child, curPath)
			if timedOut or cancelled or #files >= MAX_INSTANCES then break end
		end
	end
	
	-- Scan structural services first, leaving Workspace (with parts) for last to fill remaining budget
	local scanRoots = {
		"ServerScriptService",
		"ReplicatedStorage",
		"StarterGui",
		"StarterPack",
		"StarterPlayer",
		"Teams",
		"Workspace",
		"ServerStorage",
		"ReplicatedFirst",
		"Lighting"
	}
	
	for _, svcName in ipairs(scanRoots) do
		if shouldStop() then break end
		local svc = getService(svcName)
		if svc then
			for _, child in ipairs(svc:GetChildren()) do
				traverse(child, svcName)
				if timedOut or cancelled or #files >= MAX_INSTANCES then break end
			end
		end
	end
	return files, { count = scanned, timedOut = timedOut, cancelled = cancelled }
end

pushSnapshot = function()
	if not connected then return end
	if scanInProgress then syncVal.Text = "Scan already running…"; return end
	scanInProgress = true; scanCancelRequested = false
	setPill("scanning"); syncVal.Text = "Scanning project…"; appendLog("Scan started")
	local started = os.clock()
	local files, scan = scanFiles(SCAN_TIMEOUT)
	scanInProgress = false
	
	if scan.cancelled then
		setPill("connected"); syncVal.Text = "Scan cancelled"; appendLog("Scan cancelled"); return
	end
	
	local wasReduced = false
	if #files >= MAX_INSTANCES or scan.timedOut then
		wasReduced = true
		warn("[BloxSmith] Map too large, scan was reduced to fit within limits.")
		appendLog("Warning: Scan was reduced (limit reached)")
	end
	
	-- Chunk upload to prevent HTTP 413 or timeout issues
	local totalFiles = #files
	local chunkSize = 150 -- Upload in small chunks of 150 files each
	local totalChunks = math.ceil(totalFiles / chunkSize)
	if totalChunks == 0 then totalChunks = 1 end
	
	local scanId = tostring(os.time()) .. "_" .. tostring(math.random(1000, 9999))
	local hasError = false
	local lastErr = nil
	
	for chunkIndex = 0, totalChunks - 1 do
		if scanCancelRequested then
			appendLog("Scan upload cancelled by user")
			setPill("connected")
			syncVal.Text = "Upload cancelled"
			return
		end
		
		-- Slice the files array
		local chunkFiles = {}
		local startIdx = chunkIndex * chunkSize + 1
		local endIdx = math.min(startIdx + chunkSize - 1, totalFiles)
		for i = startIdx, endIdx do
			table.insert(chunkFiles, files[i])
		end
		
		syncVal.Text = ("Uploading chunk %d/%d…"):format(chunkIndex + 1, totalChunks)
		
		-- POST chunk to /api/public/plugin/scan
		local payload = {
			token        = getToken(),
			place_id     = tostring(game.PlaceId or 0),
			scan         = chunkFiles,
			chunk_index  = chunkIndex,
			total_chunks = totalChunks,
			scan_id      = scanId,
		}
		
		local data, err = postPlugin("/api/public/plugin/scan", payload)
		if err then
			hasError = true
			lastErr = err
			break
		end
	end
	
	if hasError then
		setPill("error")
		syncVal.Text = "Snapshot error: " .. tostring(lastErr)
		appendLog("Snapshot error: " .. tostring(lastErr))
	else
		setPill("connected")
		if wasReduced then
			syncVal.Text = ("Scanned %d objects (Reduced)"):format(#files)
		else
			syncVal.Text = ("Scanned %d objects in %.1fs"):format(#files, os.clock()-started)
		end
		appendLog("Scan finished: " .. #files .. " objects uploaded in " .. totalChunks .. " chunks")
	end
end

----------------------------------------------------------------
-- PREVIEW OVERLAY
----------------------------------------------------------------
local previewOverlay = nil
closePreviewOverlay = function()
	if previewOverlay then previewOverlay:Destroy(); previewOverlay = nil end
end

openPreviewOverlay = function()
	closePreviewOverlay()
	if #pendingPreview == 0 then syncVal.Text = "Nothing pending."; return end
	previewOverlay = Instance.new("Frame", widget)
	previewOverlay.Size = UDim2.fromScale(1,1); previewOverlay.BackgroundColor3 = Color3.new(0,0,0)
	previewOverlay.BackgroundTransparency = 0.25; previewOverlay.BorderSizePixel = 0; previewOverlay.ZIndex = 60

	local box = Instance.new("Frame", previewOverlay)
	box.Size = UDim2.new(1,-24,1,-24); box.Position = UDim2.new(0,12,0,12)
	box.BackgroundColor3 = C.panel; box.BorderSizePixel = 0; box.ZIndex = 61
	corner(box,10); uiStroke(box,C.stroke,1); padAll(box,12)

	local bTitle = Instance.new("TextLabel", box)
	bTitle.BackgroundTransparency=1; bTitle.Size = UDim2.new(1,0,0,22)
	bTitle.Text = ("Preview — %d pending action(s)"):format(#pendingPreview)
	bTitle.Font = Enum.Font.BuilderSansBold; bTitle.TextSize = 14; bTitle.TextColor3 = C.text
	bTitle.TextXAlignment = Enum.TextXAlignment.Left; bTitle.ZIndex = 62

	local pScroll = Instance.new("ScrollingFrame", box)
	pScroll.Position = UDim2.new(0,0,0,30); pScroll.Size = UDim2.new(1,0,1,-80)
	pScroll.BackgroundColor3 = C.bg; pScroll.BorderSizePixel = 0
	pScroll.CanvasSize = UDim2.new(0,0,0,0); pScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	pScroll.ScrollBarThickness = 4; pScroll.ZIndex = 62; corner(pScroll,6)
	local pList = Instance.new("UIListLayout", pScroll); pList.Padding = UDim.new(0,4)
	padAll(pScroll, 6)

	for _, a in ipairs(pendingPreview) do
		local row = Instance.new("Frame", pScroll)
		row.BackgroundColor3 = C.panel; row.AutomaticSize = Enum.AutomaticSize.Y
		row.Size = UDim2.new(1,-4,0,0); row.BorderSizePixel = 0; row.ZIndex = 63
		corner(row,4); padAll(row,6)
		local lbl = Instance.new("TextLabel", row)
		lbl.BackgroundTransparency=1; lbl.Size = UDim2.new(1,0,0,0); lbl.AutomaticSize = Enum.AutomaticSize.Y
		lbl.Font = Enum.Font.Code; lbl.TextSize = 10; lbl.TextColor3 = C.textDim
		lbl.TextWrapped = true; lbl.TextXAlignment = Enum.TextXAlignment.Left; lbl.ZIndex = 63
		lbl.Text = tostring(a.kind or "?") .. "  " .. tostring(a.name or a.parent_path or "")
	end

	local btnRow = Instance.new("Frame", box)
	btnRow.BackgroundTransparency=1; btnRow.Position = UDim2.new(0,0,1,-44)
	btnRow.Size = UDim2.new(1,0,0,38); btnRow.ZIndex = 62
	local bl = Instance.new("UIListLayout",btnRow); bl.FillDirection = Enum.FillDirection.Horizontal; bl.Padding = UDim.new(0,8)

	local function mkBtn(text, bg, tc)
		local b = Instance.new("TextButton", btnRow)
		b.Size = UDim2.new(0.5,-4,1,0); b.BackgroundColor3 = bg; b.TextColor3 = tc
		b.Font = Enum.Font.BuilderSansBold; b.TextSize = 13; b.Text = text; b.BorderSizePixel = 0
		corner(b,8); return b
	end
	local applyAll   = mkBtn("Apply All ✓", C.success, Color3.new(1,1,1))
	local discardAll = mkBtn("Discard All ✗", C.disconnect, C.error)

	applyAll.MouseButton1Click:Connect(function()
		local batch = pendingPreview; pendingPreview = {}; previewSeenIds = {}
		refreshReviewBtnLabel(); closePreviewOverlay()
		applyActions(batch, "preview-apply")
	end)
	discardAll.MouseButton1Click:Connect(function()
		local reports = {}
		for _, a in ipairs(pendingPreview) do
			if a.id then table.insert(reports, { action_id=a.id, status="failed", error="Discarded in Preview" }) end
		end
		if #reports > 0 then
			pcall(function() postPlugin("/api/public/plugin/complete", { token=getToken(), results=reports }) end)
		end
		pendingPreview = {}; previewSeenIds = {}; refreshReviewBtnLabel(); closePreviewOverlay()
		syncVal.Text = "Preview batch discarded."
	end)
end

----------------------------------------------------------------
-- POLL LOOP — the heartbeat. Called every POLL_SECONDS.
-- POST /api/public/plugin/poll  → server returns pending actions + marks them "sent"
-- Plugin immediately executes them and POSTs results to /complete
----------------------------------------------------------------
local lastPollFingerprint = ""
local consecutivePollErrors = 0

local function pollOnce()
	if not connected then return end
	if not RunService:IsEdit() then
		syncVal.Text = "Edit mode only — paused during Play Test"; return
	end
	if getPaused() then syncVal.Text = "Paused — incoming actions ignored"; return end

	local data, err = postPlugin("/api/public/plugin/poll", {
		token          = getToken(),
		place_id       = tostring(game.PlaceId or 0),
		studio_version = tostring(version()),
		plugin_version = PLUGIN_VERSION,
	})
	if not data then
		consecutivePollErrors += 1
		syncVal.Text = "Poll error: " .. tostring(err)
		appendLog("Poll failed #" .. tostring(consecutivePollErrors) .. ": " .. tostring(err))
		if consecutivePollErrors >= 3 then
			connected = false
			setPill("offline"); updateButtonState()
			appendLog("Polling failed repeatedly — auto-reconnect will run.")
		end
		if not connected then refreshHealthInfo("Disconnected"); updateButtonState() end
		return
	end
	consecutivePollErrors = 0

	refreshHealthInfo("Poll OK")
	lastSyncAt = os.time(); pcall(refreshStatsInfo)

	-- Update credits row from server response
	if data.is_admin then
		creditsVal.Text = "∞ (Owner)"
	elseif data.credits ~= nil then
		local maxC = data.max_credits or 0
		local planLbl = data.plan or "Free"
		if maxC > 0 then
			creditsVal.Text = string.format("%d / %d · %s", data.credits, maxC, planLbl)
		else
			creditsVal.Text = string.format("%d · %s", data.credits, planLbl)
		end
	end

	-- Update project id from server response if not set yet
	if (not activeProjectId or activeProjectId == "") and data.user_id then
		-- server doesn't return project_id here; it's set at pair time
	end

	local actions = data.actions or {}
	if #actions == 0 then return end
	if actions[1] and actions[1].project_id then
		activeProjectId = tostring(actions[1].project_id)
		setProjectId(activeProjectId)
		projectVal.Text = "Project: " .. activeProjectId
	end

	-- Fingerprint to skip duplicate batches
	local fp = ""
	for _, a in ipairs(actions) do fp = fp .. (a.id or "") .. ";" end
	if fp == lastPollFingerprint then return end
	lastPollFingerprint = fp

	appendLog("Received " .. #actions .. " action(s) from server for execution")

	if getPreviewMode() then
		appendLog("Preview Mode is ON, but website Build actions now execute immediately for verified builds.")
	end

	applyActions(actions, "build")
end

----------------------------------------------------------------
-- PAIRING FLOW
-- 1. POST /api/public/plugin/pair/start  → {code, link_url, expires_in}
-- 2. Show link_url in pairLinkBox
-- 3. Poll POST /api/public/plugin/pair/poll {code} until status=="approved"
-- 4. Store plugin_token + project_id, start poll loop
----------------------------------------------------------------
doPairing = function()
	if pairingInProgress then return end
	pairingInProgress = true; pairingCancelled = false
	pairCard.Visible = true; updateButtonState()
	setPill("pairing"); statusVal.Text = "Requesting pairing code…"; appendLog("Requesting pair code")

	local data, err = postPluginRaw("/api/public/plugin/pair/start", {})
	if not data or err then
		pairingInProgress = false; pairCard.Visible = false
		setPill("offline"); statusVal.Text = "Pair start failed: " .. tostring(err)
		appendLog("Pair start failed: " .. tostring(err)); updateButtonState()
		return
	end

	local code    = tostring(data.code    or "")
	local linkUrl = tostring(data.link_url or "")
	if code == "" then
		pairingInProgress = false; pairCard.Visible = false
		setPill("offline"); statusVal.Text = "No pairing code returned"; updateButtonState()
		return
	end

	pairLinkBox.Text     = linkUrl
	pairCodeLabel.Text   = "Code: " .. code
	syncVal.Text         = "Waiting for approval at bloxsmith.pro/link?code=" .. code
	appendLog("Pair link: " .. linkUrl)

	-- Poll for approval
	local deadline = os.clock() + PAIR_TIMEOUT
	task.spawn(function()
		while pairingInProgress and not pairingCancelled and os.clock() < deadline do
			task.wait(PAIR_POLL_SEC)
			if pairingCancelled then break end

			local poll, pollErr = postPluginRaw("/api/public/plugin/pair/poll", { code = code })
			if not poll then
				logLine("Pair poll error: " .. tostring(pollErr), "warn")
			elseif poll.status == "approved" then
				-- Got the token!
				local token = tostring(poll.plugin_token or "")
				local projId = tostring(poll.project_id or "")
				if token ~= "" then
					setToken(token)
					if projId ~= "" then setProjectId(projId); activeProjectId = projId end
					pairingInProgress = false; shouldBeConnected = true; connected = true
					pairCard.Visible = false
					setPill("connected"); updateButtonState()
					statusVal.Text  = "Connected!"
					projectVal.Text = projId ~= "" and ("Project: " .. projId) or "Connected"
					appendLog("Paired successfully! Token saved.")
					refreshHealthInfo("Paired OK")
					-- Immediately do a scan so the AI has context
					task.spawn(pushSnapshot)
				end
				return
			elseif poll.status == "expired" then
				logLine("Pair code expired. Click Connect to try again.", "warn")
				pairingInProgress = false; pairCard.Visible = false
				setPill("offline"); updateButtonState()
				statusVal.Text = "Pair code expired — click Connect again"
				return
			elseif poll.status == "pending" then
				-- still waiting — continue loop
			end
		end

		if pairingInProgress and not pairingCancelled then
			-- Timed out
			pairingInProgress = false; pairCard.Visible = false
			setPill("offline"); updateButtonState()
			statusVal.Text = "Pairing timed out — click Connect again"
			appendLog("Pair timed out after " .. PAIR_TIMEOUT .. "s")
		else
			pairingInProgress = false; pairCard.Visible = false
			setPill("offline"); updateButtonState()
		end
	end)
end

disconnect = function()
	shouldBeConnected = false; connected = false
	pairingInProgress = false; pairingCancelled = true
	pairCard.Visible = false; pairLinkBox.Text = ""
	lastPollFingerprint = ""
	statusVal.Text  = "Not connected"
	syncVal.Text    = "—"
	projectVal.Text = "—"
	setPill("offline"); updateButtonState(); appendLog("Disconnected")
	refreshHealthInfo("Disconnected")
end

doReconnect = function()
	-- If we have a saved token, skip pairing and go straight to polling
	local tok = getToken()
	if tok == "" then
		doPairing(); return
	end
	shouldBeConnected = true; connected = true
	statusVal.Text  = "Reconnecting with saved token…"
	projectVal.Text = getProjectId() ~= "" and ("Project: " .. getProjectId()) or "—"
	activeProjectId = getProjectId()
	setPill("connecting"); updateButtonState()
	appendLog("Reconnecting with saved token…")
	-- Verify the token by doing a poll
	local data, err = postPlugin("/api/public/plugin/poll", {
		token          = tok,
		place_id       = tostring(game.PlaceId or 0),
		studio_version = tostring(version()),
		plugin_version = PLUGIN_VERSION,
		project_id     = (activeProjectId ~= "" and activeProjectId or nil),
	})
	if not data then
		connected = false; shouldBeConnected = false
		setPill("offline"); updateButtonState()
		statusVal.Text = "Token invalid — click Connect to re-pair"
		appendLog("Reconnect failed: " .. tostring(err))
		return
	end
	connected = true
	setPill("connected"); updateButtonState()
	statusVal.Text = "Connected (token verified)"
	appendLog("Reconnected successfully")
	refreshHealthInfo("Reconnected OK")
	local actions = data.actions or {}
	if #actions > 0 then
		appendLog("Reconnect received " .. tostring(#actions) .. " action(s); executing now")
		applyActions(actions, "reconnect-build")
	end
	task.spawn(pushSnapshot)
end

----------------------------------------------------------------
-- BUTTON WIRING
----------------------------------------------------------------
connectBtn.MouseButton1Click:Connect(function()
	if connected or pairingInProgress then
		disconnect()
	else
		doPairing()
	end
end)

cancelPairBtn.MouseButton1Click:Connect(function()
	pairingCancelled = true; pairingInProgress = false
	pairCard.Visible = false; setPill("offline"); updateButtonState()
	statusVal.Text = "Pairing cancelled"; appendLog("Pairing cancelled by user")
end)

syncNowBtn.MouseButton1Click:Connect(function()
	if not connected then appendLog("Not connected — sync cancelled"); return end
	task.spawn(pollOnce)
	task.spawn(pushSnapshot)
end)

scanBtn.MouseButton1Click:Connect(function()
	if not connected then appendLog("Connect first before scanning"); return end
	task.spawn(pushSnapshot)
end)

clearQueueBtn.MouseButton1Click:Connect(function()
	if getToken() == "" then appendLog("Not connected"); return end
	local data, err = postPlugin("/api/public/plugin/clear", {
		token      = getToken(),
		project_id = (activeProjectId ~= "" and activeProjectId or nil),
	})
	if data then
		local n = data.cleared or 0
		appendLog(("Cleared %d stuck action(s) from queue"):format(n))
		syncVal.Text = ("Queue cleared — %d action(s) removed"):format(n)
	else
		appendLog("Clear failed: " .. tostring(err))
	end
end)

reconnectBtn.MouseButton1Click:Connect(function()
	disconnect()
	task.defer(doReconnect)
end)

organizeBtn.MouseButton1Click:Connect(function()
	ChangeHistoryService:SetWaypoint("BloxSmith organize start")
	local ok, result = pcall(function() return Actions.organize_project({}) end)
	ChangeHistoryService:SetWaypoint("BloxSmith organize done")
	if ok then appendLog("Organize complete")
	else appendLog("Organize error: " .. tostring(result)) end
end)

autoFixBtn.MouseButton1Click:Connect(function()
	ChangeHistoryService:SetWaypoint("BloxSmith auto-fix start")
	local ok, result = pcall(function() return Actions.autofix_project({}) end)
	ChangeHistoryService:SetWaypoint("BloxSmith auto-fix done")
	if ok then appendLog("Auto-fix complete")
	else appendLog("Auto-fix error: " .. tostring(result)) end
end)

pauseBtn.MouseButton1Click:Connect(function()
	setPaused(not getPaused())
	pauseBtn.Text = getPaused() and "▶  Resume sync" or "⏸  Pause sync"
	appendLog(getPaused() and "Sync paused" or "Sync resumed")
end)

previewBtn.MouseButton1Click:Connect(function()
	setPreviewMode(not getPreviewMode())
	previewBtn.Text = getPreviewMode() and "🔍  Preview Mode: ON" or "🔍  Preview Mode: OFF"
	if not getPreviewMode() and #pendingPreview > 0 then
		local batch = pendingPreview; pendingPreview = {}; previewSeenIds = {}
		refreshReviewBtnLabel(); applyActions(batch, "preview-off")
	end
end)

reviewBtn.MouseButton1Click:Connect(openPreviewOverlay)

----------------------------------------------------------------
-- BACKGROUND LOOPS
----------------------------------------------------------------

-- Main poll loop
task.spawn(function()
	while true do
		task.wait(POLL_SECONDS)
		if connected then pcall(pollOnce) end
	end
end)

-- Auto-reconnect if token saved but not connected
task.spawn(function()
	while true do
		task.wait(5)
		if shouldBeConnected and not connected and not pairingInProgress then
			appendLog("Auto-reconnecting…")
			pcall(doReconnect)
		end
	end
end)

-- React to workspace changes (prompt a fresh scan)
local lastWorkspaceChange = 0
Workspace.DescendantAdded:Connect(function()
	if connected then lastWorkspaceChange = os.time() end
end)
Workspace.DescendantRemoving:Connect(function()
	if connected then lastWorkspaceChange = os.time() end
end)

-- Periodic re-scan if workspace changed (debounced 30s)
task.spawn(function()
	while true do
		task.wait(30)
		if connected and lastWorkspaceChange > 0 and (os.time() - lastWorkspaceChange) > 25 and not scanInProgress then
			lastWorkspaceChange = 0
			pcall(pushSnapshot)
		end
	end
end)

----------------------------------------------------------------
-- AUTO CONNECT on load if token exists
----------------------------------------------------------------
if getToken() ~= "" then
	shouldBeConnected = true
	task.defer(doReconnect)
end

print(string.format("[BloxSmith] Ultimate v%s ready — click BloxSmith in the PLUGINS tab.", PLUGIN_VERSION))
appendLog("BloxSmith Ultimate v" .. PLUGIN_VERSION .. " loaded.")
appendLog("API: " .. API_BASE)
appendLog("Place: " .. tostring(game.PlaceId or 0))
