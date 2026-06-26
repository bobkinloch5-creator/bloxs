type UiConceptArgs = {
  prompt: string;
  style?: string;
};

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function paletteFor(style: string) {
  const s = style.toLowerCase();
  if (s.includes("neon") || s.includes("sci")) return ["#070a1f", "#18215a", "#38f2ff", "#a855f7", "#f8fafc"];
  if (s.includes("cute") || s.includes("cartoon")) return ["#151022", "#2f1d4f", "#ff7ad9", "#ffd166", "#ffffff"];
  if (s.includes("retro")) return ["#17120c", "#3b2a1a", "#f97316", "#facc15", "#fff7ed"];
  if (s.includes("minimal")) return ["#0f172a", "#1e293b", "#22c55e", "#93c5fd", "#f8fafc"];
  return ["#080817", "#171735", "#6d5dfc", "#2dd4bf", "#ffffff"];
}

function safeText(input: string, max = 44) {
  return input.replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "Premium Roblox UI";
}

function fallbackUiConcept({ prompt, style = "Modern" }: UiConceptArgs) {
  const [bg, surface, accent, accent2, text] = paletteFor(style);
  const title = safeText(prompt, 38);
  const isShop = /shop|gamepass|store|buy|currency/i.test(prompt);
  const isHud = /hud|health|xp|currency|bar/i.test(prompt);
  const cards = isShop ? ["Speed Boost", "VIP Pass", "Pet Egg"] : isHud ? ["Health", "XP", "Coins"] : ["Play", "Settings", "Inventory"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="${surface}"/></linearGradient>
    <linearGradient id="btn" x1="0" x2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity=".38"/></filter>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  <circle cx="1260" cy="150" r="210" fill="${accent}" opacity=".14"/>
  <circle cx="250" cy="850" r="260" fill="${accent2}" opacity=".10"/>
  <rect x="148" y="112" width="1240" height="800" rx="34" fill="#ffffff" opacity=".055" stroke="#ffffff" stroke-opacity=".14"/>
  <rect x="210" y="176" width="1116" height="132" rx="28" fill="#ffffff" opacity=".09" stroke="#ffffff" stroke-opacity=".18" filter="url(#shadow)"/>
  <text x="250" y="242" font-family="Gotham, Inter, Arial" font-size="48" font-weight="900" fill="${text}">${title}</text>
  <text x="252" y="284" font-family="Gotham, Inter, Arial" font-size="22" fill="#b8c1ff">Roblox-ready responsive interface concept</text>
  <rect x="1112" y="210" width="156" height="58" rx="20" fill="url(#btn)"/>
  <text x="1156" y="247" font-family="Gotham, Inter, Arial" font-size="22" font-weight="800" fill="#fff">PLAY</text>
  <rect x="230" y="366" width="270" height="430" rx="30" fill="#ffffff" opacity=".08" stroke="#ffffff" stroke-opacity=".14"/>
  <rect x="548" y="366" width="758" height="430" rx="30" fill="#ffffff" opacity=".08" stroke="#ffffff" stroke-opacity=".14"/>
  ${cards.map((card, i) => {
    const x = 590 + i * 230;
    return `<rect x="${x}" y="426" width="190" height="252" rx="26" fill="#ffffff" opacity=".105" stroke="#ffffff" stroke-opacity=".16"/>
    <rect x="${x + 22}" y="454" width="146" height="96" rx="22" fill="url(#btn)" opacity=".82"/>
    <text x="${x + 28}" y="604" font-family="Gotham, Inter, Arial" font-size="22" font-weight="800" fill="${text}">${safeText(card, 16)}</text>
    <rect x="${x + 24}" y="630" width="142" height="42" rx="16" fill="url(#btn)"/>
    <text x="${x + 63}" y="657" font-family="Gotham, Inter, Arial" font-size="16" font-weight="800" fill="#fff">${isShop ? "BUY" : "OPEN"}</text>`;
  }).join("")}
  <rect x="258" y="420" width="196" height="52" rx="18" fill="url(#btn)"/>
  <rect x="258" y="496" width="196" height="52" rx="18" fill="#ffffff" opacity=".10"/>
  <rect x="258" y="572" width="196" height="52" rx="18" fill="#ffffff" opacity=".10"/>
  <rect x="258" y="700" width="196" height="18" rx="9" fill="#ffffff" opacity=".10"/>
  <rect x="258" y="700" width="138" height="18" rx="9" fill="${accent2}"/>
  <text x="286" y="455" font-family="Gotham, Inter, Arial" font-size="18" font-weight="800" fill="#fff">Main</text>
  <text x="286" y="531" font-family="Gotham, Inter, Arial" font-size="18" font-weight="800" fill="${text}" opacity=".82">Settings</text>
  <text x="286" y="607" font-family="Gotham, Inter, Arial" font-size="18" font-weight="800" fill="${text}" opacity=".82">Inventory</text>
  <text x="230" y="862" font-family="Gotham, Inter, Arial" font-size="18" fill="#b8c1ff">Generated UI concept. BloxSmith converts this into real ScreenGui, Frames, Buttons, constraints, animations, and Luau.</text>
</svg>`;
  return svgDataUrl(svg);
}

export async function generateUiConceptImage(args: UiConceptArgs): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  const prompt = `Premium Roblox game UI concept art, not a website. ${args.style ?? "Modern"} style. Request: ${args.prompt}. Clean loading screen/main menu/HUD/shop quality, rounded panels, readable text blocks, game-ready layout, mobile friendly safe areas, polished colors.`;

  if (key) {
    try {
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
          quality: "medium",
          output_format: "png",
        }),
      });
      if (response.ok) {
        const json = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
        const first = json.data?.[0];
        if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
        if (first?.url) return first.url;
      }
    } catch {
      // Fall back to deterministic SVG concept below.
    }
  }

  return fallbackUiConcept(args);
}
