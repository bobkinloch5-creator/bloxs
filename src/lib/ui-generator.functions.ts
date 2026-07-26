import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.server";
import { z } from "zod";
import { DEFAULT_MODEL_ID } from "./models";
import { createRobloxUiBlueprint, renderRobloxUiBlueprintLuau, renderRobloxUiBlueprintSvg } from "./roblox-ui-blueprint";

const uiGenerationSelect = "id, prompt, style, code, concept_image_url, created_at, project_id";

// ---------------------------------------------------------------------------
// System prompt — governs ALL UI generations.
// The key requirement: EVERY prompt must produce a UNIQUE design.
// The AI must read the user's request carefully and choose the correct
// layout, palette, and components — never fall back to the same template.
// ---------------------------------------------------------------------------
const SYS = `You are a senior Roblox UI engineer. Given a style tag and a prompt, produce ONE complete, self-contained Luau LocalScript that builds a premium, UNIQUE ScreenGui entirely at runtime.

QUALITY BAR:
- This must look like a finished Roblox game UI, not a tutorial sample.
- Use layered panels, real visual hierarchy, clean spacing, color contrast, animated feedback, and responsive constraints.
- Never make one flat grey frame with a few buttons. Never reuse the same dark-purple/frosted layout for every prompt.
- Every generation must feel different: vary layout, panel shape, accent treatment, card density, navigation style, button style, and motion.
- Tie labels, sections, counters, cards, and button actions to the user's exact game genre/request.

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
  "large left hero panel with compact right-side cards and a sticky bottom action bar",
  "premium black-and-gold composition with restrained glow and thin dividers",
  "bright simulator style with coin/gem pills, item rarity colors, and chunky buttons",
];
const MOTION_HINTS = [
  "intro fade + upward slide on main panels",
  "stagger cards in one-by-one with small scale bounce",
  "pulse only the primary action and keep the rest calm",
  "slide drawers from the side and dim the background when opened",
  "animate progress bars from 0 to their target width",
];

function pick<T>(arr: readonly T[], seed: number): T { return arr[seed % arr.length]; }

function luaString(value: string) {
  return JSON.stringify(value);
}

function looksLikeUsableLuau(code: string) {
  const text = code.trim();
  if (text.length < 400) return false;
  if (/^--\s*(todo|placeholder|blank)/i.test(text)) return false;
  return /game:GetService\(["']Players["']\)/.test(text)
    && /Instance\.new\(["']ScreenGui["']\)/.test(text)
    && /Instance\.new\(["']TextButton["']\)/.test(text)
    && /TweenService/.test(text);
}

function fallbackRobloxUiCode(prompt: string, style: string) {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 54) || "BloxSmith UI";
  const subtitle = `${style || "Modern"} Roblox interface`;
  const isLight = /light|cartoon|cute/i.test(style);
  const bg = isLight ? "Color3.fromRGB(245, 248, 255)" : "Color3.fromRGB(8, 11, 24)";
  const panel = isLight ? "Color3.fromRGB(255, 255, 255)" : "Color3.fromRGB(20, 27, 52)";
  const text = isLight ? "Color3.fromRGB(18, 24, 38)" : "Color3.fromRGB(245, 248, 255)";
  const muted = isLight ? "Color3.fromRGB(85, 94, 115)" : "Color3.fromRGB(170, 181, 210)";
  return `-- BloxSmith generated Roblox UI fallback
-- Paste this into StarterPlayer > StarterPlayerScripts as a LocalScript.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local existing = playerGui:FindFirstChild("BloxSmithGeneratedUI")
if existing then existing:Destroy() end

local function make(className, props, parent)
  local inst = Instance.new(className)
  for key, value in pairs(props or {}) do
    inst[key] = value
  end
  inst.Parent = parent
  return inst
end

local function addCorner(parent, radius)
  return make("UICorner", { CornerRadius = UDim.new(0, radius or 12) }, parent)
end

local function addStroke(parent, color, transparency, thickness)
  return make("UIStroke", {
    Color = color or Color3.fromRGB(120, 140, 255),
    Transparency = transparency or 0.35,
    Thickness = thickness or 1,
  }, parent)
end

local function addButtonMotion(button)
  local scale = make("UIScale", { Scale = 1 }, button)
  local base = button.BackgroundColor3
  button.MouseEnter:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1.045 }):Play()
    TweenService:Create(button, TweenInfo.new(0.14), { BackgroundColor3 = base:Lerp(Color3.new(1, 1, 1), 0.12) }):Play()
  end)
  button.MouseLeave:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1 }):Play()
    TweenService:Create(button, TweenInfo.new(0.14), { BackgroundColor3 = base }):Play()
  end)
  button.MouseButton1Down:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.08), { Scale = 0.98 }):Play()
  end)
  button.MouseButton1Up:Connect(function()
    TweenService:Create(scale, TweenInfo.new(0.1), { Scale = 1.045 }):Play()
  end)
end

local gui = make("ScreenGui", {
  Name = "BloxSmithGeneratedUI",
  ResetOnSpawn = false,
  IgnoreGuiInset = true,
  ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, playerGui)

local root = make("Frame", {
  Name = "Root",
  BackgroundColor3 = ${bg},
  Size = UDim2.fromScale(1, 1),
}, gui)

local glow = make("Frame", {
  Name = "AccentGlow",
  AnchorPoint = Vector2.new(1, 0),
  BackgroundColor3 = Color3.fromRGB(91, 141, 255),
  BackgroundTransparency = 0.72,
  Position = UDim2.fromScale(1.04, -0.08),
  Size = UDim2.fromScale(0.36, 0.46),
  Rotation = 18,
}, root)
addCorner(glow, 999)

local shell = make("Frame", {
  Name = "MainPanel",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = ${panel},
  Position = UDim2.fromScale(0.5, 0.5),
  Size = UDim2.fromScale(0.72, 0.66),
}, root)
addCorner(shell, 18)
addStroke(shell, Color3.fromRGB(111, 137, 255), 0.28, 1.5)
make("UISizeConstraint", { MinSize = Vector2.new(320, 300), MaxSize = Vector2.new(820, 620) }, shell)
make("UIPadding", {
  PaddingTop = UDim.new(0, 24),
  PaddingBottom = UDim.new(0, 24),
  PaddingLeft = UDim.new(0, 24),
  PaddingRight = UDim.new(0, 24),
}, shell)

local header = make("Frame", {
  Name = "Header",
  BackgroundTransparency = 1,
  Size = UDim2.new(1, 0, 0, 82),
}, shell)

make("TextLabel", {
  Name = "Title",
  BackgroundTransparency = 1,
  Font = Enum.Font.GothamBlack,
  Text = ${luaString(title)},
  TextColor3 = ${text},
  TextScaled = true,
  TextXAlignment = Enum.TextXAlignment.Left,
  TextYAlignment = Enum.TextYAlignment.Top,
  Size = UDim2.new(0.74, 0, 0, 42),
}, header)

make("TextLabel", {
  Name = "Subtitle",
  BackgroundTransparency = 1,
  Font = Enum.Font.Gotham,
  Text = ${luaString(subtitle)},
  TextColor3 = ${muted},
  TextScaled = true,
  TextXAlignment = Enum.TextXAlignment.Left,
  Position = UDim2.new(0, 0, 0, 48),
  Size = UDim2.new(0.72, 0, 0, 20),
}, header)

local primary = make("TextButton", {
  Name = "PrimaryAction",
  AnchorPoint = Vector2.new(1, 0),
  AutoButtonColor = false,
  BackgroundColor3 = Color3.fromRGB(94, 99, 255),
  Font = Enum.Font.GothamBold,
  Text = "PLAY",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
  Position = UDim2.new(1, 0, 0, 4),
  Size = UDim2.new(0.2, 0, 0, 46),
}, header)
addCorner(primary, 12)
addStroke(primary, Color3.fromRGB(180, 220, 255), 0.35, 1)
make("UIGradient", {
  Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(76, 210, 255)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(156, 91, 255)),
  }),
}, primary)
addButtonMotion(primary)

local body = make("Frame", {
  Name = "Body",
  BackgroundTransparency = 1,
  Position = UDim2.new(0, 0, 0, 98),
  Size = UDim2.new(1, 0, 1, -98),
}, shell)
make("UIGridLayout", {
  CellPadding = UDim2.fromScale(0.025, 0.04),
  CellSize = UDim2.fromScale(0.31, 0.42),
  FillDirectionMaxCells = 3,
  SortOrder = Enum.SortOrder.LayoutOrder,
}, body)

local cards = {
  { "Shop", "Open item store", Color3.fromRGB(33, 198, 255) },
  { "Inventory", "View collected items", Color3.fromRGB(74, 222, 128) },
  { "Settings", "Audio and controls", Color3.fromRGB(250, 204, 21) },
  { "Quests", "Track objectives", Color3.fromRGB(248, 113, 113) },
  { "Rewards", "Claim bonuses", Color3.fromRGB(192, 132, 252) },
  { "Stats", "Player progress", Color3.fromRGB(45, 212, 191) },
}

for index, card in ipairs(cards) do
  local tile = make("TextButton", {
    Name = card[1] .. "Card",
    AutoButtonColor = false,
    BackgroundColor3 = card[3]:Lerp(${panel}, 0.72),
    LayoutOrder = index,
    Text = "",
  }, body)
  addCorner(tile, 14)
  addStroke(tile, card[3], 0.18, 1.25)
  make("UIPadding", {
    PaddingTop = UDim.new(0, 14),
    PaddingBottom = UDim.new(0, 14),
    PaddingLeft = UDim.new(0, 14),
    PaddingRight = UDim.new(0, 14),
  }, tile)
  addButtonMotion(tile)

  local icon = make("Frame", {
    Name = "Icon",
    BackgroundColor3 = card[3],
    Size = UDim2.fromScale(0.22, 0.28),
  }, tile)
  addCorner(icon, 999)
  make("UIAspectRatioConstraint", { AspectRatio = 1 }, icon)

  make("TextLabel", {
    Name = "CardTitle",
    BackgroundTransparency = 1,
    Font = Enum.Font.GothamBlack,
    Text = card[1],
    TextColor3 = ${text},
    TextScaled = true,
    TextXAlignment = Enum.TextXAlignment.Left,
    Position = UDim2.fromScale(0, 0.36),
    Size = UDim2.fromScale(1, 0.22),
  }, tile)

  make("TextLabel", {
    Name = "CardDescription",
    BackgroundTransparency = 1,
    Font = Enum.Font.Gotham,
    Text = card[2],
    TextColor3 = ${muted},
    TextScaled = true,
    TextWrapped = true,
    TextXAlignment = Enum.TextXAlignment.Left,
    Position = UDim2.fromScale(0, 0.62),
    Size = UDim2.fromScale(1, 0.3),
  }, tile)

  tile.MouseButton1Click:Connect(function()
    print("[BloxSmith UI] " .. card[1] .. " clicked")
  end)
end

primary.MouseButton1Click:Connect(function()
  print("[BloxSmith UI] Play clicked")
end)

shell.Position = UDim2.fromScale(0.5, 0.54)
shell.BackgroundTransparency = 1
TweenService:Create(shell, TweenInfo.new(0.35, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
  Position = UDim2.fromScale(0.5, 0.5),
  BackgroundTransparency = 0,
}):Play()
`;
}

function buildUserPrompt(prompt: string, style: string): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const layout = pick(LAYOUT_HINTS, seed);
  const accent = pick(ACCENT_HINTS, seed >> 3);
  const motion = pick(MOTION_HINTS, seed >> 5);
  return `STYLE: ${style}
REQUESTED UI: ${prompt}
VARIANT SEED: ${seed}
LAYOUT DIRECTION: ${layout}
ACCENT DIRECTION: ${accent}
MOTION DIRECTION: ${motion}

Instructions:
1. Identify the UI category from the prompt and use the matching layout from the system guidelines, BUT bias toward the LAYOUT DIRECTION above so this build is visually distinct from previous generations.
2. Choose the palette from the system guidelines that fits the style tag. DO NOT default to a generic dark frosted-glass look unless "Dark Mode" was explicitly requested.
3. Apply the ACCENT DIRECTION above to corners, strokes, gradients, and shadows.
4. Build the FULL UI — every frame, button, list, scroll, close button, tab, progress bar, and status chip — all wired with TweenService hover/press animations. Every button MUST have a real action (open/close panel, print stub, or BindableEvent).
5. Mobile-friendly (scale sizing, UIAspectRatioConstraint on icons, UISizeConstraint on modals).
6. Use the MOTION DIRECTION for intro/open/close transitions.
7. Output ONLY valid Luau code — no markdown fences, no English prose, no leading "lua" keyword. Code must paste into a LocalScript and run as-is.
8. This must be completely DIFFERENT from prior generations. Make it uniquely tied to: "${prompt}".`;
}

export const generateRobloxUi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    prompt: z.string().min(3).max(2000),
    style: z.string().min(1).max(40),
    projectId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const userId = ctx?.userId ?? "dev-user";
    enforceRateLimit(userId, "ui_generate");

    const blueprint = createRobloxUiBlueprint(data.prompt, data.style);
    const conceptImageUrl = renderRobloxUiBlueprintSvg(blueprint);
    const finalCode = renderRobloxUiBlueprintLuau(blueprint);

    // The preview and Luau are intentionally rendered from the same blueprint.
    // This keeps the website image faithful to what the Roblox LocalScript builds.

    const sb = ctx?.supabase as any;
    const { data: savedRow, error: saveError } = await sb.from("ui_generations").insert({
      user_id: userId,
      project_id: data.projectId ?? null,
      prompt: data.prompt,
      style: data.style,
      code: finalCode,
      concept_image_url: conceptImageUrl,
      model: DEFAULT_MODEL_ID,
      metadata: {
        generator: "exact-ui-blueprint",
        savedBy: "generateRobloxUi",
        exactPreview: true,
        blueprintKind: blueprint.kind,
      },
    }).select("id, created_at").single();
    if (saveError) throw new Error(`Generated UI, but saving failed: ${saveError.message}`);

    if (data.projectId) {
      await sb.from("chat_messages").insert({
        project_id: data.projectId,
        user_id: userId,
        role: "assistant",
        content: `Generated a ${data.style} Roblox UI for: ${data.prompt}`,
        status: "done",
        model: DEFAULT_MODEL_ID,
        image_url: conceptImageUrl,
      });
    }

    return {
      id: savedRow?.id as string | undefined,
      code: finalCode,
      conceptImageUrl,
      createdAt: savedRow?.created_at as string | undefined,
      kind: blueprint.kind,
      kindLabel: blueprint.kindLabel,
      elementCount: blueprint.nodes.length,
      layers: blueprint.layers,
    };
  });

export const listSavedRobloxUis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(24),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const userId = ctx?.userId ?? "dev-user";
    const sb = ctx?.supabase as any;
    let query = sb
      .from("ui_generations")
      .select(uiGenerationSelect)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.projectId) query = query.eq("project_id", data.projectId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows || []).map((row: any) => ({
      id: row.id,
      prompt: row.prompt,
      style: row.style,
      code: looksLikeUsableLuau(String(row.code ?? "")) ? row.code : fallbackRobloxUiCode(row.prompt ?? "BloxSmith UI", row.style ?? "Modern"),
      conceptImageUrl: row.concept_image_url,
      createdAt: row.created_at,
      projectId: row.project_id,
    }));
  });

export const deleteSavedRobloxUi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const userId = ctx?.userId ?? "dev-user";
    const sb = ctx?.supabase as any;
    const { error } = await sb
      .from("ui_generations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
