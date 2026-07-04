// General-purpose image generation for the AI chat.
// Used when the user asks for a real subject (dog, sword icon, logo, character
// concept, thumbnail, banner, badge, etc.) — anything that is NOT a Roblox
// ScreenGui / UI layout mockup. UI concept art still routes through
// generateUiConceptImage which returns SVG mockups of GUI panels.
//
// NVIDIA-first deployments generate real images through NVIDIA NIM. If NVIDIA is
// temporarily unavailable, return a local SVG fallback so the UI still responds.

type GenArgs = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "512x512";
  style?: string;
  kind?: string;
};

const STYLE_HINT: Record<string, string> = {
  modern: "modern, clean, premium",
  cartoon: "bright cartoon illustration, bold outlines, cel-shaded",
  neon: "vibrant neon, glowing highlights, cyberpunk lighting",
  futuristic: "sleek futuristic sci-fi look, high-tech materials",
  cute: "cute, friendly, rounded shapes, pastel palette",
  retro: "retro pixel/80s poster feel, warm palette",
  horror: "dark horror atmosphere, moody lighting, high contrast",
  fantasy: "epic fantasy illustration, painterly, rich lighting",
  premium: "premium AAA marketing art quality",
  minimal: "minimalist composition, flat design, plenty of negative space",
  dark: "dark background, dramatic rim lighting",
  light: "bright, clean, well-lit composition",
};

function styleHint(style?: string): string {
  if (!style) return "";
  const key = style.toLowerCase();
  for (const k of Object.keys(STYLE_HINT)) {
    if (key.includes(k)) return `. Style: ${STYLE_HINT[k]}`;
  }
  return `. Style: ${style}`;
}

function subjectHint(kind?: string): string {
  switch (kind) {
    case "logo": return ". Centered logo composition, transparent-friendly background, crisp edges, iconic silhouette.";
    case "thumbnail": return ". Roblox game thumbnail composition: bold hero subject, strong readable focal point, dramatic lighting, no text.";
    case "icon":
    case "shop_icon":
    case "item_icon":
    case "badge": return ". Square icon composition, single centered subject, clean background, chunky readable silhouette, no text.";
    case "character_concept": return ". Full-body character concept art, dynamic pose, neutral background.";
    case "map_concept": return ". Wide environment concept art, painterly, cinematic camera angle.";
    case "promo":
    case "banner": return ". Wide promotional banner composition, strong focal point, room for title overlay.";
    default: return "";
  }
}

function escapeSvgText(input: string) {
  return input.replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch] ?? ch));
}

function localConceptSvg(prompt: string, kind?: string): string {
  const title = escapeSvgText((kind || "NVIDIA-only concept").replace(/_/g, " ").slice(0, 34));
  const subtitle = escapeSvgText(prompt.replace(/\s+/g, " ").trim().slice(0, 92));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#07131f"/><stop offset="1" stop-color="#10271f"/></linearGradient>
    <linearGradient id="g" x1="0" x2="1"><stop stop-color="#76b900"/><stop offset="1" stop-color="#38d39f"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="32" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g opacity=".2"><rect x="112" y="180" width="800" height="560" rx="42" fill="#76b900"/><circle cx="792" cy="256" r="128" fill="#38d39f"/><circle cx="232" cy="734" r="170" fill="#76b900"/></g>
  <g filter="url(#shadow)">
    <rect x="134" y="238" width="756" height="548" rx="28" fill="#07111d" stroke="#ffffff" stroke-opacity=".12"/>
    <rect x="188" y="308" width="648" height="250" rx="20" fill="url(#g)" opacity=".16"/>
    <path d="M238 518 374 398l94 80 70-58 248 198H238z" fill="url(#g)" opacity=".72"/>
    <circle cx="710" cy="370" r="52" fill="#f8fafc" opacity=".72"/>
    <text x="512" y="654" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="900" fill="#f8fafc">${title}</text>
    <text x="512" y="704" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="22" fill="#cbd5e1">${subtitle}</text>
    <text x="512" y="744" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="18" fill="#76b900">NVIDIA-only mode · paid image gateway disabled</text>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// NVIDIA-hosted image models on ai.api.nvidia.com/v1/genai.
// Ordered by preference; falls through to the next on failure/rate-limit.
const NVIDIA_IMAGE_MODELS: Array<{ id: string; endpoint: string; buildBody: (prompt: string, size: string) => Record<string, unknown> }> = [
  {
    id: "black-forest-labs/flux.1-schnell",
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    buildBody: (prompt, size) => ({
      prompt,
      height: sizeToHeight(size),
      width: sizeToWidth(size),
      // FLUX.1-schnell's NVIDIA NIM expects cfg_scale=0 and 1-4 steps.
      cfg_scale: 0,
      mode: "base",
      samples: 1,
      seed: 0,
      steps: 4,
    }),
  },
  {
    id: "black-forest-labs/flux.1-dev",
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
    buildBody: (prompt, size) => ({
      prompt,
      cfg_scale: 3.5,
      height: sizeToHeight(size),
      width: sizeToWidth(size),
      mode: "base",
      samples: 1,
      seed: Math.floor(Math.random() * 1_000_000),
      steps: 30,
    }),
  },
];

function sizeToWidth(size: string): number {
  const [w] = size.split("x").map((n) => Number(n));
  return Number.isFinite(w) ? Math.min(1344, Math.max(768, w)) : 1024;
}

function sizeToHeight(size: string): number {
  const [, h] = size.split("x").map((n) => Number(n));
  return Number.isFinite(h) ? Math.min(1344, Math.max(768, h)) : 1024;
}

function extractBase64(json: unknown): { b64: string; mime: string } | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  // FLUX-style: { artifacts: [{ base64: "..." }] } returns JPEG.
  const arts = j.artifacts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(arts) && arts[0]) {
    const finish = String(arts[0].finishReason ?? arts[0].finish_reason ?? "SUCCESS");
    if (finish && finish !== "SUCCESS") return null;
    const b = arts[0].base64 ?? arts[0].b64_json;
    if (typeof b === "string" && b.length > 100) return { b64: b, mime: "image/jpeg" };
  }
  if (typeof j.image === "string" && j.image.length > 100) return { b64: j.image, mime: "image/png" };
  if (typeof j.b64_json === "string" && j.b64_json.length > 100) return { b64: j.b64_json, mime: "image/png" };
  // data: [{ b64_json }]
  const data = j.data as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(data) && data[0]) {
    const b = data[0].b64_json ?? data[0].base64;
    if (typeof b === "string" && b.length > 100) return { b64: b, mime: "image/png" };
  }
  return null;
}

async function tryNvidiaImage(prompt: string, size: string): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;
  if (!key) return null;

  for (const model of NVIDIA_IMAGE_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110_000);
      const res = await fetch(model.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(model.buildBody(prompt, size)),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(`[nvidia-image] ${model.id} failed ${res.status}`, txt.slice(0, 200));
        // 429 or 5xx → try next model; other errors also try next
        continue;
      }
      const json = await res.json().catch(() => null);
      const img = extractBase64(json);
      if (img) {
        console.log(`[nvidia-image] ${model.id} succeeded`);
        return `data:${img.mime};base64,${img.b64}`;
      }
      console.warn(`[nvidia-image] ${model.id} returned no image payload`);
    } catch (err) {
      console.warn(`[nvidia-image] ${model.id} threw`, err);
    }
  }
  return null;
}

async function tryLovableImageFallback(prompt: string, size: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        quality: "low",
        size,
        n: 1,
        stream: false,
      }),
    });
    if (!res.ok) {
      console.warn("[image-fallback] Lovable image failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const json = await res.json().catch(() => null);
    const img = extractBase64(json);
    return img ? `data:${img.mime};base64,${img.b64}` : null;
  } catch (err) {
    console.warn("[image-fallback] Lovable image threw", err);
    return null;
  }
}


export async function generateGeneralImage(args: GenArgs): Promise<string> {
  const prompt = `${args.prompt.trim()}${subjectHint(args.kind)}${styleHint(args.style)}`.slice(0, 1500);
  const size = args.size ?? "1024x1024";
  // NVIDIA first per BloxSmith's provider preference. If NVIDIA is cold/down,
  // fall back to a real image provider instead of asking questions or returning
  // a disabled placeholder.
  const nvImage = await tryNvidiaImage(prompt, size);
  if (nvImage) return nvImage;
  const fallbackImage = await tryLovableImageFallback(prompt, size);
  if (fallbackImage) return fallbackImage;
  return localConceptSvg(prompt, args.kind);
}


// Heuristic: is the user actually asking for a Roblox GUI/ScreenGui mockup?
// If yes, chat.ts routes to generateUiConceptImage; otherwise generateGeneralImage.
export function isUiConceptRequest(prompt: string, kind?: string): boolean {
  if (kind === "ui_background" || kind === "loading_screen") return true;
  const p = prompt.toLowerCase();
  if (/\b(screengui|gui|ui|hud|menu|shop ui|shop menu|inventory ui|inventory menu|settings menu|main menu|pause menu|quest ui|dialog(?:ue)? ui|gamepass ui|leaderboard ui|loading screen|health bar|xp bar|currency (?:ui|display)|mobile controls?)\b/.test(p)) return true;
  return false;
}
