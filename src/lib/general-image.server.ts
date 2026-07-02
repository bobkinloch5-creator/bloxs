// General-purpose image generation for the AI chat.
// Used when the user asks for a real subject (dog, sword icon, logo, character
// concept, thumbnail, banner, badge, etc.) — anything that is NOT a Roblox
// ScreenGui / UI layout mockup. UI concept art still routes through
// generateUiConceptImage which returns SVG mockups of GUI panels.
//
// Provider order: Lovable AI Gateway (openai/gpt-image-2) → optional Gemini
// image → optional OpenAI direct. Returns a data: URL on success, or throws.

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

async function callLovableGateway(prompt: string, size: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt,
      size,
      quality: "low",
      n: 1,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  return null;
}

export async function generateGeneralImage(args: GenArgs): Promise<string> {
  const size = args.size ?? "1024x1024";
  const prompt = `${args.prompt.trim()}${subjectHint(args.kind)}${styleHint(args.style)}`.slice(0, 1500);
  try {
    const url = await callLovableGateway(prompt, size);
    if (url) return url;
  } catch {
    // fall through
  }
  throw new Error("Image generation is temporarily unavailable. Please try again in a moment.");
}

// Heuristic: is the user actually asking for a Roblox GUI/ScreenGui mockup?
// If yes, chat.ts routes to generateUiConceptImage; otherwise generateGeneralImage.
export function isUiConceptRequest(prompt: string, kind?: string): boolean {
  if (kind === "ui_background" || kind === "loading_screen") return true;
  const p = prompt.toLowerCase();
  if (/\b(screengui|gui|ui|hud|menu|shop ui|shop menu|inventory ui|inventory menu|settings menu|main menu|pause menu|quest ui|dialog(?:ue)? ui|gamepass ui|leaderboard ui|loading screen|health bar|xp bar|currency (?:ui|display)|mobile controls?)\b/.test(p)) return true;
  return false;
}
