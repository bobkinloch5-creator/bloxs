-- BloxSmithPlugin.lua
-- Roblox Studio plugin: connects to your BloxSmith account, pulls queued
-- AI-generated actions, and executes them inside Studio.
-- Install: Plugins > Open Plugins Folder, drop this file in, restart Studio.

local HttpService = game:GetService("HttpService")
local ServerStorage = game:GetService("ServerStorage")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local API_BASE = "https://YOUR-BLOXSMITH-DOMAIN" -- Replace after publish, or set in the plugin UI.
local POLL_INTERVAL = 4

local toolbar = plugin:CreateToolbar("BloxSmith")
local toggleButton = toolbar:CreateButton("BloxSmith", "Open BloxSmith builder", "rbxasset://textures/StudioSharedUI/services/plugin@2x.png")

local widget = plugin:CreateDockWidgetPluginGui("BloxSmithWidget",
    DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, true, false, 320, 420, 280, 360))
widget.Title = "BloxSmith"

----------------------------------------------------------------
-- UI
----------------------------------------------------------------
local main = Instance.new("Frame")
main.Size = UDim2.fromScale(1,1)
main.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
main.BorderSizePixel = 0
main.Parent = widget

local function makeLabel(text, y, size)
    local lbl = Instance.new("TextLabel")
    lbl.Position = UDim2.new(0, 12, 0, y)
    lbl.Size = UDim2.new(1, -24, 0, size or 18)
    lbl.BackgroundTransparency = 1
    lbl.Font = Enum.Font.Gotham
    lbl.TextSize = 13
    lbl.TextColor3 = Color3.fromRGB(220, 220, 230)
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Text = text
    lbl.Parent = main
    return lbl
end

makeLabel("BloxSmith API URL", 10)
local urlBox = Instance.new("TextBox")
urlBox.Position = UDim2.new(0, 12, 0, 30)
urlBox.Size = UDim2.new(1, -24, 0, 28)
urlBox.PlaceholderText = "https://your-bloxsmith.lovable.app"
urlBox.Text = plugin:GetSetting("api") or ""
urlBox.BackgroundColor3 = Color3.fromRGB(45, 48, 58)
urlBox.TextColor3 = Color3.fromRGB(240, 240, 240)
urlBox.Font = Enum.Font.Code
urlBox.TextSize = 13
urlBox.ClearTextOnFocus = false
urlBox.BorderSizePixel = 0
urlBox.Parent = main

makeLabel("Plugin token (from BloxSmith > Studio Plugin)", 68)
local tokenBox = Instance.new("TextBox")
tokenBox.Position = UDim2.new(0, 12, 0, 88)
tokenBox.Size = UDim2.new(1, -24, 0, 28)
tokenBox.PlaceholderText = "BS-XXXXXXXXXXXX"
tokenBox.Text = plugin:GetSetting("token") or ""
tokenBox.BackgroundColor3 = Color3.fromRGB(45, 48, 58)
tokenBox.TextColor3 = Color3.fromRGB(240, 240, 240)
tokenBox.Font = Enum.Font.Code
tokenBox.TextSize = 13
tokenBox.ClearTextOnFocus = false
tokenBox.BorderSizePixel = 0
tokenBox.Parent = main

local connectBtn = Instance.new("TextButton")
connectBtn.Position = UDim2.new(0, 12, 0, 128)
connectBtn.Size = UDim2.new(1, -24, 0, 32)
connectBtn.BackgroundColor3 = Color3.fromRGB(60, 200, 130)
connectBtn.TextColor3 = Color3.fromRGB(20, 22, 28)
connectBtn.Font = Enum.Font.GothamBold
connectBtn.TextSize = 13
connectBtn.Text = "Connect"
connectBtn.BorderSizePixel = 0
connectBtn.Parent = main

local statusLabel = makeLabel("Status: disconnected", 168)
statusLabel.TextColor3 = Color3.fromRGB(180,180,190)

local logFrame = Instance.new("ScrollingFrame")
logFrame.Position = UDim2.new(0, 12, 0, 196)
logFrame.Size = UDim2.new(1, -24, 1, -208)
logFrame.BackgroundColor3 = Color3.fromRGB(20, 22, 28)
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
    lbl.TextSize = 12
    lbl.TextColor3 = color or Color3.fromRGB(200, 200, 210)
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
-- Path resolver: "ServerScriptService.Folder.Sub"
----------------------------------------------------------------
local function resolveParent(path)
    if path == nil or path == "" then return game:GetService("ServerScriptService") end
    local parts = string.split(path, ".")
    local first = parts[1]
    local ok, svc = pcall(function() return game:GetService(first) end)
    local parent
    if ok and svc then
        parent = svc
    else
        parent = game:FindFirstChild(first) or workspace
    end
    for i = 2, #parts do
        local child = parent:FindFirstChild(parts[i])
        if not child then
            child = Instance.new("Folder")
            child.Name = parts[i]
            child.Parent = parent
        end
        parent = child
    end
    return parent
end

----------------------------------------------------------------
-- Action executor
----------------------------------------------------------------
local function executeAction(action)
    local kind = action.kind
    local parent = resolveParent(action.parent_path)
    local payload = action.payload or {}

    if kind == "folder" then
        local f = parent:FindFirstChild(action.name) or Instance.new("Folder")
        f.Name = action.name; f.Parent = parent
        return f

    elseif kind == "script" or kind == "localscript" or kind == "modulescript" then
        local className = kind == "script" and "Script" or kind == "localscript" and "LocalScript" or "ModuleScript"
        local existing = parent:FindFirstChild(action.name)
        if existing and existing:IsA(className) then existing:Destroy() end
        local s = Instance.new(className)
        s.Name = action.name
        s.Source = payload.source or "-- empty"
        s.Parent = parent
        return s

    elseif kind == "gui" then
        local s = Instance.new("LocalScript")
        s.Name = action.name .. "_Builder"
        s.Source = payload.source or "-- empty"
        s.Parent = parent
        return s

    elseif kind == "part" then
        local p = Instance.new("Part")
        p.Name = action.name
        local sz = payload.size or {4,1,4}
        p.Size = Vector3.new(sz[1] or 4, sz[2] or 1, sz[3] or 4)
        local pos = payload.position or {0,5,0}
        p.Position = Vector3.new(pos[1] or 0, pos[2] or 5, pos[3] or 0)
        if payload.color then
            local c = payload.color
            p.Color = Color3.new(c[1] or 1, c[2] or 1, c[3] or 1)
        end
        p.Anchored = payload.anchored ~= false
        if payload.material then
            local ok, m = pcall(function() return Enum.Material[payload.material] end)
            if ok and m then p.Material = m end
        end
        p.Parent = parent
        return p

    elseif kind == "model" or kind == "terrain" then
        -- Run the provided source as a temporary builder script.
        local s = Instance.new("Script")
        s.Name = action.name .. "_Builder"
        s.Source = payload.source or "-- empty"
        s.Parent = ServerStorage  -- not auto-run; user reviews then moves
        return s
    end
    error("Unknown action kind: " .. tostring(kind))
end

----------------------------------------------------------------
-- Network
----------------------------------------------------------------
local connected = false

local function post(path, body)
    local apiBase = urlBox.Text:gsub("/+$", "")
    if apiBase == "" then return nil, "API URL not set" end
    local ok, res = pcall(function()
        return HttpService:RequestAsync({
            Url = apiBase .. path,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(body),
        })
    end)
    if not ok then return nil, tostring(res) end
    if not res.Success then return nil, "HTTP " .. tostring(res.StatusCode) .. ": " .. tostring(res.Body) end
    local decoded = HttpService:JSONDecode(res.Body)
    return decoded, nil
end

local function reportComplete(actionId, status, errMsg)
    post("/api/public/plugin/complete", {
        token = tokenBox.Text,
        action_id = actionId,
        status = status,
        error = errMsg,
    })
end

local function pollOnce()
    local placeId = tostring(game.PlaceId or 0)
    local data, err = post("/api/public/plugin/poll", {
        token = tokenBox.Text,
        place_id = placeId,
        studio_version = version(),
    })
    if err then
        log("poll failed: " .. err, Color3.fromRGB(255,120,120))
        statusLabel.Text = "Status: error"
        return
    end
    statusLabel.Text = "Status: connected"
    statusLabel.TextColor3 = Color3.fromRGB(120, 220, 160)
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

connectBtn.MouseButton1Click:Connect(function()
    plugin:SetSetting("api", urlBox.Text)
    plugin:SetSetting("token", tokenBox.Text)
    if tokenBox.Text == "" then log("Enter your plugin token first.", Color3.fromRGB(255,180,80)); return end
    connected = not connected
    connectBtn.Text = connected and "Disconnect" or "Connect"
    connectBtn.BackgroundColor3 = connected and Color3.fromRGB(220, 90, 90) or Color3.fromRGB(60, 200, 130)
    if connected then
        log("Connecting…", Color3.fromRGB(160,200,255))
        pollOnce()
    else
        statusLabel.Text = "Status: disconnected"
        statusLabel.TextColor3 = Color3.fromRGB(180,180,190)
    end
end)

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)
        if connected then pcall(pollOnce) end
    end
end)

log("BloxSmith plugin loaded. Paste API URL + token, then Connect.", Color3.fromRGB(140,200,255))
