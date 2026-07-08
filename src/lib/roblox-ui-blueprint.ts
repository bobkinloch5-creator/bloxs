type UiKind = "main-menu" | "hud" | "shop" | "inventory" | "loading" | "settings";

type Palette = {
  bg: string;
  bg2: string;
  panel: string;
  panel2: string;
  card: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  good: string;
  warn: string;
  danger: string;
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
  stroke?: string;
  strokeOpacity?: number;
  gradient?: boolean;
  z?: number;
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

export function paletteFor(style: string): Palette {
  const s = style.toLowerCase();
  if (s.includes("light") || s.includes("minimal")) {
    return { bg: "#f3f7ff", bg2: "#dbeafe", panel: "#ffffff", panel2: "#e6edf8", card: "#f8fbff", accent: "#3b82f6", accent2: "#06b6d4", text: "#0f172a", muted: "#516075", good: "#16a34a", warn: "#f59e0b", danger: "#ef4444" };
  }
  if (s.includes("cartoon") || s.includes("cute")) {
    return { bg: "#fff1f7", bg2: "#fff7cc", panel: "#ffe0ef", panel2: "#ffffff", card: "#fff8fb", accent: "#ff5fa2", accent2: "#ffb347", text: "#36172b", muted: "#73475f", good: "#38d9a9", warn: "#ffb347", danger: "#ff4f4f" };
  }
  if (s.includes("premium") || s.includes("vip") || s.includes("luxur")) {
    return { bg: "#07070b", bg2: "#17131d", panel: "#121018", panel2: "#231a2d", card: "#1b1726", accent: "#d4af37", accent2: "#8b5cf6", text: "#fff7df", muted: "#c7b98a", good: "#22c55e", warn: "#d4af37", danger: "#ef4444" };
  }
  if (s.includes("horror")) {
    return { bg: "#070707", bg2: "#170808", panel: "#151515", panel2: "#202020", card: "#111111", accent: "#cc0000", accent2: "#737373", text: "#f5f5f5", muted: "#b8b8b8", good: "#16a34a", warn: "#b45309", danger: "#cc0000" };
  }
  if (s.includes("rpg") || s.includes("fantasy")) {
    return { bg: "#15082e", bg2: "#241047", panel: "#21103d", panel2: "#34185d", card: "#2c1650", accent: "#c084fc", accent2: "#facc15", text: "#fff7ed", muted: "#d8c8ff", good: "#34d399", warn: "#facc15", danger: "#fb7185" };
  }
  if (s.includes("neon")) {
    return { bg: "#04040a", bg2: "#0a0620", panel: "#0d0925", panel2: "#150e38", card: "#100c2f", accent: "#00ffa3", accent2: "#ff2ecc", text: "#eafffb", muted: "#8fb7ff", good: "#00ffa3", warn: "#ffe83d", danger: "#ff3d6b" };
  }
  if (s.includes("sci") || s.includes("futur")) {
    return { bg: "#050a1d", bg2: "#0a1640", panel: "#0f1a46", panel2: "#1c2a62", card: "#13215a", accent: "#38f2ff", accent2: "#a855f7", text: "#f8fafc", muted: "#a9c6ff", good: "#2dd4bf", warn: "#facc15", danger: "#fb7185" };
  }
  if (s.includes("anime")) {
    return { bg: "#0f0f2d", bg2: "#22103d", panel: "#181543", panel2: "#2a1a5c", card: "#1e1852", accent: "#ff6ec7", accent2: "#7cf9ff", text: "#ffffff", muted: "#c9b9ff", good: "#5cf7c2", warn: "#ffd166", danger: "#ff5c8a" };
  }
  if (s.includes("pirate") || s.includes("nautic")) {
    return { bg: "#0b2624", bg2: "#123634", panel: "#153d3a", panel2: "#1e5450", card: "#194742", accent: "#e0b060", accent2: "#7a4f2f", text: "#f5e6c8", muted: "#c7b98a", good: "#4ecdc4", warn: "#e0b060", danger: "#c0392b" };
  }
  if (s.includes("retro") || s.includes("arcade") || s.includes("80")) {
    return { bg: "#160b2e", bg2: "#2a1152", panel: "#1f1043", panel2: "#31165e", card: "#25124b", accent: "#ff3ea5", accent2: "#00e0ff", text: "#ffffff", muted: "#c8a9ff", good: "#7cf7a3", warn: "#ffd23f", danger: "#ff5470" };
  }
  if (s.includes("simulator") || s.includes("obby")) {
    return { bg: "#0b0f24", bg2: "#101636", panel: "#141c3e", panel2: "#1e2856", card: "#182148", accent: "#00ffaa", accent2: "#ff6b00", text: "#ffffff", muted: "#a8b8e0", good: "#00ffaa", warn: "#ffb84d", danger: "#ff5c5c" };
  }
  if (s.includes("modern")) {
    return { bg: "#0a0f1c", bg2: "#111a30", panel: "#141d33", panel2: "#1c2949", card: "#18223c", accent: "#5b8def", accent2: "#22d3ee", text: "#f8fafc", muted: "#94a3b8", good: "#34d399", warn: "#fbbf24", danger: "#f87171" };
  }
  // Dark / default
  return { bg: "#080817", bg2: "#11142b", panel: "#151735", panel2: "#22244f", card: "#1c2048", accent: "#6d5dfc", accent2: "#2dd4bf", text: "#ffffff", muted: "#b7c2e8", good: "#2dd4bf", warn: "#facc15", danger: "#fb7185" };
}

function frame(name: string, x: number, y: number, w: number, h: number, fill: string, radius = 22, opacity = 1, extra: Partial<UiBox> = {}): UiBox {
  return { kind: "frame", name, x, y, w, h, fill, radius, opacity, ...extra };
}

function text(name: string, value: string, x: number, y: number, w: number, h: number, color: string, fontSize = 28, bold = false, extra: Partial<UiBox> = {}): UiBox {
  return { kind: "text", name, text: value, x, y, w, h, textColor: color, fontSize, bold, ...extra };
}

function button(name: string, value: string, x: number, y: number, w: number, h: number, fill: string, radius = 16, extra: Partial<UiBox> = {}): UiBox {
  return { kind: "button", name, text: value, x, y, w, h, fill, radius, textColor: "#ffffff", bold: true, fontSize: 20, stroke: "#ffffff", strokeOpacity: 0.78, ...extra };
}

function bar(name: string, label: string, x: number, y: number, w: number, h: number, progress: number, fill: string, extra: Partial<UiBox> = {}): UiBox {
  return { kind: "bar", name, text: label, x, y, w, h, progress, fill, radius: h / 2, gradient: true, ...extra };
}

function stableSeed(value: string) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

export function createRobloxUiBlueprint(prompt: string, style: string): UiBlueprint {
  const kind = inferKind(prompt);
  const palette = paletteFor(style);
  const title = safeText(prompt, kind === "hud" ? 44 : 46);
  const subtitle = `${style || "Modern"} Roblox ${kind.replace("-", " ")}`;
  const seed = stableSeed(`${prompt}|${style}|${new Date().toISOString().slice(0, 13)}`);
  const boxes: UiBox[] = [];

  boxes.push(frame("Background", 0, 0, WIDTH, HEIGHT, palette.bg, 0));
  boxes.push(frame("BackGlowTop", 1010, -110, 440, 440, palette.accent, 999, 0.16));
  boxes.push(frame("BackGlowBottom", -90, 710, 360, 360, palette.accent2, 999, 0.12));
  boxes.push(frame("MainPanel", 136, 84, 1264, 812, palette.panel, 30, 0.96, { stroke: palette.accent, strokeOpacity: 0.62 }));
  boxes.push(frame("TopRail", 184, 126, 1168, 86, palette.panel2, 22, 0.9, { stroke: "#ffffff", strokeOpacity: 0.84 }));
  boxes.push(frame("LogoMark", 224, 150, 38, 38, palette.accent, 12, 1, { gradient: true }));
  boxes.push(text("Title", title, 282, 142, 720, 40, palette.text, 31, true));
  boxes.push(text("Subtitle", subtitle, 284, 181, 610, 26, palette.muted, 17));
  boxes.push(frame("StatusPill", 1066, 148, 120, 40, palette.card, 18, 0.94, { stroke: palette.good, strokeOpacity: 0.65 }));
  boxes.push(text("StatusText", "READY", 1095, 156, 80, 22, palette.good, 14, true));

  if (kind === "loading") {
    const variant = seed % 4;
    const titleText = /city|town/i.test(prompt) ? "Loading City" : /rpg|quest|dungeon/i.test(prompt) ? "Loading Quest" : /race|car/i.test(prompt) ? "Loading Race" : /horror/i.test(prompt) ? "Entering the Dark" : "Loading World";
    const tipText = /toolbox|asset|model/i.test(prompt)
      ? "Verifying safe free Toolbox assets..."
      : /ui|menu|screen/i.test(prompt)
        ? "Animating panels and buttons..."
        : "Preparing scripts, UI, assets, and Roblox systems";
    if (variant === 0) {
      boxes.push(frame("LoadingCard", 330, 318, 876, 368, palette.panel2, 28, 0.9, { stroke: palette.accent, strokeOpacity: 0.6 }));
      boxes.push(frame("LoadingIcon", 700, 244, 136, 136, palette.accent, 28, 1, { gradient: true }));
      boxes.push(text("LoadingTitle", titleText, 468, 390, 600, 62, palette.text, 52, true));
      boxes.push(text("Tip", tipText, 416, 462, 704, 34, palette.muted, 23));
      boxes.push(frame("ProgressBack", 400, 548, 736, 34, "#000000", 18, 0.32));
      boxes.push(bar("Progress", "78%", 400, 548, 736, 34, 0.78, palette.accent));
      boxes.push(button("SkipButton", "SKIP", 646, 626, 244, 58, palette.accent2, 18, { gradient: true }));
      boxes.push(text("LoadingSmall", "Streaming assets safely...", 612, 712, 310, 26, palette.muted, 17));
    } else if (variant === 1) {
      boxes.push(frame("LeftHero", 250, 280, 420, 430, palette.panel2, 30, 0.92, { stroke: palette.accent2, strokeOpacity: 0.62 }));
      boxes.push(frame("HeroOrb", 360, 360, 198, 198, palette.accent, 999, 0.9, { gradient: true }));
      boxes.push(frame("RightLoadPanel", 720, 300, 556, 378, palette.card, 26, 0.94, { stroke: palette.accent, strokeOpacity: 0.62 }));
      boxes.push(text("LoadingTitle", titleText, 770, 352, 420, 58, palette.text, 50, true));
      boxes.push(text("Tip", tipText, 772, 430, 380, 32, palette.muted, 21));
      boxes.push(frame("ProgressBack", 770, 540, 420, 30, "#000000", 16, 0.3));
      boxes.push(bar("Progress", "64%", 770, 540, 420, 30, 0.64, palette.accent2));
      boxes.push(button("SkipButton", "CONTINUE", 770, 604, 220, 54, palette.accent, 16, { gradient: true }));
    } else if (variant === 2) {
      boxes.push(frame("LoadingStrip", 232, 334, 1072, 146, palette.panel2, 28, 0.92, { stroke: palette.accent, strokeOpacity: 0.58 }));
      boxes.push(text("LoadingTitle", titleText, 292, 382, 560, 52, palette.text, 46, true));
      boxes.push(frame("PulseOne", 940, 374, 72, 72, palette.accent, 999, 0.9, { gradient: true }));
      boxes.push(frame("PulseTwo", 1034, 374, 72, 72, palette.accent2, 999, 0.9, { gradient: true }));
      boxes.push(frame("PulseThree", 1128, 374, 72, 72, palette.good, 999, 0.9));
      boxes.push(text("Tip", tipText, 296, 526, 740, 34, palette.muted, 23));
      boxes.push(frame("ProgressBack", 292, 610, 952, 38, "#000000", 19, 0.32));
      boxes.push(bar("Progress", "91%", 292, 610, 952, 38, 0.91, palette.accent));
    } else {
      boxes.push(frame("CenterBadge", 634, 246, 268, 268, palette.accent, 42, 1, { gradient: true }));
      boxes.push(frame("LoadingCard", 392, 470, 752, 268, palette.panel2, 30, 0.9, { stroke: palette.accent2, strokeOpacity: 0.66 }));
      boxes.push(text("LoadingTitle", titleText, 492, 522, 552, 58, palette.text, 50, true));
      boxes.push(text("Tip", tipText, 492, 596, 548, 32, palette.muted, 21));
      boxes.push(frame("ProgressBack", 492, 658, 452, 30, "#000000", 16, 0.34));
      boxes.push(bar("Progress", "72%", 492, 658, 452, 30, 0.72, palette.accent2));
      boxes.push(button("SkipButton", "PLAY SOON", 964, 646, 138, 54, palette.accent, 16, { gradient: true }));
    }
  } else if (kind === "hud") {
    boxes.push(button("PlayButton", "PLAY", 1210, 144, 110, 48, palette.accent, 16, { gradient: true }));
    boxes.push(frame("CoinPill", 222, 248, 230, 58, palette.card, 20, 0.94, { stroke: palette.warn, strokeOpacity: 0.55 }));
    boxes.push(text("CoinText", "Coins  12,450", 252, 263, 170, 26, palette.warn, 20, true));
    boxes.push(frame("Sidebar", 228, 346, 270, 354, palette.panel2, 22, 0.86, { stroke: "#ffffff", strokeOpacity: 0.86 }));
    boxes.push(text("MenuLabel", "Quick Menu", 270, 376, 180, 32, palette.text, 24, true));
    ["Overview", "Play", "Settings", "Inventory"].forEach((label, i) => {
      boxes.push(button(`${label}Button`, label, 270, 430 + i * 62, 184, 42, i === 0 ? palette.accent : palette.card, 13, { gradient: i === 0 }));
    });
    boxes.push(frame("StatsPanel", 558, 308, 700, 390, palette.panel2, 24, 0.84, { stroke: palette.accent, strokeOpacity: 0.72 }));
    [["HEALTH", 0.68, palette.danger], ["MANA", 0.84, palette.accent], ["STAMINA", 0.78, palette.good], ["XP", 0.58, palette.accent2]].forEach(([label, amount, color], i) => {
      boxes.push(bar(`${label}Bar`, String(label), 620, 374 + i * 72, 520, 28, Number(amount), String(color)));
    });
    boxes.push(frame("Hotbar", 540, 738, 560, 80, palette.panel2, 22, 0.9, { stroke: "#ffffff", strokeOpacity: 0.86 }));
    ["1", "2", "3", "4", "5", "6"].forEach((label, i) => boxes.push(button(`Slot${label}`, label, 568 + i * 86, 754, 58, 48, i === 0 ? palette.accent : palette.card, 14, { gradient: i === 0 })));
  } else {
    const primary = kind === "shop" ? "BUY" : kind === "inventory" ? "EQUIP" : kind === "settings" ? "SAVE" : "PLAY";
    boxes.push(button("PrimaryButton", primary, 1210, 144, 110, 48, palette.accent, 16, { gradient: true }));
    boxes.push(frame("LeftNav", 222, 286, 268, 482, palette.panel2, 24, 0.9, { stroke: "#ffffff", strokeOpacity: 0.86 }));
    boxes.push(text("NavTitle", kind === "shop" ? "Creator Store" : kind === "inventory" ? "Inventory" : kind === "settings" ? "Settings" : "Main Menu", 262, 324, 190, 34, palette.text, 25, true));
    ["Overview", kind === "shop" ? "Featured" : "Play", "Settings", kind === "inventory" ? "Equip" : "Inventory"].forEach((label, i) => {
      boxes.push(button(`${label}Button`, label, 262, 390 + i * 70, 180, 46, i === 0 ? palette.accent : palette.card, 14, { gradient: i === 0 }));
    });
    boxes.push(frame("ContentPanel", 528, 286, 774, 482, palette.panel2, 26, 0.86, { stroke: palette.accent, strokeOpacity: 0.74 }));
    boxes.push(text("ContentTitle", kind === "shop" ? "Featured Items" : kind === "inventory" ? "Equipped Loadout" : kind === "settings" ? "Game Preferences" : "Choose Mode", 570, 326, 420, 34, palette.text, 25, true));
    if (kind === "shop") {
      boxes.push(frame("CurrencyPill", 1054, 322, 184, 42, palette.card, 16, 0.94, { stroke: palette.warn, strokeOpacity: 0.58 }));
      boxes.push(text("CurrencyText", "Coins 12,450", 1080, 332, 134, 20, palette.warn, 16, true));
    }
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
      const x = 578 + col * 220;
      const y = 392 + row * 164;
      boxes.push(frame(`${label}Card`, x, y, 178, 132, palette.card, 20, 0.94, { stroke: i % 2 === 0 ? palette.accent : palette.accent2, strokeOpacity: 0.66 }));
      boxes.push(frame(`${label}Icon`, x + 18, y + 18, 52, 52, i % 2 === 0 ? palette.accent : palette.accent2, 15, 1, { gradient: true }));
      boxes.push(text(`${label}Text`, label, x + 18, y + 84, 138, 25, palette.text, 18, true));
      boxes.push(text(`${label}Meta`, kind === "settings" ? "Tap to edit" : kind === "shop" ? "Robux-ready" : "Owned", x + 18, y + 108, 134, 18, palette.muted, 13));
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
      return `<g><text x="${box.x}" y="${box.y - 10}" font-family="Gotham, Inter, Arial" font-size="20" font-weight="900" fill="${p.text}">${safeText(box.text || "", 24)}</text><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.radius}" fill="#000" opacity=".34"/><rect x="${box.x}" y="${box.y}" width="${fillWidth}" height="${box.h}" rx="${box.radius}" fill="${box.gradient ? "url(#accent)" : box.fill || p.accent}"/></g>`;
    }
    const opacity = box.opacity ?? 1;
    const stroke = box.stroke || "#ffffff";
    const strokeOpacity = box.name === "Background" ? 0 : (box.strokeOpacity ?? 0.82);
    const fill = box.gradient ? "url(#accent)" : box.fill || p.panel;
    return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.radius || 0}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" filter="${box.name === "Background" ? "" : "url(#softShadow)"}"/>${box.kind === "button" ? `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2 + 7}" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="${box.fontSize || 18}" font-weight="900" fill="${box.textColor || "#fff"}">${safeText(box.text || "", 20)}</text>` : ""}`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgGradient" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
    <linearGradient id="accent" x1="0" x2="1"><stop stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent2}"/></linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M 64 0 L 0 0 0 64" fill="none" stroke="#ffffff" stroke-opacity=".04" stroke-width="1"/></pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity=".35"/></filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".18"/></filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGradient)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
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
  bg2 = ${luaColor(p.bg2)},
  panel = ${luaColor(p.panel)},
  panel2 = ${luaColor(p.panel2)},
  card = ${luaColor(p.card)},
  accent = ${luaColor(p.accent)},
  accent2 = ${luaColor(p.accent2)},
  text = ${luaColor(p.text)},
  muted = ${luaColor(p.muted)},
  good = ${luaColor(p.good)},
  warn = ${luaColor(p.warn)},
  danger = ${luaColor(p.danger)},
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

local function addStroke(parent, color, opacity, thickness)
  return make("UIStroke", {
    Color = color or Color3.fromRGB(255, 255, 255),
    Transparency = math.max(0, math.min(1, opacity or 0.82)),
    Thickness = thickness or 1,
  }, parent)
end

local function addGradient(parent)
  local gradient = make("UIGradient", {
    Color = ColorSequence.new(palette.accent, palette.accent2),
    Rotation = 0,
  }, parent)
  TweenService:Create(gradient, TweenInfo.new(3.8, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { Rotation = 18 }):Play()
  return gradient
end

local function addButtonMotion(button)
  local scale = make("UIScale", { Scale = 1 }, button)
  local base = button.BackgroundColor3
  button.MouseEnter:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1.045 }):Play()
    TweenService:Create(button, TweenInfo.new(0.14), { BackgroundColor3 = base:Lerp(Color3.new(1, 1, 1), 0.1) }):Play()
  end)
  button.MouseLeave:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1 }):Play()
    TweenService:Create(button, TweenInfo.new(0.14), { BackgroundColor3 = base }):Play()
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
  DisplayOrder = 10,
  ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
  AutoLocalize = false,
}, playerGui)

local root = make("Frame", {
  Name = "Root",
  BackgroundColor3 = palette.bg,
  BorderSizePixel = 0,
  Size = UDim2.fromScale(1, 1),
}, gui)

make("UIScale", { Scale = 1 }, root)
make("UIGradient", {
  Color = ColorSequence.new(palette.bg, palette.bg2),
  Rotation = 35,
}, root)

local built = {}

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
      local fillSize = UDim2.fromScale((box.w * (box.progress or 0.5)) / W, box.h / H)
      local fill = make("Frame", {
        Name = box.name,
        BackgroundColor3 = box.fill and hexColor(box.fill) or palette.accent,
        BorderSizePixel = 0,
        Position = pos,
        Size = UDim2.fromScale(0, box.h / H),
      }, root)
      addCorner(fill, box.radius or 14)
      if box.gradient then addGradient(fill) end
      TweenService:Create(fill, TweenInfo.new(0.75, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), { Size = fillSize }):Play()
    else
      local props = {
        Name = box.name,
        BackgroundColor3 = box.fill and hexColor(box.fill) or palette.panel,
        BackgroundTransparency = math.max(0, math.min(1, 1 - (box.opacity or 1))),
        BorderSizePixel = 0,
        Position = pos,
        Size = size,
      }
      if box.kind == "button" then
        props.AutoButtonColor = false
        props.Font = Enum.Font.GothamBlack
        props.Text = box.text or box.name
        props.TextColor3 = Color3.fromRGB(255, 255, 255)
        props.TextScaled = true
      end
      local inst = make(box.kind == "button" and "TextButton" or "Frame", props, root)
      addCorner(inst, box.radius or 12)
      addStroke(inst, box.stroke and hexColor(box.stroke) or Color3.fromRGB(255, 255, 255), box.strokeOpacity or 0.86, box.kind == "button" and 1.5 or 1)
      if box.gradient then addGradient(inst) end
      local finalTransparency = inst.BackgroundTransparency
      table.insert(built, { inst = inst, finalPosition = pos, finalTransparency = finalTransparency })
      inst.Position = UDim2.fromScale(box.x / W, (box.y + 28) / H)
      inst.BackgroundTransparency = math.min(1, finalTransparency + 0.2)
      if box.kind == "button" then
        addButtonMotion(inst)
      end
    end
  end
end

root.BackgroundTransparency = 1
TweenService:Create(root, TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { BackgroundTransparency = 0 }):Play()
for index, item in ipairs(built) do
  task.delay(index * 0.018, function()
    if item.inst and item.inst.Parent then
      TweenService:Create(item.inst, TweenInfo.new(0.34, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
        Position = item.finalPosition,
        BackgroundTransparency = item.finalTransparency,
      }):Play()
    end
  end)
end
`;
}
