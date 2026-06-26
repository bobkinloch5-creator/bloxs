import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { DEFAULT_MODEL_ID } from "./models";
import { generateUiConceptImage } from "./ui-concept-image.server";

const SYS = `You are a senior Roblox UI/UX engineer. You output a SINGLE, self-contained Luau script that builds ONE polished ScreenGui at runtime.

OUTPUT
- Output ONLY Luau code. No markdown fences, no commentary, no explanations.

RUNTIME
- Parent the UI exactly like this: local player = game:GetService("Players").LocalPlayer; local gui = Instance.new("ScreenGui"); gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui").
- The script must run as-is when pasted into a LocalScript in StarterPlayer > StarterPlayerScripts.
- Do NOT use deprecated APIs (no Frame.SizeConstraint hacks, no GuiObject.Selectable hacks).

QUALITY BAR
- Use modern Roblox UI primitives: UICorner, UIGradient, UIStroke, UIPadding, UIListLayout / UIGridLayout, ScrollingFrame and UIAspectRatioConstraint where helpful.
- Use Scale-based UDim2 sizing + AnchorPoint so the layout is mobile-friendly and reads correctly on phone, tablet and desktop.
- Add hover/press feedback on every interactive button via TweenService.
- Use semantic, descriptive Instance .Name values, and a short comment above each section so a beginner can follow it.

DESIGN DISCIPLINE — THIS IS THE MOST IMPORTANT PART
- Build the EXACT screen the user asked for, using the structure that screen actually needs. A loading screen, shop, inventory grid, main menu, RPG HUD, simulator HUD, settings panel and popup are all structurally DIFFERENT — never collapse them into one generic centered panel.
- The visual style (colors, typography weight, corner radius, glow, borders, button shape, spacing) MUST match the requested style. A light style must be genuinely light; cartoon must be playful and chunky; futuristic/sci-fi must be sleek with neon glow; premium must feel high-end; dark must be deep and moody.
- DO NOT default to a dark frosted-glass panel. Only use dark / glass surfaces when the requested style or prompt actually calls for it.
- Every generation must be a FRESH, DISTINCT design. Do NOT reuse the same palette, layout, button shape or composition across different prompts. Choose a layout, color palette and button treatment that specifically fit THIS request.
- Pick a coordinated palette of 4-6 colors that suits the style and theme — never a single hardcoded scheme.`;

type ScreenKind =
  | "loading" | "shop" | "inventory" | "main-menu" | "settings"
  | "rpg-hud" | "simulator-hud" | "quest" | "leaderboard" | "popup" | "generic";

function detectScreen(prompt: string): ScreenKind {
  const p = prompt.toLowerCase();
  if (/loading|splash|please wait|now loading|progress\s*bar/.test(p)) return "loading";
  if (/shop|store|game ?pass|purchase|\bbuy\b|currency|robux|coins?\b/.test(p)) return "shop";
  if (/inventory|backpack|items? grid|equip|loadout|hotbar slots/.test(p)) return "inventory";
  if (/main menu|title screen|start menu|home screen|play button|landing/.test(p)) return "main-menu";
  if (/settings|options|preferences|audio|graphics|controls/.test(p)) return "settings";
  if (/\brpg\b|health bar|mana|stamina|xp bar|level up|skill|spell|ability/.test(p)) return "rpg-hud";
  if (/simulator|rebirth|pet|hatch|boost|multiplier|click(er)?/.test(p)) return "simulator-hud";
  if (/quest|mission|objective|task list|battle ?pass|reward tier|\btier\b/.test(p)) return "quest";
  if (/leaderboard|ranking|top players|podium|scoreboard/.test(p)) return "leaderboard";
  if (/popup|pop-up|dialog|modal|confirm|reward screen|notification|toast/.test(p)) return "popup";
  return "generic";
}

const SCREEN_GUIDE: Record<ScreenKind, string> = {
  loading: "A full-screen loading / splash screen: centered logo or title, an animated progress bar (TweenService loop or a driven percentage), rotating tip text, and a subtle animated background. No content grid.",
  shop: "A shop: a ScrollingFrame grid/row of product cards (UIGridLayout) — each card with an icon area, name, price + currency icon, and a Buy button; a currency balance pill in a corner; a clear header and a close button.",
  inventory: "An inventory: a ScrollingFrame grid of item slots (UIGridLayout) with rarity-colored borders and quantity badges, an item detail/preview panel, equip/unequip actions, and category tabs along one edge.",
  "main-menu": "A main menu: a large game title/logo, a vertical stack of primary buttons (Play, Shop, Settings, Credits) with strong hover states, and decorative side art. Not a content grid.",
  settings: "A settings panel: grouped rows with labels and controls (toggles built from buttons, sliders built from frames, dropdowns), section headers, and Save / Reset actions.",
  "rpg-hud": "An RPG HUD overlay anchored to the screen edges: health/mana/stamina bars, an XP bar with a level badge, a hotbar of ability slots with cooldown overlays, and a quest tracker or minimap in a corner. Keep the screen center clear.",
  "simulator-hud": "A simulator HUD: a big animated currency counter, multiplier and rebirth pills, a vertical button rail (Shop, Pets, Rebirth, Index), and a progress-to-next-goal bar. Bright and punchy.",
  quest: "A quest / battle-pass screen: a horizontal tier track or vertical objective list with progress bars, locked/unlocked reward tiles, and Claim buttons.",
  leaderboard: "A leaderboard: a ranked list of rows (rank, avatar slot, name, score) with the local player highlighted, an optional top-3 podium, and a Global/Friends tab switch.",
  popup: "A centered modal/popup over a dimmed backdrop: an icon, title, body text, and one or two action buttons, with a tasteful pop-in animation.",
  generic: "Build the specific screen described, choosing the layout that best fits the requested content.",
};

function styleBrief(style: string, prompt: string): string {
  const s = `${style} ${prompt}`.toLowerCase();
  if (/light mode|light theme|\blight\b/.test(s) && !/light blue/.test(s))
    return "LIGHT MODE: bright off-white / light-gray surfaces, dark high-contrast text, soft subtle shadows, and one or two colorful accents. Backgrounds MUST be light, never dark.";
  if (/futur|sci-?fi|cyber|neon|tech|hologram/.test(s))
    return "FUTURISTIC / SCI-FI: sleek dark base with glowing neon accents (cyan / magenta / lime), thin bright UIStroke edges, sharp geometric panels, and layered strokes for a subtle glow.";
  if (/cartoon|cute|kawaii|playful|kids/.test(s))
    return "CARTOON: playful chunky rounded shapes, thick dark outlines (UIStroke), bright saturated candy colors, bold rounded heavy title text, and a drop-shadow pop.";
  if (/retro|vintage|pixel|arcade|8-?bit/.test(s))
    return "RETRO: warm vintage palette (orange / amber / cream), chunky bold-bordered buttons, blocky shapes, and a nostalgic arcade feel.";
  if (/minimal|clean|simple|flat/.test(s))
    return "MINIMAL: generous whitespace, a restrained 2-3 color palette, thin strokes, small corner radius, clean typography, and no glow.";
  if (/premium|luxury|elegant|gold|vip|deluxe/.test(s))
    return "PREMIUM: high-end feel — a refined dark or jewel-tone palette with gold / metallic accents, generous spacing, subtle gradients, crisp strokes, and elegant typography.";
  if (/dark mode|dark theme|\bdark\b/.test(s))
    return "DARK MODE: deep charcoal / near-black surfaces, light text, a single vivid accent color, and subtle elevation between layers.";
  if (/modern|sleek/.test(s))
    return "MODERN: a clean contemporary look with a balanced palette, medium corner radius, soft gradients, and clear visual hierarchy.";
  return `${style.toUpperCase()} STYLE: interpret this style faithfully with an original coordinated palette and shapes that genuinely match it.`;
}

export const generateRobloxUi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    prompt: z.string().min(3).max(2000),
    style: z.string().min(1).max(40),
    projectId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { model } = getProviderModel(DEFAULT_MODEL_ID);
    const conceptImageUrl = await generateUiConceptImage({ prompt: data.prompt, style: data.style });

    const screen = detectScreen(data.prompt);
    // A short random token so even identical prompts produce a fresh variation,
    // while still following the request. Never printed in the output.
    const variety = Math.random().toString(36).slice(2, 8);

    const userPrompt = `Requested style: ${data.style}
Style direction: ${styleBrief(data.style, data.prompt)}

Screen to build: ${data.prompt}
Detected screen type: ${screen}
Layout guidance: ${SCREEN_GUIDE[screen]}

Build this as REAL Roblox UI objects (ScreenGui, Frames, TextLabels, TextButtons, ScrollingFrames, UIGridLayout/UIListLayout, UICorner, UIGradient, UIStroke, UIPadding, TweenService) — not a flat image.
Match the requested style and the detected screen type exactly. Choose a coordinated color palette that fits the style; do NOT default to a dark frosted-glass panel unless the prompt explicitly asks for dark or glass.
Make it fresh and distinct: pick a layout, palette and button treatment that specifically fit THIS request — do not reuse a generic template.
Use responsive Scale-based sizing with AnchorPoints, meaningful Instance names, and a short comment above each section.
Internal design-variation token (use it to vary spacing / accent choices; do NOT output it): ${variety}`;

    const { text } = await generateText({
      model,
      system: SYS,
      prompt: userPrompt,
      // Higher temperature for genuine variety between requests; the strict
      // structural rules above keep the output valid and on-prompt.
      temperature: 0.9,
    });

    // Strip accidental code fences if model emitted them.
    const cleaned = text
      .replace(/^```(?:lua|luau)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    if (data.projectId) {
      await context.supabase.from("chat_messages").insert({
        project_id: data.projectId,
        user_id: context.userId,
        role: "assistant",
        content: `Generated a ${data.style} Roblox UI (${screen}) and matching Luau UI builder for: ${data.prompt}`,
        status: "done",
        model: DEFAULT_MODEL_ID,
        image_url: conceptImageUrl,
      });
    }

    return { code: cleaned, conceptImageUrl };
  });
