import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const IMPROVE_SYSTEM = `You are a senior prompt editor for the BloxSmith AI Roblox builder. Rewrite the user's build request so it reads with the confident, precise, professional tone of a seasoned Roblox studio brief — while preserving their exact intent and scope.

Rewrite goals:
- Fix all grammar, spelling, capitalization, and punctuation.
- Replace vague or casual wording ("stuff", "thingy", "kinda", "some", "like a") with concrete, specific vocabulary.
- Upgrade weak verbs to strong, developer-native ones (build, spawn, wire, mount, configure, hook up, script, place).
- Make the subject, action, quantity, and location explicit and unambiguous.
- Keep the voice crisp and premium — no fluff, no filler, no marketing adjectives ("amazing", "awesome", "epic"), no emoji.

Scope discipline:
- Do NOT invent features, genres, systems, mechanics, or assets the user did not imply.
- Do NOT expand a small ask into a full brief. A one-part or one-script request stays one tight sentence.
- If the request is already clear and specific, return it essentially unchanged with only grammar and phrasing polish.
- When a single asset or script is requested, append one short scope-lock clause (e.g. "— only this, no extras" or "— safe Toolbox model, server-authoritative where relevant").

Format:
- Plain prose, one to three sentences. No bullets, no headers, no labels, no quotes, no code fences.
- Under 60 words.
- Output the polished prompt only. No preamble, no explanation, no "Here is".`;

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
      const timeout = setTimeout(() => controller.abort("Improve timed out"), 3500);
      const { text } = await generateText({
        model,
        system: IMPROVE_SYSTEM,
        prompt: data.text,
        temperature: 0.3,
        maxOutputTokens: 180,
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      let cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+\n/g, "\n");
      // Strip any accidental preamble like "Improved prompt:" or "Here is..."
      cleaned = cleaned.replace(/^(improved prompt|here(?:'s| is)[^:]*|prompt)\s*[:\-–]\s*/i, "").trim();
      if (!cleaned || cleaned.length < 3) return { ok: true as const, text: fallback };
      // Guardrail: if the model ballooned it into a full brief, fall back.
      if (cleaned.split(/\s+/).length > 90 || /\n\s*(goal|scope|systems|ui|world|polish|constraints)\s*:/i.test(cleaned)) {
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

