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

local logFrame = Instance.new("ScrollingFrame")
logFrame.Position = UDim2.new(0, 12, 0, 222)
logFrame.Size = UDim2.new(1, -24, 1, -234)
logFrame.BackgroundColor3 = Color3.fromRGB(14, 16, 22)
logFrame.BorderSizePixel = 0
logFrame.CanvasSize = UDim2.new(0,0,0,0)
logFrame.ScrollBarThickness = 4
logFrame.Parent = main

local logLayout = Instance.new("UIListLayout")
logLayout.SortOrder = Enum.SortOrder.LayoutOrder
logLayout.Padding = UDim.new(0, 4)
logLayout.Parent = logFrame

local logIndex = 0
local function log(text, color)
    logIndex += 1
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, -8, 0, 16)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Code
    lbl.TextSize = 11
    lbl.TextColor3 = color or Color3.fromRGB(180, 185, 200)
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Text = "[" .. os.date("%H:%M:%S") .. "] " .. text
    lbl.LayoutOrder = logIndex
    lbl.Parent = logFrame
    logFrame.CanvasSize = UDim2.new(0,0,0, logLayout.AbsoluteContentSize.Y + 12)
    logFrame.CanvasPosition = Vector2.new(0, logFrame.CanvasSize.Y.Offset)
end

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

local function executeAction(action)
    local kind = action.kind
    local parent = resolveParent(action.parent_path)
    local payload = action.payload or {}
    if kind == "folder" then
        local f = parent:FindFirstChild(action.name) or Instance.new("Folder")
        f.Name = action.name; f.Parent = parent; return f
    elseif kind == "script" or kind == "localscript" or kind == "modulescript" then
        local className = kind == "script" and "Script" or kind == "localscript" and "LocalScript" or "ModuleScript"
        local existing = parent:FindFirstChild(action.name)
        if existing and existing:IsA(className) then existing:Destroy() end
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

local function post(path, body)
    local ok, res = pcall(function()
        return HttpService:RequestAsync({
            Url = API_BASE .. path,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(body or {}),
        })
    end)
    if not ok then return nil, tostring(res) end
    if not res.Success then return nil, "HTTP " .. tostring(res.StatusCode) .. ": " .. tostring(res.Body) end
    local decoded; pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
    return decoded or {}, nil
end

local function reportComplete(actionId, status, errMsg)
    local token = plugin:GetSetting("token")
    if not token then return end
    post("/api/public/plugin/complete", {
        token = token, action_id = actionId, status = status, error = errMsg,
    })
end

local connected = false
local pairingCode = nil

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
    })
    if err then
        setStatus("error", Color3.fromRGB(255,120,120), err)
        return
    end
    setStatus("Connected", Color3.fromRGB(120, 220, 160), "Linked to your BloxSmith account.")
    local actions = data.actions or {}
    if #actions == 0 then return end
    log("Received " .. #actions .. " action(s)", Color3.fromRGB(120,220,160))
    ChangeHistoryService:SetWaypoint("BloxSmith batch start")
    for _, a in ipairs(actions) do
        local ok, errOrInst = pcall(executeAction, a)
        if ok then
            log("✓ " .. a.kind .. " " .. a.name, Color3.fromRGB(140,220,160))
            reportComplete(a.id, "done", nil)
        else
            log("✗ " .. a.kind .. " " .. a.name .. ": " .. tostring(errOrInst), Color3.fromRGB(255,120,120))
            reportComplete(a.id, "failed", tostring(errOrInst))
        end
    end
    ChangeHistoryService:SetWaypoint("BloxSmith batch done")
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

    local data, err = post("/api/public/plugin/pair/start", { plugin_version = PLUGIN_VERSION })
    if err or not data or not data.code then
        log("Could not start pairing: " .. tostring(err or "no data"), Color3.fromRGB(255,120,120))
        setStatus("error", Color3.fromRGB(255,120,120), "Try again in a moment.")
        connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
        return
    end
    pairingCode = data.code
    local link = data.link_url
    linkBox.Text = link; linkBox.Visible = true
    copyBtn.Visible = true
    if tryCopy(link) then
        log("Approval link copied to clipboard.", Color3.fromRGB(160,200,255))
    end
    log("Open " .. link .. " in your browser to approve.", Color3.fromRGB(160,200,255))
    setStatus("waiting for approval", Color3.fromRGB(255,200,120),
        "Open the link in your browser and click Approve.")

    -- Poll the pair endpoint until approved or expired
    local elapsed = 0
    while pairingCode == data.code and elapsed < 600 do
        task.wait(2); elapsed += 2
        local poll, perr = post("/api/public/plugin/pair/poll", { code = data.code })
        if perr then
            -- 404 / 410 surface as HTTP error strings; just keep waiting unless expired
            if string.find(perr, "410") then
                log("Approval link expired. Click Connect again.", Color3.fromRGB(255,180,80))
                setStatus("expired", Color3.fromRGB(255,180,80), "Click Connect to get a new link.")
                connectBtn.Text = "Connect"; connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
                pairingCode = nil; linkBox.Visible = false; copyBtn.Visible = false
                return
            end
        elseif poll and poll.status == "approved" and poll.plugin_token then
            plugin:SetSetting("token", poll.plugin_token)
            pairingCode = nil
            linkBox.Visible = false; copyBtn.Visible = false
            log("Approved by website ✓", Color3.fromRGB(140,220,160))
            connected = true
            connectBtn.Text = "Disconnect"
            connectBtn.BackgroundColor3 = Color3.fromRGB(220, 90, 90)
            pollOnce()
            return
        end
    end
    if pairingCode == data.code then
        log("Approval timed out. Click Connect to try again.", Color3.fromRGB(255,180,80))
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
end

copyBtn.MouseButton1Click:Connect(function()
    if linkBox.Text ~= "" then
        if tryCopy(linkBox.Text) then log("Link copied.", Color3.fromRGB(160,200,255)) end
    end
end)

connectBtn.MouseButton1Click:Connect(function()
    if connected then
        disconnect(); return
    end
    if pairingCode then
        -- Cancel waiting
        pairingCode = nil
        linkBox.Visible = false; copyBtn.Visible = false
        connectBtn.Text = "Connect"
        connectBtn.BackgroundColor3 = Color3.fromRGB(70, 130, 240)
        setStatus("cancelled", Color3.fromRGB(200,200,210), "Click Connect to try again.")
        return
    end
    task.spawn(startPairing)
end)

-- Auto-resume if we already have a token from a previous session.
task.spawn(function()
    local saved = plugin:GetSetting("token")
    if saved then
        connected = true
        connectBtn.Text = "Disconnect"
        connectBtn.BackgroundColor3 = Color3.fromRGB(220, 90, 90)
        log("Restoring previous session…", Color3.fromRGB(160,200,255))
        pollOnce()
    else
        setStatus("not connected", Color3.fromRGB(200,200,210), "Click Connect to link this Studio session.")
    end
end)

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)
        if connected then pcall(pollOnce) end
    end
end)

log("BloxSmith v" .. PLUGIN_VERSION .. " loaded.", Color3.fromRGB(140,200,255))
log("API: " .. API_BASE, Color3.fromRGB(120,130,150))
