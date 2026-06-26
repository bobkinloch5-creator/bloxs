import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { chargeCredits, VOICE_COST } from "@/lib/credits.server";

const DEFAULT_BLOXSMITH_VOICE = "alloy";

const SynthInput = z.object({
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(64).optional(),
});

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SynthInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "voice_not_configured" };
    }
    const charge = await chargeCredits(context.supabase, context.userId, VOICE_COST);
    if (!charge.ok) {
      return { ok: false as const, error: "no_credits", message: charge.message };
    }
    const voice = data.voiceId || DEFAULT_BLOXSMITH_VOICE;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini-tts",
          input: data.text,
          voice,
          response_format: "mp3",
          stream_format: "audio",
          speed: 1.0,
          instructions: "Sound like a friendly Roblox game-building assistant. Speak clearly, with confident and upbeat energy.",
        }),
      },
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        ok: false as const,
        error:
          resp.status === 402 ? "credits_exhausted" :
          resp.status === 403 ? "voice_disabled" :
          resp.status === 429 ? "rate_limited" :
          "tts_failed",
        status: resp.status,
        detail: detail.slice(0, 200),
      };
    }

    const buf = await resp.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { ok: true as const, audioBase64: base64, mime: "audio/mpeg", voiceId: voice };
  });
