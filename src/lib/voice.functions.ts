import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEFAULT_BLOXSMITH_VOICE = "alloy";

const SynthInput = z.object({
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(64).optional(),
});

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SynthInput.parse(input))
  .handler(async ({ data }) => {
    const voice = data.voiceId || DEFAULT_BLOXSMITH_VOICE;
    const nvidiaKey = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;

    if (nvidiaKey) {
      try {
        const resp = await fetch("https://integrate.api.nvidia.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "resembleai/chatterbox-multilingual-tts",
            input: data.text,
            voice: process.env.NVIDIA_CHATTERBOX_VOICE || "default",
            response_format: "mp3",
          }),
        });

        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          return {
            ok: true as const,
            audioBase64: Buffer.from(buf).toString("base64"),
            mime: resp.headers.get("content-type") || "audio/mpeg",
            voiceId: voice,
            provider: "nvidia" as const,
          };
        }
      } catch (e) {
        console.error("[synthesizeVoice] NVIDIA TTS failed", e);
      }
    }

    return { ok: false as const, error: "nvidia_voice_unavailable", message: "NVIDIA voice is unavailable right now." };

  });
