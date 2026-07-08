import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const IMPROVE_SYSTEM = `You are a senior prompt editor for the BloxSmith AI Roblox builder. Rewrite the user's build request so it reads like a confident, precise Roblox studio brief the builder can execute end-to-end — while preserving the user's exact intent and scope.

INTERPRETATION (critical):
- Read the user's request the way an experienced Roblox developer would. A short noun like "a city", "a tycoon", "a zombie game", "a shop", "a sword", "an obby", "a racing game", "a farm", "a dungeon", "a pet system" already IMPLIES the full expected build — infer and name what a player would recognize as that thing.
- For GAME / GENRE / SYSTEM / FEATURE-PACKAGE asks, expand the request into an unambiguous brief that spells out: the world/map, the core gameplay loop, the systems the genre requires (spawns, HUD, currency, save, combat, shop, quests, rounds — only ones the genre actually needs), the visual/theme direction, and the target device (PC + Mobile by default).
- Example: "build me a city" → "Build a full playable city map with a gridded street layout, drivable roads, sidewalks, streetlights, traffic props, a mix of residential + commercial buildings with interiors, spawn plaza, day/night skybox, ambient sound, mobile-friendly camera and controls — server-authoritative, no placeholders, no invented asset IDs."
- For NARROW single-item asks ("add a jump button", "one script that heals the player", "insert a tree", "make a red part"), do NOT expand. Return a tight one-sentence brief and append a scope-lock clause ("— only this, no extras, plus minimum required wiring").

Rewrite goals:
- Fix all grammar, spelling, capitalization, and punctuation.
- Replace vague wording ("stuff", "thingy", "kinda", "some", "like a") with concrete Roblox-native vocabulary.
- Upgrade weak verbs to strong developer verbs (build, spawn, wire, mount, configure, script, place, hook up).
- Make subject, action, quantity, scope, and location explicit.
- Keep the voice crisp and professional — no fluff, no marketing adjectives ("amazing", "awesome", "epic"), no emoji.

Scope discipline:
- Never invent a totally unrelated genre, mechanic, or asset the user did not imply.
- Never downscope a full-game/system ask into a single part.
- If the request is already clear and specific, tighten grammar only.

Format:
- Plain prose. 1 sentence for narrow asks, up to 4 sentences for full-game / system asks.
- No bullets, no headers, no labels, no quotes, no code fences, no preamble.
- Under 120 words.
- Output the polished prompt only. No "Here is", no explanation.`;

function deterministicImprove(input: string): string {
  let cleaned = input.trim().replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, "");
  if (!cleaned) return "";
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?)]$/.test(cleaned)) cleaned += ".";
  const lower = cleaned.toLowerCase();
  const singleAsset = /\b(add|insert|spawn|make|create|get|place|put)\b/.test(lower)
    && /\b(tree|house|car|vehicle|sword|gun|weapon|pet|npc|zombie|road|building|furniture|chair|table|rock|bush|flower|shop|store|castle|boat|plane|door|window|sign|lamp)\b/.test(lower)
    && !/\b(game|system|map|city|world|full|complete|entire)\b/.test(lower);
  if (singleAsset && !/toolbox|creator store|safe|free|public|no extras|just this/i.test(cleaned)) {
    cleaned = `${cleaned.replace(/[.!?]$/, "")} from the Roblox Toolbox (safe, free, public model) — just this, no extras.`;
  } else if (/\b(script|button|remoteevent|localscript|modulescript)\b/i.test(cleaned) && !/no extras|only|just this|system|game|full|complete/i.test(cleaned)) {
    cleaned = `${cleaned.replace(/[.!?]$/, "")} — only the requested item and required wiring, no extras.`;
  }
  return cleaned;
}

export const improvePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const fallback = deterministicImprove(data.text);
    if (!fallback) return { ok: false as const, error: "empty" };
    try {
      const { model } = getProviderModel(FALLBACK_MODEL_ID);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Improve timed out"), 6000);
      const { text } = await generateText({
        model,
        system: IMPROVE_SYSTEM,
        prompt: data.text,
        temperature: 0.3,
        maxOutputTokens: 400,
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      let cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+\n/g, "\n");
      // Strip any accidental preamble like "Improved prompt:" or "Here is..."
      cleaned = cleaned.replace(/^(improved prompt|here(?:'s| is)[^:]*|prompt)\s*[:\-–]\s*/i, "").trim();
      if (!cleaned || cleaned.length < 3) return { ok: true as const, text: fallback };
      // Guardrail: block only obvious labeled-brief format (Enhance's job, not Polish's).
      if (cleaned.split(/\s+/).length > 180 || /\n\s*(goal|scope|systems|ui|world|polish|constraints)\s*:/i.test(cleaned)) {
        return { ok: true as const, text: fallback };
      }
      return { ok: true as const, text: cleaned };
    } catch {
      return { ok: true as const, text: fallback };
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

