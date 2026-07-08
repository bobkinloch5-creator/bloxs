import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const IMPROVE_SYSTEM = `You are a senior prompt editor for the BloxSmith AI Roblox builder. Rewrite the user's build request into a confident, precise, studio-grade Roblox brief the builder can execute end-to-end — preserving the user's exact intent and scope but ALWAYS fixing spelling, grammar, and duplicated words.

MANDATORY CLEANUP (do this every time):
- Fix ALL misspellings (e.g. "everythign" → "everything", "toolboxx" → "toolbox", "biuld" → "build").
- Remove duplicated words/phrases ("everything and everything" → "everything").
- Fix capitalization and punctuation. Never return the user's text nearly unchanged if it has errors.

INTERPRETATION (critical):
- Read the request the way an experienced Roblox developer would. Short nouns like "a city", "a tycoon", "a zombie game", "an obby", "a racing game", "a farm", "a dungeon" already IMPLY the full expected build — infer and name what a player would recognize as that thing.
- For GAME / GENRE / SYSTEM / MAP asks (anything containing city, town, tycoon, obby, simulator, racing, zombie, tower defense, rpg, dungeon, farm, world, map, game, experience), EXPAND into an unambiguous multi-sentence brief that spells out: the world/map layout, core gameplay loop, required systems (spawns, HUD, currency, save, combat, shop, quests, rounds — only what the genre needs), visual/theme direction, Toolbox usage where appropriate, and PC + Mobile targeting.
- CITY example → "Build a massive playable city map with a gridded street layout, drivable roads, sidewalks, streetlights and traffic props, a mix of residential and commercial buildings with enterable interiors, a central spawn plaza, day/night skybox and ambient sound, mobile-friendly camera and controls, populated with safe free Roblox Toolbox assets — server-authoritative, no placeholders, no invented asset IDs."
- TYCOON example → "Build a full solo tycoon plot with a claim pad, dropper→conveyor→collector economy, upgrade buttons gated by cash, a leaderstats currency, DataStore save/load, a sellable stack, and a themed baseplate — server-authoritative, no placeholders."
- For NARROW single-item asks ("add a jump button", "insert a tree", "one heal script", "make a red part"), do NOT expand. Return a tight one-sentence brief and append "— only this, no extras, plus minimum required wiring."

Rewrite goals:
- Replace vague wording ("stuff", "thingy", "kinda", "some") with concrete Roblox-native vocabulary.
- Use strong developer verbs (build, spawn, wire, mount, configure, script, place, hook up, populate).
- Make subject, action, quantity, scope, and location explicit.
- Crisp professional voice — no fluff, no "amazing/awesome/epic", no emoji.

Scope discipline:
- Never invent a totally unrelated genre or mechanic.
- Never downscope a full-game/map ask into a single part.

Format:
- Plain prose. 1 sentence for narrow asks, 2-5 sentences for full-game / map / system asks.
- No bullets, no headers, no labels, no quotes, no code fences, no preamble ("Here is", "Improved:").
- Under 160 words.
- Output the polished prompt only.`;

function fixCommonTypos(input: string): string {
  const fixes: Array<[RegExp, string]> = [
    [/\beverythign\b/gi, "everything"],
    [/\banythign\b/gi, "anything"],
    [/\bsomethign\b/gi, "something"],
    [/\bnothign\b/gi, "nothing"],
    [/\btoolboxx\b/gi, "toolbox"],
    [/\bbiuld\b/gi, "build"],
    [/\brblox\b/gi, "Roblox"],
    [/\broblx\b/gi, "Roblox"],
    [/\b(and\s+everything)(\s+and\s+everything)+\b/gi, "$1"],
    [/\b(\w+)\s+\1\b/gi, "$1"],
  ];
  let out = input;
  for (const [re, rep] of fixes) out = out.replace(re, rep);
  return out;
}

function deterministicImprove(input: string): string {
  let cleaned = fixCommonTypos(input.trim().replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, ""));
  if (!cleaned) return "";
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?)]$/.test(cleaned)) cleaned += ".";
  const lower = cleaned.toLowerCase();

  const genreExpansions: Array<[RegExp, string]> = [
    [/\b(city|town|metropolis|downtown)\b/i,
     "Build a massive playable city map with a gridded street layout, drivable roads, sidewalks, streetlights and traffic props, a mix of residential and commercial buildings with enterable interiors, a central spawn plaza, day/night skybox and ambient sound, mobile-friendly camera and controls, populated with safe free Roblox Toolbox assets — server-authoritative, no placeholders, no invented asset IDs."],
    [/\btycoon\b/i,
     "Build a full solo tycoon plot with a claim pad, a dropper→conveyor→collector economy, upgrade buttons gated by cash, a leaderstats currency, DataStore save and load, a sellable stack, and a themed baseplate — server-authoritative, no placeholders, no invented asset IDs."],
    [/\bobby|obstacle course\b/i,
     "Build a full obby with 15+ progressively harder stages across a themed course, checkpoints between stages, a spawn lobby, a win zone with a reward, kill bricks and moving parts wired server-side, and a mobile-friendly jump button and camera — server-authoritative, no placeholders, no invented asset IDs."],
    [/\bzombie\b/i,
     "Build a zombie survival round with wave-based spawning, server-authoritative zombie AI that chases and damages players, a starter weapon, a health and ammo HUD, a round timer, and a themed map with cover — server-authoritative, no placeholders, no invented asset IDs."],
    [/\bracing|race track|racetrack\b/i,
     "Build a full racing experience with a closed drivable track, driveable vehicles, a lap counter, a timer, checkpoints, a spawn grid, a finish line, and a leaderboard HUD — server-authoritative, no placeholders, no invented asset IDs."],
    [/\bsimulator\b/i,
     "Build a simulator loop with a clear gather action, a leaderstats currency that grows with each gather, an upgrade shop that boosts gather rate, a rebirth option for prestige, DataStore save and load, and a themed spawn area — server-authoritative, no placeholders, no invented asset IDs."],
  ];
  const isNarrow = /\b(add|insert|spawn|make|create|place|put|one)\b/.test(lower)
    && /\b(tree|house|car|sword|gun|pet|npc|road|chair|table|rock|bush|flower|door|window|sign|lamp|button|script|part)\b/.test(lower)
    && !/\b(game|system|map|city|town|world|full|complete|entire|massive|tycoon|obby|zombie|racing|simulator|dungeon|farm)\b/.test(lower);
  if (!isNarrow) {
    for (const [re, expansion] of genreExpansions) {
      if (re.test(lower)) return expansion;
    }
  }

  if (isNarrow && !/toolbox|creator store|safe|free|public|no extras|just this/i.test(cleaned)) {
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
    const rawIn = data.text.trim();
    const rawInLower = rawIn.toLowerCase();
    const hasGenre = /\b(city|town|metropolis|downtown|tycoon|obby|obstacle course|zombie|racing|race track|racetrack|simulator|dungeon|farm|rpg|tower defense|game|map|world|experience)\b/i.test(rawIn);
    const inputWordCount = rawIn.split(/\s+/).filter(Boolean).length;

    function tooSimilar(a: string, b: string): boolean {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      const aw = norm(a); const bw = norm(b);
      if (!aw.length || !bw.length) return false;
      const setA = new Set(aw);
      const overlap = bw.filter((w) => setA.has(w)).length;
      const ratio = overlap / Math.max(aw.length, bw.length);
      // Nearly identical AND barely longer = model didn't polish.
      return ratio > 0.85 && bw.length <= aw.length + 3;
    }

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
      let cleaned = fixCommonTypos((text || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+\n/g, "\n"));
      cleaned = cleaned.replace(/^(improved prompt|here(?:'s| is)[^:]*|prompt)\s*[:\-–]\s*/i, "").trim();
      if (!cleaned || cleaned.length < 3) return { ok: true as const, text: fallback };
      if (cleaned.split(/\s+/).length > 200 || /\n\s*(goal|scope|systems|ui|world|polish|constraints)\s*:/i.test(cleaned)) {
        return { ok: true as const, text: fallback };
      }
      const cleanedWords = cleaned.split(/\s+/).length;
      // If it's a genre/game ask and the model barely expanded it, use the deterministic genre brief.
      if (hasGenre && cleanedWords < 25) {
        return { ok: true as const, text: fallback };
      }
      // If the model output is nearly identical to the input, use fallback (which fixes typos + may expand).
      if (tooSimilar(rawIn, cleaned) && (fallback.toLowerCase() !== rawInLower)) {
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

