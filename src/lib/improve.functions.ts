import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const SYSTEM = `You rewrite short Roblox build prompts into a clear, specific instruction for an AI Roblox Studio game-builder.

Rules:
- Keep the user's original intent and game type.
- Add useful missing detail (mechanics, systems, UI, balance, save/leaderboard) only when it obviously fits.
- Output ONLY the improved prompt as plain text. No preamble, no quotes, no markdown headings, no bullet list unless the original was a list.
- Keep it under 90 words. Friendly, direct, builder voice.`;

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
      });
      const cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "");
      if (!cleaned) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: cleaned };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "improve_failed" };
    }
  });
