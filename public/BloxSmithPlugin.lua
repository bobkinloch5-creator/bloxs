-- BloxSmithPlugin.lua
-- Roblox Studio plugin: one-click connect to your BloxSmith account.
-- Install: Plugins > Open Plugins Folder, drop this file in, restart Studio.

local HttpService = game:GetService("HttpService")
local ServerStorage = game:GetService("ServerStorage")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local StudioService = game:GetService("StudioService")

local API_BASE   = "https://bloxsmith.pro"   -- production
local POLL_INTERVAL = 4
local PLUGIN_VERSION = "1.1.0"

local toolbar = plugin:CreateToolbar("BloxSmith")
local toggleButton = toolbar:CreateButton("BloxSmith", "Open BloxSmith builder",
    "rbxasset://textures/StudioSharedUI/services/plugin@2x.png")

local widget = plugin:CreateDockWidgetPluginGui("BloxSmithWidget",
    DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, true, false, 320, 460, 280, 380))
widget.Title = "BloxSmith"

local main = Instance.new("Frame")
main.Size = UDim2.fromScale(1,1)
main.BackgroundColor3 = Color3.fromRGB(20, 22, 28)
main.BorderSizePixel = 0
main.Parent = widget

local function makeLabel(text, y, size, color)
    local lbl = Instance.new("TextLabel")
    lbl.Position = UDim2.new(0, 12, 0, y)
    lbl.Size = UDim2.new(1, -24, 0, size or 18)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Gotham
    lbl.TextSize = 13
    lbl.TextColor3 = color or Color3.fromRGB(220, 220, 230)
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Text = text
    lbl.Parent = main
    return lbl
end

local title = makeLabel("BloxSmith", 12, 22)
title.Font = Enum.Font.GothamBold
title.TextSize = 16
makeLabel("Build Roblox games with AI", 34, 16, Color3.fromRGB(150,155,170))

local statusLabel = makeLabel("Status: not connected", 64, 18, Color3.fromRGB(200,200,210))
local subStatus   = makeLabel("Click Connect to get a one-click link.", 84, 16, Color3.fromRGB(150,155,170))

local connectBtn = Instance.new("TextButton")
connectBtn.Position = UDim2.new(0, 12, 0, 112)
connectBtn.Size = UDim2.new(1, -24, 0, 34)
connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
connectBtn.TextColor3 = Color3.fromRGB(255,255,255)
connectBtn.Font = Enum.Font.GothamBold
connectBtn.TextSize = 14
connectBtn.Text = "Connect"
connectBtn.BorderSizePixel = 0
connectBtn.AutoButtonColor = true
connectBtn.Parent = main

local linkBox = Instance.new("TextBox")
linkBox.Position = UDim2.new(0, 12, 0, 156)
linkBox.Size = UDim2.new(1, -24, 0, 28)
linkBox.BackgroundColor3 = Color3.fromRGB(35, 38, 48)
linkBox.TextColor3 = Color3.fromRGB(220,220,230)
linkBox.Font = Enum.Font.Code
linkBox.TextSize = 12
linkBox.Text = ""
linkBox.PlaceholderText = "Approval link appears here"
linkBox.ClearTextOnFocus = false
linkBox.TextEditable = false
linkBox.BorderSizePixel = 0
linkBox.Visible = false
linkBox.Parent = main

local copyBtn = Instance.new("TextButton")
copyBtn.Position = UDim2.new(0, 12, 0, 188)
copyBtn.Size = UDim2.new(1, -24, 0, 24)
copyBtn.BackgroundColor3 = Color3.fromRGB(45, 48, 58)
copyBtn.TextColor3 = Color3.fromRGB(220,220,230)
copyBtn.Font = Enum.Font.Gotham
copyBtn.TextSize = 12
copyBtn.Text = "Copy approval link"
copyBtn.BorderSizePixel = 0
copyBtn.Visible = false
copyBtn.Parent = main

-- Log header bar (title + clear + copy)
local logBar = Instance.new("Frame")
logBar.Position = UDim2.new(0, 12, 0, 222)
logBar.Size = UDim2.new(1, -24, 0, 22)
logBar.BackgroundTransparency = 1
logBar.Parent = main

local logTitle = Instance.new("TextLabel")
logTitle.Size = UDim2.new(1, -150, 1, 0)
logTitle.BackgroundTransparency = 1
logTitle.Font = Enum.Font.GothamBold
logTitle.TextSize = 12
logTitle.TextColor3 = Color3.fromRGB(200,205,215)
logTitle.TextXAlignment = Enum.TextXAlignment.Left
logTitle.Text = "Activity log"
logTitle.Parent = logBar

local function makeMiniBtn(text, xOffset)
    local b = Instance.new("TextButton")
    b.AnchorPoint = Vector2.new(1, 0.5)
    b.Position = UDim2.new(1, xOffset, 0.5, 0)
    b.Size = UDim2.new(0, 60, 0, 20)
    b.BackgroundColor3 = Color3.fromRGB(45, 48, 58)
    b.TextColor3 = Color3.fromRGB(210,215,225)
    b.Font = Enum.Font.Gotham
    b.TextSize = 11
    b.Text = text
    b.BorderSizePixel = 0
    b.AutoButtonColor = true
    b.Parent = logBar
    return b
end

local copyLogBtn = makeMiniBtn("Copy", 0)
local clearLogBtn = makeMiniBtn("Clear", -68)

local logFrame = Instance.new("ScrollingFrame")
logFrame.Position = UDim2.new(0, 12, 0, 248)
logFrame.Size = UDim2.new(1, -24, 1, -260)
logFrame.BackgroundColor3 = Color3.fromRGB(14, 16, 22)
logFrame.BorderSizePixel = 0
logFrame.CanvasSize = UDim2.new(0,0,0,0)
logFrame.ScrollBarThickness = 4
logFrame.Parent = main

local logPad = Instance.new("UIPadding")
logPad.PaddingTop = UDim.new(0, 6)
logPad.PaddingBottom = UDim.new(0, 6)
logPad.PaddingLeft = UDim.new(0, 6)
logPad.PaddingRight = UDim.new(0, 6)
logPad.Parent = logFrame

local logLayout = Instance.new("UIListLayout")
logLayout.SortOrder = Enum.SortOrder.LayoutOrder
logLayout.Padding = UDim.new(0, 2)
logLayout.Parent = logFrame

-- Severity → color + tag + Studio Output mirror
local LEVELS = {
    info    = { color = Color3.fromRGB(160, 200, 255), tag = "INFO",  mirror = "print" },
    debug   = { color = Color3.fromRGB(140, 145, 160), tag = "DBG ",  mirror = nil     },
    success = { color = Color3.fromRGB(140, 220, 160), tag = " OK ",  mirror = "print" },
    warn    = { color = Color3.fromRGB(255, 200, 120), tag = "WARN",  mirror = "warn"  },
    error   = { color = Color3.fromRGB(255, 120, 120), tag = "ERR ",  mirror = "warn"  },
    net     = { color = Color3.fromRGB(150, 190, 235), tag = "NET ",  mirror = nil     },
    action  = { color = Color3.fromRGB(190, 175, 255), tag = "ACT ",  mirror = "print" },
}

local logIndex = 0
local LOG_MAX = 400
local logHistory = {}            -- {string} plain-text lines for Copy
local logChildren = {}           -- TextLabel refs, to evict oldest

local function relayoutCanvas()
    logFrame.CanvasSize = UDim2.new(0, 0, 0, logLayout.AbsoluteContentSize.Y + 12)
    logFrame.CanvasPosition = Vector2.new(0, math.max(0, logFrame.CanvasSize.Y.Offset - logFrame.AbsoluteSize.Y))
end

local function log(text, levelOrColor)
    -- Backwards compat: callers may pass a Color3 OR a level string.
    local meta
    if typeof(levelOrColor) == "Color3" then
        meta = { color = levelOrColor, tag = "    ", mirror = nil }
    elseif type(levelOrColor) == "string" and LEVELS[levelOrColor] then
        meta = LEVELS[levelOrColor]
    else
        meta = LEVELS.info
    end

    logIndex += 1
    local stamp = os.date("%H:%M:%S")
    local line  = string.format("[%s] %s | %s", stamp, meta.tag, tostring(text))
    table.insert(logHistory, line)
    if #logHistory > LOG_MAX then table.remove(logHistory, 1) end

    local lbl = Instance.new("TextLabel")
    lbl.AutomaticSize = Enum.AutomaticSize.Y
    lbl.Size = UDim2.new(1, -4, 0, 0)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Code
    lbl.TextSize = 11
    lbl.TextColor3 = meta.color
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.TextYAlignment = Enum.TextYAlignment.Top
    lbl.TextWrapped = true
    lbl.RichText = false
    lbl.Text = line
    lbl.LayoutOrder = logIndex
    lbl.Parent = logFrame
    table.insert(logChildren, lbl)
    if #logChildren > LOG_MAX then
        local oldest = table.remove(logChildren, 1)
        if oldest then oldest:Destroy() end
    end

    if meta.mirror == "warn" then warn("[BloxSmith] " .. tostring(text))
    elseif meta.mirror == "print" then print("[BloxSmith] " .. tostring(text)) end

    task.defer(relayoutCanvas)
end

local function tryCopyText(s)
    return pcall(function() (setclipboard or (_G and _G.setclipboard))(s) end)
end

clearLogBtn.MouseButton1Click:Connect(function()
    for _, c in ipairs(logChildren) do c:Destroy() end
    table.clear(logChildren); table.clear(logHistory); logIndex = 0
    relayoutCanvas()
    log("Log cleared.", "debug")
end)

copyLogBtn.MouseButton1Click:Connect(function()
    local blob = table.concat(logHistory, "\n")
    if tryCopyText(blob) then
        log(string.format("Copied %d log lines to clipboard.", #logHistory), "info")
    else
        log("Clipboard not available in this context.", "warn")
    end
end)

toggleButton.Click:Connect(function()
    widget.Enabled = not widget.Enabled
end)

----------------------------------------------------------------
local function resolveParent(path)
    if path == nil or path == "" then return game:GetService("ServerScriptService") end
    local parts = string.split(path, ".")
    local first = parts[1]
    local ok, svc = pcall(function() return game:GetService(first) end)
    local parent
    if ok and svc then parent = svc else parent = game:FindFirstChild(first) or workspace end
    for i = 2, #parts do
        local child = parent:FindFirstChild(parts[i])
        if not child then
            child = Instance.new("Folder"); child.Name = parts[i]; child.Parent = parent
        end
        parent = child
    end
    return parent
end

local function describeAction(a)
    local payload = a.payload or {}
    local extra = ""
    if a.kind == "script" or a.kind == "localscript" or a.kind == "modulescript" then
        local src = payload.source or ""
        extra = string.format(" (%d chars)", #src)
    elseif a.kind == "part" then
        local sz = payload.size or {}
        extra = string.format(" (size %sx%sx%s)", tostring(sz[1] or "?"), tostring(sz[2] or "?"), tostring(sz[3] or "?"))
    end
    return string.format("%s '%s' → %s%s", a.kind, tostring(a.name), tostring(a.parent_path or "ServerScriptService"), extra)
end

local function executeAction(action)
    local kind = action.kind
    local parent = resolveParent(action.parent_path)
    local payload = action.payload or {}
    log("→ executing " .. describeAction(action), "debug")
    if kind == "folder" then
        local f = parent:FindFirstChild(action.name) or Instance.new("Folder")
        f.Name = action.name; f.Parent = parent; return f
    elseif kind == "script" or kind == "localscript" or kind == "modulescript" then
        local className = kind == "script" and "Script" or kind == "localscript" and "LocalScript" or "ModuleScript"
        local existing = parent:FindFirstChild(action.name)
        if existing and existing:IsA(className) then
            log("replacing existing " .. className .. " " .. existing:GetFullName(), "debug")
            existing:Destroy()
        end
        local s = Instance.new(className)
        s.Name = action.name; s.Source = payload.source or "-- empty"; s.Parent = parent; return s
    elseif kind == "gui" then
        local s = Instance.new("LocalScript")
        s.Name = action.name .. "_Builder"; s.Source = payload.source or "-- empty"; s.Parent = parent; return s
    elseif kind == "part" then
        local p = Instance.new("Part")
        p.Name = action.name
        local sz = payload.size or {4,1,4}
        p.Size = Vector3.new(sz[1] or 4, sz[2] or 1, sz[3] or 4)
        local pos = payload.position or {0,5,0}
        p.Position = Vector3.new(pos[1] or 0, pos[2] or 5, pos[3] or 0)
        if payload.color then local c = payload.color; p.Color = Color3.new(c[1] or 1, c[2] or 1, c[3] or 1) end
        p.Anchored = payload.anchored ~= false
        if payload.material then
            local ok, m = pcall(function() return Enum.Material[payload.material] end)
            if ok and m then p.Material = m end
        end
        p.Parent = parent; return p
    elseif kind == "model" or kind == "terrain" then
        local s = Instance.new("Script")
        s.Name = action.name .. "_Builder"; s.Source = payload.source or "-- empty"; s.Parent = ServerStorage; return s
    end
    error("Unknown action kind: " .. tostring(kind))
end

----------------------------------------------------------------
local function studioVersion()
    local ok, v = pcall(function() return version() end)
    if ok then return tostring(v) end
    return "unknown"
end

-- Verbose logging toggle. Verbose logs every poll request/response. Off by default
-- to avoid spamming the log every 4 seconds, but every error/action is still logged.
local VERBOSE = false

local function post(path, body, opts)
    opts = opts or {}
    local verbose = opts.verbose ~= false and (VERBOSE or opts.force)
    local t0 = os.clock()
    if verbose then log("→ POST " .. path, "net") end
    local ok, res = pcall(function()
        return HttpService:RequestAsync({
            Url = API_BASE .. path,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(body or {}),
        })
    end)
    local dt = math.floor((os.clock() - t0) * 1000)
    if not ok then
        log(string.format("✗ POST %s failed after %dms — %s", path, dt, tostring(res)), "error")
        return nil, tostring(res)
    end
    if not res.Success then
        local short = tostring(res.Body or "")
        if #short > 240 then short = short:sub(1, 240) .. "…" end
        log(string.format("✗ POST %s → HTTP %s in %dms — %s", path, tostring(res.StatusCode), dt, short), "error")
        return nil, "HTTP " .. tostring(res.StatusCode) .. ": " .. tostring(res.Body)
    end
    local decoded; pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
    if verbose then
        log(string.format("← POST %s → %s in %dms", path, tostring(res.StatusCode), dt), "net")
    end
    return decoded or {}, nil
end

local function reportComplete(actionId, status, errMsg)
    local token = plugin:GetSetting("token")
    if not token then return end
    post("/api/public/plugin/complete", {
        token = token, action_id = actionId, status = status, error = errMsg,
    }, { verbose = false })
end

local connected = false
local pairingCode = nil
local lastPollLog = 0     -- throttle "polled" debug line
local lastPollOk  = nil   -- last successful poll timestamp

local function setStatus(text, color, sub)
    statusLabel.Text = "Status: " .. text
    statusLabel.TextColor3 = color or Color3.fromRGB(200,200,210)
    if sub then subStatus.Text = sub end
end

local function pollOnce()
    local token = plugin:GetSetting("token")
    if not token then return end
    local placeId = tostring(game.PlaceId or 0)
    local data, err = post("/api/public/plugin/poll", {
        token = token, place_id = placeId, studio_version = studioVersion(),
    }, { verbose = VERBOSE })
    if err then
        setStatus("error", Color3.fromRGB(255,120,120), err)
        log("Poll failed — will retry. " .. err, "error")
        return
    end
    lastPollOk = os.time()
    setStatus("Connected", Color3.fromRGB(120, 220, 160), "Linked to your BloxSmith account.")
    local actions = data.actions or {}
    -- Heartbeat line every ~60s so the log shows the plugin is alive
    if os.clock() - lastPollLog > 60 then
        log(string.format("Heartbeat — connected, place %s, %d pending", placeId, #actions), "debug")
        lastPollLog = os.clock()
    end
    if #actions == 0 then return end
    log(string.format("Received %d action(s) from server.", #actions), "success")
    ChangeHistoryService:SetWaypoint("BloxSmith batch start")
    local okCount, failCount = 0, 0
    for _, a in ipairs(actions) do
        local ok, errOrInst = pcall(executeAction, a)
        if ok then
            okCount += 1
            log("✓ " .. describeAction(a), "action")
            reportComplete(a.id, "done", nil)
        else
            failCount += 1
            log("✗ " .. a.kind .. " '" .. tostring(a.name) .. "': " .. tostring(errOrInst), "error")
            reportComplete(a.id, "failed", tostring(errOrInst))
        end
    end
    ChangeHistoryService:SetWaypoint("BloxSmith batch done")
    log(string.format("Batch complete — %d ok, %d failed.", okCount, failCount), failCount > 0 and "warn" or "success")
end

local function tryCopy(url)
    -- setclipboard exists in Studio plugin contexts
    local ok = pcall(function() (setclipboard or (_G and _G.setclipboard))(url) end)
    return ok
end

local function startPairing()
    setStatus("connecting", Color3.fromRGB(160,200,255), "Creating one-time approval link…")
    connectBtn.Text = "Cancel"
    connectBtn.BackgroundColor3 = Color3.fromRGB(220, 90, 90)
    log("Requesting pair code from " .. API_BASE .. " …", "info")

    local data, err = post("/api/public/plugin/pair/start", { plugin_version = PLUGIN_VERSION }, { verbose = true })
    if err or not data or not data.code then
        log("Could not start pairing: " .. tostring(err or "no data"), "error")
        setStatus("error", Color3.fromRGB(255,120,120), "Try again in a moment.")
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
        return
    end
    pairingCode = data.code
    local link = data.link_url
    linkBox.Text = link; linkBox.Visible = true
    copyBtn.Visible = true
    log("Pair code received: " .. tostring(data.code), "success")
    if tryCopy(link) then
        log("Approval link copied to clipboard.", "info")
    end
    log("Open " .. link .. " in your browser to approve.", "info")
    setStatus("waiting for approval", Color3.fromRGB(255,200,120),
        "Open the link in your browser and click Approve.")

    -- Poll the pair endpoint until approved or expired
    local elapsed = 0
    local lastTick = 0
    while pairingCode == data.code and elapsed < 600 do
        task.wait(2); elapsed += 2
        if elapsed - lastTick >= 30 then
            log(string.format("Still waiting for approval (%ds elapsed)…", elapsed), "debug")
            lastTick = elapsed
        end
        local poll, perr = post("/api/public/plugin/pair/poll", { code = data.code }, { verbose = false })
        if perr then
            if string.find(perr, "410") then
                log("Approval link expired. Click Connect again.", "warn")
                setStatus("expired", Color3.fromRGB(255,180,80), "Click Connect to get a new link.")
                connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
                pairingCode = nil; linkBox.Visible = false; copyBtn.Visible = false
                return
            end
        elseif poll and poll.status == "approved" and poll.plugin_token then
            plugin:SetSetting("token", poll.plugin_token)
            pairingCode = nil
            linkBox.Visible = false; copyBtn.Visible = false
            log("Approved by website ✓ — token saved locally.", "success")
            connected = true
            connectBtn.Text = "Disconnect"
            connectBtn.BackgroundColor3 = Color3.fromRGB(220, 90, 90)
            pollOnce()
            return
        end
    end
    if pairingCode == data.code then
        log("Approval timed out after 10 minutes. Click Connect to try again.", "warn")
        setStatus("timed out", Color3.fromRGB(255,180,80), "Click Connect to try again.")
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
        pairingCode = nil; linkBox.Visible = false; copyBtn.Visible = false
    end
end

local function disconnect()
    plugin:SetSetting("token", nil)
    connected = false
    pairingCode = nil
    connectBtn.Text = "Connect"
    connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
    linkBox.Visible = false; copyBtn.Visible = false
    setStatus("not connected", Color3.fromRGB(200,200,210), "Click Connect to link this Studio session.")
    log("Disconnected. Token removed from this Studio install.", "warn")
end

copyBtn.MouseButton1Click:Connect(function()
    if linkBox.Text ~= "" then
        if tryCopy(linkBox.Text) then log("Link copied to clipboard.", "info") end
    end
end)

connectBtn.MouseButton1Click:Connect(function()
    if connected then
        disconnect(); return
    end
    if pairingCode then
        pairingCode = nil
        linkBox.Visible = false; copyBtn.Visible = false
        connectBtn.Text = "Connect"
        connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
        setStatus("cancelled", Color3.fromRGB(200,200,210), "Click Connect to try again.")
        log("Pairing cancelled by user.", "warn")
        return
    end
    task.spawn(startPairing)
end)

-- Verbose toggle in the log bar
local verboseBtn = makeMiniBtn("Verbose", -136)
verboseBtn.MouseButton1Click:Connect(function()
    VERBOSE = not VERBOSE
    verboseBtn.BackgroundColor3 = VERBOSE and Color3.fromRGB(70, 130, 240) or Color3.fromRGB(45, 48, 58)
    log("Verbose logging " .. (VERBOSE and "ON — every HTTP call is shown." or "OFF — only events and errors."), "debug")
end)

-- Auto-resume if we already have a token from a previous session.
task.spawn(function()
    local saved = plugin:GetSetting("token")
    if saved then
        connected = true
        connectBtn.Text = "Disconnect"
        connectBtn.BackgroundColor3 = Color3.fromRGB(220, 90, 90)
        log("Restoring previous session…", "info")
        pollOnce()
    else
        setStatus("not connected", Color3.fromRGB(200,200,210), "Click Connect to link this Studio session.")
    end
end)

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)
        if connected then
            local ok, err = pcall(pollOnce)
            if not ok then log("Poll loop crashed: " .. tostring(err), "error") end
        end
    end
end)

log("BloxSmith v" .. PLUGIN_VERSION .. " loaded.", "success")
log("API: " .. API_BASE, "debug")
log("Studio " .. studioVersion() .. " — place " .. tostring(game.PlaceId or 0), "debug")
log("Tip: tap Verbose to see every HTTP request, or Copy to share logs in Discord.", "debug")
