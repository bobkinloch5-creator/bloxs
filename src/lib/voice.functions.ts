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
  .validator((input: unknown) => SynthInput.parse(input))
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

      // Auto-fallback to ElevenLabs on credit/quota/disabled errors.
      const elevenKey = process.env.ELEVENLABS_API_KEY;
      if (elevenKey && (resp.status === 402 || resp.status === 429 || resp.status === 403)) {
        try {
          const elevenVoiceId = "JBFqnCBsd6RMkjVDRZzb";
          const eleven = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "xi-api-key": elevenKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text: data.text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: { stability: 0.4, similarity_boost: 0.75 },
              }),
            },
          );
          if (eleven.ok) {
            const fbuf = await eleven.arrayBuffer();
            return {
              ok: true as const,
              audioBase64: Buffer.from(fbuf).toString("base64"),
              mime: "audio/mpeg",
              voiceId: elevenVoiceId,
              provider: "elevenlabs" as const,
            };
          }
        } catch (e) {
          console.error("[synthesizeVoice] ElevenLabs fallback failed", e);
        }
      }

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
    return { ok: true as const, audioBase64: base64, mime: "audio/mpeg", voiceId: voice, provider: "lovable" as const };

  });
