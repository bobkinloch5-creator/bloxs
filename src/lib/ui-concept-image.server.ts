type UiConceptArgs = {
  prompt: string;
  style?: string;
};

const LAYOUTS = [
  "hero-menu",
  "shop-catalog",
  "hud-bars",
  "inventory-grid",
  "quest-journal",
  "loading-screen",
] as const;

const SHAPES = [
  "soft glass panels",
  "chunky Roblox simulator cards",
  "thin premium bordered panels",
  "angled futuristic panels",
  "bright layered cartoon tiles",
] as const;

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function paletteFor(style: string) {
  // Returns [bg, surface, accent, accent2, text]. Kept varied per style so the
  // concept art actually reflects the requested look instead of one dark scheme.
  const s = style.toLowerCase();
  if (s.includes("light")) return ["#eef2f9", "#ffffff", "#6d5dfc", "#06b6d4", "#0f172a"];
  if (s.includes("futur") || s.includes("neon") || s.includes("sci") || s.includes("cyber")) return ["#070a1f", "#18215a", "#38f2ff", "#a855f7", "#f8fafc"];
  if (s.includes("cute") || s.includes("cartoon")) return ["#fff0f6", "#ffe1ef", "#ff5fa2", "#ffb347", "#3a1d2e"];
  if (s.includes("retro")) return ["#17120c", "#3b2a1a", "#f97316", "#facc15", "#fff7ed"];
  if (s.includes("minimal")) return ["#f8fafc", "#ffffff", "#0ea5e9", "#64748b", "#0f172a"];
  if (s.includes("premium") || s.includes("luxury") || s.includes("vip")) return ["#0b0b10", "#1b1726", "#d4af37", "#9b8cff", "#fdf6e3"];
  if (s.includes("horror")) return ["#09090b", "#171717", "#ef4444", "#737373", "#f5f5f5"];
  if (s.includes("fantasy")) return ["#14072e", "#251047", "#c084fc", "#facc15", "#fff7ed"];
  if (s.includes("rpg")) return ["#1c1209", "#3b2413", "#d4a017", "#8b5cf6", "#fff7ed"];
  if (s.includes("dark")) return ["#05060a", "#12141c", "#6366f1", "#22d3ee", "#f8fafc"];
  return ["#080817", "#171735", "#6d5dfc", "#2dd4bf", "#ffffff"];
}

function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return ((s >>> 0) / 4294967296);
  };
}

function pick<T>(items: readonly T[], random: () => number) {
  return items[Math.floor(random() * items.length) % items.length];
}

function safeText(input: string, max = 44) {
  return input.replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "Premium Roblox UI";
}

function fallbackUiConcept({ prompt, style = "Modern" }: UiConceptArgs) {
  const seed = hashSeed(`${prompt}|${style}|${Date.now()}|${Math.random()}`);
  const random = seeded(seed);
  const [bg, surface, accent, accent2, text] = paletteFor(style);
  const title = safeText(prompt, 38);
  const isShop = /shop|gamepass|store|buy|currency/i.test(prompt);
  const isHud = /hud|health|xp|currency|bar/i.test(prompt);
  const isInventory = /inventory|items|pets|weapons|backpack/i.test(prompt);
  const isQuest = /quest|dialog|rpg|mission/i.test(prompt);
  const isLoading = /loading|load screen|progress/i.test(prompt);
  const requestedLayout =
    isShop ? "shop-catalog"
    : isHud ? "hud-bars"
    : isInventory ? "inventory-grid"
    : isQuest ? "quest-journal"
    : isLoading ? "loading-screen"
    : pick(LAYOUTS, random);
  const shape = pick(SHAPES, random);
  const cards = isShop ? ["Speed Boost", "VIP Pass", "Pet Egg", "2x Coins"]
    : isHud ? ["Health", "XP", "Coins", "Gems"]
    : isInventory ? ["Legendary", "Rare", "Epic", "Common", "Equip", "Inspect"]
    : isQuest ? ["Daily Quest", "Boss Hunt", "Reward", "Progress"]
    : ["Play", "Settings", "Inventory", "Shop"];
  const heroX = Math.round(120 + random() * 90);
  const heroY = Math.round(108 + random() * 40);
  const radius = Math.round(22 + random() * 22);
  const tilt = Math.round((random() - 0.5) * 5);
  const glow = Math.max(0.12, Math.min(0.32, random() * 0.3));
  const gridCards = cards.map((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 600 + col * 220;
    const y = 398 + row * 190;
    const icon = ["★", "◆", "●", "✦", "⬢", "▣"][i % 6];
    return `<g transform="translate(${x} ${y})">
      <rect width="190" height="154" rx="${radius}" fill="#ffffff" opacity="${0.08 + random() * 0.08}" stroke="#ffffff" stroke-opacity=".18"/>
      <rect x="18" y="18" width="64" height="64" rx="18" fill="url(#btn)" opacity=".9"/>
      <text x="50" y="60" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="28" font-weight="900" fill="#fff">${icon}</text>
      <text x="18" y="112" font-family="Gotham, Inter, Arial" font-size="20" font-weight="900" fill="${text}">${safeText(card, 16)}</text>
      <rect x="18" y="122" width="120" height="12" rx="6" fill="#ffffff" opacity=".12"/>
      <rect x="18" y="122" width="${62 + Math.round(random() * 52)}" height="12" rx="6" fill="${accent2}" opacity=".95"/>
    </g>`;
  }).join("");

  const centerPanel = requestedLayout === "hud-bars"
    ? `<g transform="translate(218 330)">
        <rect width="1100" height="410" rx="${radius}" fill="#ffffff" opacity=".055" stroke="#ffffff" stroke-opacity=".14"/>
        ${["HEALTH", "XP", "ENERGY"].map((label, i) => {
          const y = 52 + i * 108;
          return `<text x="58" y="${y}" font-family="Gotham, Inter, Arial" font-size="26" font-weight="900" fill="${text}">${label}</text>
          <rect x="230" y="${y - 28}" width="740" height="38" rx="19" fill="#000000" opacity=".28"/>
          <rect x="230" y="${y - 28}" width="${360 + Math.round(random() * 330)}" height="38" rx="19" fill="url(#btn)"/>
          <rect x="1000" y="${y - 38}" width="58" height="58" rx="18" fill="#ffffff" opacity=".11"/>`;
        }).join("")}
      </g>`
    : requestedLayout === "loading-screen"
      ? `<g transform="translate(288 356)">
          <rect width="960" height="318" rx="${radius}" fill="#ffffff" opacity=".08" stroke="#ffffff" stroke-opacity=".18" filter="url(#shadow)"/>
          <text x="480" y="95" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="48" font-weight="900" fill="${text}">Loading World</text>
          <text x="480" y="144" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="22" fill="${text}" opacity=".72">Preparing scripts, UI, and Roblox systems</text>
          <rect x="160" y="210" width="640" height="28" rx="14" fill="#000000" opacity=".3"/>
          <rect x="160" y="210" width="${350 + Math.round(random() * 240)}" height="28" rx="14" fill="url(#btn)"/>
        </g>`
      : `<g>${gridCards}</g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="${surface}"/></linearGradient>
    <linearGradient id="btn" x1="0" x2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".42"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000" flood-opacity=".42"/></filter>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  <rect width="1536" height="1024" fill="url(#glow)" opacity="${glow}" transform="translate(${Math.round(random() * 800)} ${Math.round(random() * 300)}) scale(1.2)"/>
  <circle cx="${1150 + Math.round(random() * 180)}" cy="${120 + Math.round(random() * 180)}" r="${160 + Math.round(random() * 110)}" fill="${accent}" opacity=".13"/>
  <circle cx="${160 + Math.round(random() * 180)}" cy="${720 + Math.round(random() * 180)}" r="${180 + Math.round(random() * 120)}" fill="${accent2}" opacity=".12"/>
  <rect x="98" y="84" width="1340" height="850" rx="${radius + 12}" fill="#ffffff" opacity=".045" stroke="#ffffff" stroke-opacity=".13"/>
  <g transform="rotate(${tilt} 768 512)">
    <rect x="${heroX}" y="${heroY}" width="1180" height="142" rx="${radius}" fill="#ffffff" opacity=".095" stroke="#ffffff" stroke-opacity=".2" filter="url(#shadow)"/>
    <text x="${heroX + 44}" y="${heroY + 64}" font-family="Gotham, Inter, Arial" font-size="46" font-weight="900" fill="${text}">${title}</text>
    <text x="${heroX + 46}" y="${heroY + 106}" font-family="Gotham, Inter, Arial" font-size="21" fill="${text}" opacity=".7">${safeText(style, 18)} · ${requestedLayout.replace("-", " ")} · ${shape}</text>
    <rect x="${heroX + 960}" y="${heroY + 42}" width="152" height="58" rx="20" fill="url(#btn)"/>
    <text x="${heroX + 1036}" y="${heroY + 78}" text-anchor="middle" font-family="Gotham, Inter, Arial" font-size="21" font-weight="900" fill="#fff">${isShop ? "BUY" : isLoading ? "LOAD" : "PLAY"}</text>
  </g>
  <rect x="220" y="358" width="292" height="454" rx="${radius}" fill="#ffffff" opacity=".075" stroke="#ffffff" stroke-opacity=".16"/>
  <text x="258" y="424" font-family="Gotham, Inter, Arial" font-size="30" font-weight="900" fill="${text}">Menu</text>
  ${["Overview", isShop ? "Offers" : "Play", "Settings", isInventory ? "Equip" : "Inventory"].map((label, i) =>
    `<rect x="258" y="${472 + i * 74}" width="214" height="50" rx="17" fill="${i === 0 ? "url(#btn)" : "#ffffff"}" opacity="${i === 0 ? ".95" : ".105"}"/>
    <text x="286" y="${504 + i * 74}" font-family="Gotham, Inter, Arial" font-size="17" font-weight="900" fill="${i === 0 ? "#fff" : text}">${label}</text>`
  ).join("")}
  <rect x="548" y="344" width="790" height="486" rx="${radius + 4}" fill="#ffffff" opacity=".064" stroke="#ffffff" stroke-opacity=".15"/>
  ${centerPanel}
  <text x="220" y="890" font-family="Gotham, Inter, Arial" font-size="18" fill="${text}" opacity=".64">Unique generated concept. BloxSmith rebuilds it as real ScreenGui objects, animations, and Luau.</text>
</svg>`;
  return svgDataUrl(svg);
}

async function generateGeminiImage(prompt: string): Promise<string | null> {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!response.ok) return null;
  const json = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  const image = json.candidates?.flatMap((c) => c.content?.parts ?? []).find((p) => p.inlineData?.data)?.inlineData;
  return image?.data ? `data:${image.mimeType || "image/png"};base64,${image.data}` : null;
}

async function generateOpenAiImage(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      output_format: "png",
    }),
  });
  if (!response.ok) return null;
  const json = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  return null;
}

export async function generateUiConceptImage(args: UiConceptArgs): Promise<string> {
  const style = args.style ?? "Modern";
  const variation = Math.floor(Math.random() * 1_000_000);
  const prompt = `Premium Roblox game UI concept art, polished AAA Roblox interface, not a website, not a wireframe.
Style: ${style}. Request: ${args.prompt}. Variation seed: ${variation}.
Create a fresh unique layout every time with strong hierarchy, crisp spacing, professional typography, rich icons, beautiful buttons, responsive mobile-safe composition, and Roblox game feel.
Make it specific to the requested screen type: loading screen, main menu, HUD, shop, inventory, gamepass UI, quest UI, health/XP/currency display, or settings.
Avoid generic dark frosted-glass templates, empty panels, placeholder boxes, blurry text, broken labels, bland colors, clutter, overlap, and low-effort mockups.
The image is only a concept; BloxSmith will rebuild it as real Roblox ScreenGui objects.`;

  try {
    const geminiImage = await generateGeminiImage(prompt);
    if (geminiImage) return geminiImage;
  } catch {
    // Try the next provider, then the high-quality randomized local fallback.
  }

  try {
    const openAiImage = await generateOpenAiImage(prompt);
    if (openAiImage) return openAiImage;
  } catch {
    // Fall back to generated SVG below.
  }

  return fallbackUiConcept(args);
}
