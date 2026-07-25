-- BloxSmithPlugin.lua
-- BloxSmith Roblox Studio Plugin -- execution & connection bridge.
-- Install: Plugins > Open Plugins Folder, drop this file in, restart Studio.

local HttpService           = game:GetService("HttpService")
local ServerStorage         = game:GetService("ServerStorage")
local ServerScriptService   = game:GetService("ServerScriptService")
local ReplicatedStorage     = game:GetService("ReplicatedStorage")
local StarterGui            = game:GetService("StarterGui")
local StarterPlayer         = game:GetService("StarterPlayer")
local StarterPack           = game:GetService("StarterPack")
local Lighting              = game:GetService("Lighting")
local SoundService          = game:GetService("SoundService")
local Teams                 = game:GetService("Teams")
local Workspace             = game:GetService("Workspace")
local ChangeHistoryService  = game:GetService("ChangeHistoryService")
local InsertService         = game:GetService("InsertService")
local CollectionService     = game:GetService("CollectionService")
local Selection             = game:GetService("Selection")

local API_BASE       = "https://bloxsmith.pro"
local POLL_INTERVAL  = 0.5
local PLUGIN_VERSION = "2.1.27"

------------------------------------------------------------------- token helpers
local TOKEN_KEY = "token"
local function validToken()
    local t = plugin:GetSetting(TOKEN_KEY)
    if type(t) ~= "string" then return nil end
    t = (t:gsub("^%s+", ""):gsub("%s+$", ""))
    if t == "" then return nil end
    return t
end
local function clearToken()
    plugin:SetSetting(TOKEN_KEY, nil)
end

------------------------------------------------------------------- UI shell
local toolbar = plugin:CreateToolbar("BloxSmith")
local toggleButton = toolbar:CreateButton("BloxSmith", "Open BloxSmith builder",
    "rbxasset://textures/StudioSharedUI/services/plugin@2x.png")

local widget = plugin:CreateDockWidgetPluginGui("BloxSmithWidget",
    DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, true, false, 360, 700, 320, 560))
widget.Title = "BloxSmith"

-- ============ tiny visual helpers ============
local function round(inst, r)
    local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0, r or 8); c.Parent = inst
    return inst
end
local function stroke(inst, color, thickness, transparency)
    local s = Instance.new("UIStroke")
    s.Color = color or Color3.fromRGB(255,255,255)
    s.Thickness = thickness or 1
    s.Transparency = transparency or 0.8
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = inst
    return s
end
local function gradient(parent, c1, c2, rotation)
    local g = Instance.new("UIGradient")
    g.Rotation = rotation or 90
    g.Color = ColorSequence.new{
        ColorSequenceKeypoint.new(0, c1),
        ColorSequenceKeypoint.new(1, c2),
    }
    g.Parent = parent
    return g
end
local function label(parent, text, pos, size, font, ts, color)
    local l = Instance.new("TextLabel")
    l.Position = pos; l.Size = size
    l.BackgroundTransparency = 1
    l.Font = font or Enum.Font.Gotham
    l.TextSize = ts or 12
    l.TextColor3 = color or Color3.fromRGB(225,225,240)
    l.TextXAlignment = Enum.TextXAlignment.Left
    l.TextYAlignment = Enum.TextYAlignment.Top
    l.TextWrapped = true
    l.Text = text
    l.Parent = parent
    return l
end

-- ============ root ============
local main = Instance.new("Frame")
main.Size = UDim2.fromScale(1,1)
main.BackgroundColor3 = Color3.fromRGB(10, 11, 26)
main.BorderSizePixel = 0
main.Parent = widget
gradient(main, Color3.fromRGB(16, 14, 36), Color3.fromRGB(7, 8, 20), 160)

-- ============ header card ============
local header = Instance.new("Frame")
header.Position = UDim2.new(0,12,0,12); header.Size = UDim2.new(1,-24,0,66)
header.BackgroundColor3 = Color3.fromRGB(24, 22, 54)
header.BorderSizePixel = 0
header.Parent = main
round(header, 12)
gradient(header, Color3.fromRGB(60, 42, 130), Color3.fromRGB(22, 20, 48), 135)
stroke(header, Color3.fromRGB(160, 140, 255), 1, 0.7)

-- logo mark
local logo = Instance.new("Frame")
logo.Position = UDim2.new(0,12,0.5,-19); logo.Size = UDim2.fromOffset(38,38)
logo.BackgroundColor3 = Color3.fromRGB(129, 92, 255)
logo.BorderSizePixel = 0
logo.Parent = header
round(logo, 11)
gradient(logo, Color3.fromRGB(139, 102, 255), Color3.fromRGB(236, 72, 190), 135)
stroke(logo, Color3.fromRGB(255,255,255), 1, 0.6)

local sparkImg = Instance.new("ImageLabel")
sparkImg.Size = UDim2.new(1,-8,1,-8)
sparkImg.Position = UDim2.new(0,4,0,4)
sparkImg.BackgroundTransparency = 1
sparkImg.Image = "rbxassetid://122260441773119"
sparkImg.ScaleType = Enum.ScaleType.Fit
sparkImg.Parent = logo

local title = label(header, "BloxSmith", UDim2.new(0,62,0,12), UDim2.new(1,-72,0,22),
    Enum.Font.GothamBold, 17, Color3.fromRGB(248, 244, 255))
label(header, "Execution bridge for Roblox Studio", UDim2.new(0,62,0,34), UDim2.new(1,-72,0,18),
    Enum.Font.Gotham, 11, Color3.fromRGB(190, 185, 220))

-- version pill top-right
local vPill = Instance.new("TextLabel")
vPill.AnchorPoint = Vector2.new(1,0)
vPill.Position = UDim2.new(1,-10,0,10); vPill.Size = UDim2.fromOffset(52,18)
vPill.BackgroundColor3 = Color3.fromRGB(50, 40, 100)
vPill.BorderSizePixel = 0
vPill.Font = Enum.Font.GothamBold; vPill.TextSize = 10
vPill.TextColor3 = Color3.fromRGB(215, 205, 255)
vPill.Text = "v" .. PLUGIN_VERSION
vPill.Parent = header
round(vPill, 6)
stroke(vPill, Color3.fromRGB(180, 160, 255), 1, 0.5)

-- ============ status card ============
local statusCard = Instance.new("Frame")
statusCard.Position = UDim2.new(0,12,0,86); statusCard.Size = UDim2.new(1,-24,0,64)
statusCard.BackgroundColor3 = Color3.fromRGB(18, 20, 40)
statusCard.BorderSizePixel = 0
statusCard.Parent = main
round(statusCard, 10)
stroke(statusCard, Color3.fromRGB(120, 120, 200), 1, 0.85)

local statusDot = Instance.new("Frame")
statusDot.Position = UDim2.new(0,12,0,14); statusDot.Size = UDim2.fromOffset(10,10)
statusDot.BackgroundColor3 = Color3.fromRGB(248, 113, 113)
statusDot.BorderSizePixel = 0
statusDot.Parent = statusCard
round(statusDot, 8)
stroke(statusDot, Color3.fromRGB(255, 180, 180), 1, 0.4)

local statusLabel = label(statusCard, "Status: not connected",
    UDim2.new(0,28,0,8), UDim2.new(1,-40,0,18),
    Enum.Font.GothamBold, 13, Color3.fromRGB(240,240,250))
local subStatus   = label(statusCard, "Click Connect to link this Studio session.",
    UDim2.new(0,12,0,28), UDim2.new(1,-24,0,14),
    Enum.Font.Gotham, 11, Color3.fromRGB(165, 170, 200))
local infoLabel   = label(statusCard, "Place: loading...   Live: 0",
    UDim2.new(0,12,0,44), UDim2.new(1,-24,0,14),
    Enum.Font.Code, 10, Color3.fromRGB(140, 200, 235))

-- ============ credits card ============
local creditsCard = Instance.new("Frame")
creditsCard.Position = UDim2.new(0,12,0,156); creditsCard.Size = UDim2.new(1,-24,0,52)
creditsCard.BackgroundColor3 = Color3.fromRGB(20, 22, 44)
creditsCard.BorderSizePixel = 0
creditsCard.Parent = main
round(creditsCard, 10)
stroke(creditsCard, Color3.fromRGB(140, 200, 255), 1, 0.85)

local creditsIcon = Instance.new("TextLabel")
creditsIcon.Position = UDim2.new(0,10,0,8); creditsIcon.Size = UDim2.fromOffset(20,18)
creditsIcon.BackgroundTransparency = 1
creditsIcon.Font = Enum.Font.GothamBold; creditsIcon.TextSize = 14
creditsIcon.TextColor3 = Color3.fromRGB(251, 191, 36); creditsIcon.Text = "⚡"
creditsIcon.TextXAlignment = Enum.TextXAlignment.Left
creditsIcon.Parent = creditsCard

local creditsCaption = label(creditsCard, "Credits",
    UDim2.new(0,32,0,8), UDim2.new(0.5,-32,0,18),
    Enum.Font.GothamBold, 12, Color3.fromRGB(225, 228, 245))

local planPill = Instance.new("TextLabel")
planPill.AnchorPoint = Vector2.new(1,0)
planPill.Position = UDim2.new(1,-10,0,8); planPill.Size = UDim2.fromOffset(60,18)
planPill.BackgroundColor3 = Color3.fromRGB(40, 60, 110)
planPill.BorderSizePixel = 0
planPill.Font = Enum.Font.GothamBold; planPill.TextSize = 10
planPill.TextColor3 = Color3.fromRGB(190, 220, 255)
planPill.Text = "Free"
planPill.Parent = creditsCard
round(planPill, 6)
stroke(planPill, Color3.fromRGB(120, 180, 255), 1, 0.5)

local creditsValue = Instance.new("TextLabel")
creditsValue.AnchorPoint = Vector2.new(1,0)
creditsValue.Position = UDim2.new(1,-76,0,8); creditsValue.Size = UDim2.fromOffset(90,18)
creditsValue.BackgroundTransparency = 1
creditsValue.Font = Enum.Font.Code; creditsValue.TextSize = 12
creditsValue.TextColor3 = Color3.fromRGB(230, 235, 250)
creditsValue.Text = "-- / --"
creditsValue.TextXAlignment = Enum.TextXAlignment.Right
creditsValue.Parent = creditsCard

-- progress bar
local creditsTrack = Instance.new("Frame")
creditsTrack.Position = UDim2.new(0,10,0,32); creditsTrack.Size = UDim2.new(1,-20,0,8)
creditsTrack.BackgroundColor3 = Color3.fromRGB(12, 14, 30)
creditsTrack.BorderSizePixel = 0
creditsTrack.Parent = creditsCard
round(creditsTrack, 4)

local creditsFill = Instance.new("Frame")
creditsFill.Size = UDim2.new(0,0,1,0)
creditsFill.BackgroundColor3 = Color3.fromRGB(74, 222, 128)
creditsFill.BorderSizePixel = 0
creditsFill.Parent = creditsTrack
round(creditsFill, 4)
gradient(creditsFill, Color3.fromRGB(129, 140, 255), Color3.fromRGB(74, 222, 128), 0)

local lastLabel   = label(main, "Last: (none)",
    UDim2.new(0,14,0,212), UDim2.new(1,-28,0,14),
    Enum.Font.Gotham, 11, Color3.fromRGB(155, 160, 195))

local function setCredits(credits, maxCredits, plan)
    credits = tonumber(credits) or 0
    maxCredits = tonumber(maxCredits) or 0
    creditsValue.Text = string.format("%s / %s",
        (credits >= 10000) and (math.floor(credits/1000).."k") or tostring(credits),
        (maxCredits >= 10000) and (math.floor(maxCredits/1000).."k") or tostring(maxCredits))
    local pct = 0
    if maxCredits > 0 then pct = math.clamp(credits / maxCredits, 0, 1) end
    creditsFill:TweenSize(UDim2.new(pct, 0, 1, 0),
        Enum.EasingDirection.Out, Enum.EasingStyle.Quad, 0.35, true)
    -- color shifts red as it depletes
    if pct < 0.15 then
        creditsFill.BackgroundColor3 = Color3.fromRGB(248, 113, 113)
    elseif pct < 0.4 then
        creditsFill.BackgroundColor3 = Color3.fromRGB(251, 191, 36)
    else
        creditsFill.BackgroundColor3 = Color3.fromRGB(74, 222, 128)
    end
    if plan and plan ~= "" then
        planPill.Text = tostring(plan)
        if plan == "Owner" then
            planPill.BackgroundColor3 = Color3.fromRGB(90, 40, 130)
            planPill.TextColor3 = Color3.fromRGB(240, 210, 255)
        elseif plan == "Pro" or plan == "Business" or plan == "Enterprise" then
            planPill.BackgroundColor3 = Color3.fromRGB(50, 90, 60)
            planPill.TextColor3 = Color3.fromRGB(210, 255, 220)
        else
            planPill.BackgroundColor3 = Color3.fromRGB(40, 60, 110)
            planPill.TextColor3 = Color3.fromRGB(190, 220, 255)
        end
    end
end

-- ============ primary connect button ============
local connectBtn = Instance.new("TextButton")
connectBtn.Position = UDim2.new(0,12,0,234); connectBtn.Size = UDim2.new(1,-24,0,40)
connectBtn.BackgroundColor3 = Color3.fromRGB(99, 102, 241)
connectBtn.TextColor3 = Color3.fromRGB(255,255,255)
connectBtn.Font = Enum.Font.GothamBold; connectBtn.TextSize = 14
connectBtn.Text = "Connect"; connectBtn.BorderSizePixel = 0
connectBtn.AutoButtonColor = true
connectBtn.Parent = main
round(connectBtn, 10)
gradient(connectBtn, Color3.fromRGB(139, 116, 255), Color3.fromRGB(236, 89, 190), 90)
stroke(connectBtn, Color3.fromRGB(255,255,255), 1, 0.65)

-- ============ approval link box (hidden by default) ============
local linkBox = Instance.new("TextBox")
linkBox.Position = UDim2.new(0,12,0,282); linkBox.Size = UDim2.new(1,-24,0,28)
linkBox.BackgroundColor3 = Color3.fromRGB(22, 24, 44)
linkBox.TextColor3 = Color3.fromRGB(210, 220, 245)
linkBox.Font = Enum.Font.Code; linkBox.TextSize = 11
linkBox.Text = ""; linkBox.PlaceholderText = "Approval link appears here"
linkBox.ClearTextOnFocus = false; linkBox.TextEditable = false
linkBox.BorderSizePixel = 0; linkBox.Visible = false
linkBox.Parent = main
round(linkBox, 8)
stroke(linkBox, Color3.fromRGB(129, 140, 240), 1, 0.7)

-- ============ control buttons grid ============
local controls = Instance.new("Frame")
controls.Position = UDim2.new(0,12,0,318); controls.Size = UDim2.new(1,-24,0,152)
controls.BackgroundTransparency = 1; controls.Parent = main
local grid = Instance.new("UIGridLayout", controls)
grid.CellPadding = UDim2.new(0,6,0,6)
grid.CellSize = UDim2.new(0.333, -4, 0, 34)
grid.SortOrder = Enum.SortOrder.LayoutOrder

local function ctrlBtn(text, order, opts)
    opts = opts or {}
    local baseColor  = opts.color     or Color3.fromRGB(26, 28, 50)
    local hoverColor = opts.hover     or Color3.fromRGB(40, 44, 74)
    local accent     = opts.accent    or Color3.fromRGB(150, 160, 220)
    local b = Instance.new("TextButton")
    b.BackgroundColor3 = baseColor
    b.TextColor3 = opts.textColor or Color3.fromRGB(232, 234, 248)
    b.Font = Enum.Font.GothamMedium; b.TextSize = 11
    b.Text = text; b.BorderSizePixel = 0
    b.AutoButtonColor = false
    b.LayoutOrder = order; b.Parent = controls
    round(b, 8)
    local s = Instance.new("UIStroke")
    s.Color = accent; s.Thickness = 1; s.Transparency = 0.55
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = b
    -- left accent bar
    local bar = Instance.new("Frame")
    bar.Size = UDim2.new(0,3,1,-12); bar.Position = UDim2.new(0,0,0,6)
    bar.BackgroundColor3 = accent; bar.BorderSizePixel = 0
    bar.Parent = b
    local bc = Instance.new("UICorner"); bc.CornerRadius = UDim.new(1,0); bc.Parent = bar
    b.MouseEnter:Connect(function()
        b.BackgroundColor3 = hoverColor; s.Transparency = 0.2
    end)
    b.MouseLeave:Connect(function()
        b.BackgroundColor3 = baseColor; s.Transparency = 0.55
    end)
    return b
end

local reconnectBtn = ctrlBtn("Reconnect",    1,  { accent = Color3.fromRGB( 96, 165, 250) })
local syncBtn      = ctrlBtn("Sync",         2,  { accent = Color3.fromRGB( 52, 211, 153) })
local execBtn      = ctrlBtn("Execute Now",  3,  { accent = Color3.fromRGB(129, 140, 255) })
local clearBtn     = ctrlBtn("Clear Stuck",  4,  { accent = Color3.fromRGB(251, 191,  36) })
local errorsBtn    = ctrlBtn("View Errors",  5,  { accent = Color3.fromRGB(248, 113, 113) })
local openWebBtn   = ctrlBtn("Open Website", 6,  { accent = Color3.fromRGB(103, 232, 249) })
local scanBtn      = ctrlBtn("Scan Game",    7,  { accent = Color3.fromRGB(167, 139, 250) })
local sendErrBtn   = ctrlBtn("Send Errors",  8,  { accent = Color3.fromRGB(244, 114, 182) })
local autoErrBtn   = ctrlBtn("Auto-Send: ON",9,  { accent = Color3.fromRGB(236,  72, 153) })
local organizeBtn  = ctrlBtn("Organize",     10, { accent = Color3.fromRGB( 45, 212, 191) })
local autoFixBtn   = ctrlBtn("Auto-Fix",     11, { accent = Color3.fromRGB( 74, 222, 128) })
local cleanBtn     = ctrlBtn("Clean Slate",  12, {
    color = Color3.fromRGB(130, 40, 60),
    hover = Color3.fromRGB(170, 55, 80),
    accent = Color3.fromRGB(255, 130, 150),
    textColor = Color3.fromRGB(255, 235, 240),
})


------------------------------------------------------------------- log
local logBar = Instance.new("Frame")
logBar.Position = UDim2.new(0,12,0,480); logBar.Size = UDim2.new(1,-24,0,24)
logBar.BackgroundTransparency = 1; logBar.Parent = main

local logTitle = Instance.new("TextLabel")
logTitle.Size = UDim2.new(1,-220,1,0); logTitle.BackgroundTransparency = 1
logTitle.Font = Enum.Font.GothamBold; logTitle.TextSize = 12
logTitle.TextColor3 = Color3.fromRGB(215, 215, 240)
logTitle.TextXAlignment = Enum.TextXAlignment.Left
logTitle.Text = "◆  Activity log"; logTitle.Parent = logBar

local function miniBtn(text, xOff, accent)
    local b = Instance.new("TextButton")
    b.AnchorPoint = Vector2.new(1,0.5)
    b.Position = UDim2.new(1,xOff,0.5,0); b.Size = UDim2.new(0,60,0,22)
    b.BackgroundColor3 = Color3.fromRGB(26, 28, 50)
    b.TextColor3 = Color3.fromRGB(225, 228, 245)
    b.Font = Enum.Font.GothamMedium; b.TextSize = 11
    b.Text = text; b.BorderSizePixel = 0
    b.AutoButtonColor = false
    b.Parent = logBar
    round(b, 6)
    local s = Instance.new("UIStroke")
    s.Color = accent or Color3.fromRGB(120,130,200); s.Thickness = 1; s.Transparency = 0.5
    s.Parent = b
    b.MouseEnter:Connect(function() s.Transparency = 0.15 end)
    b.MouseLeave:Connect(function() s.Transparency = 0.5 end)
    return b
end
local copyLogBtn  = miniBtn("Copy",     0,    Color3.fromRGB(103, 232, 249))
local clearLogBtn = miniBtn("Clear",   -66,   Color3.fromRGB(248, 113, 113))
local verboseBtn  = miniBtn("Verbose", -132,  Color3.fromRGB(129, 140, 255))

local logFrame = Instance.new("ScrollingFrame")
logFrame.Position = UDim2.new(0,12,0,508); logFrame.Size = UDim2.new(1,-24,1,-520)
logFrame.BackgroundColor3 = Color3.fromRGB(6, 7, 18); logFrame.BorderSizePixel = 0
logFrame.CanvasSize = UDim2.new(0,0,0,0); logFrame.ScrollBarThickness = 4
logFrame.ScrollBarImageColor3 = Color3.fromRGB(120, 130, 200)
logFrame.Parent = main
round(logFrame, 10)
stroke(logFrame, Color3.fromRGB(120, 130, 220), 1, 0.8)

local lp = Instance.new("UIPadding", logFrame)
lp.PaddingTop = UDim.new(0,6); lp.PaddingBottom = UDim.new(0,6)
lp.PaddingLeft = UDim.new(0,8); lp.PaddingRight = UDim.new(0,8)
local ll = Instance.new("UIListLayout", logFrame)
ll.SortOrder = Enum.SortOrder.LayoutOrder; ll.Padding = UDim.new(0,2)

local LEVELS = {
    info    = { c = Color3.fromRGB(160,200,255), t = "INFO", m = "print" },
    debug   = { c = Color3.fromRGB(140,145,160), t = "DBG ", m = nil     },
    success = { c = Color3.fromRGB(140,220,160), t = " OK ", m = "print" },
    warn    = { c = Color3.fromRGB(255,200,120), t = "WARN", m = "warn"  },
    error   = { c = Color3.fromRGB(255,120,120), t = "ERR ", m = "warn"  },
    net     = { c = Color3.fromRGB(150,190,235), t = "NET ", m = nil     },
    action  = { c = Color3.fromRGB(190,175,255), t = "ACT ", m = "print" },
}
local LOG_MAX = 400
local logIndex, logHistory, logChildren, errorHistory = 0, {}, {}, {}

local function relayout()
    logFrame.CanvasSize = UDim2.new(0,0,0, ll.AbsoluteContentSize.Y + 12)
    logFrame.CanvasPosition = Vector2.new(0, math.max(0, logFrame.CanvasSize.Y.Offset - logFrame.AbsoluteSize.Y))
end

local function log(text, level)
    local meta = LEVELS[level or "info"] or LEVELS.info
    logIndex += 1
    local line = string.format("[%s] %s | %s", os.date("%H:%M:%S"), meta.t, tostring(text))
    table.insert(logHistory, line)
    if #logHistory > LOG_MAX then table.remove(logHistory, 1) end
    if level == "error" then
        table.insert(errorHistory, line)
        if #errorHistory > 50 then table.remove(errorHistory, 1) end
    end
    local lbl = Instance.new("TextLabel")
    lbl.AutomaticSize = Enum.AutomaticSize.Y
    lbl.Size = UDim2.new(1,-4,0,0); lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Code; lbl.TextSize = 11
    lbl.TextColor3 = meta.c; lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.TextYAlignment = Enum.TextYAlignment.Top; lbl.TextWrapped = true
    lbl.Text = line; lbl.LayoutOrder = logIndex; lbl.Parent = logFrame
    table.insert(logChildren, lbl)
    if #logChildren > LOG_MAX then
        local oldest = table.remove(logChildren, 1)
        if oldest then oldest:Destroy() end
    end
    if meta.m == "warn" then warn("[BloxSmith] " .. tostring(text))
    elseif meta.m == "print" then print("[BloxSmith] " .. tostring(text)) end
    task.defer(relayout)
end

local function tryCopy(s) return pcall(function() (setclipboard or (_G and _G.setclipboard))(s) end) end

clearLogBtn.MouseButton1Click:Connect(function()
    for _,c in ipairs(logChildren) do c:Destroy() end
    table.clear(logChildren); table.clear(logHistory); logIndex = 0
    relayout(); log("Log cleared.", "debug")
end)
copyLogBtn.MouseButton1Click:Connect(function()
    if tryCopy(table.concat(logHistory, "\n")) then
        log(("Copied %d lines to clipboard."):format(#logHistory), "info")
    else log("Clipboard unavailable.", "warn") end
end)

local VERBOSE = false
verboseBtn.MouseButton1Click:Connect(function()
    VERBOSE = not VERBOSE
    verboseBtn.BackgroundColor3 = VERBOSE and Color3.fromRGB(70,130,240) or Color3.fromRGB(45,48,58)
    log("Verbose " .. (VERBOSE and "ON" or "OFF"), "debug")
end)

toggleButton.Click:Connect(function() widget.Enabled = not widget.Enabled end)

------------------------------------------------------------------- Roblox service routing
-- Default parent per action kind. Anything in payload.parent_path overrides this.
local DEFAULT_PARENT = {
    script         = ServerScriptService,
    localscript    = StarterPlayer:FindFirstChild("StarterPlayerScripts") or StarterPlayer,
    modulescript   = ReplicatedStorage,
    screengui      = StarterGui,
    frame          = StarterGui,
    textlabel      = StarterGui,
    textbutton     = StarterGui,
    imagelabel     = StarterGui,
    remoteevent    = ReplicatedStorage,
    remotefunction = ReplicatedStorage,
    bindableevent  = ReplicatedStorage,
    folder         = ReplicatedStorage,
    part           = Workspace,
    model          = Workspace,
    tool           = StarterPack,
    sound          = SoundService,
    team           = Teams,
    leaderstats    = ServerScriptService,
    insert_asset   = Workspace,
}

local function defaultParentFor(kind) return DEFAULT_PARENT[kind] or Workspace end

local function isPhysicalKind(kind)
    return kind == "part" or kind == "model" or kind == "terrain" or kind == "insert_asset"
end

local function isCodeOnlyPath(path)
    path = tostring(path or ""):gsub("/", ".")
    return path:match("^ServerScriptService")
        or path:match("^ServerStorage")
        or path:match("^ReplicatedStorage")
        or path:match("^StarterPlayer")
        or path:match("^StarterPlayerScripts")
        or path:match("^StarterCharacterScripts")
end

local function resolveParent(path, kind)
    if isPhysicalKind(kind) and isCodeOnlyPath(path) then return Workspace end
    if not path or path == "" then return defaultParentFor(kind) end
    local parts = string.split(path, ".")
    local first = parts[1]
    local ok, svc = pcall(function() return game:GetService(first) end)
    local parent = (ok and svc) or game:FindFirstChild(first) or Workspace
    for i = 2, #parts do
        local child = parent:FindFirstChild(parts[i])
        if not child then
            child = Instance.new("Folder"); child.Name = parts[i]; child.Parent = parent
        end
        parent = child
    end
    return parent
end

local function findByPath(path)
    if not path or path == "" then return nil end
    local parts = string.split(path, ".")
    local ok, svc = pcall(function() return game:GetService(parts[1]) end)
    local node = (ok and svc) or game:FindFirstChild(parts[1])
    for i = 2, #parts do
        if not node then return nil end
        node = node:FindFirstChild(parts[i])
    end
    return node
end

local function fullPath(inst)
    local ok, path = pcall(function() return inst:GetFullName() end)
    return ok and path or tostring(inst)
end

local function ensureFolder(parent, name)
    local existing = parent:FindFirstChild(name)
    if existing and existing:IsA("Folder") then return existing end
    local f = Instance.new("Folder")
    f.Name = name
    f.Parent = parent
    return f
end

local function ensureProjectFolders()
    local folders = {
        ensureFolder(Workspace, "Map"),
        ensureFolder(Workspace, "NPCs"),
        ensureFolder(Workspace, "Props"),
        ensureFolder(Workspace, "Vehicles"),
        ensureFolder(Workspace, "Gameplay"),
        ensureFolder(ReplicatedStorage, "Remotes"),
        ensureFolder(ReplicatedStorage, "Modules"),
        ensureFolder(ReplicatedStorage, "Assets"),
        ensureFolder(ServerScriptService, "Systems"),
        ensureFolder(ServerStorage, "BloxSmith_Quarantine"),
    }
    -- StarterPlayerScripts is a protected Roblox service container.
    -- Never attempt to create or re-parent it -- just look it up if it exists.
    local starterScripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
    if starterScripts then
        table.insert(folders, starterScripts)
    end
    return folders
end

local SUSPICIOUS_SOURCE_PATTERNS = {
    -- Normal require(path.to.ModuleScript) is required for real Roblox systems.
    -- Only quarantine external asset-id requires, which are commonly abused and
    -- are not needed for BloxSmith-authored code.
    "require%s*%(%s*%d",
    "loadstring%s*%(",
    "getfenv%s*%(",
    "setfenv%s*%(",
    "HttpService%s*:",
    "InsertService%s*:%s*LoadAsset",
    "MarketplaceService%s*:%s*PromptPurchase",
}

local function sourceLooksSuspicious(source)
    if type(source) ~= "string" or source == "" then return false, nil end
    for _, pattern in ipairs(SUSPICIOUS_SOURCE_PATTERNS) do
        if string.find(source, pattern) then return true, pattern end
    end
    return false, nil
end

local function quarantineInstance(inst, reason)
    local quarantine = ensureFolder(ServerStorage, "BloxSmith_Quarantine")
    local marker = Instance.new("StringValue")
    marker.Name = "BloxSmith_QuarantineReason"
    marker.Value = tostring(reason or "suspicious")
    marker.Parent = inst
    pcall(function() CollectionService:AddTag(inst, "BloxSmithQuarantined") end)
    inst.Parent = quarantine
    return fullPath(inst)
end

local function inspectInsertedAsset(root, options)
    options = options or {}
    local report = {
        scanned = 0, scripts = 0, quarantined = 0, warnings = {},
        visible_parts = 0, mesh_parts = 0, textures = 0, decals = 0, special_meshes = 0,
        has_visible_content = false, has_textures_or_meshes = false,
    }
    local descendants = root:GetDescendants()
    table.insert(descendants, 1, root)
    for _, inst in ipairs(descendants) do
        report.scanned += 1
        if inst:IsA("BasePart") then
            if inst.Transparency < 1 and inst.Size.Magnitude > 0.05 then
                report.visible_parts += 1
                report.has_visible_content = true
            end
            if inst:IsA("MeshPart") then report.mesh_parts += 1 end
            if inst.Anchored == false and not inst:FindFirstAncestorOfClass("Tool") and not inst:FindFirstAncestorWhichIsA("Humanoid") then
                table.insert(report.warnings, "loose_unanchored_part:" .. fullPath(inst))
            end
        elseif inst:IsA("Texture") then
            report.textures += 1
        elseif inst:IsA("Decal") then
            report.decals += 1
        elseif inst:IsA("SpecialMesh") then
            report.special_meshes += 1
        elseif inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
            report.scripts += 1
            local source = ""
            pcall(function() source = inst.Source end)
            local suspicious, pattern = sourceLooksSuspicious(source)
            if options.no_scripts or suspicious then
                report.quarantined += 1
                pcall(function()
                    if inst:IsA("Script") or inst:IsA("LocalScript") then inst.Disabled = true end
                end)
                local before = fullPath(inst)
                quarantineInstance(inst, options.no_scripts and "Toolbox scripts disabled by safety setting" or ("Suspicious source pattern: " .. tostring(pattern)))
                table.insert(report.warnings, "quarantined_script:" .. before)
            end
        end
        if #report.warnings >= 40 then
            table.insert(report.warnings, "warning_limit_reached")
            break
        end
    end
    report.has_textures_or_meshes = report.mesh_parts > 0 or report.textures > 0 or report.decals > 0 or report.special_meshes > 0
    if not report.has_visible_content then
        table.insert(report.warnings, "no_visible_3d_content")
    end
    return report
end

local function assetBounds(root)
    if root:IsA("Model") then
        local ok, cf, size = pcall(function() return root:GetBoundingBox() end)
        if ok and cf and size then return cf, size end
    elseif root:IsA("BasePart") then
        return root.CFrame, root.Size
    end
    return nil, nil
end

local function groundSnap(root)
    if root:FindFirstAncestorOfClass("Tool") then return false end
    local cf, size = assetBounds(root)
    if not cf or not size or size.Magnitude <= 0.05 then return false end
    local bottomY = cf.Position.Y - (size.Y / 2)
    local desiredBottom = 0
    local deltaY = desiredBottom - bottomY
    if math.abs(deltaY) < 0.05 then return false end
    pcall(function() root:PivotTo(cf + Vector3.new(0, deltaY, 0)) end)
    return true
end

local function anchorWorldModel(root)
    if root:FindFirstAncestorOfClass("Tool") or root:FindFirstChildOfClass("Humanoid") then return 0 end
    local anchored = 0
    for _, inst in ipairs(root:GetDescendants()) do
        if inst:IsA("BasePart") and not inst.Anchored then
            inst.Anchored = true
            anchored += 1
        end
    end
    if root:IsA("BasePart") and not root.Anchored then
        root.Anchored = true
        anchored += 1
    end
    return anchored
end

local function findExistingAsset(parent, id)
    for _, inst in ipairs(parent:GetDescendants()) do
        local existingId = inst:GetAttribute("BloxSmithAssetId") or inst:GetAttribute("BloxSmithRequestedAssetId")
        if tonumber(existingId) == tonumber(id) then
            return inst
        end
    end
    return nil
end

local function organizeProject()
    ensureProjectFolders()
    local moved = {}
    local workspaceFolders = {
        Map = Workspace:FindFirstChild("Map"),
        NPCs = Workspace:FindFirstChild("NPCs"),
        Props = Workspace:FindFirstChild("Props"),
        Vehicles = Workspace:FindFirstChild("Vehicles"),
        Gameplay = Workspace:FindFirstChild("Gameplay"),
    }
    local protected = {
        Terrain = true, Camera = true, Map = true, NPCs = true, Props = true,
        Vehicles = true, Gameplay = true,
    }
    for _, inst in ipairs(Workspace:GetChildren()) do
        if not protected[inst.Name] then
            local target = nil
            local lower = string.lower(inst.Name)
            if inst:IsA("SpawnLocation") or string.find(lower, "checkpoint") or string.find(lower, "teleport") then
                target = workspaceFolders.Gameplay
            elseif inst:FindFirstChildOfClass("Humanoid") or string.find(lower, "npc") or string.find(lower, "enemy") or string.find(lower, "zombie") then
                target = workspaceFolders.NPCs
            elseif string.find(lower, "car") or string.find(lower, "vehicle") or string.find(lower, "boat") or string.find(lower, "plane") then
                target = workspaceFolders.Vehicles
            elseif inst:IsA("Model") or inst:IsA("Folder") then
                target = workspaceFolders.Map
            elseif inst:IsA("BasePart") then
                target = workspaceFolders.Props
            end
            if target then
                local from = fullPath(inst)
                inst.Parent = target
                table.insert(moved, from .. " -> " .. fullPath(target))
            end
        end
    end
    for _, inst in ipairs(ReplicatedStorage:GetChildren()) do
        if inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction") or inst:IsA("BindableEvent") or inst:IsA("BindableFunction") then
            local from = fullPath(inst)
            inst.Parent = ReplicatedStorage.Remotes
            table.insert(moved, from .. " -> " .. fullPath(ReplicatedStorage.Remotes))
        elseif inst:IsA("ModuleScript") then
            local from = fullPath(inst)
            inst.Parent = ReplicatedStorage.Modules
            table.insert(moved, from .. " -> " .. fullPath(ReplicatedStorage.Modules))
        end
    end
    -- Do not move newly-created server Scripts after insertion. Roblox scripts
    -- often use script.Parent or sibling paths during startup; moving them here
    -- can make a valid script appear to "not run" or lose dependencies.
    return { moved = moved, moved_count = #moved }
end

local function autoFixProject()
    local result = organizeProject()
    result.fixed = {}
    result.warnings = {}
    for _, inst in ipairs(game:GetDescendants()) do
        if #result.warnings >= 80 then
            table.insert(result.warnings, "warning_limit_reached")
            break
        end
        if inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
            local source = ""
            pcall(function() source = inst.Source end)
            local suspicious, pattern = sourceLooksSuspicious(source)
            if suspicious and not inst:FindFirstAncestor("BloxSmith_Quarantine") then
                local before = fullPath(inst)
                pcall(function()
                    if inst:IsA("Script") or inst:IsA("LocalScript") then inst.Disabled = true end
                end)
                quarantineInstance(inst, "Suspicious source pattern: " .. tostring(pattern))
                table.insert(result.fixed, "quarantined suspicious script: " .. before)
            end
        elseif inst:IsA("BasePart") then
            if inst.Parent == Workspace and inst.Anchored == false and not inst:FindFirstAncestorOfClass("Tool") then
                inst.Anchored = true
                table.insert(result.fixed, "anchored loose root part: " .. fullPath(inst))
            end
        end
    end
    result.fixed_count = #result.fixed
    return result
end

local function applyProps(inst, props)
    if type(props) ~= "table" then return end
    for k, v in pairs(props) do
        local ok, err = pcall(function() inst[k] = v end)
        if not ok then log(("set %s.%s failed: %s"):format(inst.Name, k, tostring(err)), "warn") end
    end
end

local function vec3(t, def)
    t = t or def or {0,0,0}
    return Vector3.new(t[1] or 0, t[2] or 0, t[3] or 0)
end
local function color(t)
    if not t then return nil end
    return Color3.new(math.clamp(t[1] or 1,0,1), math.clamp(t[2] or 1,0,1), math.clamp(t[3] or 1,0,1))
end
local function ud2(t, defScale, defOffset)
    t = t or {}
    return UDim2.new(t.xs or t[1] or defScale or 0, t.xo or t[2] or defOffset or 0,
                     t.ys or t[3] or defScale or 0, t.yo or t[4] or defOffset or 0)
end

local function ensureUnique(parent, name)
    -- avoid duplicate child names by suffixing _2, _3--
    if not parent:FindFirstChild(name) then return name end
    local i = 2
    while parent:FindFirstChild(name .. "_" .. i) do i += 1 end
    return name .. "_" .. i
end

------------------------------------------------------------------- action executors
local Exec = {}

local function isScriptActionKind(kind)
    return kind == "script" or kind == "localscript" or kind == "modulescript" or kind == "run_lua"
end

local function pickActionSource(action)
    local payload = action.payload or {}
    local candidates = {
        { value = payload.source, origin = "payload.source" },
        { value = action.source, origin = "action.source" },
        { value = payload.code, origin = "payload.code" },
        { value = payload.lua, origin = "payload.lua" },
        { value = payload.luau, origin = "payload.luau" },
        { value = payload.script, origin = "payload.script" },
    }
    for _, candidate in ipairs(candidates) do
        if type(candidate.value) == "string" and not candidate.value:match("^%s*$") then
            return candidate.value, candidate.origin
        end
    end
    return "", "missing"
end

-- Best-effort in-plugin repair for JSON-style tables the model sometimes
-- emits ({"key": value}) — convert to Luau ({key = value}) before we validate.
-- This scanner skips comments and normal string literals so JSON-looking UI
-- text is not modified.
local function previousNonWhitespace(text)
    for i = #text, 1, -1 do
        local ch = text:sub(i, i)
        if not ch:match("%s") then return ch end
    end
    return ""
end

local function nextNonWhitespaceIndex(text, index)
    local i = index
    while i <= #text and text:sub(i, i):match("%s") do i += 1 end
    return i
end

local function readQuotedString(text, index)
    local quote = text:sub(index, index)
    if quote ~= '"' and quote ~= "'" then return nil, nil end
    local value = ""
    local i = index + 1
    while i <= #text do
        local ch = text:sub(i, i)
        if ch == "\\" then
            value = value .. text:sub(i, math.min(i + 1, #text))
            i += 2
        elseif ch == quote then
            return i + 1, value
        else
            value = value .. ch
            i += 1
        end
    end
    return nil, nil
end

local function luaQuote(value)
    value = tostring(value or ""):gsub("\\", "\\\\"):gsub('"', '\\"')
    return '"' .. value .. '"'
end

local function autoRepairJsonTables(source)
    if type(source) ~= "string" or source == "" then return source, false end
    local out = {}
    local changed = false
    local i = 1
    while i <= #source do
        if source:sub(i, i + 3) == "--[[" then
            local stop = source:find("]]", i + 4, true)
            stop = stop and (stop + 1) or #source
            table.insert(out, source:sub(i, stop)); i = stop + 1
        elseif source:sub(i, i + 1) == "--" then
            local stop = source:find("\n", i + 2, true) or (#source + 1)
            table.insert(out, source:sub(i, stop - 1)); i = stop
        else
            local ch = source:sub(i, i)
            if ch == '"' or ch == "'" then
                local stop, key = readQuotedString(source, i)
                if stop then
                    local nextIndex = nextNonWhitespaceIndex(source, stop)
                    local prev = previousNonWhitespace(table.concat(out))
                    if (prev == "{" or prev == ",") and source:sub(nextIndex, nextIndex) == ":" then
                        if key:match("^[%a_][%w_]*$") then
                            table.insert(out, key .. " = ")
                        else
                            table.insert(out, "[" .. luaQuote(key) .. "] = ")
                        end
                        i = nextIndex + 1
                        changed = true
                    else
                        table.insert(out, source:sub(i, stop - 1)); i = stop
                    end
                else
                    table.insert(out, ch); i += 1
                end
            elseif ch:match("[%a_]") and (previousNonWhitespace(table.concat(out)) == "{" or previousNonWhitespace(table.concat(out)) == ",") then
                local key = source:sub(i):match("^([%a_][%w_]*)")
                local endIndex = key and (i + #key - 1) or i
                local nextIndex = key and nextNonWhitespaceIndex(source, endIndex + 1) or i
                if key and source:sub(nextIndex, nextIndex) == ":" then
                    table.insert(out, key .. " = ")
                    i = nextIndex + 1
                    changed = true
                else
                    table.insert(out, ch); i += 1
                end
            else
                table.insert(out, ch); i += 1
            end
        end
    end
    return table.concat(out), changed
end

local function validateLuaSource(source, scriptName)
    if type(source) ~= "string" or source:match("^%s*$") then
        return false, "empty script source"
    end
    local fn, err = loadstring(source, "=BloxSmithScript/" .. tostring(scriptName or "Script"))
    if not fn then
        return false, tostring(err)
    end
    return true, nil
end

local function scriptPlacementIssue(className, inst)
    if typeof(inst) ~= "Instance" then return "script instance was not created" end
    if className == "Script" then
        if inst:IsDescendantOf(ServerScriptService) or inst:IsDescendantOf(Workspace) then return nil end
        return "Script must be under ServerScriptService or Workspace to run at play time; got " .. fullPath(inst.Parent)
    elseif className == "LocalScript" then
        if inst:IsDescendantOf(StarterPlayer) or inst:IsDescendantOf(StarterGui) or inst:IsDescendantOf(StarterPack) then return nil end
        return "LocalScript must be under StarterPlayerScripts, StarterCharacterScripts, StarterGui/PlayerGui, or a Tool; got " .. fullPath(inst.Parent)
    elseif className == "ModuleScript" then
        if inst:IsDescendantOf(ReplicatedStorage) or inst:IsDescendantOf(ServerScriptService) or inst:IsDescendantOf(ServerStorage) or inst:IsDescendantOf(StarterPlayer) or inst:IsDescendantOf(StarterGui) then return nil end
        return "ModuleScript is in a nonstandard location and may not be require-able: " .. fullPath(inst.Parent)
    end
    return nil
end

local function verifyInsertedScript(inst, className, expectedSource)
    if typeof(inst) ~= "Instance" or not inst:IsA(className) then
        return false, "created instance is not a " .. tostring(className)
    end
    local actual = ""
    local readOk, readErr = pcall(function() actual = inst.Source end)
    if not readOk then return false, "could not read script source after insertion: " .. tostring(readErr) end
    if type(actual) ~= "string" or actual:match("^%s*$") then return false, "inserted script source is empty" end
    if actual ~= expectedSource then return false, "inserted script source changed during write" end
    local placement = scriptPlacementIssue(className, inst)
    if placement then return false, placement end
    if className == "Script" or className == "LocalScript" then
        local enabledOk, enabledErr = pcall(function() inst.Disabled = false end)
        if not enabledOk then return false, "could not enable script after insertion: " .. tostring(enabledErr) end
    end
    pcall(function()
        inst:SetAttribute("BloxSmithValidated", true)
        inst:SetAttribute("BloxSmithValidatedAt", os.time())
        inst:SetAttribute("BloxSmithClass", className)
    end)
    return true, nil
end

local function collectScriptSet()
    local set = {}
    for _, inst in ipairs(game:GetDescendants()) do
        if inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
            set[inst] = true
        end
    end
    return set
end

local function verifyNewScriptsCreatedByRunLua(beforeSet)
    local checked = 0
    local failures = {}
    for _, inst in ipairs(game:GetDescendants()) do
        if (inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript")) and not beforeSet[inst] then
            checked += 1
            local source = ""
            pcall(function() source = inst.Source end)
            local ok, err = validateLuaSource(source, inst.Name)
            if ok then
                ok, err = verifyInsertedScript(inst, inst.ClassName, source)
            end
            if not ok then
                local path = fullPath(inst)
                pcall(function() inst:Destroy() end)
                table.insert(failures, path .. " - " .. tostring(err))
            end
        end
    end
    if #failures > 0 then
        error("run_lua created invalid script(s); removed before leaving broken code in Studio: " .. table.concat(failures, "; "))
    end
    return checked
end

local function makeScript(className, action, parent)
    local payload = action.payload or {}
    local source, origin = pickActionSource(action)
    log(("Validating %s '%s' source from %s (%d chars).")
        :format(tostring(className), tostring(action.name), tostring(origin), #source), "debug")
    local repaired, changed = autoRepairJsonTables(source)
    if changed then
        log(("Auto-repaired JSON-style tables in '%s'."):format(tostring(action.name)), "warn")
        source = repaired
    end
    local ok, err = validateLuaSource(source, action.name)
    if not ok then
        error("script validation failed for " .. tostring(action.name) .. " before insertion: " .. tostring(err) .. " (source=" .. tostring(origin) .. ", chars=" .. tostring(#source) .. ")")
    end
    local existing = parent:FindFirstChild(action.name)
    if existing and existing:IsA(className) then existing:Destroy() end
    local s = Instance.new(className)
    s.Name = action.name
    s.Source = source
    s.Parent = parent
    local verified, verifyErr = verifyInsertedScript(s, className, source)
    if not verified then
        pcall(function() s:Destroy() end)
        error("script post-insertion verification failed for " .. tostring(action.name) .. ": " .. tostring(verifyErr))
    end
    return s
end

Exec.folder = function(a, p)
    local f = p:FindFirstChild(a.name) or Instance.new("Folder")
    f.Name = a.name; f.Parent = p; return f
end
Exec.script         = function(a,p) return makeScript("Script", a, p) end
Exec.localscript    = function(a,p) return makeScript("LocalScript", a, p) end
Exec.modulescript   = function(a,p) return makeScript("ModuleScript", a, p) end

Exec.screengui = function(a, p)
    local existing = p:FindFirstChild(a.name)
    if existing then existing:Destroy() end
    local g = Instance.new("ScreenGui"); g.Name = a.name
    g.ResetOnSpawn = (a.payload and a.payload.reset_on_spawn) ~= false
    g.Parent = p; applyProps(g, a.payload and a.payload.properties); return g
end
local function makeGuiObject(className, a, p)
    local payload = a.payload or {}
    local obj = Instance.new(className); obj.Name = a.name
    if obj:IsA("GuiObject") then
        obj.Size = ud2(payload.size, 0, 100)
        obj.Position = ud2(payload.position, 0, 0)
        if payload.bg then obj.BackgroundColor3 = color(payload.bg) or obj.BackgroundColor3 end
        if payload.bg_transparency then obj.BackgroundTransparency = payload.bg_transparency end
    end
    if obj:IsA("TextLabel") or obj:IsA("TextButton") then
        obj.Text = payload.text or a.name
        if payload.text_color then obj.TextColor3 = color(payload.text_color) or obj.TextColor3 end
        if payload.text_size then obj.TextSize = payload.text_size end
        obj.Font = Enum.Font.BuilderSans
    end
    if obj:IsA("ImageLabel") and payload.image then obj.Image = payload.image end
    obj.Parent = p; applyProps(obj, payload.properties); return obj
end
Exec.frame      = function(a,p) return makeGuiObject("Frame", a, p) end
Exec.textlabel  = function(a,p) return makeGuiObject("TextLabel", a, p) end
Exec.textbutton = function(a,p) return makeGuiObject("TextButton", a, p) end
Exec.imagelabel = function(a,p) return makeGuiObject("ImageLabel", a, p) end

local function ensureRemote(className, a, p)
    local existing = p:FindFirstChild(a.name)
    if existing and existing:IsA(className) then return existing end
    if existing then existing:Destroy() end
    local r = Instance.new(className); r.Name = a.name; r.Parent = p; return r
end
Exec.remoteevent    = function(a,p) return ensureRemote("RemoteEvent", a, p) end
Exec.remotefunction = function(a,p) return ensureRemote("RemoteFunction", a, p) end
Exec.bindableevent  = function(a,p) return ensureRemote("BindableEvent", a, p) end

Exec.part = function(a, p)
    local payload = a.payload or {}
    if p and not p:IsA("Workspace") and isCodeOnlyPath(p:GetFullName()) then p = Workspace end
    local part = Instance.new("Part"); part.Name = a.name
    part.Size = vec3(payload.size, {4,1,4})
    part.Position = vec3(payload.position, {0,5,0})
    part.Anchored = payload.anchored ~= false
    if payload.color then part.Color = color(payload.color) end
    if payload.material then
        local ok, m = pcall(function() return Enum.Material[payload.material] end)
        if ok and m then part.Material = m end
    end
    part.Parent = p; applyProps(part, payload.properties); return part
end

Exec.model = function(a, p)
    local m = Instance.new("Model"); m.Name = a.name; m.Parent = p; return m
end

Exec.tool = function(a, p)
    local payload = a.payload or {}
    local t = Instance.new("Tool"); t.Name = a.name
    t.RequiresHandle = payload.requires_handle ~= false
    if payload.requires_handle ~= false then
        local h = Instance.new("Part"); h.Name = "Handle"
        h.Size = vec3(payload.handle_size, {1,1,2}); h.Parent = t
    end
    t.Parent = p; applyProps(t, payload.properties); return t
end

Exec.sound = function(a, p)
    local payload = a.payload or {}
    local s = Instance.new("Sound"); s.Name = a.name
    if payload.sound_id then s.SoundId = payload.sound_id end
    if payload.volume then s.Volume = payload.volume end
    s.Looped = payload.looped == true
    s.Parent = p; return s
end

Exec.team = function(a, p)
    local payload = a.payload or {}
    local t = Instance.new("Team"); t.Name = a.name
    if payload.color then t.TeamColor = BrickColor.new(color(payload.color) or Color3.new(1,1,1)) end
    t.AutoAssignable = payload.auto_assignable ~= false
    t.Parent = Teams; return t
end

Exec.leaderstats = function(a, _)
    -- Standard leaderstats injector script in SSS.
    local payload = a.payload or {}
    local stats = payload.stats or { { name = "Cash", value = 0, kind = "IntValue" } }
    local lines = {
        "-- BloxSmith leaderstats",
        "game.Players.PlayerAdded:Connect(function(plr)",
        "    local ls = Instance.new('Folder'); ls.Name='leaderstats'; ls.Parent = plr",
    }
    for _, st in ipairs(stats) do
        local kind = st.kind or "IntValue"
        table.insert(lines, ("    local v = Instance.new('%s'); v.Name='%s'; v.Value=%s; v.Parent=ls")
            :format(kind, tostring(st.name or "Stat"), tostring(st.value or 0)))
    end
    table.insert(lines, "end)")
    local s = ServerScriptService:FindFirstChild("BloxSmith_Leaderstats")
    if s then s:Destroy() end
    s = Instance.new("Script"); s.Name = "BloxSmith_Leaderstats"
    s.Source = table.concat(lines, "\n"); s.Parent = ServerScriptService; return s
end

Exec.organize_project = function(_, _)
    local result = organizeProject()
    log(("Organized project -- moved %d item(s)."):format(result.moved_count or 0), "success")
    return result
end

Exec.autofix_project = function(_, _)
    local result = autoFixProject()
    log(("Auto-fix complete -- %d moved, %d fixed."):format(result.moved_count or 0, result.fixed_count or 0), "success")
    return result
end

local blockedAssetIds = {}

local function wrapGinsertObjects(id, objects, name)
    if type(objects) ~= "table" or #objects == 0 then
        return nil, "ginsert returned no objects"
    end
    local container = Instance.new("Model")
    container.Name = name or ("Asset_" .. tostring(id))
    local moved = 0
    for _, obj in ipairs(objects) do
        if typeof(obj) == "Instance" then
            obj.Parent = container
            moved += 1
        end
    end
    if moved == 0 then
        container:Destroy()
        return nil, "ginsert returned no instances"
    end
    return container, nil
end

local function ginsertCandidate(id, name)
    local ok, objects = pcall(function() return game:GetObjects("rbxassetid://" .. tostring(id)) end)
    if ok then
        local wrapped, err = wrapGinsertObjects(id, objects, name)
        if wrapped then return wrapped, nil end
        return nil, err
    end
    return nil, tostring(objects)
end

local function pickBestToolboxModel(container)
    local models, lines = {}, {}
    local function partCount(inst)
        local n = 0
        for _, d in ipairs(inst:GetDescendants()) do
            if d:IsA("BasePart") then n += 1 end
        end
        return n
    end
    local function bounds(inst)
        local ok, size = pcall(function() return inst:GetExtentsSize() end)
        return ok and size and size.Magnitude or 0
    end
    for _, d in ipairs(container:GetDescendants()) do
        if d:IsA("Model") then
            table.insert(models, {
                inst = d,
                index = #models + 1,
                hasPrimary = d.PrimaryPart ~= nil,
                parts = partCount(d),
                bbox = bounds(d),
            })
        end
    end
    if #models == 0 then
        table.insert(lines, "all models found: 0; rejecting only because no Model exists anywhere")
        return nil, lines
    end
    for _, m in ipairs(models) do
        table.insert(lines, ("model found: %s (primary=%s parts=%d bbox=%.1f)"):format(fullPath(m.inst), tostring(m.hasPrimary), m.parts, m.bbox))
    end
    table.sort(models, function(a, b)
        if a.hasPrimary ~= b.hasPrimary then return a.hasPrimary end
        if a.parts ~= b.parts then return a.parts > b.parts end
        if a.bbox ~= b.bbox then return a.bbox > b.bbox end
        return a.index < b.index
    end)
    local best = models[1]
    local why = best.hasPrimary and "has PrimaryPart" or (best.parts > 0 and "most BaseParts" or (best.bbox > 0 and "largest bounding box" or "first valid Model"))
    table.insert(lines, ("chosen model: %s — %s (primary=%s parts=%d bbox=%.1f)"):format(fullPath(best.inst), why, tostring(best.hasPrimary), best.parts, best.bbox))
    for i = 2, math.min(#models, 12) do
        local m = models[i]
        table.insert(lines, ("not chosen: %s — lower priority than chosen (primary=%s parts=%d bbox=%.1f)"):format(fullPath(m.inst), tostring(m.hasPrimary), m.parts, m.bbox))
    end
    return best.inst, lines
end

local function loadAssetCandidate(id, name, parent)
    if blockedAssetIds[id] then
        return nil, "blacklisted_failed_asset"
    end
    local container, ginsertErr = ginsertCandidate(id, name)
    if not container then
        local ok, loaded = pcall(function() return InsertService:LoadAsset(id) end)
        if ok and loaded then
            container = loaded
        else
            blockedAssetIds[id] = true
            return nil, "ginsert/GetObjects failed: " .. tostring(ginsertErr) .. " | LoadAsset failed: " .. tostring(loaded)
        end
    end
    local kids = container:GetChildren()
    if #kids == 0 then
        container:Destroy()
        return nil, "loaded empty asset"
    end
    container.Name = name or ("Asset_" .. tostring(id))
    log(("Scanning Toolbox package id=%d (%d top-level children); selecting from all nested Models"):format(id, #kids), "debug")
    local best, debugLines = pickBestToolboxModel(container)
    for _, line in ipairs(debugLines or {}) do log("[insert_asset] " .. line, "debug") end
    if not best then
        container:Destroy()
        return nil, "rejected: no Model found anywhere in Toolbox asset"
    end
    best.Name = container.Name
    best.Parent = parent
    container:Destroy()
    return best, nil
end

Exec.insert_asset = function(a, p)
    local payload = a.payload or {}
    local id = tonumber(payload.asset_id)
    if not id or id <= 0 then error("insert_asset missing asset_id") end
    if payload.folder_name and type(payload.folder_name) == "string" and payload.folder_name ~= "" then
        local folder = p:FindFirstChild(payload.folder_name)
        if not folder then
            folder = Instance.new("Folder")
            folder.Name = payload.folder_name
            folder.Parent = p
        end
        p = folder
    end

    local candidates = { id }
    if type(payload.fallback_ids) == "table" then
        for _, fallbackId in ipairs(payload.fallback_ids) do
            local n = tonumber(fallbackId)
            if n and n > 0 and n ~= id then
                table.insert(candidates, n)
            end
        end
    end

    if payload.allow_duplicates ~= true then
        for _, candidateId in ipairs(candidates) do
            local existing = findExistingAsset(p, candidateId)
            if existing then
                log(("Skipped duplicate Toolbox asset id=%d already at %s"):format(candidateId, fullPath(existing)), "warn")
                return {
                    skipped = true,
                    reason = "duplicate_asset",
                    asset_id = candidateId,
                    path = fullPath(existing),
                    verified = true,
                    safety_status = "Duplicate Skipped",
                }
            end
        end
    end

    local noScripts = payload.no_scripts ~= false and payload.allow_scripts ~= true
    local inserted, loadErr, usedId, safetyReport = nil, nil, nil, nil
    local attempted = {}
    for index, candidateId in ipairs(candidates) do
        table.insert(attempted, candidateId)
        inserted, loadErr = loadAssetCandidate(candidateId, a.name or ("Asset_" .. candidateId), p)
        if inserted then
            -- Single scan: checks visibility AND quarantines suspicious scripts.
            safetyReport = inspectInsertedAsset(inserted, { no_scripts = noScripts })
            if not safetyReport.has_visible_content then
                inserted:Destroy()
                blockedAssetIds[candidateId] = true
                inserted = nil; safetyReport = nil
                loadErr = "loaded asset has no visible 3D content"
                log(("Skipped empty/invisible asset id=%d. Trying another free model."):format(candidateId), "warn")
            else
                usedId = candidateId
            end
        end
        if inserted then
            if index > 1 then
                log(("Asset id=%d failed; fallback id=%d inserted instead."):format(id, usedId), "warn")
            end
            break
        end
        log(("Skipped locked/private asset id=%d: %s. Trying another free model."):format(candidateId, tostring(loadErr)), "warn")
    end
    if not inserted then
        return {
            skipped = true,
            reason = "all_asset_candidates_unavailable",
            requested_asset_id = id,
            attempted_asset_ids = attempted,
            error = tostring(loadErr),
        }
    end

    -- Optional placement: payload.position {x,y,z}, payload.rotation {x,y,z}
    -- in degrees, or payload.yaw in degrees. ScaleTo is supported for Models.
    local cf = nil
    if payload.position then
        local pos = payload.position
        cf = CFrame.new(tonumber(pos[1]) or 0, tonumber(pos[2]) or 0, tonumber(pos[3]) or 0)
    end
    if cf and payload.rotation then
        local rot = payload.rotation
        cf = cf * CFrame.Angles(math.rad(tonumber(rot[1]) or 0), math.rad(tonumber(rot[2]) or 0), math.rad(tonumber(rot[3]) or 0))
    elseif cf and payload.yaw then
        cf = cf * CFrame.Angles(0, math.rad(tonumber(payload.yaw) or 0), 0)
    end
    if cf and (inserted:IsA("Model") or inserted:IsA("BasePart")) then
        pcall(function() inserted:PivotTo(cf) end)
    end
    if payload.scale and inserted:IsA("Model") then
        pcall(function() inserted:ScaleTo(tonumber(payload.scale) or 1) end)
    end
    local anchoredCount = 0
    if payload.anchor ~= false and payload.anchored ~= false then
        anchoredCount = anchorWorldModel(inserted)
    end
    local groundSnapped = false
    if payload.ground_snap ~= false then
        groundSnapped = groundSnap(inserted)
    end
    if payload.tags and type(payload.tags) == "table" then
        for _, tag in ipairs(payload.tags) do
            if type(tag) == "string" and tag ~= "" then
                pcall(function() CollectionService:AddTag(inserted, tag) end)
            end
        end
    end
    pcall(function()
        inserted:SetAttribute("BloxSmithAssetId", usedId)
        inserted:SetAttribute("BloxSmithRequestedAssetId", id)
        inserted:SetAttribute("BloxSmithToolboxOnly", payload.toolbox_only == true or payload.free_only == true)
        inserted:SetAttribute("BloxSmithProceduralFallbackDisabled", payload.disable_procedural_fallback ~= false)
        if payload.asset_name then inserted:SetAttribute("BloxSmithAssetName", tostring(payload.asset_name)) end
        if payload.creator_name then inserted:SetAttribute("BloxSmithCreatorName", tostring(payload.creator_name)) end
        if payload.source_query then inserted:SetAttribute("BloxSmithSourceQuery", tostring(payload.source_query)) end
        if payload.placement_role then inserted:SetAttribute("BloxSmithPlacementRole", tostring(payload.placement_role)) end
        if payload.district then inserted:SetAttribute("BloxSmithDistrict", tostring(payload.district)) end
        if payload.quality_tier then inserted:SetAttribute("BloxSmithQualityTier", tostring(payload.quality_tier)) end
        if payload.safety_score then inserted:SetAttribute("BloxSmithSafetyScore", tonumber(payload.safety_score) or 0) end
        if payload.relevance_score then inserted:SetAttribute("BloxSmithRelevanceScore", tonumber(payload.relevance_score) or 0) end
        if payload.category then inserted:SetAttribute("BloxSmithCategory", tostring(payload.category)) end
        inserted:SetAttribute("BloxSmithStudioVerified", true)
    end)
    safetyReport = safetyReport or inspectInsertedAsset(inserted, { no_scripts = noScripts })
    if safetyReport.quarantined > 0 then
        log(("Asset safety scan quarantined %d suspicious script(s) from id=%d."):format(safetyReport.quarantined, usedId), "warn")
    elseif safetyReport.scripts > 0 then
        log(("Asset safety scan checked %d script(s) in id=%d."):format(safetyReport.scripts, usedId), "debug")
    end
    local cf, size = assetBounds(inserted)
    local bounds = nil
    if cf and size then
        bounds = {
            position = { cf.Position.X, cf.Position.Y, cf.Position.Z },
            size = { size.X, size.Y, size.Z },
        }
    end
    log(("-- inserted verified asset id=%d as '%s' under %s (%d visible part(s), %d texture/mesh signal(s))"):format(
        usedId,
        inserted.Name,
        p:GetFullName(),
        safetyReport.visible_parts or 0,
        (safetyReport.mesh_parts or 0) + (safetyReport.textures or 0) + (safetyReport.decals or 0) + (safetyReport.special_meshes or 0)
    ), "success")
    return {
        asset_id = usedId,
        requested_asset_id = id,
        fallback_used = usedId ~= id,
        attempted_asset_ids = attempted,
        name = inserted.Name,
        path = inserted:GetFullName(),
        class = inserted.ClassName,
        verified = safetyReport.has_visible_content == true,
        safety_status = safetyReport.quarantined > 0 and "Scripts Quarantined" or "Verified",
        safety = safetyReport,
        anchored_parts = anchoredCount,
        ground_snapped = groundSnapped,
        bounds = bounds,
    }
end

-- Try to load a single asset id. Returns (placed_instance, nil) on success
-- or (nil, reason_string) on failure. Never throws.
local function tryLoadAsset(id, name, parent)
    local placed, reason = loadAssetCandidate(id, name, parent)
    if not placed then return nil, reason end
    pcall(function() CollectionService:AddTag(placed, "BloxSmithAsset") end)
    return placed, nil
end

-- toolbox_assets: server-resolved batch of free Roblox Toolbox assets.
-- Auto-skips unauthorized assets. It does not substitute hardcoded fallback
-- models because Toolbox mode must only insert assets selected by live search.
Exec.toolbox_assets = function(a, p)
    local payload = a.payload or {}
    local assets = payload.assets
    if type(assets) ~= "table" or #assets == 0 then
        error("toolbox_assets missing payload.assets array")
    end
    local folder = p:FindFirstChild("BloxSmithAssets")
    if not folder then
        folder = Instance.new("Folder")
        folder.Name = "BloxSmithAssets"
        folder.Parent = p
    end
    local inserted, failed, skipped = {}, {}, 0
    for i, asset in ipairs(assets) do
        local id = tonumber(asset and asset.id)
        if not id or id <= 0 then
            table.insert(failed, { id = asset and asset.id, reason = "invalid_id" })
        else
            local placed, err = tryLoadAsset(id, asset.name, folder)
            if placed then
                local safety = inspectInsertedAsset(placed)
                table.insert(inserted, {
                    id = id, name = placed.Name,
                    path = placed:GetFullName(), class = placed.ClassName,
                    creator = asset.creator, safety = safety,
                })
                log(("-- asset id=%d '%s'"):format(id, placed.Name), "success")
            else
                skipped += 1
                table.insert(failed, { id = id, name = asset.name, reason = err })
                log(("-- asset id=%d unauthorized or missing (%s) -- skipped; no hardcoded fallback inserted"):format(id, tostring(err)), "warn")
            end
        end
    end
    log(("Toolbox batch -- %d inserted, %d skipped, %d failed."):format(
        #inserted, skipped, #failed), #failed > 0 and "warn" or "success")
    return { inserted = inserted, failed = failed, skipped = skipped, source = payload.source or "live" }
end

Exec.set_properties = function(a, _)
    local path = a.payload and a.payload.target_path
    local inst = findByPath(path)
    if not inst then
        -- Soft-skip: don't fail the whole batch if the AI referenced a
        -- target that doesn't exist (typo, race with a previous action, or
        -- the target lives in a place the user hasn't scanned). Try the
        -- action's own `name` under `parent_path` as a fallback.
        if a.parent_path and a.name then
            local parent = resolveParent(a.parent_path, "folder")
            inst = parent and parent:FindFirstChild(a.name)
        end
        if not inst then
            log(("set_properties skipped -- target not found: %s"):format(tostring(path)), "warn")
            return { skipped = true, reason = "target_not_found", target_path = path }
        end
    end
    applyProps(inst, a.payload.properties); return inst
end

Exec.rename = function(a, _)
    local path = a.payload and a.payload.target_path
    local inst = findByPath(path)
    if not inst and a.parent_path and a.name then
        local parent = resolveParent(a.parent_path, "folder")
        inst = parent and parent:FindFirstChild(a.name)
    end
    if not inst then
        log(("rename skipped — target not found: %s"):format(tostring(path)), "warn")
        return { skipped = true, reason = "target_not_found", target_path = path }
    end
    inst.Name = a.payload.new_name or inst.Name; return inst
end

Exec.move = function(a, _)
    local path = a.payload and a.payload.target_path
    local inst = findByPath(path)
    if not inst and a.parent_path and a.name then
        local parent = resolveParent(a.parent_path, "folder")
        inst = parent and parent:FindFirstChild(a.name)
    end
    if not inst then
        log(("move skipped — target not found: %s"):format(tostring(path)), "warn")
        return { skipped = true, reason = "target_not_found", target_path = path }
    end
    local dest = resolveParent(a.payload.new_parent_path, "folder")
    inst.Parent = dest; return inst
end

Exec.delete = function(a, _)
    local path = a.payload and a.payload.target_path
    local inst = findByPath(path)
    if not inst and a.parent_path and a.name then
        local parent = resolveParent(a.parent_path, "folder")
        inst = parent and parent:FindFirstChild(a.name)
    end
    if not inst then
        -- Soft-skip: the target may already be gone (previous cleanup, re-run,
        -- or a rename earlier in the same batch). Don't fail the whole build
        -- for a no-op delete.
        log(("delete skipped — target not found: %s"):format(tostring(path)), "warn")
        return { skipped = true, reason = "target_not_found", target_path = path }
    end
    if inst.Parent == game then
        log(("delete skipped — refuses to delete service %s"):format(inst.Name), "warn")
        return { skipped = true, reason = "is_service", target_path = path }
    end
    local name = inst:GetFullName()
    inst:Destroy()
    return { deleted = name }
end

-- run_lua: execute a Luau builder script INSIDE the plugin context.
-- Two extra helpers are exposed to the builder so the AI doesn't have to
-- guard every property write itself:
--   safeSet(inst, key, value)            -- pcall-wrapped single property set
--   safeSetProps(inst, { K = V, ... })   -- pcall-wrapped bulk set
-- Both swallow errors with a [BloxSmith] warn so one hallucinated property
-- (e.g. workspace.Terrain.Decoration) can't kill the whole build.
Exec.run_lua = function(a, p)
    local payload = a.payload or {}
    local source, origin = pickActionSource(a)
    log(("Validating run_lua '%s' source from %s (%d chars).")
        :format(tostring(a.name), tostring(origin), #source), "debug")
    if type(source) ~= "string" or source:match("^%s*$") then
        error("run_lua missing source before execution (source=" .. tostring(origin) .. ", chars=" .. tostring(#source) .. ")")
    end
    local repaired, changed = autoRepairJsonTables(source)
    if changed then
        log(("Auto-repaired JSON-style tables in run_lua '%s'."):format(tostring(a.name)), "warn")
        source = repaired
    end
    local wrapped = [[
return function(parent, plugin, safeSet, safeSetProps, ...)
]] .. source .. [[

end
]]
    local fn, parseErr = loadstring(wrapped, "=BloxSmith/" .. tostring(a.name or "builder"))
    if not fn then error("compile error: " .. tostring(parseErr)) end
    local builder = fn()
    if type(builder) ~= "function" then error("builder did not return a function") end

    local function safeSet(inst, k, v)
        if typeof(inst) ~= "Instance" then return false end
        local ok, err = pcall(function() inst[k] = v end)
        if not ok then
            warn(("[BloxSmith] safeSet %s.%s skipped: %s"):format(inst.Name or "?", tostring(k), tostring(err)))
        end
        return ok
    end
    local function safeSetProps(inst, props)
        if typeof(inst) ~= "Instance" or type(props) ~= "table" then return end
        for k, v in pairs(props) do safeSet(inst, k, v) end
    end

    local beforeScripts = collectScriptSet()
    local ok, builderResult = pcall(builder, p, plugin, safeSet, safeSetProps)
    if not ok then error("runtime error: " .. tostring(builderResult)) end
    local verifiedScripts = verifyNewScriptsCreatedByRunLua(beforeScripts)
    local result = { ran = a.name, scripts_verified = verifiedScripts }
    if typeof(builderResult) == "Instance" then
        result.path = fullPath(builderResult)
        result.class = builderResult.ClassName
        result.name = builderResult.Name
    elseif type(builderResult) == "table" then
        if typeof(builderResult.instance) == "Instance" then
            result.path = fullPath(builderResult.instance)
            result.class = builderResult.instance.ClassName
            result.name = builderResult.instance.Name
        elseif type(builderResult.path) == "string" then
            result.path = builderResult.path
        end
        if type(builderResult.summary) == "string" then result.summary = builderResult.summary end
        if type(builderResult.visible) == "boolean" then result.visible = builderResult.visible end
        if type(builderResult.created) == "table" then
            result.created = {}
            for _, entry in ipairs(builderResult.created) do
                if typeof(entry) == "Instance" then
                    table.insert(result.created, { path = fullPath(entry), class = entry.ClassName, name = entry.Name })
                elseif type(entry) == "table" and type(entry.path) == "string" then
                    table.insert(result.created, entry)
                end
            end
        end
    end
    return result
end

local function describeAction(a)
    local payload = a.payload or {}
    local meta = payload._bloxsmith or {}
    local extra = ""
    if a.kind == "script" or a.kind == "localscript" or a.kind == "modulescript" then
        local source = pickActionSource(a)
        extra = (" (%d chars)"):format(#source)
    elseif a.kind == "part" then
        local sz = payload.size or {}
        extra = (" %sx%sx%s"):format(tostring(sz[1] or "?"), tostring(sz[2] or "?"), tostring(sz[3] or "?"))
    elseif a.kind == "insert_asset" then
        local assetName = payload.asset_name or (payload.preview and payload.preview.name)
        local safety = payload.safety_score or (payload.preview and payload.preview.safety)
        local safetyNum = tonumber(safety)
        extra = (" id=%s%s%s"):format(
            tostring(payload.asset_id),
            assetName and (" ?? " .. tostring(assetName)) or "",
            safetyNum and (" ?? safety " .. tostring(math.floor(safetyNum * 100))) or ""
        )
    end
    local mode = meta.execution_mode and (" [" .. tostring(meta.execution_mode) .. "]") or ""
    return ("%s%s '%s' -- %s%s"):format(a.kind, mode, tostring(a.name), tostring(a.parent_path or "auto"), extra)
end

local function executeAction(action)
    local kind = action.kind
    local handler = Exec[kind]
    if not handler then error("Unknown action kind: " .. tostring(kind)) end
    local parent = resolveParent(action.parent_path, kind)
    log("-- " .. describeAction(action), "debug")
    return handler(action, parent)
end

local function actionTimeoutSeconds(action)
    local kind = tostring(action and action.kind or "")
    if kind == "insert_asset" then return 14 end
    if kind == "scan_project" or kind == "autofix_project" or kind == "organize_project" then return 10 end
    if kind == "run_lua" then return 12 end
    return 6
end

local function executeActionWithTimeout(action)
    local finished = false
    local ok = false
    local value = nil
    local thread = task.spawn(function()
        ok, value = pcall(executeAction, action)
        finished = true
    end)
    local timeoutAt = os.clock() + actionTimeoutSeconds(action)
    while not finished and os.clock() < timeoutAt do
        task.wait(0.025)
    end
    if not finished then
        pcall(task.cancel, thread)
        return false, ("Studio action timed out after %ds; skipped so newer builds can execute immediately."):format(actionTimeoutSeconds(action))
    end
    return ok, value
end

local function reportableResult(value)
    if typeof(value) == "Instance" then
        return { path = fullPath(value), class = value.ClassName, name = value.Name }
    elseif type(value) == "table" then
        return value
    end
    return nil
end

-- Collect concrete Instance handles from an action's return value so the
-- camera can focus on freshly created objects after the batch completes.
local function collectInstancesFromResult(bucket, value)
    if typeof(value) == "Instance" then
        table.insert(bucket, value)
        return
    end
    if type(value) ~= "table" then return end
    if typeof(value.instance) == "Instance" then table.insert(bucket, value.instance) end
    if type(value.path) == "string" then
        local ok, inst = pcall(findByPath, value.path)
        if ok and typeof(inst) == "Instance" then table.insert(bucket, inst) end
    end
    for _, key in ipairs({ "inserted", "created", "children" }) do
        local list = value[key]
        if type(list) == "table" then
            for _, entry in ipairs(list) do
                if typeof(entry) == "Instance" then
                    table.insert(bucket, entry)
                elseif type(entry) == "table" and type(entry.path) == "string" then
                    local ok, inst = pcall(findByPath, entry.path)
                    if ok and typeof(inst) == "Instance" then table.insert(bucket, inst) end
                end
            end
        end
    end
end

-- Compute a combined bounding box for a set of instances (parts + models).
local function combinedBounds(instances)
    local minV, maxV
    local function extend(cf, size)
        if not cf or not size then return end
        local half = size / 2
        local corners = {
            cf.Position + Vector3.new(-half.X, -half.Y, -half.Z),
            cf.Position + Vector3.new( half.X,  half.Y,  half.Z),
        }
        for _, p in ipairs(corners) do
            if not minV then minV = p; maxV = p
            else
                minV = Vector3.new(math.min(minV.X,p.X), math.min(minV.Y,p.Y), math.min(minV.Z,p.Z))
                maxV = Vector3.new(math.max(maxV.X,p.X), math.max(maxV.Y,p.Y), math.max(maxV.Z,p.Z))
            end
        end
    end
    for _, inst in ipairs(instances) do
        if inst and inst.Parent then
            if inst:IsA("Model") then
                local ok, cf, sz = pcall(function() return inst:GetBoundingBox() end)
                if ok then extend(cf, sz) end
            elseif inst:IsA("BasePart") then
                extend(inst.CFrame, inst.Size)
            else
                for _, d in ipairs(inst:GetDescendants()) do
                    if d:IsA("BasePart") then extend(d.CFrame, d.Size) end
                end
            end
        end
    end
    if not minV then return nil end
    local center = (minV + maxV) / 2
    local size = maxV - minV
    return center, size
end

-- Select the freshly-built instances and pull the Studio camera in to frame
-- them, so the user immediately SEES what just got built.
local function focusCameraOn(instances)
    local visible = {}
    for _, inst in ipairs(instances) do
        if inst and inst.Parent and (inst:IsA("BasePart") or inst:IsA("Model") or inst:FindFirstChildWhichIsA("BasePart", true)) then
            table.insert(visible, inst)
        end
    end
    if #visible == 0 then return end
    pcall(function() Selection:Set(visible) end)
    local center, size = combinedBounds(visible)
    if not center or not size then return end
    local radius = math.max(size.Magnitude, 8)
    local distance = math.clamp(radius * 1.6, 12, 400)
    local camera = Workspace.CurrentCamera
    if not camera then return end
    local offset = Vector3.new(distance * 0.75, distance * 0.55, distance * 0.75)
    pcall(function()
        camera.CameraType = Enum.CameraType.Scriptable
        camera.CFrame = CFrame.new(center + offset, center)
        camera.Focus = CFrame.new(center)
        task.delay(0.35, function()
            if camera then camera.CameraType = Enum.CameraType.Custom end
        end)
    end)
end


------------------------------------------------------------------- HTTP
local function studioVersion()
    local ok, v = pcall(function() return version() end)
    return ok and tostring(v) or "unknown"
end

local function post(path, body, opts)
    opts = opts or {}
    local verbose = opts.verbose ~= false and (VERBOSE or opts.force)
    local t0 = os.clock()
    if verbose then log("-- POST " .. API_BASE .. path, "net") end
    body = body or {}
    local headers = { ["Content-Type"] = "application/json" }
    -- Forward token in both header and body for defense-in-depth.
    if type(body.token) == "string" and body.token ~= "" then
        headers["Authorization"] = "Bearer " .. body.token
        headers["X-BloxSmith-Token"] = body.token
    end
    local ok, res = pcall(function()
        return HttpService:RequestAsync({
            Url = API_BASE .. path, Method = "POST",
            Headers = headers,
            Body = HttpService:JSONEncode(body),
        })
    end)
    local dt = math.floor((os.clock() - t0) * 1000)
    if not ok then
        log(("-- POST %s failed after %dms -- %s"):format(path, dt, tostring(res)), "error")
        return nil, tostring(res), 0
    end
    if not res.Success then
        local short = tostring(res.Body or "")
        if #short > 240 then short = short:sub(1,240) .. "--" end
        log(("-- POST %s -- HTTP %s in %dms -- %s"):format(path, tostring(res.StatusCode), dt, short), "error")
        return nil, "HTTP " .. tostring(res.StatusCode) .. ": " .. tostring(res.Body), tonumber(res.StatusCode) or 0
    end
    local decoded; pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
    if verbose then log(("-- POST %s -- %s in %dms"):format(path, tostring(res.StatusCode), dt), "net") end
    return decoded or {}, nil, tonumber(res.StatusCode) or 200
end

local function reportComplete(actionId, status, errMsg, result)
    local token = validToken()
    if not token then return end
    post("/api/public/plugin/complete", {
        token = token, action_id = actionId, status = status, error = errMsg, result = result,
    }, { verbose = false })
end

-- Fast batch report: one HTTP call for many results.
local function reportBatch(results)
    local token = validToken()
    if not token or #results == 0 then return end
    local ok, err = pcall(function()
        local _, postErr = post("/api/public/plugin/complete", { token = token, results = results }, { verbose = false })
        if postErr then error(postErr) end
    end)
    if not ok then
        -- Fallback: per-action (older server)
        log("Batch completion report failed; retrying per action: " .. tostring(err), "warn")
        for _, r in ipairs(results) do
            reportComplete(r.action_id, r.status, r.error, r.result)
        end
    end
end

------------------------------------------------------------------- state
local connected, pairingCode = false, nil
local lastHeartbeat, queueLen, lastAction = 0, 0, "--"

local function setStatus(text, color, sub)
    statusLabel.Text = "Status: " .. text
    statusLabel.TextColor3 = color or Color3.fromRGB(230,232,245)
    if sub then subStatus.Text = sub end
    -- colored dot mirrors state
    local t = text:lower()
    if t:find("connected") and not t:find("not") and not t:find("disconn") then
        statusDot.BackgroundColor3 = Color3.fromRGB(74, 222, 128)
    elseif t:find("waiting") or t:find("pair") or t:find("approve") then
        statusDot.BackgroundColor3 = Color3.fromRGB(251, 191, 36)
    else
        statusDot.BackgroundColor3 = Color3.fromRGB(248, 113, 113)
    end
end
local function refreshInfo()
    infoLabel.Text = ("Place: %s    Live: %d"):format(tostring(game.PlaceId or 0), queueLen)
    lastLabel.Text = "Last: " .. lastAction
end

local function statusForAction(action)
    local kind = tostring(action and action.kind or "")
    if kind == "insert_asset" then
        return "Inserting assets", "Loading verified Toolbox asset into Studio."
    elseif kind == "script" or kind == "localscript" or kind == "modulescript" or kind == "run_lua" then
        return "Creating scripts", "Writing and validating Luau for the open project."
    elseif kind == "screengui" or kind == "gui" or kind == "frame" or kind == "textlabel" or kind == "textbutton" or kind == "imagelabel" then
        return "Creating UI", "Building Roblox ScreenGui objects and wiring controls."
    elseif kind == "remoteevent" or kind == "remotefunction" or kind == "bindableevent" then
        return "Creating scripts", "Creating communication objects for systems."
    elseif kind == "scan_project" then
        return "Scanning project", "Checking errors, hierarchy, assets, UI, and scripts."
    elseif kind == "autofix_project" then
        return "Fixing errors", "Repairing broken scripts, folders, assets, and UI."
    elseif kind == "organize_project" then
        return "Organizing project", "Sorting Studio objects into clean folders."
    end
    return "Executing build", "Applying structured BloxSmith command in Studio."
end

local function pollOnce(force)
    local token = validToken()
    if not token then
        connected = false
        setStatus("not connected", Color3.fromRGB(255,180,80),
            "Plugin not connected. Please reconnect from bloxsmith.pro.")
        if force then log("No saved token -- click Connect to link.", "warn") end
        return
    end
    if force then log(("token found: yes  ??  API: %s  ??  place: %s  ??  v%s")
        :format(API_BASE, tostring(game.PlaceId or 0), PLUGIN_VERSION), "debug") end
    local data, err, status = post("/api/public/plugin/poll", {
        token = token, place_id = tostring(game.PlaceId or 0), studio_version = studioVersion(), plugin_version = PLUGIN_VERSION,
        force = force == true,
    }, { verbose = VERBOSE, force = force })
    if err then
        if status == 401 then
            clearToken(); connected = false
            connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
            setStatus("not connected", Color3.fromRGB(255,180,80),
                "Plugin not connected. Please reconnect from bloxsmith.pro.")
            log("Token rejected by server (401) -- cleared. Click Connect to reconnect.", "error")
            return
        end
        setStatus("error", Color3.fromRGB(255,120,120), err)
        log("Poll failed -- will retry.", "error"); return
    end
    if data and data.user_id then
        -- userId surfaced only on first successful poll after (re)connect
        if lastHeartbeat == 0 then
            log("userId: " .. tostring(data.user_id), "debug")
            task.spawn(function()
                pcall(function()
                    local scan = buildScan()
                    post("/api/public/plugin/scan", {
                        token = token, place_id = tostring(game.PlaceId or 0), scan = scan,
                    }, { verbose = false })
                end)
            end)
        end
    end
    setStatus("Connected to Studio", Color3.fromRGB(120,220,160), "Waiting for prompt.")
    if data.credits ~= nil or data.max_credits ~= nil then
        setCredits(data.credits, data.max_credits, data.plan)
    end
    local actions = data.actions or {}
    queueLen = #actions; refreshInfo()
    if os.clock() - lastHeartbeat > 60 then
        log(("Heartbeat -- %d pending"):format(#actions), "debug")
        lastHeartbeat = os.clock()
    end
    if #actions == 0 then return 0 end
    setStatus("Planning build", Color3.fromRGB(160,200,255), ("Received %d structured command(s)."):format(#actions))
    log(("Received %d action(s)."):format(#actions), "success")
    local preflightFailures = {}
    for _, a in ipairs(actions) do
        if isScriptActionKind(a.kind) then
            local source, origin = pickActionSource(a)
            -- Auto-repair JSON-style tables in-place so the build isn't blocked
            -- by a syntax slip the model can produce. If repair happens, the
            -- healed source is written back to payload.source before insertion.
            local repaired, changed = autoRepairJsonTables(source)
            if changed then
                log(("Auto-repaired JSON-style tables in '%s' during preflight."):format(tostring(a.name)), "warn")
                a.payload = a.payload or {}
                a.payload.source = repaired
                source = repaired
            end
            local ok, err = validateLuaSource(source, a.name)
            log(("Preflight %s '%s': source=%s chars=%d.")
                :format(tostring(a.kind), tostring(a.name), tostring(origin), #source), ok and "debug" or "error")
            if not ok then
                table.insert(preflightFailures, {
                    action = a,
                    error = "script preflight failed before insertion: " .. tostring(err) .. " (source=" .. tostring(origin) .. ", chars=" .. tostring(#source) .. ")"
                })
            end
        end
    end
    if #preflightFailures > 0 then
        local results = {}
        for _, failure in ipairs(preflightFailures) do
            log("Blocked build before execution: " .. tostring(failure.action.kind) .. " '" .. tostring(failure.action.name) .. "': " .. tostring(failure.error), "error")
            results[#results+1] = { action_id = failure.action.id, status = "failed", error = failure.error }
        end
        task.spawn(reportBatch, results)
        setStatus("Build blocked", Color3.fromRGB(255,180,80), ("%d script validation issue(s). No scripts were inserted."):format(#preflightFailures))
        log(("Batch blocked before Studio insertion -- %d invalid script action(s).")
            :format(#preflightFailures), "error")
        return #actions
    end
    ChangeHistoryService:SetWaypoint("BloxSmith batch start")
    local okN, failN = 0, 0
    local results = {}
    local focusTargets = {}
    for _, a in ipairs(actions) do
        local stage, sub = statusForAction(a)
        setStatus(stage, Color3.fromRGB(160,200,255), sub)
        local ok, errOrInst = executeActionWithTimeout(a)
        if ok then
            okN += 1; lastAction = describeAction(a)
            log("-- " .. lastAction, "action")
            results[#results+1] = { action_id = a.id, status = "done", result = reportableResult(errOrInst) }
            pcall(collectInstancesFromResult, focusTargets, errOrInst)
        else
            failN += 1
            log("-- " .. a.kind .. " '" .. tostring(a.name) .. "': " .. tostring(errOrInst), "error")
            results[#results+1] = { action_id = a.id, status = "failed", error = tostring(errOrInst) }
        end
    end
    -- Confirm completion immediately; cleanup must never delay the website from
    -- showing that a one-action build finished.
    task.spawn(reportBatch, results)
    if #actions > 1 then
        local fixOk, fixResult = pcall(autoFixProject)
        if fixOk and fixResult then
            local moved = fixResult.moved_count or 0
            local fixed = fixResult.fixed_count or 0
            if moved > 0 or fixed > 0 then
                log(("Auto-cleanup after batch -- %d moved, %d fixed."):format(moved, fixed), "success")
            end
        elseif not fixOk then
            log("Auto-cleanup skipped: " .. tostring(fixResult), "warn")
        end
    end
    queueLen = 0; refreshInfo()
    ChangeHistoryService:SetWaypoint("BloxSmith batch done")
    -- Auto-focus Studio's camera on whatever just got built so the user
    -- immediately sees the new geometry without hunting for it.
    if #focusTargets > 0 and failN == 0 then
        pcall(focusCameraOn, focusTargets)
    end
    if failN > 0 then
        setStatus("Build failed with reason", Color3.fromRGB(255,180,80), ("%d command(s) failed. Check activity log for details."):format(failN))
    else
        setStatus("Build complete", Color3.fromRGB(120,220,160), ("Built %d thing(s). Camera focused."):format(okN))
    end
    log(("Batch complete -- %d ok, %d failed."):format(okN, failN), failN > 0 and "warn" or "success")
    -- ── Auto-Playtest v2: verify the build actually works, and let the AI
    --    fix failures automatically (up to 4 retries).
    if okN > 0 and failN == 0 and _G.__BS_RunAutoPlaytest then
        task.spawn(function()
            local ok, err = pcall(_G.__BS_RunAutoPlaytest, actions)
            if not ok then log("Auto-Playtest failed to start: " .. tostring(err), "warn") end
        end)
    end
    return #actions
end

local function startPairing()
    setStatus("connecting", Color3.fromRGB(160,200,255), "Creating one-time approval link--")
    connectBtn.Text = "Cancel"; connectBtn.BackgroundColor3 = Color3.fromRGB(220,90,90)
    log("Requesting pair code--", "info")
    local data, err = post("/api/public/plugin/pair/start", { plugin_version = PLUGIN_VERSION }, { verbose = true })
    if err or not data or not data.code then
        log("Pair start failed: " .. tostring(err or "no data"), "error")
        setStatus("error", Color3.fromRGB(255,120,120), "Try again.")
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240); return
    end
    pairingCode = data.code
    linkBox.Text = data.link_url; linkBox.Visible = true
    log("Pair code: " .. tostring(data.code), "success")
    if tryCopy(data.link_url) then log("Approval link copied to clipboard.", "info") end
    log("Open " .. data.link_url .. " in your browser.", "info")
    setStatus("waiting for approval", Color3.fromRGB(255,200,120), "Approve in your browser.")
    local elapsed = 0
    while pairingCode == data.code and elapsed < 600 do
        task.wait(2); elapsed += 2
        local poll, perr = post("/api/public/plugin/pair/poll", { code = data.code }, { verbose = false })
        if perr and string.find(perr, "410") then
            log("Approval link expired.", "warn")
            setStatus("expired", Color3.fromRGB(255,180,80), "Click Connect to retry.")
            connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
            pairingCode = nil; linkBox.Visible = false; return
        elseif poll and poll.status == "approved" and poll.plugin_token then
            plugin:SetSetting("token", poll.plugin_token)
            pairingCode = nil; linkBox.Visible = false
            log("Approved -- -- token saved.", "success")
            connected = true
            connectBtn.Text = "Disconnect"; connectBtn.BackgroundColor3 = Color3.fromRGB(220,90,90)
            pollOnce(true); return
        end
    end
    if pairingCode == data.code then
        log("Approval timed out.", "warn")
        setStatus("timed out", Color3.fromRGB(255,180,80), "Click Connect to retry.")
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
        pairingCode = nil; linkBox.Visible = false
    end
end

local function disconnect()
    clearToken()
    connected = false; pairingCode = nil
    connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
    linkBox.Visible = false
    setStatus("not connected", Color3.fromRGB(200,200,210), "Click Connect to link.")
    log("Disconnected -- token removed.", "warn")
end

------------------------------------------------------------------- buttons
connectBtn.MouseButton1Click:Connect(function()
    if connected then disconnect(); return end
    if pairingCode then
        pairingCode = nil; linkBox.Visible = false
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
        log("Pairing cancelled.", "warn"); return
    end
    task.spawn(startPairing)
end)

reconnectBtn.MouseButton1Click:Connect(function()
    if not validToken() then
        log("No saved token -- starting fresh connect.", "warn")
        clearToken(); connected = false
        task.spawn(startPairing); return
    end
    log("Reconnecting...", "info")
    connected = false
    local ok, err = pcall(pollOnce, true)
    if ok then
        connected = true
    else
        log("Reconnect failed: " .. tostring(err), "error")
        setStatus("error", Color3.fromRGB(255,120,120), "Reconnect failed. Try Connect.")
    end
end)

syncBtn.MouseButton1Click:Connect(function()
    if not connected then log("Not connected.", "warn"); return end
    log("Manual sync triggered.", "info"); pollOnce(true)
end)

execBtn.MouseButton1Click:Connect(function()
    if not connected then log("Not connected.", "warn"); return end
    log("Executing now--", "info"); pollOnce(true)
end)

clearBtn.MouseButton1Click:Connect(function()
    local token = validToken()
    if not token then log("Not connected -- click Connect first.", "warn"); return end
    log("Clearing stuck queue--", "info")
    local data, err = post("/api/public/plugin/clear", { token = token }, { verbose = true })
    if err then log("Clear failed: " .. err, "error")
    else log(("Cleared %d action(s)."):format((data and data.cleared) or 0), "success"); queueLen = 0; refreshInfo() end
end)

errorsBtn.MouseButton1Click:Connect(function()
    if #errorHistory == 0 then log("No recent errors.", "success"); return end
    log(("--- Last %d errors ---"):format(#errorHistory), "info")
    for _, line in ipairs(errorHistory) do log(line, "error") end
end)

openWebBtn.MouseButton1Click:Connect(function()
    if tryCopy(API_BASE .. "/plugin") then
        log("Copied " .. API_BASE .. "/plugin to clipboard -- paste into your browser.", "info")
    else
        log("Open " .. API_BASE .. "/plugin in your browser.", "info")
    end
end)

------------------------------------------------------------------- scan game tree
local SCAN_ROOTS = {
    "Workspace", "ServerScriptService", "ServerStorage", "ReplicatedStorage",
    "ReplicatedFirst", "StarterGui", "StarterPack", "StarterPlayer",
    "Lighting", "SoundService", "Teams",
}
local function pushLimited(list, value, max)
    if #list < (max or 50) then table.insert(list, value) end
end
local function analyzeWorkspace()
    local summary = {
        counts = {},
        folders = {},
        issues = {},
        remotes = {},
        modules = {},
        systems = {},
        gui = {},
        tools = {},
        assets = {},
        suggestions = {},
    }
    local expected = {
        "Workspace.Map",
        "Workspace.NPCs",
        "Workspace.Props",
        "Workspace.Vehicles",
        "Workspace.Gameplay",
        "ReplicatedStorage.Remotes",
        "ReplicatedStorage.Modules",
        "ReplicatedStorage.Assets",
        "ServerScriptService.Systems",
    }
    for _, path in ipairs(expected) do
        summary.folders[path] = findByPath(path) ~= nil
        if not summary.folders[path] then
            pushLimited(summary.issues, "missing_folder:" .. path, 80)
        end
    end
    local services = {}
    for _, svcName in ipairs(SCAN_ROOTS) do
        local ok, svc = pcall(function() return game:GetService(svcName) end)
        if ok and svc then table.insert(services, svc) end
    end
    for _, svc in ipairs(services) do
        for _, inst in ipairs(svc:GetDescendants()) do
            summary.counts[inst.ClassName] = (summary.counts[inst.ClassName] or 0) + 1
            if inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction") or inst:IsA("BindableEvent") or inst:IsA("BindableFunction") then
                pushLimited(summary.remotes, fullPath(inst), 60)
                if inst.Parent == ReplicatedStorage then
                    pushLimited(summary.issues, "remote_not_in_remotes_folder:" .. fullPath(inst), 80)
                end
            elseif inst:IsA("ModuleScript") then
                pushLimited(summary.modules, fullPath(inst), 60)
                local source = ""
                pcall(function() source = inst.Source end)
                local suspicious, pattern = sourceLooksSuspicious(source)
                if suspicious then pushLimited(summary.issues, "suspicious_module:" .. fullPath(inst) .. ":" .. tostring(pattern), 80) end
            elseif inst:IsA("Script") or inst:IsA("LocalScript") then
                local source = ""
                pcall(function() source = inst.Source end)
                local suspicious, pattern = sourceLooksSuspicious(source)
                if suspicious then pushLimited(summary.issues, "suspicious_script:" .. fullPath(inst) .. ":" .. tostring(pattern), 80) end
                if inst:IsA("Script") and inst.Parent == ServerScriptService and inst.Name ~= "BloxSmith_Leaderstats" then
                    pushLimited(summary.issues, "server_script_not_in_systems:" .. fullPath(inst), 80)
                end
            elseif inst:IsA("ScreenGui") then
                pushLimited(summary.gui, fullPath(inst), 50)
            elseif inst:IsA("Tool") then
                pushLimited(summary.tools, fullPath(inst), 50)
            elseif inst:IsA("BasePart") then
                if inst.Parent == Workspace and inst.Anchored == false and not inst:FindFirstAncestorOfClass("Tool") then
                    pushLimited(summary.issues, "loose_unanchored_root_part:" .. fullPath(inst), 80)
                end
            end
            if CollectionService:HasTag(inst, "BloxSmithAsset") then
                pushLimited(summary.assets, fullPath(inst), 60)
            end
        end
    end
    if #summary.issues > 0 then
        pushLimited(summary.suggestions, "Run organize_project or autofix_project before adding more systems.", 10)
    end
    if #(summary.remotes) == 0 then
        pushLimited(summary.suggestions, "No remotes found; new interactive systems should create ReplicatedStorage.Remotes.", 10)
    end
    if #(summary.modules) == 0 then
        pushLimited(summary.suggestions, "No modules found; reusable catalogs/config should go in ReplicatedStorage.Modules.", 10)
    end
    return summary
end
local function scanInstance(inst, depth, maxDepth, budget)
    if budget.count >= budget.max then return nil end
    budget.count += 1
    local node = { name = inst.Name, class = inst.ClassName }
    if inst:IsA("LuaSourceContainer") then
        pcall(function()
            local src = inst.Source
            if type(src) == "string" and #src > 0 then
                node.source = #src > 50000 and (src:sub(1, 50000) .. "\n-- [Truncated large script]") or src
            end
        end)
    end
    if depth < maxDepth then
        local kids = inst:GetChildren()
        if #kids > 0 then
            node.children = {}
            for i, c in ipairs(kids) do
                if i > 120 then node.truncated = true; break end
                local child = scanInstance(c, depth + 1, maxDepth, budget)
                if child then table.insert(node.children, child) end
            end
        end
    end
    return node
end
local function buildScan()
    local budget = { count = 0, max = 2000 }
    local roots = {}
    for _, svcName in ipairs(SCAN_ROOTS) do
        local ok, svc = pcall(function() return game:GetService(svcName) end)
        if ok and svc then
            local node = scanInstance(svc, 0, 4, budget)
            if node then table.insert(roots, node) end
        end
    end
    return {
        place_id = tostring(game.PlaceId or 0),
        built_at = os.time(),
        plugin_version = PLUGIN_VERSION,
        roots = roots,
        sampled = budget.count,
        awareness = analyzeWorkspace(),
    }
end

Exec.scan_project = function(_, _)
    local token = validToken()
    if not token then error("scan_project requires connected plugin token") end
    local scan = buildScan()
    local data, err = post("/api/public/plugin/scan", {
        token = token, place_id = tostring(game.PlaceId or 0), scan = scan,
    }, { verbose = false })
    if err then error("scan upload failed: " .. tostring(err)) end
    log(("Workspace scan uploaded -- %d instance(s), %d issue(s)."):format(scan.sampled or 0, #(scan.awareness and scan.awareness.issues or {})), "success")
    return { scanned = scan.sampled, issues = scan.awareness and scan.awareness.issues or {}, uploaded = data and data.ok == true }
end

local scanBusy = false
scanBtn.MouseButton1Click:Connect(function()
    if scanBusy then log("Scan already running...", "warn"); return end
    local token = validToken()
    if not token then log("Not connected -- click Connect first.", "warn"); return end
    scanBusy = true
    scanBtn.Text = "Scanning..."
    log("Scanning game tree...", "info")
    local ok, err = pcall(function()
        local scan = buildScan()
        log(("Scanned %d instance(s) across %d service(s)."):format(scan.sampled, #scan.roots), "debug")
        local data, uErr = post("/api/public/plugin/scan", {
            token = token, place_id = tostring(game.PlaceId or 0), scan = scan,
        }, { verbose = true })
        if uErr then log("Scan upload failed: " .. uErr, "error")
        else log("Scan uploaded. AI will see this on your next message.", "success") end
    end)
    if not ok then log("Scan crashed: " .. tostring(err), "error") end
    scanBusy = false
    scanBtn.Text = "Scan Game"
end)

------------------------------------------------------------------- error capture (LogService -- API)
local LogService = game:GetService("LogService")
local AUTO_SEND_ERRORS = true
local errorQueue, lastErrFlush = {}, 0

local function classifyLevel(msgType)
    if msgType == Enum.MessageType.MessageError then return "error"
    elseif msgType == Enum.MessageType.MessageWarning then return "warn"
    else return nil end
end

LogService.MessageOut:Connect(function(message, msgType)
    local lvl = classifyLevel(msgType)
    if not lvl then return end
    -- skip our own plugin log lines to avoid feedback loops
    if string.find(message, "[BloxSmith]", 1, true) then return end
    table.insert(errorQueue, { source = "Roblox", level = lvl, message = message })
    if #errorQueue > 50 then table.remove(errorQueue, 1) end
end)

local function flushErrors(manual)
    local token = validToken()
    if not token then if manual then log("Not connected.", "warn") end; return end
    if #errorQueue == 0 then if manual then log("No errors to send.", "success") end; return end
    local batch = {}
    for _, e in ipairs(errorQueue) do table.insert(batch, e) end
    table.clear(errorQueue)
    local data, err = post("/api/public/plugin/error", { token = token, errors = batch }, { verbose = false })
    if err then
        log("Error upload failed: " .. err, "error")
        -- requeue so we can retry
        for _, e in ipairs(batch) do table.insert(errorQueue, e) end
    else
        log(("-- Sent %d Studio error(s) -- AI will use these to fix on next message."):format(#batch), "success")
    end
end

sendErrBtn.MouseButton1Click:Connect(function() flushErrors(true) end)
autoErrBtn.MouseButton1Click:Connect(function()
    AUTO_SEND_ERRORS = not AUTO_SEND_ERRORS
    autoErrBtn.Text = "Auto-Send: " .. (AUTO_SEND_ERRORS and "ON" or "OFF")
    autoErrBtn.BackgroundColor3 = AUTO_SEND_ERRORS and Color3.fromRGB(45,48,58) or Color3.fromRGB(80,50,50)
    log("Auto error upload " .. (AUTO_SEND_ERRORS and "enabled" or "disabled"), "debug")
end)

local organizeBusy = false
organizeBtn.MouseButton1Click:Connect(function()
    if organizeBusy then log("Organize already running...", "warn"); return end
    organizeBusy = true
    organizeBtn.Text = "Organizing..."
    ChangeHistoryService:SetWaypoint("BloxSmith organize start")
    local ok, result = pcall(organizeProject)
    ChangeHistoryService:SetWaypoint("BloxSmith organize done")
    if ok then
        log(("Organized project -- moved %d item(s)."):format((result and result.moved_count) or 0), "success")
    else
        log("Organize failed: " .. tostring(result), "error")
    end
    organizeBusy = false
    organizeBtn.Text = "Organize"
end)

local autoFixBusy = false
autoFixBtn.MouseButton1Click:Connect(function()
    if autoFixBusy then log("Auto-Fix already running...", "warn"); return end
    autoFixBusy = true
    autoFixBtn.Text = "Fixing..."
    ChangeHistoryService:SetWaypoint("BloxSmith auto-fix start")
    local ok, result = pcall(autoFixProject)
    ChangeHistoryService:SetWaypoint("BloxSmith auto-fix done")
    if ok then
        log(("Auto-fix complete -- %d moved, %d fixed."):format((result and result.moved_count) or 0, (result and result.fixed_count) or 0), "success")
    else
        log("Auto-fix failed: " .. tostring(result), "error")
    end
    autoFixBusy = false
    autoFixBtn.Text = "Auto-Fix"
end)

------------------------------------------------------------------- Clean Slate (workspace reset)
local function showConfirm(title, body, onConfirm)
    local overlay = Instance.new("Frame")
    overlay.Size = UDim2.fromScale(1,1)
    overlay.BackgroundColor3 = Color3.fromRGB(0,0,0)
    overlay.BackgroundTransparency = 0.4
    overlay.BorderSizePixel = 0
    overlay.ZIndex = 50
    overlay.Parent = widget

    local card = Instance.new("Frame")
    card.AnchorPoint = Vector2.new(0.5,0.5)
    card.Position = UDim2.fromScale(0.5,0.5)
    card.Size = UDim2.new(1,-40,0,180)
    card.BackgroundColor3 = Color3.fromRGB(28,30,38)
    card.BorderSizePixel = 0
    card.ZIndex = 51
    card.Parent = overlay
    round(card, 10)

    local t = Instance.new("TextLabel")
    t.BackgroundTransparency = 1
    t.Position = UDim2.new(0,14,0,12); t.Size = UDim2.new(1,-28,0,22)
    t.Font = Enum.Font.BuilderSansBold; t.TextSize = 15
    t.TextColor3 = Color3.fromRGB(255,220,220)
    t.TextXAlignment = Enum.TextXAlignment.Left
    t.Text = title; t.ZIndex = 52; t.Parent = card

    local b = Instance.new("TextLabel")
    b.BackgroundTransparency = 1
    b.Position = UDim2.new(0,14,0,40); b.Size = UDim2.new(1,-28,0,90)
    b.Font = Enum.Font.BuilderSans; b.TextSize = 12
    b.TextColor3 = Color3.fromRGB(210,215,225)
    b.TextXAlignment = Enum.TextXAlignment.Left
    b.TextYAlignment = Enum.TextYAlignment.Top
    b.TextWrapped = true
    b.Text = body; b.ZIndex = 52; b.Parent = card

    local function mkBtn(text, x, color, hover)
        local btn = Instance.new("TextButton")
        btn.AnchorPoint = Vector2.new(1, 1)
        btn.Position = UDim2.new(x, -14, 1, -14); btn.Size = UDim2.new(0, 110, 0, 30)
        btn.BackgroundColor3 = color
        btn.TextColor3 = Color3.fromRGB(255,255,255)
        btn.Font = Enum.Font.BuilderSansBold; btn.TextSize = 13
        btn.Text = text; btn.BorderSizePixel = 0
        btn.AutoButtonColor = false
        btn.ZIndex = 52; btn.Parent = card
        round(btn, 6)
        btn.MouseEnter:Connect(function() btn.BackgroundColor3 = hover end)
        btn.MouseLeave:Connect(function() btn.BackgroundColor3 = color end)
        return btn
    end
    local cancel = mkBtn("Cancel", 0.5, Color3.fromRGB(60,64,78), Color3.fromRGB(75,80,95))
    cancel.Position = UDim2.new(0.5, -6, 1, -14)
    cancel.AnchorPoint = Vector2.new(1, 1)
    local confirm = mkBtn("Wipe it", 1, Color3.fromRGB(180,60,60), Color3.fromRGB(210,80,80))

    cancel.MouseButton1Click:Connect(function() overlay:Destroy() end)
    confirm.MouseButton1Click:Connect(function()
        overlay:Destroy()
        onConfirm()
    end)
end

local CLEAN_CLEAR_CONTAINERS = {
    ServerScriptService, ServerStorage, ReplicatedStorage,
    StarterGui, StarterPack, Lighting, Teams, SoundService,
}

local function cleanSlate()
    local removed = 0
    -- Workspace: keep Terrain + Camera, drop everything else
    for _, ch in ipairs(Workspace:GetChildren()) do
        if not ch:IsA("Terrain") and not ch:IsA("Camera") then
            pcall(function() ch:Destroy() end)
            removed += 1
        end
    end
    -- Reset terrain
    pcall(function() Workspace.Terrain:Clear() end)

    -- Clear common script containers
    for _, container in ipairs(CLEAN_CLEAR_CONTAINERS) do
        for _, ch in ipairs(container:GetChildren()) do
            pcall(function() ch:Destroy() end)
            removed += 1
        end
    end
    -- StarterPlayer sub-containers
    local sps = StarterPlayer:FindFirstChild("StarterPlayerScripts")
    if sps then for _, ch in ipairs(sps:GetChildren()) do pcall(function() ch:Destroy() end); removed += 1 end end
    local scs = StarterPlayer:FindFirstChild("StarterCharacterScripts")
    if scs then for _, ch in ipairs(scs:GetChildren()) do pcall(function() ch:Destroy() end); removed += 1 end end

    -- Fresh Baseplate
    local base = Instance.new("Part")
    base.Name = "Baseplate"
    base.Size = Vector3.new(512, 4, 512)
    base.Position = Vector3.new(0, -2, 0)
    base.Anchored = true
    base.Locked = true
    base.Material = Enum.Material.SmoothPlastic
    base.Color = Color3.fromRGB(60, 68, 78)
    base.TopSurface = Enum.SurfaceType.Smooth
    base.BottomSurface = Enum.SurfaceType.Smooth
    base.Parent = Workspace

    -- Spawn location so Play works immediately
    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "SpawnLocation"
    spawn.Size = Vector3.new(6, 1, 6)
    spawn.Position = Vector3.new(0, 0.5, 0)
    spawn.Anchored = true
    spawn.Locked = true
    spawn.TopSurface = Enum.SurfaceType.Smooth
    spawn.BottomSurface = Enum.SurfaceType.Smooth
    spawn.BrickColor = BrickColor.new("Medium stone grey")
    spawn.Parent = Workspace

    return removed
end

local cleanBusy = false
cleanBtn.MouseButton1Click:Connect(function()
    if cleanBusy then return end
    showConfirm(
        "Wipe place to a clean slate?",
        "This deletes every child of Workspace (except Terrain/Camera) and clears ServerScriptService, ServerStorage, ReplicatedStorage, StarterGui, StarterPack, Lighting, Teams, SoundService, StarterPlayerScripts, and StarterCharacterScripts. A fresh Baseplate + SpawnLocation are added. Undo (Ctrl+Z) will restore.",
        function()
            cleanBusy = true
            cleanBtn.Text = "Wiping..."
            ChangeHistoryService:SetWaypoint("BloxSmith clean-slate start")
            local ok, result = pcall(cleanSlate)
            ChangeHistoryService:SetWaypoint("BloxSmith clean-slate done")
            if ok then
                log(("Clean slate complete -- removed %d item(s), added Baseplate + SpawnLocation."):format(result or 0), "success")
            else
                log("Clean slate failed: " .. tostring(result), "error")
            end
            cleanBusy = false
            cleanBtn.Text = "Clean Slate"
        end
    )
end)


task.spawn(function()
    while true do
        task.wait(15)
        if AUTO_SEND_ERRORS and connected and #errorQueue > 0 and os.clock() - lastErrFlush > 10 then
            lastErrFlush = os.clock()
            pcall(flushErrors, false)
        end
    end
end)

------------------------------------------------------------------- boot
task.spawn(function()
    if validToken() then
        connected = true
        connectBtn.Text = "Disconnect"; connectBtn.BackgroundColor3 = Color3.fromRGB(220,90,90)
        log("Restoring previous session--", "info"); pollOnce(true)
    else
        clearToken() -- scrub any stale empty/garbage value
        connected = false
        setStatus("not connected", Color3.fromRGB(200,200,210), "Click Connect to link.")
    end
    refreshInfo()
end)

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)
        if connected then
            -- Drain: keep polling immediately while the server has work ready.
            for _ = 1, 5 do
                local ok, errOrCount = pcall(pollOnce)
                if not ok then
                    log("Poll loop crashed: " .. tostring(errOrCount), "error")
                    break
                end
                if (errOrCount or 0) == 0 then break end
            end
        end
    end
end)

-- Independent heartbeat: keeps the web UI's "online" indicator green even
-- while the main poll coroutine is blocked executing a long build.
task.spawn(function()
    while true do
        task.wait(10)
        local token = validToken()
        if token then
            pcall(function()
                post("/api/public/plugin/heartbeat", {
                    token = token,
                    place_id = tostring(game.PlaceId or 0),
                    studio_version = studioVersion(),
                    plugin_version = PLUGIN_VERSION,
                }, { verbose = false })
            end)
        end
    end
end)

------------------------------------------------------------------- Auto-Playtest v2
-- Runs after every material build batch. Verifies compile/spawn/UI/interactions/
-- remotes/DataStore/perf, POSTs the report, and follows the server's loop
-- directive (wait_for_ai -> rerun -> stop/passed/stuck) up to 4 attempts.
do
    local MATERIAL_CLASSES = {
        Script=true, LocalScript=true, ModuleScript=true,
        RemoteEvent=true, RemoteFunction=true, BindableEvent=true, BindableFunction=true,
        Tool=true, ClickDetector=true, ProximityPrompt=true, SpawnLocation=true,
        ScreenGui=true, SurfaceGui=true, BillboardGui=true,
    }
    local MATERIAL_PARENTS = {
        "StarterPlayer","StarterGui","StarterPack",
        "ServerScriptService","ReplicatedStorage","ServerStorage",
    }

    local function isMaterialBatch(actions)
        if not actions then return false end
        for _, a in ipairs(actions) do
            local k = tostring(a.kind or ""):lower()
            if k == "script" or k == "localscript" or k == "modulescript"
                or k == "remoteevent" or k == "remotefunction"
                or k == "run_lua" or k == "insert_asset"
                or k == "spawn_location" or k == "screengui" or k == "tool" then
                return true
            end
            local cls = a.className or (a.payload and a.payload.className) or ""
            if MATERIAL_CLASSES[cls] then return true end
            local parent = tostring(a.parent or (a.payload and a.payload.parent) or "")
            for _, p in ipairs(MATERIAL_PARENTS) do
                if string.find(parent, p, 1, true) then return true end
            end
        end
        return false
    end

    local function newHttpUuid()
        local HttpService = game:GetService("HttpService")
        return string.lower(HttpService:GenerateGUID(false))
    end
    local function safeChildren(inst)
        local ok, kids = pcall(function() return inst:GetDescendants() end)
        return ok and kids or {}
    end

    local function phaseCompile()
        local findings, ev = {}, { errors = 0, warnings = 0 }
        for _, e in ipairs(errorQueue) do
            if e.level == "error" then
                ev.errors = ev.errors + 1
                table.insert(findings, { severity="critical", category="script",
                    title="Studio reported a script error",
                    detail=tostring(e.message):sub(1,400), path="LogService" })
            elseif e.level == "warn" then ev.warnings = ev.warnings + 1 end
        end
        return { pass = ev.errors == 0, findings = findings, evidence = ev }
    end

    local function phaseSpawn()
        local findings, spawns = {}, 0
        for _, d in ipairs(safeChildren(game.Workspace)) do
            if d:IsA("SpawnLocation") then spawns = spawns + 1 end
        end
        if spawns == 0 then
            table.insert(findings, { severity="high", category="gameplay",
                title="No SpawnLocation in Workspace",
                detail="Players will fall on join. Add at least one SpawnLocation.",
                path="Workspace", auto_fixable=true })
        end
        return { pass = #findings == 0, findings = findings, evidence = { spawn_count = spawns } }
    end

    local function phaseUI()
        local StarterGui = game:GetService("StarterGui")
        local findings, guiCount, buttonCount = {}, 0, 0
        for _, gui in ipairs(safeChildren(StarterGui)) do
            if gui:IsA("ScreenGui") then
                guiCount = guiCount + 1
                for _, node in ipairs(safeChildren(gui)) do
                    if node:IsA("GuiButton") then buttonCount = buttonCount + 1 end
                    if node:IsA("GuiObject") and node.Size.X.Scale == 0 and node.Size.X.Offset == 0
                        and node.Size.Y.Scale == 0 and node.Size.Y.Offset == 0 then
                        table.insert(findings, { severity="medium", category="ui",
                            title="GUI element has zero size",
                            detail="Element " .. node:GetFullName() .. " will not render.",
                            path=node:GetFullName() })
                    end
                end
            end
        end
        return { pass = #findings == 0, findings = findings, evidence = { gui_count = guiCount, button_count = buttonCount } }
    end

    local function phaseInteractions()
        local clicks, prompts, tools = 0, 0, 0
        for _, inst in ipairs(safeChildren(game.Workspace)) do
            if inst:IsA("ClickDetector") then clicks = clicks + 1
            elseif inst:IsA("ProximityPrompt") then prompts = prompts + 1
            elseif inst:IsA("Tool") then tools = tools + 1 end
        end
        return { pass = true, findings = {}, evidence = { click_detectors=clicks, proximity_prompts=prompts, tools=tools } }
    end

    local function phaseRemotes()
        local findings = {}
        local ReplicatedStorage = game:GetService("ReplicatedStorage")
        local remotes = 0
        for _, inst in ipairs(safeChildren(ReplicatedStorage)) do
            if inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction") then
                remotes = remotes + 1
                local hasListener = false
                pcall(function()
                    if inst:IsA("RemoteEvent") then
                        hasListener = #inst.OnServerEvent:GetConnections() > 0
                    else
                        hasListener = inst.OnServerInvoke ~= nil
                    end
                end)
                if not hasListener then
                    table.insert(findings, { severity="medium", category="script",
                        title="Remote has no server listener",
                        detail="Nothing is listening to " .. inst.Name .. ". Client calls will silently fail.",
                        path=inst:GetFullName() })
                end
            end
        end
        return { pass = #findings == 0, findings = findings, evidence = { remotes = remotes } }
    end

    local function phaseDataStore()
        local findings = {}
        local DataStoreService = game:GetService("DataStoreService")
        local ok, err = pcall(function()
            local ds = DataStoreService:GetDataStore("BloxSmithPlaytestProbe")
            ds:SetAsync("__probe__" .. tostring(math.random(1, 1e9)), { t = os.time() })
        end)
        if not ok then
            table.insert(findings, { severity="high", category="security",
                title="DataStore write failed in Studio",
                detail="Enable 'Allow Studio Access to API Services' or DataStores will fail at runtime. Error: " .. tostring(err):sub(1,200),
                path="DataStoreService" })
        end
        return { pass = ok, findings = findings, evidence = { studio_api_ok = ok } }
    end

    local function phasePerf()
        local RunService = game:GetService("RunService")
        local Stats = game:GetService("Stats")
        local samples, worst = 0, 0
        local memStart = 0
        pcall(function() memStart = Stats:GetTotalMemoryUsageMb() end)
        local conn = RunService.Heartbeat:Connect(function(dt)
            samples = samples + 1
            if dt > worst then worst = dt end
        end)
        task.wait(2)
        if conn then conn:Disconnect() end
        local memEnd = 0
        pcall(function() memEnd = Stats:GetTotalMemoryUsageMb() end)
        local memDelta = memEnd - memStart
        local findings = {}
        if worst > 0.2 then
            table.insert(findings, { severity="medium", category="performance",
                title="Frame stall detected (>200ms)",
                detail=("Worst frame during 2s sample: %.0fms."):format(worst * 1000),
                path="Heartbeat" })
        end
        if memDelta > 200 then
            table.insert(findings, { severity="medium", category="performance",
                title="Memory grew >200MB during sample",
                detail=("Memory went from %.0fMB to %.0fMB in 2s."):format(memStart, memEnd),
                path="Stats" })
        end
        return { pass = #findings == 0, findings = findings,
            evidence = { samples = samples, worst_frame_ms = math.floor(worst * 1000), mem_delta_mb = memDelta } }
    end

    local function tryScreenshot()
        local ok, contentId = pcall(function()
            local CaptureService = game:GetService("CaptureService")
            local id
            CaptureService:CaptureAsync(function(returned) id = returned end)
            local waited = 0
            while not id and waited < 3 do task.wait(0.25); waited = waited + 0.25 end
            return id
        end)
        return ok and contentId or nil
    end

    local activeRun = { id = nil, attempt = 0, running = false }

    local function pollNext(token, runId)
        local d, err = post("/api/public/plugin/playtest/next-action", { token = token, run_id = runId }, { verbose = false })
        if err then return nil end
        return d
    end

    local function runOnce(autoTriggered, parentRunId)
        local token = validToken()
        if not token then log("Playtest skipped: not connected.", "warn"); return end
        if activeRun.running then log("Playtest already running.", "debug"); return end
        activeRun.running = true
        setStatus("Playtesting", Color3.fromRGB(200,180,255), "Verifying scripts, UI, spawn, remotes, perf...")
        local runId = activeRun.id or newHttpUuid()
        activeRun.id = runId
        activeRun.attempt = activeRun.attempt + 1
        log(("-- Auto-Playtest attempt %d (run %s)"):format(activeRun.attempt, runId:sub(1,8)), "info")

        local t0 = os.clock()
        local phases = {
            compile = phaseCompile(),
            spawn = phaseSpawn(),
            ui = phaseUI(),
            interactions = phaseInteractions(),
            remotes = phaseRemotes(),
            datastore = phaseDataStore(),
            perf = phasePerf(),
        }
        local allFindings, allPass, phaseResults = {}, true, {}
        for name, r in pairs(phases) do
            phaseResults[name] = { pass = r.pass, evidence = r.evidence, finding_count = #r.findings }
            if not r.pass then allPass = false end
            for _, f in ipairs(r.findings) do
                f.id = f.id or (name .. "-" .. tostring(#allFindings + 1))
                table.insert(allFindings, f)
            end
        end
        local screenshot = tryScreenshot()
        local duration = math.floor((os.clock() - t0) * 1000)

        local resp, perr = post("/api/public/plugin/playtest/report", {
            token = token, run_id = runId, parent_run_id = parentRunId,
            attempt = activeRun.attempt, auto_triggered = autoTriggered == true,
            max_attempts = 4,
            status = allPass and "passed" or "failed",
            duration_ms = duration,
            summary = {
                verdict = allPass and "clean" or "broken",
                headline = allPass and "All phases passed" or ("%d issue(s) found"):format(#allFindings),
                phase_count = 7,
            },
            metrics = { duration_ms = duration, phase_count = 7, finding_count = #allFindings },
            findings = allFindings,
            phase_results = phaseResults,
            screenshot_urls = screenshot and { tostring(screenshot) } or {},
        }, { verbose = false })
        if perr then
            log("Playtest report upload failed: " .. tostring(perr), "error")
            activeRun.running = false; return
        end

        local directive = resp and resp.directive or "passed"
        local reason = resp and resp.reason or ""
        log(("-- Playtest %s (%s). %s"):format(directive, allPass and "green" or "red", reason),
            directive == "passed" and "success" or "warn")

        if directive == "wait_for_ai" then
            setStatus("AI fixing", Color3.fromRGB(255,200,120), "AI is auto-fixing the failing findings...")
            local elapsed = 0
            while elapsed < 90 do
                task.wait(3); elapsed = elapsed + 3
                local d = pollNext(token, runId)
                if d and d.directive and d.directive ~= "wait_for_ai" then
                    directive = d.directive
                    log(("-- Loop directive -> %s (%s)"):format(directive, tostring(d.reason or "")), "info")
                    break
                end
            end
        end

        activeRun.running = false
        if directive == "rerun" then
            task.wait(1); runOnce(true, runId)
        elseif directive == "passed" then
            setStatus("Playtest passed", Color3.fromRGB(120,220,160), "All phases green.")
            activeRun.id = nil; activeRun.attempt = 0
        elseif directive == "stuck" then
            setStatus("Playtest stuck", Color3.fromRGB(255,180,80), "Same failure twice; stopping loop.")
            activeRun.id = nil; activeRun.attempt = 0
        else
            setStatus("Playtest stopped", Color3.fromRGB(255,180,80), reason ~= "" and reason or "Loop stopped.")
            activeRun.id = nil; activeRun.attempt = 0
        end
    end

    _G.__BS_RunAutoPlaytest = function(actions)
        if not isMaterialBatch(actions) then
            log("Auto-Playtest skipped: batch is cosmetic-only.", "debug"); return
        end
        runOnce(true, nil)
    end
    _G.__BS_RunPlaytestManual = function() runOnce(false, nil) end
end

log("BloxSmith v" .. PLUGIN_VERSION .. " loaded.", "success")
log("API: " .. API_BASE, "debug")
log("Studio " .. studioVersion() .. " -- place " .. tostring(game.PlaceId or 0), "debug")
log("Use Connect -- approve in browser -- builds execute here automatically.", "info")
