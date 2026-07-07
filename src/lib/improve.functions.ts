import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const SYSTEM = `You lightly polish a Roblox build prompt. Your ONLY job is to make the SAME request clearer — never to change scope, add new features, or expand what the user asked for. This rule applies to EVERY prompt, no exceptions: single items, systems, whole games — all of them stay the same size and scope.

STRICT RULES (apply to every prompt):
- Preserve the user's exact intent, subject, and scope. What they asked for is what the improved prompt asks for — nothing more.
- Do NOT add extra systems, mechanics, terrain, NPCs, UI, scripts, DataStores, remotes, testing steps, "wire it up", "organize", or "scan" language unless the user already used those words.
- Do NOT invent a genre, theme, art style, size, colors, or features the user didn't mention.
- Do NOT turn a single object into a scene, a scene into a map, or a small feature into a full game.
- You MAY: fix grammar and spelling, add "from Roblox Toolbox (safe, free, public)" for asset requests, and add "insert one" / "just this, no extras" for single-item requests.
- Length rule: the improved prompt must be at most ~15 words longer than the user's original. Usually 1 short sentence.
- Output ONLY the improved prompt as plain text. No preamble, no quotes, no markdown, no bullets.

Examples:
- "add a house" → "Add one house from Roblox Toolbox (safe, free, public model) — just the house, no extras."
- "sword" → "Insert one sword from Roblox Toolbox (safe, free, public model)."
- "add a leaderstats script" → "Add one leaderstats script — just the script, no extras."
- "spawn a tree" → "Spawn one tree from Roblox Toolbox (safe, free, public model) — just the tree, no extras."
- "make a tycoon" → "Make a tycoon."  (already scoped — do not expand it into features the user didn't ask for)`;

export const improvePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    try {
      // Keep the toolbar responsive: Improve is a lightweight polish action,
      // not a build/planning pass. Do it deterministically instead of waiting
      // on a model round-trip that can leave the button stuck on "Improving…".
      let cleaned = data.text
        .trim()
        .replace(/\s+/g, " ")
        .replace(/^["'`]+|["'`]+$/g, "");
      if (cleaned && !/[.!?)]$/.test(cleaned)) cleaned += ".";

      const lower = cleaned.toLowerCase();
      const wantsSingleAsset = /\b(add|insert|spawn|make|create|get|place)\b/.test(lower)
        && /\b(tree|house|car|vehicle|sword|gun|weapon|pet|npc|zombie|road|building|furniture|chair|table|rock|bush|flower|shop|store|castle|boat|plane)\b/.test(lower)
        && !/\b(game|system|map|city|world|full|complete|entire)\b/.test(lower);
      if (wantsSingleAsset && !/toolbox|creator store|safe|free|public/i.test(cleaned)) {
        cleaned = `${cleaned.replace(/[.!?]$/, "")} from Roblox Toolbox (safe, free, public model) — just this, no extras.`;
      } else if (!/no extras|only|just this/i.test(cleaned) && /\b(script|button|remoteevent|localscript|modulescript)\b/i.test(cleaned) && !/\b(system|game|full|complete)\b/i.test(cleaned)) {
        cleaned = `${cleaned.replace(/[.!?]$/, "")} — only the requested item and required wiring, no extras.`;
      }
      if (!cleaned) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: cleaned };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "improve_failed" };
    }
  });

// ── ENHANCE: aggressive expander ────────────────────────────────────────────
// Rewrites a short/vague build ask into a rich, specification-grade prompt
// the build pipeline can plan against — genre, mechanics, systems, UI, polish,
// and constraints — WITHOUT changing the user's core intent.
const ENHANCE_SYSTEM = `You are a Roblox game design brief writer. Take a short or vague build request and rewrite it as a rich, developer-ready build brief the BloxSmith AI builder can plan against.

Expand ONLY along dimensions the user already implied:
- Genre / theme (if implied): name it explicitly.
- Core mechanics: 3-6 concrete gameplay verbs (collect, fight, race, build, trade, survive, craft, explore).
- Systems needed: name each (inventory, shop, combat, save/load, leaderboard, spawns, rounds) — only ones the mechanics require.
- UI needs: main menu style, HUD elements, panels — only if the mechanics need them.
- World scope: baseplate / arena / open map / obby lanes — pick sensible defaults for the genre.
- Polish targets: mobile-friendly UI, dark theme accent color, sound cues.
- Constraints: server-authoritative, no placeholders, no invented asset IDs, Toolbox assets allowed.

Rules:
- Preserve the user's exact intent. Do NOT add a totally unrelated genre or feature.
- If the user asked for a single small thing (one part, one script, one icon), DO NOT expand — return the original plus one clarifying constraint line.
- Keep the brief under 220 words. Use short labeled lines (Goal:, Genre:, Core loop:, Systems:, UI:, World:, Polish:, Constraints:).
- Output the brief only. No preamble, no markdown headers, no quotes.`;

export const enhancePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    try {
      const fallbackBrief = () => {
        const text = data.text.trim().replace(/\s+/g, " ");
        if (/\b(script|button|remoteevent|localscript|modulescript|part|tree|house|car|sword|gun|weapon|pet|npc)\b/i.test(text) && !/\b(game|system|full|complete)\b/i.test(text)) {
          return `Goal: ${text}\nScope: Build only this requested item and the minimum required wiring.\nConstraints: No extra menus, HUDs, loading screens, unrelated systems, placeholders, or invented asset IDs.`;
        }
        return `Goal: ${text}\nCore loop: Make the requested Roblox experience playable and clear.\nSystems: Include only systems required by the request.\nUI: Add UI only when the request needs it.\nWorld: Use safe Toolbox assets for visual models when relevant, otherwise build clean Roblox geometry.\nConstraints: Server-authoritative where needed, no placeholders, no invented asset IDs, no unrelated extras.`;
      };
      const { model } = getProviderModel(FALLBACK_MODEL_ID);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Enhance timed out"), 4500);
      const { text } = await generateText({
        model,
        system: ENHANCE_SYSTEM,
        prompt: data.text,
        temperature: 0.4,
        maxOutputTokens: 500,
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      const cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "");
      if (!cleaned) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: cleaned };
    } catch (e: any) {
      const text = data.text.trim().replace(/\s+/g, " ");
      if (!text) return { ok: false as const, error: "empty" };
      const fallback = /\b(script|button|remoteevent|localscript|modulescript|part|tree|house|car|sword|gun|weapon|pet|npc)\b/i.test(text) && !/\b(game|system|full|complete)\b/i.test(text)
        ? `Goal: ${text}\nScope: Build only this requested item and the minimum required wiring.\nConstraints: No extra menus, HUDs, loading screens, unrelated systems, placeholders, or invented asset IDs.`
        : `Goal: ${text}\nCore loop: Make the requested Roblox experience playable and clear.\nSystems: Include only systems required by the request.\nUI: Add UI only when the request needs it.\nWorld: Use safe Toolbox assets for visual models when relevant, otherwise build clean Roblox geometry.\nConstraints: Server-authoritative where needed, no placeholders, no invented asset IDs, no unrelated extras.`;
      return { ok: true as const, text: fallback };
    }
  });

