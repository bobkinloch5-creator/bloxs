import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Liam — robotic-friendly default for BloxSmith
export const DEFAULT_BLOXSMITH_VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ";

const SynthInput = z.object({
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(64).optional(),
});

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SynthInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "voice_not_configured" };
    }
    const voiceId = data.voiceId || DEFAULT_BLOXSMITH_VOICE_ID;

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        ok: false as const,
        error: resp.status === 401 ? "auth_failed" : resp.status === 429 ? "rate_limited" : "tts_failed",
        status: resp.status,
        detail: detail.slice(0, 200),
      };
    }

    const buf = await resp.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { ok: true as const, audioBase64: base64, mime: "audio/mpeg", voiceId };
  });
