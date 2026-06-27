import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { DEFAULT_MODEL_ID } from "./models";
import { generateUiConceptImage } from "./ui-concept-image.server";

// ---------------------------------------------------------------------------
// System prompt — governs ALL UI generations.
// The key requirement: EVERY prompt must produce a UNIQUE design.
// The AI must read the user's request carefully and choose the correct
// layout, palette, and components — never fall back to the same template.
// ---------------------------------------------------------------------------
const SYS = `You are a senior Roblox UI engineer. Given a style tag and a prompt, produce ONE complete, self-contained Luau LocalScript that builds a premium, UNIQUE ScreenGui entirely at runtime.

STEP 1 — READ THE PROMPT. Choose the layout type that fits:
  Loading Screen  → full-screen overlay, progress bar, tip rotator, fade-out on game.Loaded
  Main Menu       → hero bg + logo + vertical Play/Shop/Settings button stack + footer
  Shop UI         → currency pill header + category tabs + ScrollingFrame UIGridLayout item cards
  Inventory UI    → search TextBox + rarity-bordered grid + item detail panel + equip/drop buttons
  Quest / RPG UI  → left tracker panel + quest cards with progress bars + NPC dialog area
  HUD             → coin pill top-left, XP bar top-right, health bar bottom-center (edge-anchored, NOT full-screen modal)
  Simulator UI    → large action icon grid + stat counters + rebirth/upgrade button
  Settings Menu   → modal with tabs: Audio sliders, Graphics toggles, Controls section
  Pause Menu      → centered modal, Resume / Settings / Quit buttons
  Battle Pass     → tier track scrolling left-right + locked/unlocked reward cards + XP progress
  Leaderboard     → ranked list rows with avatar thumbnail + name + score, podium top-3
  Crafting UI     → ingredient slot grid + recipe arrow + output slot + Craft button

STEP 2 — CHOOSE A PALETTE that matches the style tag:
  Simulator  → vivid neon (#00FFAA accent, #FF6B00 secondary) on near-black (#0D0D18)
  RPG        → dark warm (#1C1209 bg, #D4A017 gold accent, #8B6914 secondary)
  Futuristic → deep navy (#060D1F bg, #00CFFF cyan accent, #0077AA secondary)
  Cartoon    → saturated cheerful (#FF4F4F red, #FFC800 yellow, #38D9A9 teal) on white
  Dark Mode  → charcoal (#141420 bg, #7C5CFC purple accent)
  Light Mode → off-white (#F8FAFC bg, #3B82F6 blue accent, #1E293B text)
  Premium    → pure black bg, gold UIGradient on hero button, thin white UIStroke
  Horror     → near-black (#0A0A0A), blood red (#CC0000), desaturated grey text
  Fantasy    → deep indigo (#1A0A3C), violet (#9B59B6), gold (#F1C40F)
  Anime      → dark navy (#0F0F2D), pink (#FF6EC7), white text
  Pirate     → dark teal (#0D2B2B), worn brown (#7A4F2F), cream (#F5E6C8)

STEP 3 — WRITE THE CODE following these non-negotiable rules:
- Output ONLY valid Luau code. Zero markdown fences, zero English prose.
- game:GetService() for every service (Players, TweenService, RunService, etc.).
- Every button MUST do something: open/close a panel, fire a BindableEvent, or print a stub.
- All sizing: UDim2.fromScale() or UDim2.new(scale, offset). No naked pixel-only sizes.
- UIListLayout or UIGridLayout for every list/grid — NEVER manually offset siblings.
- UIAspectRatioConstraint on square icons. UISizeConstraint on modals (min 300px, max 700px).
- TweenService hover on every interactive button: MouseEnter → scale ×1.05 + brighten; MouseLeave → reverse; MouseButton1Down → darken.
- UICorner on all surfaces: regular UI = CornerRadius UDim.new(0,10); cartoon = UDim.new(0,20).
- UIStroke on primary buttons and bordered cards.
- UIGradient on hero/primary action buttons.
- UIPadding inside every panel frame.
- Fonts: Enum.Font.GothamBlack for titles, Enum.Font.GothamBold for buttons, Enum.Font.Gotham for body.
- Comments above each named section.
- Code runs as-is in StarterPlayerScripts LocalScript.
- No deprecated APIs (no SizeConstraint, no Selectable hacks, no wait() — use task.wait()).`;

// ---------------------------------------------------------------------------
// Build a rich, unique user prompt from the style + user request.
// Explicitly tells the model NOT to reuse the same frosted-glass template.
// ---------------------------------------------------------------------------
const LAYOUT_HINTS = [
  "asymmetric split with a tall left column and stacked right cards",
  "centered modal with a large hero image at the top and action buttons under it",
  "edge-anchored HUD with corner pills and a bottom-center action bar",
  "scroll-driven catalog with sticky header and floating filter bar",
  "diagonal hero banner with overlapping cards beneath",
  "three-column dashboard with a wide center panel and skinny side rails",
  "bento-grid of mixed-size tiles, each tile a different color block",
  "tabbed shell with a top nav and a swipeable content area",
];
const ACCENT_HINTS = [
  "neon glow outlines and animated UIGradient sweeps on primary buttons",
  "thick rounded UICorner (16px) with double-layer UIStroke for chunky cartoon vibe",
  "thin 1px UIStroke borders, flat fills, no gradients — clean minimal",
  "frosted glass only on the header; solid color blocks everywhere else",
  "tilted/rotated badge accents and emoji-like icon glyphs",
  "deep drop-shadow ImageLabel beneath each card for depth",
];

function pick<T>(arr: readonly T[], seed: number): T { return arr[seed % arr.length]; }

function buildUserPrompt(prompt: string, style: string): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const layout = pick(LAYOUT_HINTS, seed);
  const accent = pick(ACCENT_HINTS, seed >> 3);
  return `STYLE: ${style}
REQUESTED UI: ${prompt}
VARIANT SEED: ${seed}
LAYOUT DIRECTION: ${layout}
ACCENT DIRECTION: ${accent}

Instructions:
1. Identify the UI category from the prompt and use the matching layout from the system guidelines, BUT bias toward the LAYOUT DIRECTION above so this build is visually distinct from previous generations.
2. Choose the palette from the system guidelines that fits the style tag. DO NOT default to a generic dark frosted-glass look unless "Dark Mode" was explicitly requested.
3. Apply the ACCENT DIRECTION above to corners, strokes, gradients, and shadows.
4. Build the FULL UI — every frame, button, list, scroll — all wired with TweenService hover/press animations. Every button MUST have a real action (open/close panel, print stub, or BindableEvent).
5. Mobile-friendly (scale sizing, UIAspectRatioConstraint on icons, UISizeConstraint on modals).
6. Output ONLY valid Luau code — no markdown fences, no English prose, no leading "lua" keyword. Code must paste into a LocalScript and run as-is.
7. This must be completely DIFFERENT from prior generations. Make it uniquely tied to: "${prompt}".`;
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

    const { text } = await generateText({
      model,
      system: SYS,
      prompt: buildUserPrompt(data.prompt, data.style),
      temperature: 1.0,
      maxOutputTokens: 4096,
    });

    // Strip accidental code fences if the model emitted them
    const cleaned = text
      .replace(/^```(?:lua|luau)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    if (data.projectId) {
      await context.supabase.from("chat_messages").insert({
        project_id: data.projectId,
        user_id: context.userId,
        role: "assistant",
        content: `Generated a ${data.style} Roblox UI for: ${data.prompt}`,
        status: "done",
        model: DEFAULT_MODEL_ID,
        image_url: conceptImageUrl,
      });
    }

    return { code: cleaned, conceptImageUrl };
  });
