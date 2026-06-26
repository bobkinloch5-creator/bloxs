-- BloxSmithPlugin.lua
-- BloxSmith Roblox Studio Plugin — execution & connection bridge.
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

local API_BASE       = "https://bloxsmith.pro"
local POLL_INTERVAL  = 1
local PLUGIN_VERSION = "1.6.0"

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
    DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, true, false, 340, 560, 300, 460))
widget.Title = "BloxSmith"

local main = Instance.new("Frame")
main.Size = UDim2.fromScale(1,1)
main.BackgroundColor3 = Color3.fromRGB(20, 22, 28)
main.BorderSizePixel = 0
main.Parent = widget

local function label(parent, text, pos, size, font, ts, color)
    local l = Instance.new("TextLabel")
    l.Position = pos; l.Size = size
    l.BackgroundTransparency = 1
    l.Font = font or Enum.Font.Gotham
    l.TextSize = ts or 13
    l.TextColor3 = color or Color3.fromRGB(220,220,230)
    l.TextXAlignment = Enum.TextXAlignment.Left
    l.TextYAlignment = Enum.TextYAlignment.Top
    l.TextWrapped = true
    l.Text = text
    l.Parent = parent
    return l
end

local title = label(main, "BloxSmith", UDim2.new(0,12,0,10), UDim2.new(1,-24,0,22), Enum.Font.GothamBold, 16)
label(main, "Execution bridge for Roblox Studio", UDim2.new(0,12,0,32), UDim2.new(1,-24,0,16), nil, 12, Color3.fromRGB(150,155,170))

local statusLabel = label(main, "Status: not connected", UDim2.new(0,12,0,58), UDim2.new(1,-24,0,18), Enum.Font.GothamMedium, 13)
local subStatus   = label(main, "Click Connect to link this Studio session.", UDim2.new(0,12,0,78), UDim2.new(1,-24,0,16), nil, 12, Color3.fromRGB(150,155,170))

local infoLabel   = label(main, "Project: —    Queue: 0", UDim2.new(0,12,0,98), UDim2.new(1,-24,0,16), nil, 12, Color3.fromRGB(160,165,180))
local lastLabel   = label(main, "Last action: —", UDim2.new(0,12,0,116), UDim2.new(1,-24,0,16), nil, 12, Color3.fromRGB(160,165,180))

-- primary connect button
local connectBtn = Instance.new("TextButton")
connectBtn.Position = UDim2.new(0,12,0,142); connectBtn.Size = UDim2.new(1,-24,0,34)
connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
connectBtn.TextColor3 = Color3.fromRGB(255,255,255)
connectBtn.Font = Enum.Font.GothamBold; connectBtn.TextSize = 14
connectBtn.Text = "Connect"; connectBtn.BorderSizePixel = 0
connectBtn.Parent = main

-- approval link box (hidden by default)
local linkBox = Instance.new("TextBox")
linkBox.Position = UDim2.new(0,12,0,182); linkBox.Size = UDim2.new(1,-24,0,26)
linkBox.BackgroundColor3 = Color3.fromRGB(35,38,48)
linkBox.TextColor3 = Color3.fromRGB(220,220,230)
linkBox.Font = Enum.Font.Code; linkBox.TextSize = 12
linkBox.Text = ""; linkBox.PlaceholderText = "Approval link appears here"
linkBox.ClearTextOnFocus = false; linkBox.TextEditable = false
linkBox.BorderSizePixel = 0; linkBox.Visible = false
linkBox.Parent = main

-- control buttons grid (2 rows x 3 cols)
local controls = Instance.new("Frame")
controls.Position = UDim2.new(0,12,0,216); controls.Size = UDim2.new(1,-24,0,98)
controls.BackgroundTransparency = 1; controls.Parent = main
local grid = Instance.new("UIGridLayout", controls)
grid.CellPadding = UDim2.new(0,6,0,6)
grid.CellSize = UDim2.new(0.333, -4, 0, 28)
grid.SortOrder = Enum.SortOrder.LayoutOrder

local function ctrlBtn(text, order)
    local b = Instance.new("TextButton")
    b.BackgroundColor3 = Color3.fromRGB(45,48,58)
    b.TextColor3 = Color3.fromRGB(220,225,235)
    b.Font = Enum.Font.GothamMedium; b.TextSize = 12
    b.Text = text; b.BorderSizePixel = 0
    b.LayoutOrder = order; b.Parent = controls
    return b
end

local reconnectBtn = ctrlBtn("Reconnect", 1)
local syncBtn      = ctrlBtn("Sync", 2)
local execBtn      = ctrlBtn("Run Queue", 3)
local clearBtn     = ctrlBtn("Clear Queue", 4)
local errorsBtn    = ctrlBtn("View Errors", 5)
local openWebBtn   = ctrlBtn("Open Website", 6)
local scanBtn      = ctrlBtn("Scan Game", 7)
local sendErrBtn   = ctrlBtn("Send Errors", 8)
local autoErrBtn   = ctrlBtn("Auto-Send: ON", 9)

------------------------------------------------------------------- log
local logBar = Instance.new("Frame")
logBar.Position = UDim2.new(0,12,0,322); logBar.Size = UDim2.new(1,-24,0,22)
logBar.BackgroundTransparency = 1; logBar.Parent = main

local logTitle = Instance.new("TextLabel")
logTitle.Size = UDim2.new(1,-220,1,0); logTitle.BackgroundTransparency = 1
logTitle.Font = Enum.Font.GothamBold; logTitle.TextSize = 12
logTitle.TextColor3 = Color3.fromRGB(200,205,215)
logTitle.TextXAlignment = Enum.TextXAlignment.Left
logTitle.Text = "Activity log"; logTitle.Parent = logBar

local function miniBtn(text, xOff)
    local b = Instance.new("TextButton")
    b.AnchorPoint = Vector2.new(1,0.5)
    b.Position = UDim2.new(1,xOff,0.5,0); b.Size = UDim2.new(0,60,0,20)
    b.BackgroundColor3 = Color3.fromRGB(45,48,58)
    b.TextColor3 = Color3.fromRGB(210,215,225)
    b.Font = Enum.Font.Gotham; b.TextSize = 11
    b.Text = text; b.BorderSizePixel = 0
    b.Parent = logBar; return b
end
local copyLogBtn  = miniBtn("Copy", 0)
local clearLogBtn = miniBtn("Clear", -66)
local verboseBtn  = miniBtn("Verbose", -132)

local logFrame = Instance.new("ScrollingFrame")
logFrame.Position = UDim2.new(0,12,0,348); logFrame.Size = UDim2.new(1,-24,1,-360)
logFrame.BackgroundColor3 = Color3.fromRGB(14,16,22); logFrame.BorderSizePixel = 0
logFrame.CanvasSize = UDim2.new(0,0,0,0); logFrame.ScrollBarThickness = 4
logFrame.Parent = main
local lp = Instance.new("UIPadding", logFrame)
lp.PaddingTop = UDim.new(0,6); lp.PaddingBottom = UDim.new(0,6)
lp.PaddingLeft = UDim.new(0,6); lp.PaddingRight = UDim.new(0,6)
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
    localscript    = StarterPlayer:WaitForChild("StarterPlayerScripts"),
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

local function resolveParent(path, kind)
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
    -- avoid duplicate child names by suffixing _2, _3…
    if not parent:FindFirstChild(name) then return name end
    local i = 2
    while parent:FindFirstChild(name .. "_" .. i) do i += 1 end
    return name .. "_" .. i
end

------------------------------------------------------------------- action executors
local Exec = {}

local function makeScript(className, action, parent)
    local payload = action.payload or {}
    local existing = parent:FindFirstChild(action.name)
    if existing and existing:IsA(className) then existing:Destroy() end
    local s = Instance.new(className)
    s.Name = action.name
    s.Source = payload.source or "-- empty"
    s.Parent = parent; return s
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
        obj.Font = Enum.Font.Gotham
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

Exec.insert_asset = function(a, p)
    local payload = a.payload or {}
    local id = tonumber(payload.asset_id)
    if not id then error("insert_asset missing asset_id") end
    local ok, model = pcall(function() return InsertService:LoadAsset(id) end)
    if not ok or not model then error("LoadAsset failed for " .. tostring(id)) end
    model.Name = a.name or ("Asset_" .. id)
    -- Unwrap single-child Model container into the target parent
    local children = model:GetChildren()
    if #children == 1 then
        children[1].Name = model.Name
        children[1].Parent = p
        model:Destroy()
        return children[1]
    end
    model.Parent = p; return model
end

Exec.set_properties = function(a, _)
    local inst = findByPath(a.payload and a.payload.target_path)
    if not inst then error("target not found: " .. tostring(a.payload and a.payload.target_path)) end
    applyProps(inst, a.payload.properties); return inst
end

Exec.rename = function(a, _)
    local inst = findByPath(a.payload and a.payload.target_path)
    if not inst then error("target not found") end
    inst.Name = a.payload.new_name or inst.Name; return inst
end

Exec.move = function(a, _)
    local inst = findByPath(a.payload and a.payload.target_path)
    if not inst then error("target not found") end
    local dest = resolveParent(a.payload.new_parent_path, "folder")
    inst.Parent = dest; return inst
end

Exec.delete = function(a, _)
    local inst = findByPath(a.payload and a.payload.target_path)
    if not inst then error("target not found") end
    -- safety: never delete a top-level service
    if inst.Parent == game then error("refuse to delete service " .. inst.Name) end
    local name = inst:GetFullName()
    inst:Destroy()
    return { deleted = name }
end

-- run_lua: execute a Luau builder script INSIDE the plugin context.
-- This is how complex builds (lobbies, obbies, tycoons, NPCs, full systems) are
-- created — the AI emits one builder, we loadstring it, and it has full Studio
-- access (Instance.new, InsertService, all services, ChangeHistoryService, etc.).
Exec.run_lua = function(a, p)
    local payload = a.payload or {}
    local source = payload.source
    if type(source) ~= "string" or source == "" then
        error("run_lua missing payload.source")
    end
    -- Wrap so the builder gets a convenient `parent` arg (resolved parent_path or Workspace).
    local wrapped = "return function(parent, plugin) " .. source .. "\nend"
    local fn, parseErr = loadstring(wrapped, "=BloxSmith/" .. tostring(a.name or "builder"))
    if not fn then error("compile error: " .. tostring(parseErr)) end
    local builder = fn()
    if type(builder) ~= "function" then error("builder did not return a function") end
    local ok, runErr = pcall(builder, p, plugin)
    if not ok then error("runtime error: " .. tostring(runErr)) end
    return { ran = a.name }
end

local function describeAction(a)
    local payload = a.payload or {}
    local extra = ""
    if a.kind == "script" or a.kind == "localscript" or a.kind == "modulescript" then
        extra = (" (%d chars)"):format(#(payload.source or ""))
    elseif a.kind == "part" then
        local sz = payload.size or {}
        extra = (" %sx%sx%s"):format(tostring(sz[1] or "?"), tostring(sz[2] or "?"), tostring(sz[3] or "?"))
    elseif a.kind == "insert_asset" then
        extra = (" id=%s"):format(tostring(payload.asset_id))
    end
    return ("%s '%s' → %s%s"):format(a.kind, tostring(a.name), tostring(a.parent_path or "auto"), extra)
end

local function executeAction(action)
    local kind = action.kind
    local handler = Exec[kind]
    if not handler then error("Unknown action kind: " .. tostring(kind)) end
    local parent = resolveParent(action.parent_path, kind)
    log("→ " .. describeAction(action), "debug")
    return handler(action, parent)
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
    if verbose then log("→ POST " .. API_BASE .. path, "net") end
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
        log(("✗ POST %s failed after %dms — %s"):format(path, dt, tostring(res)), "error")
        return nil, tostring(res), 0
    end
    if not res.Success then
        local short = tostring(res.Body or "")
        if #short > 240 then short = short:sub(1,240) .. "…" end
        log(("✗ POST %s → HTTP %s in %dms — %s"):format(path, tostring(res.StatusCode), dt, short), "error")
        return nil, "HTTP " .. tostring(res.StatusCode) .. ": " .. tostring(res.Body), tonumber(res.StatusCode) or 0
    end
    local decoded; pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
    if verbose then log(("← POST %s → %s in %dms"):format(path, tostring(res.StatusCode), dt), "net") end
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
    local ok = pcall(function()
        post("/api/public/plugin/complete", { token = token, results = results }, { verbose = false })
    end)
    if not ok then
        -- Fallback: per-action (older server)
        for _, r in ipairs(results) do
            reportComplete(r.action_id, r.status, r.error, r.result)
        end
    end
end

------------------------------------------------------------------- state
local connected, pairingCode = false, nil
local lastHeartbeat, queueLen, lastAction = 0, 0, "—"

local function setStatus(text, color, sub)
    statusLabel.Text = "Status: " .. text
    statusLabel.TextColor3 = color or Color3.fromRGB(200,200,210)
    if sub then subStatus.Text = sub end
end
local function refreshInfo()
    infoLabel.Text = ("Place: %s    Queue: %d    v%s"):format(tostring(game.PlaceId or 0), queueLen, PLUGIN_VERSION)
    lastLabel.Text = "Last: " .. lastAction
end

local function pollOnce(force)
    local token = validToken()
    if not token then
        connected = false
        setStatus("not connected", Color3.fromRGB(255,180,80),
            "Plugin not connected. Please reconnect from bloxsmith.pro.")
        if force then log("No saved token — click Connect to link.", "warn") end
        return
    end
    if force then log(("token found: yes  ·  API: %s  ·  place: %s  ·  v%s")
        :format(API_BASE, tostring(game.PlaceId or 0), PLUGIN_VERSION), "debug") end
    local data, err, status = post("/api/public/plugin/poll", {
        token = token, place_id = tostring(game.PlaceId or 0), studio_version = studioVersion(),
    }, { verbose = VERBOSE, force = force })
    if err then
        if status == 401 then
            clearToken(); connected = false
            connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70,130,240)
            setStatus("not connected", Color3.fromRGB(255,180,80),
                "Plugin not connected. Please reconnect from bloxsmith.pro.")
            log("Token rejected by server (401) — cleared. Click Connect to reconnect.", "error")
            return
        end
        setStatus("error", Color3.fromRGB(255,120,120), err)
        log("Poll failed — will retry.", "error"); return
    end
    if data and data.user_id then
        -- userId surfaced only on first successful poll after (re)connect
        if lastHeartbeat == 0 then log("userId: " .. tostring(data.user_id), "debug") end
    end
    setStatus("Connected", Color3.fromRGB(120,220,160), "Linked to your BloxSmith account.")
    local actions = data.actions or {}
    queueLen = #actions; refreshInfo()
    if os.clock() - lastHeartbeat > 60 then
        log(("Heartbeat — %d pending"):format(#actions), "debug")
        lastHeartbeat = os.clock()
    end
    if #actions == 0 then return 0 end
    log(("Received %d action(s)."):format(#actions), "success")
    ChangeHistoryService:SetWaypoint("BloxSmith batch start")
    local okN, failN = 0, 0
    local results = {}
    for _, a in ipairs(actions) do
        local ok, errOrInst = pcall(executeAction, a)
        if ok then
            okN += 1; lastAction = describeAction(a)
            log("✓ " .. lastAction, "action")
            results[#results+1] = { action_id = a.id, status = "done" }
        else
            failN += 1
            log("✗ " .. a.kind .. " '" .. tostring(a.name) .. "': " .. tostring(errOrInst), "error")
            results[#results+1] = { action_id = a.id, status = "failed", error = tostring(errOrInst) }
        end
    end
    queueLen = 0; refreshInfo()
    ChangeHistoryService:SetWaypoint("BloxSmith batch done")
    -- Report all results in a single HTTP call, off the hot path.
    task.spawn(reportBatch, results)
    log(("Batch complete — %d ok, %d failed."):format(okN, failN), failN > 0 and "warn" or "success")
    return #actions
end

local function startPairing()
    setStatus("connecting", Color3.fromRGB(160,200,255), "Creating one-time approval link…")
    connectBtn.Text = "Cancel"; connectBtn.BackgroundColor3 = Color3.fromRGB(220,90,90)
    log("Requesting pair code…", "info")
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
            log("Approved ✓ — token saved.", "success")
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
    log("Disconnected — token removed.", "warn")
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
        log("No saved token — starting fresh connect.", "warn")
        clearToken(); connected = false
        task.spawn(startPairing); return
    end
    log("Reconnecting…", "info"); connected = true; pollOnce(true)
end)

syncBtn.MouseButton1Click:Connect(function()
    if not connected then log("Not connected.", "warn"); return end
    log("Manual sync triggered.", "info"); pollOnce(true)
end)

execBtn.MouseButton1Click:Connect(function()
    if not connected then log("Not connected.", "warn"); return end
    log("Running queue…", "info"); pollOnce(true)
end)

clearBtn.MouseButton1Click:Connect(function()
    local token = validToken()
    if not token then log("Not connected — click Connect first.", "warn"); return end
    log("Clearing stuck queue…", "info")
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
        log("Copied " .. API_BASE .. "/plugin to clipboard — paste into your browser.", "info")
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
local function scanInstance(inst, depth, maxDepth, budget)
    if budget.count >= budget.max then return nil end
    budget.count += 1
    local node = { name = inst.Name, class = inst.ClassName }
    if depth < maxDepth then
        local kids = inst:GetChildren()
        if #kids > 0 then
            node.children = {}
            for i, c in ipairs(kids) do
                if i > 80 then node.truncated = true; break end
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
    return { place_id = tostring(game.PlaceId or 0), built_at = os.time(), roots = roots, sampled = budget.count }
end

scanBtn.MouseButton1Click:Connect(function()
    local token = validToken()
    if not token then log("Not connected — click Connect first.", "warn"); return end
    log("Scanning game tree…", "info")
    local scan = buildScan()
    log(("Scanned %d instance(s) across %d service(s)."):format(scan.sampled, #scan.roots), "debug")
    local data, err = post("/api/public/plugin/scan", {
        token = token, place_id = tostring(game.PlaceId or 0), scan = scan,
    }, { verbose = true })
    if err then log("Scan upload failed: " .. err, "error")
    else log("✓ Scan uploaded. AI will see this on your next message.", "success") end
end)

------------------------------------------------------------------- error capture (LogService → API)
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
        log(("✓ Sent %d Studio error(s) — AI will use these to fix on next message."):format(#batch), "success")
    end
end

sendErrBtn.MouseButton1Click:Connect(function() flushErrors(true) end)
autoErrBtn.MouseButton1Click:Connect(function()
    AUTO_SEND_ERRORS = not AUTO_SEND_ERRORS
    autoErrBtn.Text = "Auto-Send: " .. (AUTO_SEND_ERRORS and "ON" or "OFF")
    autoErrBtn.BackgroundColor3 = AUTO_SEND_ERRORS and Color3.fromRGB(45,48,58) or Color3.fromRGB(80,50,50)
    log("Auto error upload " .. (AUTO_SEND_ERRORS and "enabled" or "disabled"), "debug")
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
        log("Restoring previous session…", "info"); pollOnce(true)
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
            -- Drain: keep polling immediately while the server has work queued.
            for _ = 1, 8 do
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

log("BloxSmith v" .. PLUGIN_VERSION .. " loaded.", "success")
log("API: " .. API_BASE, "debug")
log("Studio " .. studioVersion() .. " — place " .. tostring(game.PlaceId or 0), "debug")
log("Use Connect → approve in browser → builds execute here automatically.", "info")
