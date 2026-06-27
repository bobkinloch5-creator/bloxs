type UiKind = "main-menu" | "hud" | "shop" | "inventory" | "loading" | "settings";

type Palette = {
  bg: string;
  panel: string;
  panel2: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
};

type UiBox = {
  kind: "frame" | "text" | "button" | "bar";
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  radius?: number;
  opacity?: number;
  progress?: number;
};

type UiBlueprint = {
  prompt: string;
  style: string;
  title: string;
  subtitle: string;
  kind: UiKind;
  palette: Palette;
  boxes: UiBox[];
};

const WIDTH = 1536;
const HEIGHT = 1024;

function safeText(input: string, max = 52) {
  return input.replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "BloxSmith UI";
}

function luaString(value: string) {
  return JSON.stringify(value);
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function luaColor(hex: string) {
  const c = hexToRgb(hex);
  return `Color3.fromRGB(${c.r}, ${c.g}, ${c.b})`;
}

function luaValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return luaString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `{ ${value.map(luaValue).join(", ")} }`;
  if (typeof value === "object") {
    return `{ ${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => `${key} = ${luaValue(child)}`)
      .join(", ")} }`;
  }
  return "nil";
}

function inferKind(prompt: string): UiKind {
  if (/loading|load screen|progress/i.test(prompt)) return "loading";
  if (/shop|store|gamepass|buy|currency/i.test(prompt)) return "shop";
  if (/inventory|items|backpack|pets|weapons/i.test(prompt)) return "inventory";
  if (/settings|audio|graphics|controls/i.test(prompt)) return "settings";
  if (/hud|health|mana|stamina|xp|coin|gem|bar|hotbar/i.test(prompt)) return "hud";
  return "main-menu";
}

function paletteFor(style: string): Palette {
  const s = style.toLowerCase();
  if (s.includes("light") || s.includes("minimal")) {
    return { bg: "#f3f7ff", panel: "#ffffff", panel2: "#e6edf8", accent: "#3b82f6", accent2: "#06b6d4", text: "#0f172a", muted: "#516075" };
  }
  if (s.includes("cartoon") || s.includes("cute")) {
    return { bg: "#fff1f7", panel: "#ffe0ef", panel2: "#ffffff", accent: "#ff5fa2", accent2: "#ffb347", text: "#36172b", muted: "#73475f" };
  }
  if (s.includes("premium") || s.includes("vip")) {
    return { bg: "#07070b", panel: "#17131d", panel2: "#231a2d", accent: "#d4af37", accent2: "#8b5cf6", text: "#fff7df", muted: "#c7b98a" };
  }
  if (s.includes("horror")) {
    return { bg: "#070707", panel: "#151515", panel2: "#202020", accent: "#cc0000", accent2: "#737373", text: "#f5f5f5", muted: "#b8b8b8" };
  }
  if (s.includes("rpg") || s.includes("fantasy")) {
    return { bg: "#15082e", panel: "#251047", panel2: "#34185d", accent: "#c084fc", accent2: "#facc15", text: "#fff7ed", muted: "#d8c8ff" };
  }
  if (s.includes("sci") || s.includes("futur") || s.includes("neon")) {
    return { bg: "#050a1d", panel: "#111b48", panel2: "#1c2a62", accent: "#38f2ff", accent2: "#a855f7", text: "#f8fafc", muted: "#a9c6ff" };
  }
  return { bg: "#080817", panel: "#171735", panel2: "#22244f", accent: "#6d5dfc", accent2: "#2dd4bf", text: "#ffffff", muted: "#b7c2e8" };
}

function frame(name: string, x: number, y: number, w: number, h: number, fill: string, radius = 22, opacity = 1): UiBox {
  return { kind: "frame", name, x, y, w, h, fill, radius, opacity };
}

function text(name: string, value: string, x: number, y: number, w: number, h: number, color: string, fontSize = 28, bold = false): UiBox {
  return { kind: "text", name, text: value, x, y, w, h, textColor: color, fontSize, bold };
}

function button(name: string, value: string, x: number, y: number, w: number, h: number, fill: string, radius = 16): UiBox {
  return { kind: "button", name, text: value, x, y, w, h, fill, radius, textColor: "#ffffff", bold: true, fontSize: 20 };
}

function bar(name: string, label: string, x: number, y: number, w: number, h: number, progress: number, fill: string): UiBox {
  return { kind: "bar", name, text: label, x, y, w, h, progress, fill, radius: h / 2 };
}

export function createRobloxUiBlueprint(prompt: string, style: string): UiBlueprint {
  const kind = inferKind(prompt);
  const palette = paletteFor(style);
  const title = safeText(prompt, kind === "hud" ? 44 : 46);
  const subtitle = `${style || "Modern"} Roblox ${kind.replace("-", " ")}`;
  const boxes: UiBox[] = [];

  boxes.push(frame("Background", 0, 0, WIDTH, HEIGHT, palette.bg, 0));
  boxes.push(frame("MainPanel", 150, 96, 1236, 780, palette.panel, 34, 0.96));
  boxes.push(frame("AccentOrbA", 1040, 70, 330, 330, palette.accent, 999, 0.2));
  boxes.push(frame("AccentOrbB", 180, 660, 260, 260, palette.accent2, 999, 0.16));
  boxes.push(frame("Header", 250, 155, 1036, 112, palette.panel2, 24, 0.92));
  boxes.push(text("Title", title, 290, 184, 720, 44, palette.text, 34, true));
  boxes.push(text("Subtitle", subtitle, 292, 230, 610, 28, palette.muted, 19));

  if (kind === "loading") {
    boxes.push(text("LoadingTitle", "Loading World", 468, 378, 600, 70, palette.text, 54, true));
    boxes.push(text("Tip", "Preparing scripts, UI, assets, and Roblox systems", 406, 456, 730, 34, palette.muted, 24));
    boxes.push(frame("ProgressBack", 400, 548, 736, 34, "#000000", 18, 0.32));
    boxes.push(bar("Progress", "78%", 400, 548, 736, 34, 0.78, palette.accent));
    boxes.push(button("SkipButton", "SKIP", 646, 640, 244, 58, palette.accent2));
  } else if (kind === "hud") {
    boxes.push(button("PlayButton", "PLAY", 1070, 184, 150, 52, palette.accent));
    boxes.push(frame("Sidebar", 250, 335, 270, 360, palette.panel2, 22, 0.86));
    boxes.push(text("MenuLabel", "Menu", 292, 370, 160, 34, palette.text, 25, true));
    ["Overview", "Play", "Settings", "Inventory"].forEach((label, i) => {
      boxes.push(button(`${label}Button`, label, 292, 432 + i * 68, 180, 42, i === 0 ? palette.accent : palette.panel, 13));
    });
    boxes.push(frame("StatsPanel", 560, 332, 650, 364, palette.panel2, 22, 0.82));
    [["HEALTH", 0.68], ["MANA", 0.84], ["STAMINA", 0.78], ["XP", 0.58]].forEach(([label, amount], i) => {
      boxes.push(bar(`${label}Bar`, String(label), 610, 380 + i * 72, 500, 28, Number(amount), i === 3 ? palette.accent2 : palette.accent));
    });
    boxes.push(frame("Hotbar", 604, 735, 440, 68, palette.panel2, 18, 0.86));
    ["1", "2", "3", "4", "5"].forEach((label, i) => boxes.push(button(`Slot${label}`, label, 626 + i * 82, 748, 54, 42, palette.panel)));
  } else {
    const primary = kind === "shop" ? "BUY" : kind === "inventory" ? "EQUIP" : kind === "settings" ? "SAVE" : "PLAY";
    boxes.push(button("PrimaryButton", primary, 1070, 184, 150, 52, palette.accent));
    boxes.push(frame("LeftNav", 250, 330, 250, 420, palette.panel2, 22, 0.86));
    boxes.push(text("NavTitle", kind === "shop" ? "Store" : kind === "inventory" ? "Bag" : kind === "settings" ? "Settings" : "Menu", 292, 370, 170, 34, palette.text, 25, true));
    ["Overview", kind === "shop" ? "Featured" : "Play", "Settings", kind === "inventory" ? "Equip" : "Inventory"].forEach((label, i) => {
      boxes.push(button(`${label}Button`, label, 292, 432 + i * 68, 170, 42, i === 0 ? palette.accent : palette.panel, 13));
    });
    boxes.push(frame("ContentPanel", 542, 330, 700, 420, palette.panel2, 24, 0.82));
    const labels = kind === "shop"
      ? ["VIP Pass", "2x Coins", "Pet Egg", "Speed", "Magic", "Boost"]
      : kind === "inventory"
        ? ["Sword", "Pet", "Potion", "Gem", "Key", "Cape"]
        : kind === "settings"
          ? ["Audio", "Graphics", "Controls", "Mobile", "Camera", "Privacy"]
          : ["Play", "Shop", "Inventory", "Settings", "Quests", "Rewards"];
    labels.forEach((label, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 590 + col * 205;
      const y = 378 + row * 160;
      boxes.push(frame(`${label}Card`, x, y, 160, 126, palette.panel, 18, 0.9));
      boxes.push(frame(`${label}Icon`, x + 18, y + 18, 48, 48, i % 2 === 0 ? palette.accent : palette.accent2, 14, 1));
      boxes.push(text(`${label}Text`, label, x + 18, y + 82, 128, 26, palette.text, 18, true));
    });
  }

  boxes.push(text("Footer", "Exact generated preview: BloxSmith builds this same layout as real ScreenGui objects.", 250, 830, 850, 26, palette.muted, 17));
  return { prompt, style, title, subtitle, kind, palette, boxes };
}

export function renderRobloxUiBlueprintSvg(blueprint: UiBlueprint) {
  const p = blueprint.palette;
  const elements = blueprint.boxes.map((box) => {
    if (box.kind === "text") {
      return `<text x="${box.x}" y="${box.y + (box.fontSize || 24)}" font-family="Gotham, Inter, Arial" font-size="${box.fontSize || 24}" font-weight="${box.bold ? 900 : 500}" fill="${box.textColor || p.text}">${safeText(box.text || "", 80)}</text>`;
    }
    if (box.kind === "bar") {
      const fillWidth = Math.max(0, Math.min(1, box.progress || 0)) * box.w;
      return `<g><text x="${box.x}" y="${box.y - 10}" font-family="Gotham, Inter, Arial" font-size="20" font-weight="900" fill="${p.text}">${safeText(box.text || "", 24)}</text><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.radius}" fill="#000" opacity=".34"/><rect x="${box.x}" y="${box.y}" width="${fillWidth}" height="${box.h}" rx="${box.radius}" fill="url(#accent)"/></g>`;
    }
    const opacity = box.opacity ?? 1;
    return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.radius || 0}" fill="${box.fill || p.panel}" opacity="${opacity}" stroke="#ffffff" stroke-opacity="${box.name === "Background" ? 0 : 0.12}"/>${box.kind === "button" ? `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2 + 7}" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="${box.fontSize || 18}" font-weight="900" fill="${box.textColor || "#fff"}">${safeText(box.text || "", 20)}</text>` : ""}`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="accent" x1="0" x2="1"><stop stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent2}"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity=".35"/></filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${p.bg}"/>
  <g filter="url(#shadow)">${elements}</g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function renderRobloxUiBlueprintLuau(blueprint: UiBlueprint) {
  const p = blueprint.palette;
  return `-- BloxSmith exact UI preview script
-- The preview image is rendered from the same blueprint table used below.
-- Paste into StarterPlayer > StarterPlayerScripts as a LocalScript.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local existing = playerGui:FindFirstChild("BloxSmithExactUI")
if existing then existing:Destroy() end

local W, H = ${WIDTH}, ${HEIGHT}
local palette = {
  bg = ${luaColor(p.bg)},
  panel = ${luaColor(p.panel)},
  panel2 = ${luaColor(p.panel2)},
  accent = ${luaColor(p.accent)},
  accent2 = ${luaColor(p.accent2)},
  text = ${luaColor(p.text)},
  muted = ${luaColor(p.muted)},
}
local boxes = ${luaValue(blueprint.boxes)}

local function hexColor(hex)
  hex = string.gsub(hex or "#ffffff", "#", "")
  return Color3.fromRGB(tonumber(string.sub(hex, 1, 2), 16), tonumber(string.sub(hex, 3, 4), 16), tonumber(string.sub(hex, 5, 6), 16))
end

local function make(className, props, parent)
  local inst = Instance.new(className)
  for key, value in pairs(props or {}) do inst[key] = value end
  inst.Parent = parent
  return inst
end

local function scaledRect(box)
  return UDim2.fromScale(box.x / W, box.y / H), UDim2.fromScale(box.w / W, box.h / H)
end

local function addCorner(parent, radius)
  return make("UICorner", { CornerRadius = UDim.new(0, radius or 12) }, parent)
end

local function addStroke(parent)
  return make("UIStroke", { Color = Color3.fromRGB(255, 255, 255), Transparency = 0.88, Thickness = 1 }, parent)
end

local function addButtonMotion(button)
  local scale = make("UIScale", { Scale = 1 }, button)
  button.MouseEnter:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1.045 }):Play()
  end)
  button.MouseLeave:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1 }):Play()
  end)
  button.MouseButton1Down:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.08), { Scale = 0.97 }):Play()
  end)
  button.MouseButton1Up:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.1), { Scale = 1.045 }):Play()
  end)
  button.MouseButton1Click:Connect(function()
    print("[BloxSmith UI] " .. button.Name .. " clicked")
  end)
end

local gui = make("ScreenGui", {
  Name = "BloxSmithExactUI",
  IgnoreGuiInset = true,
  ResetOnSpawn = false,
  ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, playerGui)

local root = make("Frame", {
  Name = "Root",
  BackgroundColor3 = palette.bg,
  BorderSizePixel = 0,
  Size = UDim2.fromScale(1, 1),
}, gui)

make("UIScale", { Scale = 1 }, root)

for _, box in ipairs(boxes) do
  if box.name ~= "Background" then
    local pos, size = scaledRect(box)
    if box.kind == "text" then
      make("TextLabel", {
        Name = box.name,
        BackgroundTransparency = 1,
        Font = box.bold and Enum.Font.GothamBlack or Enum.Font.Gotham,
        Position = pos,
        Size = size,
        Text = box.text or "",
        TextColor3 = box.textColor and hexColor(box.textColor) or palette.text,
        TextScaled = true,
        TextWrapped = true,
        TextXAlignment = Enum.TextXAlignment.Left,
        TextYAlignment = Enum.TextYAlignment.Center,
      }, root)
    elseif box.kind == "bar" then
      make("TextLabel", {
        Name = box.name .. "Label",
        BackgroundTransparency = 1,
        Font = Enum.Font.GothamBlack,
        Position = UDim2.fromScale(box.x / W, (box.y - 34) / H),
        Size = UDim2.fromScale(box.w / W, 26 / H),
        Text = box.text or "",
        TextColor3 = palette.text,
        TextScaled = true,
        TextXAlignment = Enum.TextXAlignment.Left,
      }, root)
      local back = make("Frame", {
        Name = box.name .. "Back",
        BackgroundColor3 = Color3.fromRGB(0, 0, 0),
        BackgroundTransparency = 0.34,
        BorderSizePixel = 0,
        Position = pos,
        Size = size,
      }, root)
      addCorner(back, box.radius or 14)
      local fill = make("Frame", {
        Name = box.name,
        BackgroundColor3 = box.fill and hexColor(box.fill) or palette.accent,
        BorderSizePixel = 0,
        Position = pos,
        Size = UDim2.fromScale((box.w * (box.progress or 0.5)) / W, box.h / H),
      }, root)
      addCorner(fill, box.radius or 14)
      make("UIGradient", { Color = ColorSequence.new(palette.accent, palette.accent2) }, fill)
    else
      local inst = make(box.kind == "button" and "TextButton" or "Frame", {
        Name = box.name,
        AutoButtonColor = false,
        BackgroundColor3 = box.fill and hexColor(box.fill) or palette.panel,
        BackgroundTransparency = math.max(0, math.min(1, 1 - (box.opacity or 1))),
        BorderSizePixel = 0,
        Font = Enum.Font.GothamBlack,
        Position = pos,
        Size = size,
        Text = box.kind == "button" and (box.text or box.name) or "",
        TextColor3 = Color3.fromRGB(255, 255, 255),
        TextScaled = box.kind == "button",
      }, root)
      addCorner(inst, box.radius or 12)
      addStroke(inst)
      if box.kind == "button" then
        addButtonMotion(inst)
        if box.name == "PrimaryButton" or box.name == "PlayButton" then
          make("UIGradient", { Color = ColorSequence.new(palette.accent, palette.accent2) }, inst)
        end
      end
    end
  end
end

root.BackgroundTransparency = 1
TweenService:Create(root, TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { BackgroundTransparency = 0 }):Play()
`;
}
