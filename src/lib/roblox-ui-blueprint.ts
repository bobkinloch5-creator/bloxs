// BloxSmith exact Roblox UI blueprint engine.
//
// A single node tree drives BOTH the website preview (SVG) and the generated
// Luau LocalScript. Both renderers use the same 1280x720 pixel canvas and the
// same pixel coordinates, so the preview on the site is what Roblox draws.
//
// In Roblox the whole UI is built inside one 1280x720 root Frame that is
// centered and scaled with a UIScale, so the layout stays identical on every
// screen size (desktop, tablet, phone) instead of stretching.

export const UI_CANVAS_WIDTH = 1280;
export const UI_CANVAS_HEIGHT = 720;

export type UiKind =
  | "main-menu"
  | "hud"
  | "shop"
  | "inventory"
  | "settings"
  | "loading"
  | "leaderboard"
  | "quests"
  | "pause"
  | "battlepass"
  | "crafting"
  | "dialog"
  | "trading";

export type Palette = {
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

export type UiNodeKind =
  | "frame"
  | "text"
  | "button"
  | "bar"
  | "icon"
  | "toggle"
  | "slider"
  | "divider"
  | "scrim";

export type UiNode = {
  kind: UiNodeKind;
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
  align?: "left" | "center" | "right";
  radius?: number;
  opacity?: number;
  progress?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  gradient?: boolean;
  glyph?: string;
  on?: boolean;
  shadow?: boolean;
};

export type UiBlueprint = {
  prompt: string;
  style: string;
  title: string;
  subtitle: string;
  kind: UiKind;
  kindLabel: string;
  transparentBackdrop: boolean;
  palette: Palette;
  nodes: UiNode[];
  layers: string[];
};

const W = UI_CANVAS_WIDTH;
const H = UI_CANVAS_HEIGHT;

const KIND_LABELS: Record<UiKind, string> = {
  "main-menu": "Main Menu",
  hud: "HUD",
  shop: "Shop",
  inventory: "Inventory",
  settings: "Settings",
  loading: "Loading Screen",
  leaderboard: "Leaderboard",
  quests: "Quests",
  pause: "Pause Menu",
  battlepass: "Battle Pass",
  crafting: "Crafting",
  dialog: "NPC Dialog",
  trading: "Trading",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeText(input: string, max = 52) {
  const cleaned = String(input || "").replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "BloxSmith UI";
  return cleaned.length > max ? cleaned.slice(0, max - 2).trimEnd() + ".." : cleaned;
}

function titleCase(input: string) {
  return input.replace(/(^|\s)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
}

function escapeXml(input: string) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Approximate Gotham advance width so preview text truncates the same way the
// generated TextLabels do (they use TextTruncate.AtEnd).
function fitText(value: string, width: number, fontSize: number, bold: boolean) {
  const perChar = fontSize * (bold ? 0.58 : 0.54);
  const maxChars = Math.max(1, Math.floor((width - 4) / perChar));
  const text = String(value || "");
  return text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 2)) + ".." : text;
}

function hexToRgb(hex: string) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luaColor(hex: string) {
  const c = hexToRgb(hex);
  return `Color3.fromRGB(${c.r}, ${c.g}, ${c.b})`;
}

function luaString(value: string) {
  return JSON.stringify(String(value ?? ""));
}

function luaValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return luaString(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `{ ${value.map(luaValue).join(", ")} }`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{ ${entries.map(([k, v]) => `${k} = ${luaValue(v)}`).join(", ")} }`;
  }
  return "nil";
}

// ---------------------------------------------------------------------------
// Screen detection
// ---------------------------------------------------------------------------

type KindRule = { kind: UiKind; patterns: RegExp[] };

const KIND_RULES: KindRule[] = [
  { kind: "loading", patterns: [/\bloading\b/i, /\bload(ing)? screen\b/i, /\bsplash\b/i, /\bpreload/i] },
  { kind: "pause", patterns: [/\bpause\b/i, /\bresume\b/i, /\bquit (menu|screen)\b/i] },
  { kind: "main-menu", patterns: [/\bmain menu\b/i, /\btitle screen\b/i, /\blobby menu\b/i, /\bstart screen\b/i, /\bplay \/ shop\b/i] },
  { kind: "battlepass", patterns: [/\bbattle ?pass\b/i, /\bseason pass\b/i, /\btier track\b/i, /\brewards? track\b/i] },
  { kind: "leaderboard", patterns: [/\bleaderboard\b/i, /\bleaderstats? board\b/i, /\branking\b/i, /\btop players\b/i, /\bpodium\b/i] },
  { kind: "quests", patterns: [/\bquest/i, /\bmission/i, /\bobjective/i, /\bdaily task/i, /\bachievement/i] },
  { kind: "crafting", patterns: [/\bcraft/i, /\brecipe/i, /\bforge\b/i, /\bsmelt/i, /\bworkbench\b/i] },
  { kind: "trading", patterns: [/\btrade\b/i, /\btrading\b/i, /\btrade window\b/i, /\boffer panel\b/i] },
  { kind: "dialog", patterns: [/\bdialog/i, /\bdialogue/i, /\bnpc (talk|chat|convers)/i, /\bconversation\b/i, /\bspeech box\b/i] },
  { kind: "settings", patterns: [/\bsettings\b/i, /\boptions menu\b/i, /\bgraphics\b/i, /\bvolume\b/i, /\bsensitivity\b/i, /\bkeybind/i] },
  { kind: "inventory", patterns: [/\binventory\b/i, /\bbackpack\b/i, /\bloadout\b/i, /\bitem grid\b/i, /\brarity\b/i, /\bequip\b/i] },
  { kind: "shop", patterns: [/\bshop\b/i, /\bstore\b/i, /\bmarket\b/i, /\bgamepass/i, /\bbuy\b/i, /\bpurchase\b/i, /\brobux\b/i, /\bdev products?\b/i] },
  { kind: "hud", patterns: [/\bhud\b/i, /\bhealth bar\b/i, /\bhotbar\b/i, /\bstamina\b/i, /\bmana\b/i, /\bxp bar\b/i, /\bcoin counter\b/i, /\bon-?screen\b/i, /\bcooldown/i] },
];

export function detectUiKind(prompt: string): UiKind {
  const text = String(prompt || "");
  let best: { kind: UiKind; score: number } = { kind: "main-menu", score: 0 };
  for (const rule of KIND_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text);
      if (!match) continue;
      score += 4;
      // The screen the user names first is the screen they are asking for.
      if (match.index <= 28) score += 6;
      else if (match.index <= 64) score += 2;
    }
    if (score > best.score) best = { kind: rule.kind, score };
  }
  return best.score > 0 ? best.kind : "main-menu";
}

export function paletteFor(style: string): Palette {
  const s = String(style || "").toLowerCase();
  if (s.includes("light") || s.includes("minimal")) {
    return { bg: "#f3f7ff", bg2: "#dbeafe", panel: "#ffffff", panel2: "#eef3fb", card: "#f8fbff", accent: "#3b82f6", accent2: "#06b6d4", text: "#0f172a", muted: "#516075", good: "#16a34a", warn: "#d97706", danger: "#ef4444" };
  }
  if (s.includes("cartoon") || s.includes("cute") || s.includes("simulator") || s.includes("obby")) {
    return { bg: "#0f142b", bg2: "#192348", panel: "#1c2957", panel2: "#273a78", card: "#213169", accent: "#ff3b75", accent2: "#00e5ff", text: "#ffffff", muted: "#a0b5f5", good: "#00e676", warn: "#ffc107", danger: "#ff3d00" };
  }
  if (s.includes("premium") || s.includes("vip") || s.includes("luxur")) {
    return { bg: "#07070b", bg2: "#17131d", panel: "#121018", panel2: "#1d1826", card: "#241d2f", accent: "#d4af37", accent2: "#8b5cf6", text: "#fff7df", muted: "#c7b98a", good: "#22c55e", warn: "#d4af37", danger: "#ef4444" };
  }
  if (s.includes("horror")) {
    return { bg: "#070707", bg2: "#170808", panel: "#111111", panel2: "#1a1a1a", card: "#202020", accent: "#cc0000", accent2: "#6b6b6b", text: "#f5f5f5", muted: "#a3a3a3", good: "#4d7c0f", warn: "#b45309", danger: "#cc0000" };
  }
  if (s.includes("rpg") || s.includes("fantasy")) {
    return { bg: "#15082e", bg2: "#241047", panel: "#21103d", panel2: "#2c1650", card: "#34185d", accent: "#c084fc", accent2: "#facc15", text: "#fff7ed", muted: "#d8c8ff", good: "#34d399", warn: "#facc15", danger: "#fb7185" };
  }
  if (s.includes("neon")) {
    return { bg: "#04040a", bg2: "#0a0620", panel: "#0d0925", panel2: "#130e33", card: "#191141", accent: "#00ffa3", accent2: "#ff2ecc", text: "#eafffb", muted: "#8fb7ff", good: "#00ffa3", warn: "#ffe83d", danger: "#ff3d6b" };
  }
  if (s.includes("sci") || s.includes("futur")) {
    return { bg: "#050a1d", bg2: "#0a1640", panel: "#0d1740", panel2: "#132155", card: "#1a2c6b", accent: "#38f2ff", accent2: "#a855f7", text: "#f8fafc", muted: "#a9c6ff", good: "#2dd4bf", warn: "#facc15", danger: "#fb7185" };
  }
  if (s.includes("anime")) {
    return { bg: "#0f0f2d", bg2: "#22103d", panel: "#181543", panel2: "#221a55", card: "#2d2170", accent: "#ff6ec7", accent2: "#7cf9ff", text: "#ffffff", muted: "#c9b9ff", good: "#5cf7c2", warn: "#ffd166", danger: "#ff5c8a" };
  }
  if (s.includes("pirate") || s.includes("nautic")) {
    return { bg: "#0b2624", bg2: "#123634", panel: "#153d3a", panel2: "#1b4a46", card: "#215a55", accent: "#e0b060", accent2: "#7a4f2f", text: "#f5e6c8", muted: "#c7b98a", good: "#4ecdc4", warn: "#e0b060", danger: "#c0392b" };
  }
  if (s.includes("retro") || s.includes("arcade")) {
    return { bg: "#160b2e", bg2: "#2a1152", panel: "#1f1043", panel2: "#28145a", card: "#351a70", accent: "#ff3ea5", accent2: "#00e0ff", text: "#ffffff", muted: "#c8a9ff", good: "#7cf7a3", warn: "#ffd23f", danger: "#ff5470" };
  }
  // Default: Saturated cheerful Roblox Game palette (Adopt Me / Pet Sim / Blox Fruits style)
  return { bg: "#0f142b", bg2: "#192348", panel: "#1c2957", panel2: "#273a78", card: "#213169", accent: "#ff3b75", accent2: "#00e5ff", text: "#ffffff", muted: "#a0b5f5", good: "#00e676", warn: "#ffc107", danger: "#ff3d00" };
}

// ---------------------------------------------------------------------------
// Node builders (pixel coordinates on the 1280x720 canvas)
// ---------------------------------------------------------------------------

function frame(name: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<UiNode> = {}): UiNode {
  return { kind: "frame", name, x, y, w, h, fill, radius: 16, opacity: 1, shadow: true, ...extra };
}

function label(name: string, value: string, x: number, y: number, w: number, h: number, color: string, fontSize: number, extra: Partial<UiNode> = {}): UiNode {
  return { kind: "text", name, text: value, x, y, w, h, textColor: color, fontSize, align: "left", ...extra };
}

function button(name: string, value: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<UiNode> = {}): UiNode {
  return {
    kind: "button",
    name,
    text: value,
    x,
    y,
    w,
    h,
    fill,
    radius: 14,
    opacity: 1,
    align: "center",
    bold: true,
    fontSize: 18,
    textColor: "#ffffff",
    shadow: true,
    gradient: true,
    ...extra,
  };
}

function bar(name: string, value: string, x: number, y: number, w: number, h: number, progress: number, fill: string, extra: Partial<UiNode> = {}): UiNode {
  return { kind: "bar", name, text: value, x, y, w, h, progress: clamp(progress, 0, 1), fill, radius: Math.round(h / 2), fontSize: Math.max(11, Math.round(h * 0.55)), ...extra };
}

function icon(name: string, glyph: string, x: number, y: number, size: number, fill: string, extra: Partial<UiNode> = {}): UiNode {
  return { kind: "icon", name, glyph, x, y, w: size, h: size, fill, radius: Math.round(size * 0.28), gradient: true, ...extra };
}

function divider(name: string, x: number, y: number, w: number, color: string): UiNode {
  return { kind: "divider", name, x, y, w, h: 1, fill: color, opacity: 0.18 };
}

function toggleRow(name: string, text: string, x: number, y: number, w: number, on: boolean, p: Palette): UiNode {
  return { kind: "toggle", name, text, x, y, w, h: 42, on, fill: p.card, textColor: p.text, fontSize: 16, radius: 10, stroke: on ? p.good : p.muted, strokeOpacity: 0.55 };
}

function sliderRow(name: string, text: string, x: number, y: number, w: number, progress: number, p: Palette): UiNode {
  return { kind: "slider", name, text, x, y, w, h: 46, progress: clamp(progress, 0, 1), fill: p.accent, textColor: p.text, fontSize: 16, radius: 6 };
}

type Ctx = {
  p: Palette;
  prompt: string;
  title: string;
  subtitle: string;
  nodes: UiNode[];
};

function push(ctx: Ctx, ...nodes: UiNode[]) {
  for (const node of nodes) ctx.nodes.push(node);
}

// Full-screen gradient background for screens that own the whole viewport.
function backdrop(ctx: Ctx) {
  push(ctx, frame("Backdrop", 0, 0, W, H, ctx.p.bg, { radius: 0, gradient: true, opacity: 1 }));
  push(ctx, frame("GlowTop", 820, -140, 460, 460, ctx.p.accent, { radius: 230, opacity: 0.16 }));
  push(ctx, frame("GlowBottom", -120, 430, 380, 380, ctx.p.accent2, { radius: 190, opacity: 0.13 }));
}

// Dim scrim behind modal screens (shop, inventory, settings, ...).
function scrim(ctx: Ctx) {
  push(ctx, { kind: "scrim", name: "Scrim", x: 0, y: 0, w: W, h: H, fill: "#000000", opacity: 0.55, radius: 0 });
}

type ModalBox = { x: number; y: number; w: number; h: number; contentY: number };

function modal(ctx: Ctx, w: number, h: number, heading: string, sub: string, opts: { close?: boolean; pill?: string } = {}): ModalBox {
  const p = ctx.p;
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);
  push(ctx, frame("Window", x, y, w, h, p.panel, { radius: 18, stroke: p.accent, strokeOpacity: 0.45, strokeWidth: 2, shadow: true }));
  push(ctx, frame("WindowHeader", x, y, w, 66, p.panel2, { radius: 18 }));
  push(ctx, label("WindowTitle", heading, x + 24, y + 12, w - 260, 26, p.text, 22, { bold: true }));
  push(ctx, label("WindowSubtitle", sub, x + 24, y + 38, w - 260, 18, p.muted, 14));
  if (opts.pill) {
    const pillW = 150;
    push(ctx, frame("CurrencyPill", x + w - (opts.close ? 118 : 24) - pillW, y + 16, pillW, 34, p.card, { radius: 17, stroke: p.warn, strokeOpacity: 0.5 }));
    push(ctx, icon("CurrencyIcon", "C", x + w - (opts.close ? 118 : 24) - pillW + 6, y + 22, 22, p.warn, { radius: 11 }));
    push(ctx, label("CurrencyText", opts.pill, x + w - (opts.close ? 118 : 24) - pillW + 34, y + 22, pillW - 42, 22, p.warn, 15, { bold: true }));
  }
  if (opts.close) {
    push(ctx, button("CloseButton", "X", x + w - 62, y + 16, 38, 34, p.danger, { radius: 10, fontSize: 16 }));
  }
  return { x, y, w, h, contentY: y + 66 };
}

function tabs(ctx: Ctx, items: string[], x: number, y: number, tabW = 132) {
  const p = ctx.p;
  items.forEach((item, i) => {
    push(ctx, button(`Tab${item.replace(/[^A-Za-z0-9]/g, "")}`, item, x + i * (tabW + 10), y, tabW, 38, i === 0 ? p.accent : p.card, {
      radius: 10,
      fontSize: 15,
      gradient: i === 0,
      textColor: i === 0 ? "#ffffff" : p.muted,
      stroke: i === 0 ? p.accent : p.muted,
      strokeOpacity: i === 0 ? 0.35 : 0.7,
    }));
  });
}

type CardSpec = { name: string; meta: string; action?: string; rare?: boolean };

function cardGrid(ctx: Ctx, items: CardSpec[], x: number, y: number, cols: number, cardW: number, cardH: number, gap = 16) {
  const p = ctx.p;
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    const key = item.name.replace(/[^A-Za-z0-9]/g, "");
    const accent = item.rare ? p.warn : i % 2 === 0 ? p.accent : p.accent2;
    push(ctx, frame(`${key}Card`, cx, cy, cardW, cardH, p.card, { radius: 14, stroke: accent, strokeOpacity: 0.5, shadow: true }));
    push(ctx, icon(`${key}Icon`, item.name.slice(0, 1).toUpperCase(), cx + Math.round((cardW - 56) / 2), cy + 14, 56, accent));
    push(ctx, label(`${key}Name`, item.name, cx + 10, cy + 78, cardW - 20, 20, p.text, 16, { bold: true, align: "center" }));
    push(ctx, label(`${key}Meta`, item.meta, cx + 10, cy + 99, cardW - 20, 16, p.muted, 13, { align: "center" }));
    if (item.action) {
      push(ctx, button(`${key}Action`, item.action, cx + 12, cy + cardH - 44, cardW - 24, 32, accent, { radius: 9, fontSize: 14, gradient: true }));
    }
  });
}

// ---------------------------------------------------------------------------
// Per-screen layouts
// ---------------------------------------------------------------------------

function menuButtons(prompt: string): string[] {
  const map: Array<[RegExp, string]> = [
    [/\bplay\b/i, "Play"],
    [/\bshop|store\b/i, "Shop"],
    [/\binventory|backpack\b/i, "Inventory"],
    [/\bquest|mission\b/i, "Quests"],
    [/\bpets?\b/i, "Pets"],
    [/\bcodes?\b/i, "Codes"],
    [/\bleaderboard\b/i, "Leaderboard"],
    [/\bcredits?\b/i, "Credits"],
    [/\bsettings|options\b/i, "Settings"],
  ];
  const found = map.filter(([re]) => re.test(prompt)).map(([, name]) => name);
  if (!found.includes("Play")) found.unshift("Play");
  const list = found.length >= 3 ? found : ["Play", "Shop", "Settings"];
  return list.slice(0, 5);
}

function layoutMainMenu(ctx: Ctx) {
  const p = ctx.p;
  backdrop(ctx);
  push(ctx, icon("Logo", ctx.title.slice(0, 1).toUpperCase(), 588, 78, 104, p.accent, { radius: 30, shadow: true }));
  push(ctx, label("Title", ctx.title, 240, 200, 800, 54, p.text, 44, { bold: true, align: "center" }));
  push(ctx, label("Subtitle", ctx.subtitle, 300, 258, 680, 24, p.muted, 18, { align: "center" }));
  const buttons = menuButtons(ctx.prompt);
  buttons.forEach((name, i) => {
    const primary = i === 0;
    push(ctx, button(`${name}Button`, name.toUpperCase(), 480, 320 + i * 66, 320, 54, primary ? p.accent : p.card, {
      radius: 12,
      fontSize: primary ? 22 : 18,
      gradient: primary,
      stroke: primary ? p.accent2 : p.muted,
      strokeOpacity: primary ? 0.3 : 0.65,
    }));
  });
  push(ctx, label("Footer", "BloxSmith build - v1.0.0", 32, H - 44, 320, 22, p.muted, 14));
  push(ctx, frame("PlayersPill", W - 212, H - 52, 180, 36, p.card, { radius: 18, stroke: p.good, strokeOpacity: 0.5 }));
  push(ctx, label("PlayersText", "24 players online", W - 200, H - 43, 160, 18, p.good, 14, { bold: true }));
  ["D", "G", "T"].forEach((glyph, i) => {
    push(ctx, button(`Social${glyph}`, glyph, W - 72, 28 + i * 56, 44, 44, p.card, { radius: 22, fontSize: 16, stroke: p.accent, strokeOpacity: 0.5 }));
  });
}

function layoutHud(ctx: Ctx) {
  const p = ctx.p;
  // Coins + gems pills (top-left)
  push(ctx, frame("CoinPill", 28, 24, 214, 48, p.panel, { radius: 24, opacity: 0.92, stroke: p.warn, strokeOpacity: 0.45, shadow: true }));
  push(ctx, icon("CoinIcon", "C", 34, 30, 36, p.warn, { radius: 18 }));
  push(ctx, label("CoinText", "12,450", 78, 34, 150, 28, p.text, 22, { bold: true }));
  push(ctx, frame("GemPill", 28, 80, 176, 40, p.panel, { radius: 20, opacity: 0.92, stroke: p.accent2, strokeOpacity: 0.45 }));
  push(ctx, icon("GemIcon", "G", 34, 85, 30, p.accent2, { radius: 15 }));
  push(ctx, label("GemText", "320", 72, 89, 120, 22, p.text, 18, { bold: true }));
  // Objective (top-center)
  push(ctx, label("Objective", "Collect 50 crystals", 440, 28, 400, 24, p.text, 18, { bold: true, align: "center" }));
  push(ctx, label("ObjectiveSub", "32 / 50", 440, 54, 400, 20, p.muted, 15, { align: "center" }));
  // Level badge + XP (top-right)
  push(ctx, icon("LevelBadge", "7", 1204, 24, 48, p.accent, { radius: 24 }));
  push(ctx, bar("XPBar", "XP 620 / 1000", 944, 36, 246, 22, 0.62, p.accent2, { gradient: true }));
  // Left action rail
  ["Shop", "Pets", "Quest", "Rebirth"].forEach((name, i) => {
    push(ctx, button(`${name}Rail`, name.slice(0, 1), 28, 176 + i * 68, 58, 58, p.card, {
      radius: 16,
      fontSize: 20,
      stroke: i === 0 ? p.accent : p.muted,
      strokeOpacity: i === 0 ? 0.4 : 0.7,
    }));
    push(ctx, label(`${name}RailText`, name, 92, 194 + i * 68, 90, 20, p.muted, 13, { bold: true }));
  });
  // Minimap (bottom-right)
  push(ctx, frame("Minimap", W - 196, H - 196, 164, 164, p.panel, { radius: 14, opacity: 0.9, stroke: p.accent, strokeOpacity: 0.4 }));
  push(ctx, label("MinimapLabel", "MAP", W - 186, H - 190, 60, 16, p.muted, 12, { bold: true }));
  push(ctx, icon("MinimapDot", "o", W - 122, H - 122, 16, p.good, { radius: 8 }));
  // Vitals (bottom-center)
  push(ctx, bar("HealthBar", "HP 82 / 100", 440, 574, 400, 22, 0.82, p.danger, {}));
  push(ctx, bar("StaminaBar", "", 440, 602, 400, 12, 0.64, p.good, {}));
  // Hotbar
  ["1", "2", "3", "4", "5", "6"].forEach((slot, i) => {
    push(ctx, button(`Slot${slot}`, slot, 454 + i * 62, 636, 54, 54, i === 0 ? p.accent : p.card, {
      radius: 12,
      fontSize: 16,
      gradient: i === 0,
      opacity: 0.94,
      stroke: i === 0 ? p.accent2 : p.muted,
      strokeOpacity: i === 0 ? 0.35 : 0.7,
    }));
  });
}

function layoutShop(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1000, 604, "Shop", ctx.subtitle, { close: true, pill: "12,450" });
  tabs(ctx, ["Featured", "Coins", "Pets", "Passes"], box.x + 24, box.contentY + 14, 126);
  const items: CardSpec[] = [
    { name: "VIP Pass", meta: "499 Robux", action: "BUY", rare: true },
    { name: "2x Coins", meta: "199 Robux", action: "BUY" },
    { name: "Pet Egg", meta: "1,500 Coins", action: "BUY" },
    { name: "Speed Boost", meta: "800 Coins", action: "BUY" },
    { name: "Lucky Crate", meta: "250 Robux", action: "BUY", rare: true },
    { name: "Magic Sword", meta: "4,000 Coins", action: "BUY" },
    { name: "Auto Collect", meta: "349 Robux", action: "BUY" },
    { name: "Starter Kit", meta: "99 Robux", action: "BUY" },
  ];
  cardGrid(ctx, items, box.x + 24, box.contentY + 66, 4, 220, 176, 16);
  push(ctx, label("ShopFooter", "All purchases are processed through MarketplaceService.", box.x + 24, box.y + box.h - 34, 600, 20, p.muted, 13));
}

function layoutInventory(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1040, 600, "Inventory", ctx.subtitle, { close: true });
  push(ctx, frame("SearchBox", box.x + 24, box.contentY + 14, 420, 38, p.card, { radius: 10, stroke: p.muted, strokeOpacity: 0.65 }));
  push(ctx, label("SearchText", "Search items...", box.x + 38, box.contentY + 23, 380, 20, p.muted, 15));
  tabs(ctx, ["All", "Gear", "Pets"], box.x + 460, box.contentY + 14, 76);
  const rarity = [p.warn, p.accent, p.good, p.accent2, p.danger];
  const names = ["Sword", "Bow", "Wand", "Shield", "Potion", "Gem", "Key", "Cape", "Boots", "Helm", "Ring", "Orb"];
  names.forEach((name, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const sx = box.x + 24 + col * 96;
    const sy = box.contentY + 70 + row * 96;
    const color = rarity[i % rarity.length];
    push(ctx, frame(`${name}Slot`, sx, sy, 84, 84, p.card, { radius: 12, stroke: color, strokeOpacity: 0.45 }));
    push(ctx, icon(`${name}SlotIcon`, name.slice(0, 1), sx + 20, sy + 14, 44, color));
    push(ctx, label(`${name}SlotCount`, `x${(i + 1) * 2}`, sx + 8, sy + 62, 68, 16, p.muted, 12, { bold: true, align: "right" }));
  });
  const dx = box.x + box.w - 300;
  push(ctx, frame("DetailPanel", dx, box.contentY + 14, 276, box.h - 96, p.panel2, { radius: 14, stroke: p.accent, strokeOpacity: 0.4 }));
  push(ctx, icon("DetailIcon", "S", dx + 92, box.contentY + 34, 92, p.warn, { radius: 22 }));
  push(ctx, label("DetailName", "Magic Sword", dx + 16, box.contentY + 142, 244, 24, p.text, 20, { bold: true, align: "center" }));
  push(ctx, label("DetailRarity", "Legendary", dx + 16, box.contentY + 168, 244, 18, p.warn, 14, { bold: true, align: "center" }));
  push(ctx, divider("DetailDivider", dx + 16, box.contentY + 198, 244, p.muted));
  [["Damage", "148"], ["Speed", "1.2x"], ["Level", "7"]].forEach((row, i) => {
    push(ctx, label(`Stat${i}Key`, row[0], dx + 16, box.contentY + 212 + i * 28, 120, 20, p.muted, 15));
    push(ctx, label(`Stat${i}Value`, row[1], dx + 136, box.contentY + 212 + i * 28, 124, 20, p.text, 15, { bold: true, align: "right" }));
  });
  push(ctx, button("EquipButton", "EQUIP", dx + 16, box.contentY + 316, 244, 44, p.accent, { gradient: true, fontSize: 17 }));
  push(ctx, button("DropButton", "DROP", dx + 16, box.contentY + 368, 244, 38, p.card, { fontSize: 15, textColor: p.danger, stroke: p.danger, strokeOpacity: 0.5 }));
}

function layoutSettings(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 900, 580, "Settings", ctx.subtitle, { close: true });
  ["Audio", "Graphics", "Controls", "Account"].forEach((name, i) => {
    push(ctx, button(`${name}Tab`, name, box.x + 24, box.contentY + 20 + i * 54, 190, 44, i === 0 ? p.accent : p.card, {
      radius: 10,
      fontSize: 16,
      gradient: i === 0,
      textColor: i === 0 ? "#ffffff" : p.muted,
    }));
  });
  const cx = box.x + 240;
  const cw = box.w - 264;
  push(ctx, frame("SettingsPanel", cx, box.contentY + 20, cw, box.h - 108, p.panel2, { radius: 14, stroke: p.accent, strokeOpacity: 0.35 }));
  push(ctx, label("SettingsHeading", "Audio", cx + 20, box.contentY + 36, 300, 24, p.text, 19, { bold: true }));
  [["Master Volume", 0.8], ["Music", 0.55], ["Sound Effects", 0.7]].forEach((row, i) => {
    push(ctx, sliderRow(`Slider${i}`, String(row[0]), cx + 20, box.contentY + 74 + i * 58, cw - 40, Number(row[1]), p));
  });
  [["Shadows", true], ["Particles", true], ["Reduce Motion", false]].forEach((row, i) => {
    push(ctx, toggleRow(`Toggle${i}`, String(row[0]), cx + 20, box.contentY + 254 + i * 52, cw - 40, Boolean(row[1]), p));
  });
  push(ctx, button("SaveButton", "SAVE", box.x + box.w - 200, box.y + box.h - 60, 176, 42, p.accent, { gradient: true, fontSize: 17 }));
  push(ctx, button("ResetButton", "RESET", box.x + box.w - 388, box.y + box.h - 60, 176, 42, p.card, { fontSize: 15, textColor: p.muted, stroke: p.muted, strokeOpacity: 0.6 }));
}

function layoutLoading(ctx: Ctx) {
  const p = ctx.p;
  backdrop(ctx);
  push(ctx, icon("LoadingLogo", ctx.title.slice(0, 1).toUpperCase(), 572, 128, 136, p.accent, { radius: 34, shadow: true }));
  push(ctx, label("LoadingTitle", ctx.title, 240, 296, 800, 52, p.text, 40, { bold: true, align: "center" }));
  push(ctx, label("LoadingSub", ctx.subtitle, 300, 352, 680, 24, p.muted, 17, { align: "center" }));
  push(ctx, bar("LoadingBar", "", 360, 416, 560, 24, 0.72, p.accent, { gradient: true }));
  push(ctx, label("LoadingPercent", "72%", 360, 450, 560, 22, p.text, 16, { bold: true, align: "center" }));
  push(ctx, label("LoadingTip", "Tip: hold Shift to sprint and chain jumps for speed.", 300, 492, 680, 22, p.muted, 16, { align: "center" }));
  push(ctx, label("LoadingStage", "Streaming map assets", 300, 520, 680, 20, p.accent2, 14, { bold: true, align: "center" }));
  push(ctx, label("LoadingVersion", "v1.0.0", W - 132, H - 44, 100, 20, p.muted, 13, { align: "right" }));
}

function layoutLeaderboard(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 900, 600, "Leaderboard", ctx.subtitle, { close: true });
  tabs(ctx, ["Coins", "Wins", "Time"], box.x + 24, box.contentY + 14, 96);
  const podium = [
    { place: "2", name: "BlueFox", score: "84,200", h: 118, color: p.muted },
    { place: "1", name: "kingdavez", score: "126,900", h: 150, color: p.warn },
    { place: "3", name: "NoobSlayer", score: "71,050", h: 96, color: p.accent2 },
  ];
  podium.forEach((entry, i) => {
    const pw = 236;
    const px = box.x + 32 + i * (pw + 20);
    const py = box.contentY + 200 - entry.h;
    push(ctx, frame(`Podium${entry.place}`, px, py, pw, entry.h + 40, p.card, { radius: 14, stroke: entry.color, strokeOpacity: 0.5, shadow: true }));
    push(ctx, icon(`Podium${entry.place}Avatar`, entry.name.slice(0, 1).toUpperCase(), px + 90, py + 12, 56, entry.color, { radius: 28 }));
    push(ctx, label(`Podium${entry.place}Name`, entry.name, px + 10, py + 76, pw - 20, 20, p.text, 16, { bold: true, align: "center" }));
    push(ctx, label(`Podium${entry.place}Score`, entry.score, px + 10, py + 98, pw - 20, 18, entry.color, 15, { bold: true, align: "center" }));
  });
  const rows = [
    ["4", "CrystalCat", "64,800"],
    ["5", "ObbyKing", "58,120"],
    ["6", "PetLover", "51,940"],
    ["7", "SwordMain", "47,600"],
    ["8", "You", "44,180"],
  ];
  rows.forEach((row, i) => {
    const ry = box.contentY + 258 + i * 52;
    const highlight = row[1] === "You";
    push(ctx, frame(`Row${row[0]}`, box.x + 32, ry, box.w - 64, 44, highlight ? p.panel2 : p.card, {
      radius: 10,
      stroke: highlight ? p.accent : p.muted,
      strokeOpacity: highlight ? 0.45 : 0.75,
    }));
    push(ctx, label(`Row${row[0]}Rank`, `#${row[0]}`, box.x + 46, ry + 12, 50, 20, p.muted, 15, { bold: true }));
    push(ctx, icon(`Row${row[0]}Avatar`, row[1].slice(0, 1), box.x + 100, ry + 6, 32, highlight ? p.accent : p.accent2, { radius: 16 }));
    push(ctx, label(`Row${row[0]}Name`, row[1], box.x + 144, ry + 12, 300, 20, p.text, 16, { bold: highlight }));
    push(ctx, label(`Row${row[0]}Score`, row[2], box.x + box.w - 220, ry + 12, 160, 20, highlight ? p.accent : p.text, 16, { bold: true, align: "right" }));
  });
}

function layoutQuests(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1000, 600, "Quests", ctx.subtitle, { close: true });
  tabs(ctx, ["Daily", "Weekly", "Story"], box.x + 24, box.contentY + 14, 108);
  const quests = [
    { name: "Collect 50 crystals", progress: 0.64, meta: "32 / 50" },
    { name: "Defeat 10 slimes", progress: 0.4, meta: "4 / 10" },
    { name: "Reach level 8", progress: 0.85, meta: "7 / 8" },
    { name: "Craft a magic sword", progress: 0.15, meta: "Locked" },
  ];
  quests.forEach((quest, i) => {
    const qy = box.contentY + 66 + i * 106;
    const qw = 560;
    push(ctx, frame(`Quest${i}Card`, box.x + 24, qy, qw, 92, p.card, { radius: 12, stroke: i === 0 ? p.accent : p.muted, strokeOpacity: i === 0 ? 0.5 : 0.75 }));
    push(ctx, icon(`Quest${i}Icon`, String(i + 1), box.x + 40, qy + 18, 52, i === 0 ? p.accent : p.accent2));
    push(ctx, label(`Quest${i}Name`, quest.name, box.x + 106, qy + 16, 380, 22, p.text, 17, { bold: true }));
    push(ctx, label(`Quest${i}Meta`, quest.meta, box.x + qw - 116, qy + 16, 100, 20, p.muted, 14, { align: "right" }));
    push(ctx, bar(`Quest${i}Bar`, "", box.x + 106, qy + 52, qw - 132, 16, quest.progress, i === 0 ? p.accent : p.good, {}));
  });
  const dx = box.x + 608;
  const dw = box.w - 632;
  push(ctx, frame("QuestDetail", dx, box.contentY + 66, dw, 396, p.panel2, { radius: 14, stroke: p.accent, strokeOpacity: 0.4 }));
  push(ctx, label("QuestDetailTitle", "Collect 50 crystals", dx + 18, box.contentY + 86, dw - 36, 24, p.text, 19, { bold: true }));
  push(ctx, label("QuestDetailBody", "Mine crystal nodes in the caves to fill the order.", dx + 18, box.contentY + 114, dw - 36, 40, p.muted, 15));
  [["Find the cave entrance", true], ["Mine 32 crystals", true], ["Return to the trader", false]].forEach((row, i) => {
    const oy = box.contentY + 170 + i * 40;
    push(ctx, icon(`Objective${i}Box`, row[1] ? "y" : "-", dx + 18, oy, 26, row[1] ? p.good : p.muted, { radius: 8, gradient: false }));
    push(ctx, label(`Objective${i}Text`, String(row[0]), dx + 54, oy + 3, dw - 76, 20, row[1] ? p.text : p.muted, 15));
  });
  push(ctx, divider("QuestDivider", dx + 18, box.contentY + 300, dw - 36, p.muted));
  push(ctx, label("RewardLabel", "Reward", dx + 18, box.contentY + 312, 140, 20, p.muted, 14, { bold: true }));
  push(ctx, label("RewardValue", "2,500 Coins + Pet Egg", dx + 18, box.contentY + 334, dw - 36, 20, p.warn, 16, { bold: true }));
  push(ctx, button("ClaimButton", "CLAIM", dx + 18, box.contentY + 372, dw - 36, 46, p.good, { gradient: true, fontSize: 18 }));
}

function layoutPause(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 420, 476, "Paused", ctx.subtitle, {});
  ["Resume", "Settings", "Shop", "Leave Game"].forEach((name, i) => {
    const primary = i === 0;
    const danger = name === "Leave Game";
    push(ctx, button(`${name.replace(/\s+/g, "")}Button`, name.toUpperCase(), box.x + 40, box.contentY + 28 + i * 68, box.w - 80, 54, primary ? p.accent : danger ? p.danger : p.card, {
      radius: 12,
      fontSize: primary ? 20 : 17,
      gradient: primary,
      stroke: primary ? p.accent2 : p.muted,
      strokeOpacity: primary ? 0.3 : 0.65,
    }));
  });
  push(ctx, divider("PauseDivider", box.x + 40, box.contentY + 316, box.w - 80, p.muted));
  push(ctx, label("PauseStats", "Session 14m - Level 7 - 12,450 coins", box.x + 40, box.contentY + 330, box.w - 80, 20, p.muted, 14, { align: "center" }));
}

function layoutBattlePass(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1080, 560, "Battle Pass", ctx.subtitle, { close: true, pill: "Season 3" });
  push(ctx, label("TierLabel", "Tier 12", box.x + 24, box.contentY + 18, 140, 24, p.text, 19, { bold: true }));
  push(ctx, bar("SeasonXP", "", box.x + 150, box.contentY + 22, box.w - 320, 20, 0.58, p.accent, { gradient: true }));
  push(ctx, label("TierNext", "580 / 1000 XP", box.x + box.w - 164, box.contentY + 22, 140, 20, p.muted, 14, { align: "right" }));
  const rewards = [
    { name: "Coins", meta: "1,000", locked: false },
    { name: "Pet Egg", meta: "Common", locked: false },
    { name: "Skin", meta: "Rare", locked: false },
    { name: "Gems", meta: "250", locked: true },
    { name: "Aura", meta: "Epic", locked: true },
    { name: "Mount", meta: "Legendary", locked: true },
  ];
  rewards.forEach((reward, i) => {
    const cw = 158;
    const cx = box.x + 24 + i * (cw + 14);
    const cy = box.contentY + 70;
    const color = reward.locked ? p.muted : i === 2 ? p.warn : p.accent;
    push(ctx, frame(`Tier${i}Card`, cx, cy, cw, 250, p.card, { radius: 14, stroke: color, strokeOpacity: reward.locked ? 0.8 : 0.45, opacity: reward.locked ? 0.85 : 1 }));
    push(ctx, label(`Tier${i}Label`, `TIER ${10 + i}`, cx + 10, cy + 12, cw - 20, 16, p.muted, 12, { bold: true, align: "center" }));
    push(ctx, icon(`Tier${i}Icon`, reward.name.slice(0, 1), cx + Math.round((cw - 72) / 2), cy + 36, 72, color, { gradient: !reward.locked }));
    push(ctx, label(`Tier${i}Name`, reward.name, cx + 10, cy + 122, cw - 20, 20, p.text, 16, { bold: true, align: "center" }));
    push(ctx, label(`Tier${i}Meta`, reward.meta, cx + 10, cy + 144, cw - 20, 18, color, 13, { align: "center" }));
    push(ctx, button(`Tier${i}Action`, reward.locked ? "LOCKED" : "CLAIM", cx + 12, cy + 196, cw - 24, 38, reward.locked ? p.panel2 : p.good, {
      radius: 9,
      fontSize: 14,
      gradient: !reward.locked,
      textColor: reward.locked ? p.muted : "#ffffff",
    }));
  });
  push(ctx, button("BuyPremium", "UNLOCK PREMIUM - 799 ROBUX", box.x + box.w - 344, box.y + box.h - 60, 320, 44, p.warn, { gradient: true, fontSize: 16 }));
  push(ctx, label("SeasonEnds", "Season ends in 12 days", box.x + 24, box.y + box.h - 50, 320, 20, p.muted, 14));
}

function layoutCrafting(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1000, 580, "Crafting", ctx.subtitle, { close: true });
  ["Magic Sword", "Iron Shield", "Health Potion", "Crystal Pickaxe"].forEach((name, i) => {
    const ry = box.contentY + 22 + i * 62;
    push(ctx, button(`Recipe${i}`, name, box.x + 24, ry, 270, 52, i === 0 ? p.accent : p.card, {
      radius: 10,
      fontSize: 15,
      gradient: i === 0,
      textColor: i === 0 ? "#ffffff" : p.text,
    }));
  });
  const gx = box.x + 320;
  push(ctx, frame("CraftPanel", gx, box.contentY + 22, box.w - 344, box.h - 122, p.panel2, { radius: 14, stroke: p.accent, strokeOpacity: 0.35 }));
  push(ctx, label("CraftTitle", "Magic Sword", gx + 20, box.contentY + 40, 320, 24, p.text, 19, { bold: true }));
  push(ctx, label("CraftMeta", "Requires level 6 - 12s craft time", gx + 20, box.contentY + 66, 400, 20, p.muted, 14));
  const mats = ["Iron", "Crystal", "Wood", "Rune", "Ember", "Dust", "Silk", "Bone", "Ore"];
  mats.forEach((mat, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = gx + 24 + col * 92;
    const sy = box.contentY + 104 + row * 92;
    const have = i < 6;
    push(ctx, frame(`Mat${i}Slot`, sx, sy, 80, 80, p.card, { radius: 12, stroke: have ? p.good : p.muted, strokeOpacity: have ? 0.5 : 0.8 }));
    push(ctx, icon(`Mat${i}Icon`, mat.slice(0, 1), sx + 20, sy + 12, 40, have ? p.accent2 : p.muted, { gradient: have }));
    push(ctx, label(`Mat${i}Count`, have ? "x4" : "x0", sx + 8, sy + 58, 64, 16, have ? p.good : p.danger, 12, { bold: true, align: "right" }));
  });
  push(ctx, label("CraftArrow", ">", gx + 306, box.contentY + 216, 40, 40, p.accent, 34, { bold: true, align: "center" }));
  push(ctx, frame("OutputSlot", gx + 372, box.contentY + 170, 128, 128, p.card, { radius: 16, stroke: p.warn, strokeOpacity: 0.5, shadow: true }));
  push(ctx, icon("OutputIcon", "S", gx + 404, box.contentY + 194, 64, p.warn));
  push(ctx, label("OutputName", "Magic Sword", gx + 372, box.contentY + 306, 128, 20, p.text, 14, { bold: true, align: "center" }));
  push(ctx, button("CraftButton", "CRAFT", box.x + box.w - 280, box.y + box.h - 64, 256, 48, p.good, { gradient: true, fontSize: 19 }));
  push(ctx, label("CraftHint", "Missing 3 materials for a full stack.", box.x + 24, box.y + box.h - 52, 400, 20, p.muted, 14));
}

function layoutDialog(ctx: Ctx) {
  const p = ctx.p;
  push(ctx, frame("DialogBox", 160, 424, 960, 244, p.panel, { radius: 18, opacity: 0.96, stroke: p.accent, strokeOpacity: 0.45, shadow: true }));
  push(ctx, frame("PortraitFrame", 184, 448, 132, 132, p.card, { radius: 14, stroke: p.accent2, strokeOpacity: 0.5 }));
  push(ctx, icon("Portrait", "N", 208, 470, 84, p.accent2, { radius: 20 }));
  push(ctx, frame("NamePlate", 184, 588, 132, 32, p.accent, { radius: 10, gradient: true }));
  push(ctx, label("NpcName", "Old Miner", 190, 595, 120, 20, "#ffffff", 15, { bold: true, align: "center" }));
  push(ctx, label("DialogText", "The caves below are full of crystal. Bring me 50 and I will forge you something worthy.", 344, 452, 752, 60, p.text, 20));
  ["I will help you.", "How much do I get?", "Not right now."].forEach((choice, i) => {
    push(ctx, button(`Choice${i}`, choice, 344, 528 + i * 44, 500, 38, i === 0 ? p.accent : p.card, {
      radius: 10,
      fontSize: 15,
      align: "left",
      gradient: i === 0,
      textColor: i === 0 ? "#ffffff" : p.text,
    }));
  });
  push(ctx, label("DialogHint", "Press E to continue", 880, 620, 216, 20, p.muted, 13, { align: "right" }));
  push(ctx, button("DialogSkip", "SKIP", 1024, 448, 72, 32, p.card, { radius: 8, fontSize: 13, textColor: p.muted, stroke: p.muted, strokeOpacity: 0.7 }));
}

function layoutTrading(ctx: Ctx) {
  const p = ctx.p;
  scrim(ctx);
  const box = modal(ctx, 1000, 560, "Trade", ctx.subtitle, { close: true });
  const sides = [
    { key: "You", name: "kingdavez", ready: true },
    { key: "Them", name: "BlueFox", ready: false },
  ];
  sides.forEach((side, s) => {
    const px = s === 0 ? box.x + 24 : box.x + box.w - 424;
    push(ctx, frame(`${side.key}Panel`, px, box.contentY + 22, 400, 340, p.panel2, { radius: 14, stroke: side.ready ? p.good : p.muted, strokeOpacity: side.ready ? 0.5 : 0.75 }));
    push(ctx, icon(`${side.key}Avatar`, side.name.slice(0, 1).toUpperCase(), px + 16, box.contentY + 38, 40, s === 0 ? p.accent : p.accent2, { radius: 20 }));
    push(ctx, label(`${side.key}Name`, side.name, px + 64, box.contentY + 46, 220, 22, p.text, 17, { bold: true }));
    push(ctx, label(`${side.key}Status`, side.ready ? "READY" : "CHOOSING...", px + 264, box.contentY + 46, 120, 22, side.ready ? p.good : p.warn, 14, { bold: true, align: "right" }));
    for (let i = 0; i < 8; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = px + 20 + col * 92;
      const sy = box.contentY + 88 + row * 92;
      const filled = i < (s === 0 ? 3 : 2);
      push(ctx, frame(`${side.key}Slot${i}`, sx, sy, 80, 80, p.card, { radius: 12, stroke: filled ? p.accent : p.muted, strokeOpacity: filled ? 0.5 : 0.85 }));
      if (filled) push(ctx, icon(`${side.key}Slot${i}Icon`, "I", sx + 20, sy + 20, 40, s === 0 ? p.accent : p.accent2));
    }
    push(ctx, label(`${side.key}Value`, s === 0 ? "Offer value 8,400" : "Offer value 7,950", px + 20, box.contentY + 288, 360, 20, p.muted, 14));
    push(ctx, bar(`${side.key}Ready`, "", px + 20, box.contentY + 316, 360, 12, side.ready ? 1 : 0.35, side.ready ? p.good : p.warn, {}));
  });
  push(ctx, label("TradeVs", "TRADE", box.x + 444, box.contentY + 170, 112, 24, p.muted, 16, { bold: true, align: "center" }));
  push(ctx, icon("TradeSwap", "S", box.x + 476, box.contentY + 206, 48, p.accent, { radius: 24 }));
  push(ctx, button("AcceptButton", "ACCEPT TRADE", box.x + 24, box.y + box.h - 66, 400, 48, p.good, { gradient: true, fontSize: 18 }));
  push(ctx, button("DeclineButton", "DECLINE", box.x + box.w - 424, box.y + box.h - 66, 400, 48, p.card, { fontSize: 17, textColor: p.danger, stroke: p.danger, strokeOpacity: 0.5 }));
}

const LAYOUTS: Record<UiKind, (ctx: Ctx) => void> = {
  "main-menu": layoutMainMenu,
  hud: layoutHud,
  shop: layoutShop,
  inventory: layoutInventory,
  settings: layoutSettings,
  loading: layoutLoading,
  leaderboard: layoutLeaderboard,
  quests: layoutQuests,
  pause: layoutPause,
  battlepass: layoutBattlePass,
  crafting: layoutCrafting,
  dialog: layoutDialog,
  trading: layoutTrading,
};

const TRANSPARENT_KINDS: UiKind[] = ["hud", "dialog"];

function titleFor(kind: UiKind, prompt: string) {
  const cleaned = String(prompt || "").replace(/\s+/g, " ").trim();
  const named = /(?:called|named|titled)\s+"?([A-Za-z0-9 '!:-]{2,28})"?/i.exec(cleaned);
  if (named) return safeText(titleCase(named[1]), 28);
  if (kind === "main-menu" || kind === "loading") {
    const game = /\b([A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+){0,2})\b/.exec(cleaned.replace(/^(a|an|the)\s+/i, ""));
    if (game && !/^(main|loading|shop|inventory|settings|hud)$/i.test(game[1])) return safeText(titleCase(game[1]), 26);
  }
  return KIND_LABELS[kind];
}

export function createRobloxUiBlueprint(prompt: string, style: string): UiBlueprint {
  const kind = detectUiKind(prompt);
  const palette = paletteFor(style);
  const styleLabel = safeText(style || "Modern", 20);
  const title = titleFor(kind, prompt);
  const subtitle = `${styleLabel} ${KIND_LABELS[kind]} - ${safeText(prompt, 58)}`;
  const ctx: Ctx = { p: palette, prompt: String(prompt || ""), title, subtitle, nodes: [] };
  LAYOUTS[kind](ctx);
  const layers = ctx.nodes
    .filter((node) => node.kind !== "scrim" && node.kind !== "divider")
    .map((node) => node.name);
  return {
    prompt: String(prompt || ""),
    style: styleLabel,
    title,
    subtitle,
    kind,
    kindLabel: KIND_LABELS[kind],
    transparentBackdrop: TRANSPARENT_KINDS.includes(kind),
    palette,
    nodes: ctx.nodes,
    layers,
  };
}

// ---------------------------------------------------------------------------
// Preview renderer (SVG) - mirrors the Luau renderer below 1:1
// ---------------------------------------------------------------------------

function svgText(node: UiNode, value: string, fallbackColor: string, extraSize?: number) {
  const size = extraSize ?? node.fontSize ?? 16;
  const bold = Boolean(node.bold);
  const align = node.align ?? "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const tx = align === "center" ? node.x + node.w / 2 : align === "right" ? node.x + node.w - 2 : node.x + 2;
  const ty = node.y + node.h / 2;
  const color = node.textColor || fallbackColor;
  return `<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="${size}" font-weight="${bold ? 800 : 500}" fill="${color}">${escapeXml(fitText(value, node.w, size, bold))}</text>`;
}

export function renderRobloxUiBlueprintSvg(blueprint: UiBlueprint) {
  const p = blueprint.palette;
  const parts: string[] = [];

  for (const node of blueprint.nodes) {
    const radius = node.radius ?? 0;
    const opacity = node.opacity ?? 1;
    const fill = node.gradient ? "url(#accentGradient)" : node.fill || p.panel;
    const shadow = node.shadow ? ' filter="url(#softShadow)"' : "";
    const strokeAttr = node.stroke
      ? ` stroke="${node.stroke}" stroke-opacity="${clamp(node.strokeOpacity ?? 0.5, 0, 1)}" stroke-width="${node.strokeWidth ?? 1.5}"`
      : "";

    if (node.kind === "scrim") {
      parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${node.fill || "#000"}" opacity="${opacity}"/>`);
      continue;
    }
    if (node.kind === "divider") {
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="1" fill="${node.fill || p.muted}" opacity="${opacity}"/>`);
      continue;
    }
    if (node.kind === "text") {
      parts.push(svgText(node, node.text || "", p.text));
      continue;
    }
    if (node.kind === "bar") {
      const fillWidth = Math.round(node.w * clamp(node.progress ?? 0, 0, 1));
      const r = node.radius ?? Math.round(node.h / 2);
      if (node.text) {
        parts.push(`<text x="${node.x}" y="${node.y - 12}" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="${node.fontSize ?? 14}" font-weight="800" fill="${p.text}">${escapeXml(fitText(node.text, node.w, node.fontSize ?? 14, true))}</text>`);
      }
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${r}" fill="#000000" opacity="0.42"/>`);
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${fillWidth}" height="${node.h}" rx="${r}" fill="${node.gradient ? "url(#accentGradient)" : node.fill || p.accent}"/>`);
      continue;
    }
    if (node.kind === "icon") {
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="${fill}" opacity="${opacity}"${strokeAttr}${shadow}/>`);
      const glyphSize = Math.round(node.h * 0.5);
      parts.push(`<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="${glyphSize}" font-weight="800" fill="#ffffff">${escapeXml((node.glyph || "").slice(0, 2))}</text>`);
      continue;
    }
    if (node.kind === "toggle") {
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="${node.fill || p.card}" opacity="${opacity}"${strokeAttr}/>`);
      parts.push(`<text x="${node.x + 14}" y="${node.y + node.h / 2}" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="${node.fontSize ?? 16}" font-weight="600" fill="${node.textColor || p.text}">${escapeXml(fitText(node.text || "", node.w - 90, node.fontSize ?? 16, false))}</text>`);
      const trackX = node.x + node.w - 74;
      const trackY = node.y + Math.round((node.h - 26) / 2);
      parts.push(`<rect x="${trackX}" y="${trackY}" width="56" height="26" rx="13" fill="${node.on ? p.good : "#000000"}" opacity="${node.on ? 1 : 0.45}"/>`);
      parts.push(`<circle cx="${node.on ? trackX + 42 : trackX + 14}" cy="${trackY + 13}" r="10" fill="#ffffff"/>`);
      continue;
    }
    if (node.kind === "slider") {
      const progress = clamp(node.progress ?? 0, 0, 1);
      parts.push(`<text x="${node.x}" y="${node.y + 10}" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="${node.fontSize ?? 16}" font-weight="600" fill="${node.textColor || p.text}">${escapeXml(fitText(node.text || "", node.w - 60, node.fontSize ?? 16, false))}</text>`);
      parts.push(`<text x="${node.x + node.w}" y="${node.y + 10}" text-anchor="end" dominant-baseline="central" font-family="Gotham, Montserrat, Inter, Arial, sans-serif" font-size="13" font-weight="800" fill="${p.muted}">${Math.round(progress * 100)}%</text>`);
      const trackY = node.y + 30;
      parts.push(`<rect x="${node.x}" y="${trackY}" width="${node.w}" height="8" rx="4" fill="#000000" opacity="0.45"/>`);
      parts.push(`<rect x="${node.x}" y="${trackY}" width="${Math.round(node.w * progress)}" height="8" rx="4" fill="${node.fill || p.accent}"/>`);
      parts.push(`<circle cx="${node.x + Math.round(node.w * progress)}" cy="${trackY + 4}" r="9" fill="#ffffff"/>`);
      continue;
    }
    // frame + button
    parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="${fill}" opacity="${opacity}"${strokeAttr}${shadow}/>`);
    if (node.kind === "button") {
      const inner: UiNode = node.align === "left" ? { ...node, x: node.x + 14, w: node.w - 28 } : node;
      parts.push(svgText(inner, node.text || node.name, "#ffffff"));
    }
  }

  const worldBackdrop = blueprint.transparentBackdrop
    ? `<rect width="${W}" height="${H}" fill="url(#worldGradient)"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect x="0" y="${H - 190}" width="${W}" height="190" fill="#0b1220" opacity="0.55"/>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGradient" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
    <linearGradient id="accentGradient" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent2}"/></linearGradient>
    <linearGradient id="worldGradient" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#1b2b4a"/><stop offset="0.55" stop-color="#0e1730"/><stop offset="1" stop-color="#070b16"/></linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M 64 0 L 0 0 0 64" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="1"/></pattern>
    <filter id="softShadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".35"/></filter>
  </defs>
  ${worldBackdrop}
  ${parts.join("\n  ")}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Luau renderer - builds the exact same pixel layout inside Roblox
// ---------------------------------------------------------------------------

export function renderRobloxUiBlueprintLuau(blueprint: UiBlueprint) {
  const p = blueprint.palette;
  const nodes = blueprint.nodes.map((node) => ({
    kind: node.kind,
    name: node.name,
    x: Math.round(node.x),
    y: Math.round(node.y),
    w: Math.round(node.w),
    h: Math.round(node.h),
    fill: node.fill,
    text: node.text,
    textColor: node.textColor,
    fontSize: node.fontSize,
    bold: node.bold,
    align: node.align,
    radius: node.radius,
    opacity: node.opacity,
    progress: node.progress,
    stroke: node.stroke,
    strokeOpacity: node.strokeOpacity,
    strokeWidth: node.strokeWidth,
    gradient: node.gradient,
    glyph: node.glyph,
    on: node.on,
    shadow: node.shadow,
  }));

  return `--!strict
-- BloxSmith generated Roblox UI: ${blueprint.kindLabel}
-- Prompt: ${blueprint.prompt.replace(/[\r\n]+/g, " ").slice(0, 160)}
-- Style: ${blueprint.style}
--
-- The site preview and this script are rendered from the SAME node tree on a
-- ${W}x${H} pixel canvas, so what you saw is what Roblox builds.
-- Place this in StarterPlayer > StarterPlayerScripts as a LocalScript.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local GUI_NAME = "BloxSmith_${blueprint.kind.replace(/-/g, "_")}"
local existing = playerGui:FindFirstChild(GUI_NAME)
if existing then
	existing:Destroy()
end

local CANVAS_W, CANVAS_H = ${W}, ${H}

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

local TRANSPARENT_BACKDROP = ${blueprint.transparentBackdrop}
local nodes = ${luaValue(nodes)}

local function hexColor(hex: string?): Color3
	local value = string.gsub(hex or "#ffffff", "#", "")
	if #value == 3 then
		value = string.rep(string.sub(value, 1, 1), 2) .. string.rep(string.sub(value, 2, 2), 2) .. string.rep(string.sub(value, 3, 3), 2)
	end
	return Color3.fromRGB(
		tonumber(string.sub(value, 1, 2), 16) or 255,
		tonumber(string.sub(value, 3, 4), 16) or 255,
		tonumber(string.sub(value, 5, 6), 16) or 255
	)
end

local function make(className: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(className)
	for key, value in pairs(props) do
		(inst :: any)[key] = value
	end
	inst.Parent = parent
	return inst
end

local function corner(parent: Instance, radius: number?)
	if (radius or 0) <= 0 then
		return
	end
	make("UICorner", { CornerRadius = UDim.new(0, radius or 0) }, parent)
end

local function stroke(parent: Instance, color: string?, opacity: number?, thickness: number?)
	if not color then
		return
	end
	make("UIStroke", {
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Color = hexColor(color),
		Thickness = thickness or 1.5,
		Transparency = math.clamp(1 - (opacity or 0.5), 0, 1),
	}, parent)
end

local function gradient(parent: Instance)
	local grad = make("UIGradient", {
		Color = ColorSequence.new(palette.accent, palette.accent2),
		Rotation = 12,
	}, parent)
	TweenService:Create(grad, TweenInfo.new(4, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { Rotation = -12 }):Play()
end

local function alignment(value: string?): Enum.TextXAlignment
	if value == "center" then
		return Enum.TextXAlignment.Center
	elseif value == "right" then
		return Enum.TextXAlignment.Right
	end
	return Enum.TextXAlignment.Left
end

local function font(bold: boolean?): Enum.Font
	return bold and Enum.Font.GothamBlack or Enum.Font.Gotham
end

local function hoverMotion(target: GuiButton)
	local scale = make("UIScale", { Scale = 1 }, target)
	local base = target.BackgroundColor3
	target.MouseEnter:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Quad), { Scale = 1.04 }):Play()
		TweenService:Create(target, TweenInfo.new(0.12), { BackgroundColor3 = base:Lerp(Color3.new(1, 1, 1), 0.12) }):Play()
	end)
	target.MouseLeave:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Quad), { Scale = 1 }):Play()
		TweenService:Create(target, TweenInfo.new(0.12), { BackgroundColor3 = base }):Play()
	end)
	target.MouseButton1Down:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.07), { Scale = 0.97 }):Play()
	end)
	target.MouseButton1Up:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.09), { Scale = 1 }):Play()
	end)
end

local screenGui = make("ScreenGui", {
	Name = GUI_NAME,
	IgnoreGuiInset = true,
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 20,
}, playerGui)

-- Fixed-size canvas, centered and uniformly scaled: identical layout on every device.
local root = make("Frame", {
	Name = "Canvas",
	AnchorPoint = Vector2.new(0.5, 0.5),
	BackgroundColor3 = palette.bg,
	BackgroundTransparency = TRANSPARENT_BACKDROP and 1 or 0,
	BorderSizePixel = 0,
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromOffset(CANVAS_W, CANVAS_H),
}, screenGui)

local canvasScale = make("UIScale", { Scale = 1 }, root)

local function refit()
	local viewport = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(CANVAS_W, CANVAS_H)
	canvasScale.Scale = math.min(viewport.X / CANVAS_W, viewport.Y / CANVAS_H)
end

refit()
if workspace.CurrentCamera then
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(refit)
end
workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
	if workspace.CurrentCamera then
		workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(refit)
		refit()
	end
end)

local entrance = {}

for _, node in ipairs(nodes) do
	local position = UDim2.fromOffset(node.x, node.y)
	local size = UDim2.fromOffset(node.w, node.h)
	local backgroundTransparency = math.clamp(1 - (node.opacity or 1), 0, 1)

	if node.kind == "scrim" then
		local scrim = make("Frame", {
			Name = node.name,
			BackgroundColor3 = hexColor(node.fill),
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			Position = UDim2.fromScale(0.5, 0.5),
			AnchorPoint = Vector2.new(0.5, 0.5),
			-- Cover the whole screen even outside the scaled canvas.
			Size = UDim2.fromScale(6, 6),
		}, root)
		TweenService:Create(scrim, TweenInfo.new(0.2), { BackgroundTransparency = backgroundTransparency }):Play()
	elseif node.kind == "text" then
		make("TextLabel", {
			Name = node.name,
			BackgroundTransparency = 1,
			Font = font(node.bold),
			Position = position,
			Size = size,
			Text = node.text or "",
			TextColor3 = node.textColor and hexColor(node.textColor) or palette.text,
			TextSize = node.fontSize or 16,
			TextScaled = false,
			TextTruncate = Enum.TextTruncate.AtEnd,
			TextWrapped = (node.h or 0) > (node.fontSize or 16) * 1.9,
			TextXAlignment = alignment(node.align),
			TextYAlignment = Enum.TextYAlignment.Center,
		}, root)
	elseif node.kind == "divider" then
		local line = make("Frame", {
			Name = node.name,
			BackgroundColor3 = hexColor(node.fill),
			BackgroundTransparency = 1 - (node.opacity or 0.18),
			BorderSizePixel = 0,
			Position = position,
			Size = UDim2.fromOffset(node.w, 1),
		}, root)
		line.ZIndex = 2
	elseif node.kind == "bar" then
		if node.text and node.text ~= "" then
			make("TextLabel", {
				Name = node.name .. "Label",
				BackgroundTransparency = 1,
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(node.x, node.y - 24),
				Size = UDim2.fromOffset(node.w, 20),
				Text = node.text,
				TextColor3 = palette.text,
				TextSize = node.fontSize or 14,
				TextScaled = false,
				TextXAlignment = Enum.TextXAlignment.Left,
			}, root)
		end
		local track = make("Frame", {
			Name = node.name .. "Track",
			BackgroundColor3 = Color3.new(0, 0, 0),
			BackgroundTransparency = 0.58,
			BorderSizePixel = 0,
			Position = position,
			Size = size,
		}, root)
		corner(track, node.radius or math.floor(node.h / 2))
		local fillBar = make("Frame", {
			Name = node.name,
			BackgroundColor3 = node.fill and hexColor(node.fill) or palette.accent,
			BorderSizePixel = 0,
			Size = UDim2.fromOffset(0, node.h),
		}, track)
		corner(fillBar, node.radius or math.floor(node.h / 2))
		if node.gradient then
			gradient(fillBar)
		end
		TweenService:Create(fillBar, TweenInfo.new(0.7, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
			Size = UDim2.fromOffset(math.floor(node.w * math.clamp(node.progress or 0, 0, 1)), node.h),
		}):Play()
	elseif node.kind == "icon" then
		local box = make("Frame", {
			Name = node.name,
			BackgroundColor3 = node.fill and hexColor(node.fill) or palette.accent,
			BackgroundTransparency = backgroundTransparency,
			BorderSizePixel = 0,
			Position = position,
			Size = size,
		}, root)
		corner(box, node.radius)
		stroke(box, node.stroke, node.strokeOpacity, node.strokeWidth)
		if node.gradient then
			gradient(box)
		end
		make("UIAspectRatioConstraint", { AspectRatio = 1 }, box)
		make("TextLabel", {
			Name = "Glyph",
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBlack,
			Size = UDim2.fromScale(1, 1),
			Text = node.glyph or "",
			TextColor3 = Color3.new(1, 1, 1),
			TextSize = math.floor((node.h or 24) * 0.5),
			TextScaled = false,
		}, box)
		table.insert(entrance, box)
	elseif node.kind == "toggle" then
		local row = make("Frame", {
			Name = node.name,
			BackgroundColor3 = node.fill and hexColor(node.fill) or palette.card,
			BackgroundTransparency = backgroundTransparency,
			BorderSizePixel = 0,
			Position = position,
			Size = size,
		}, root)
		corner(row, node.radius)
		stroke(row, node.stroke, node.strokeOpacity, node.strokeWidth)
		make("TextLabel", {
			Name = "Label",
			BackgroundTransparency = 1,
			Font = Enum.Font.Gotham,
			Position = UDim2.fromOffset(14, 0),
			Size = UDim2.fromOffset(node.w - 96, node.h),
			Text = node.text or "",
			TextColor3 = node.textColor and hexColor(node.textColor) or palette.text,
			TextSize = node.fontSize or 16,
			TextScaled = false,
			TextXAlignment = Enum.TextXAlignment.Left,
		}, row)
		local on = node.on == true
		local track = make("TextButton", {
			Name = "Switch",
			AutoButtonColor = false,
			BackgroundColor3 = on and palette.good or Color3.new(0, 0, 0),
			BackgroundTransparency = on and 0 or 0.55,
			BorderSizePixel = 0,
			Position = UDim2.fromOffset(node.w - 74, math.floor((node.h - 26) / 2)),
			Size = UDim2.fromOffset(56, 26),
			Text = "",
		}, row)
		corner(track, 13)
		local knob = make("Frame", {
			Name = "Knob",
			BackgroundColor3 = Color3.new(1, 1, 1),
			BorderSizePixel = 0,
			Position = UDim2.fromOffset(on and 32 or 4, 3),
			Size = UDim2.fromOffset(20, 20),
		}, track)
		corner(knob, 10)
		track.MouseButton1Click:Connect(function()
			on = not on
			TweenService:Create(knob, TweenInfo.new(0.14, Enum.EasingStyle.Quad), { Position = UDim2.fromOffset(on and 32 or 4, 3) }):Play()
			TweenService:Create(track, TweenInfo.new(0.14), {
				BackgroundColor3 = on and palette.good or Color3.new(0, 0, 0),
				BackgroundTransparency = on and 0 or 0.55,
			}):Play()
		end)
		table.insert(entrance, row)
	elseif node.kind == "slider" then
		local holder = make("Frame", {
			Name = node.name,
			BackgroundTransparency = 1,
			Position = position,
			Size = size,
		}, root)
		make("TextLabel", {
			Name = "Label",
			BackgroundTransparency = 1,
			Font = Enum.Font.Gotham,
			Size = UDim2.fromOffset(node.w - 60, 20),
			Text = node.text or "",
			TextColor3 = node.textColor and hexColor(node.textColor) or palette.text,
			TextSize = node.fontSize or 16,
			TextScaled = false,
			TextXAlignment = Enum.TextXAlignment.Left,
		}, holder)
		local value = math.clamp(node.progress or 0, 0, 1)
		local readout = make("TextLabel", {
			Name = "Value",
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBlack,
			Position = UDim2.fromOffset(node.w - 60, 0),
			Size = UDim2.fromOffset(60, 20),
			Text = tostring(math.floor(value * 100)) .. "%",
			TextColor3 = palette.muted,
			TextSize = 13,
			TextScaled = false,
			TextXAlignment = Enum.TextXAlignment.Right,
		}, holder)
		local track = make("TextButton", {
			Name = "Track",
			AutoButtonColor = false,
			BackgroundColor3 = Color3.new(0, 0, 0),
			BackgroundTransparency = 0.55,
			BorderSizePixel = 0,
			Position = UDim2.fromOffset(0, 30),
			Size = UDim2.fromOffset(node.w, 8),
			Text = "",
		}, holder)
		corner(track, 4)
		local fillBar = make("Frame", {
			Name = "Fill",
			BackgroundColor3 = node.fill and hexColor(node.fill) or palette.accent,
			BorderSizePixel = 0,
			Size = UDim2.fromOffset(math.floor(node.w * value), 8),
		}, track)
		corner(fillBar, 4)
		local knob = make("Frame", {
			Name = "Knob",
			AnchorPoint = Vector2.new(0.5, 0.5),
			BackgroundColor3 = Color3.new(1, 1, 1),
			BorderSizePixel = 0,
			Position = UDim2.fromOffset(math.floor(node.w * value), 4),
			Size = UDim2.fromOffset(18, 18),
		}, track)
		corner(knob, 9)
		local dragging = false
		local function setFromX(absoluteX: number)
			local ratio = math.clamp((absoluteX - track.AbsolutePosition.X) / math.max(track.AbsoluteSize.X, 1), 0, 1)
			fillBar.Size = UDim2.fromOffset(math.floor(node.w * ratio), 8)
			knob.Position = UDim2.fromOffset(math.floor(node.w * ratio), 4)
			readout.Text = tostring(math.floor(ratio * 100)) .. "%"
		end
		track.MouseButton1Down:Connect(function(x)
			dragging = true
			setFromX(x)
		end)
		track.MouseButton1Up:Connect(function()
			dragging = false
		end)
		track.MouseLeave:Connect(function()
			dragging = false
		end)
		track.MouseMoved:Connect(function(x)
			if dragging then
				setFromX(x)
			end
		end)
		table.insert(entrance, holder)
	else
		local className = node.kind == "button" and "TextButton" or "Frame"
		local props: { [string]: any } = {
			Name = node.name,
			BackgroundColor3 = node.fill and hexColor(node.fill) or palette.panel,
			BackgroundTransparency = backgroundTransparency,
			BorderSizePixel = 0,
			Position = position,
			Size = size,
		}
		if node.kind == "button" then
			props.AutoButtonColor = false
			props.Font = Enum.Font.GothamBlack
			props.Text = node.text or node.name
			props.TextColor3 = node.textColor and hexColor(node.textColor) or Color3.new(1, 1, 1)
			props.TextSize = node.fontSize or 18
			props.TextScaled = false
			props.TextTruncate = Enum.TextTruncate.AtEnd
			props.TextXAlignment = alignment(node.align)
		end
		local inst = make(className, props, root)
		corner(inst, node.radius)
		stroke(inst, node.stroke, node.strokeOpacity, node.strokeWidth)
		if node.gradient then
			gradient(inst)
		end
		if node.kind == "button" then
			if node.align == "left" then
				make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14) }, inst)
			end
			hoverMotion(inst)
			inst.MouseButton1Click:Connect(function()
				-- Wire this to your own systems (RemoteEvent, panel toggle, etc.).
				print("[BloxSmith UI] clicked: " .. inst.Name)
			end)
		end
		table.insert(entrance, inst)
	end
end

-- Staggered entrance: fade + small rise, matching the preview composition.
for index, inst in ipairs(entrance) do
	local targetPosition = inst.Position
	local targetTransparency = inst.BackgroundTransparency
	inst.Position = targetPosition + UDim2.fromOffset(0, 18)
	inst.BackgroundTransparency = math.min(1, targetTransparency + 0.25)
	task.delay(index * 0.012, function()
		if inst.Parent then
			TweenService:Create(inst, TweenInfo.new(0.28, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
				Position = targetPosition,
				BackgroundTransparency = targetTransparency,
			}):Play()
		end
	end)
end

if RunService:IsStudio() then
	print(string.format("[BloxSmith] %s built with %d elements on a %dx%d canvas.", GUI_NAME, #nodes, CANVAS_W, CANVAS_H))
end
`;
}

// ---------------------------------------------------------------------------
// Editor helpers
// ---------------------------------------------------------------------------

export function kindLabelFor(kind: UiKind) {
  return KIND_LABELS[kind];
}

// Screen types the editor can request explicitly. Prefixing the prompt with one
// of these labels guarantees the generator picks that exact layout.
export const UI_KIND_OPTIONS: Array<{ kind: UiKind; label: string; hint: string }> = [
  { kind: "main-menu", label: "Main Menu", hint: "Logo, title, vertical button stack" },
  { kind: "hud", label: "HUD", hint: "Edge-anchored pills, bars, hotbar" },
  { kind: "shop", label: "Shop", hint: "Currency pill, tabs, item cards" },
  { kind: "inventory", label: "Inventory", hint: "Rarity slot grid + detail panel" },
  { kind: "settings", label: "Settings", hint: "Tabs, sliders, toggles, save" },
  { kind: "loading", label: "Loading Screen", hint: "Logo, progress bar, tips" },
  { kind: "quests", label: "Quests", hint: "Quest cards + objective checklist" },
  { kind: "leaderboard", label: "Leaderboard", hint: "Podium top 3 + ranked rows" },
  { kind: "battlepass", label: "Battle Pass", hint: "Season XP + tier reward track" },
  { kind: "crafting", label: "Crafting", hint: "Recipes, material slots, output" },
  { kind: "trading", label: "Trading", hint: "Two offer panels + accept" },
  { kind: "dialog", label: "NPC Dialog", hint: "Portrait, speech box, choices" },
  { kind: "pause", label: "Pause Menu", hint: "Resume / Settings / Leave" },
];
