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
      const { model } = getProviderModel(FALLBACK_MODEL_ID);
      const { text } = await generateText({
        model,
        system: SYSTEM,
        prompt: data.text,
        temperature: 0.2,
        maxOutputTokens: 180,
      });
      const cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "");
      if (!cleaned) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: cleaned };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "improve_failed" };
    }
  });
