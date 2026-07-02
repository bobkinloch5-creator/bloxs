// Voice TTS route.
// Preferred path: NVIDIA Magpie TTS through Build.NVIDIA.com/NVCF when an
// NVIDIA key is configured. Fallback path: Lovable AI Gateway SSE, then
// ElevenLabs MP3 if available.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { chargeCredits, VOICE_COST } from "@/lib/credits.server";

const DEFAULT_VOICE = "alloy";
const DEFAULT_NVIDIA_MAGPIE_TTS_URL =
  "https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/synthesize";

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getNvidiaKey() {
  return process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY || "";
}

function wavFromPcm16(bytes: Uint8Array, sampleRate = 44100) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes.byteLength, true);
  return new Blob([header, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "audio/wav" });
}

async function tryNvidiaMagpieTts(input: string, request: Request): Promise<Response | null> {
  if (process.env.NVIDIA_VOICE_ENABLED === "false") return null;
  const key = getNvidiaKey();
  if (!key) return null;
  const endpoint = process.env.NVIDIA_MAGPIE_TTS_URL || DEFAULT_NVIDIA_MAGPIE_TTS_URL;
  const language = process.env.NVIDIA_TTS_LANGUAGE || "en-US";
  const voice = process.env.NVIDIA_TTS_VOICE || "Magpie-Multilingual.EN-US.Aria";

  const form = new FormData();
  form.set("text", input);
  form.set("language", language);
  form.set("voice", voice);
  form.set("encoding", "LINEAR_PCM");
  form.set("sample_rate_hz", "44100");

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: request.signal,
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.warn("[voice] NVIDIA Magpie TTS unavailable", upstream.status, detail.slice(0, 200));
    return null;
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (/audio\/(wav|wave|mpeg|mp3|ogg|webm)/i.test(contentType)) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Voice-Provider": "nvidia-magpie",
      },
    });
  }

  const raw = new Uint8Array(await upstream.arrayBuffer());
  const wav = wavFromPcm16(raw, Number(process.env.NVIDIA_TTS_SAMPLE_RATE || 44100));
  return new Response(wav.stream(), {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Voice-Provider": "nvidia-magpie",
    },
  });
}

/**
 * Chatterbox TTS — Resemble.AI multilingual model hosted on NVIDIA NIM.
 * The most human-sounding option: expressive, natural, warm voice in 23 languages.
 * API: https://integrate.api.nvidia.com/v1/audio/speech  (OpenAI-compatible)
 * Tried FIRST — produces the most realistic human-like voice.
 */
async function tryNvidiaChatterboxTts(input: string, request: Request): Promise<Response | null> {
  if (process.env.NVIDIA_CHATTERBOX_ENABLED === "false") return null;
  const key = getNvidiaKey();
  if (!key || key.startsWith("nvapi-REPLACE")) return null;

  try {
    const upstream = await fetch("https://integrate.api.nvidia.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "resembleai/chatterbox-multilingual-tts",
        input,
        // "default" gives a warm, confident American English assistant voice
        voice: process.env.NVIDIA_CHATTERBOX_VOICE || "default",
        response_format: "wav",
        // Expressiveness: 0=flat, 1=natural, >1=theatrical. 0.9 is warm & clear.
        exaggeration: parseFloat(process.env.NVIDIA_TTS_EXAGGERATION || "0.9"),
        // Guidance scale: higher = closer to the reference voice. 3 is balanced.
        cfg_weight: parseFloat(process.env.NVIDIA_TTS_CFG_WEIGHT || "3"),
      }),
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.warn("[voice] NVIDIA Chatterbox TTS unavailable", upstream.status, detail.slice(0, 200));
      return null;
    }

    const contentType = upstream.headers.get("content-type") || "audio/wav";
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType.startsWith("audio/") ? contentType : "audio/wav",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Voice-Provider": "nvidia-chatterbox",
      },
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    console.warn("[voice] Chatterbox fetch error", e?.message);
    return null;
  }
}

export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return jsonError("Please sign in again.", 401, "no_auth");

          let body: { text?: string; voiceId?: string };
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return jsonError("Invalid JSON.", 400, "bad_json");
          }
          const text = (body.text ?? "").toString().trim();
          if (!text) return jsonError("No text to speak.", 400, "missing_text");
          // Keep each request small for fast time-to-first-audio.
          const input = text.slice(0, 1200);
          const voice = (body.voiceId || DEFAULT_VOICE).toString().slice(0, 64);

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return jsonError("Session expired.", 401, "expired");

          const charge = await chargeCredits(supabase, userData.user.id, VOICE_COST);
          if (!charge.ok) {
            return jsonError(charge.message ?? "Out of credits.", 402, charge.code ?? "no_credits");
          }

          // 1. NVIDIA Chatterbox (Resemble.AI) — most human-sounding, tried first
          const chatterboxVoice = await tryNvidiaChatterboxTts(input, request);
          if (chatterboxVoice) return chatterboxVoice;

          // 2. NVIDIA Magpie TTS — multilingual fallback
          const nvidiaVoice = await tryNvidiaMagpieTts(input, request);
          if (nvidiaVoice) return nvidiaVoice;

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey && !process.env.ELEVENLABS_API_KEY) {
            return jsonError("Voice not configured.", 500, "voice_not_configured");
          }

          // Forward the gateway SSE body straight to the browser.
          // PCM (24kHz 16-bit mono) so the client can decode + play chunk by chunk.
          let upstream: Response;
          try {
            if (!apiKey) throw new Error("Lovable voice key missing.");
            upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "openai/gpt-4o-mini-tts",
                input,
                voice,
                stream_format: "sse",
                response_format: "pcm",
                speed: 1.0,
                instructions:
                  "Sound like a friendly Roblox game-building assistant. Speak clearly with confident, upbeat energy.",
              }),
              signal: request.signal,
            });
          } catch (err) {
            if (request.signal.aborted) return new Response(null, { status: 499 });
            upstream = new Response("Lovable voice unavailable", { status: 503 });
          }

          if (!upstream.ok || !upstream.body) {
            const detail = await upstream.text().catch(() => "");

            // Auto-fallback to ElevenLabs on credit exhaustion / rate limit /
            // gateway disabled. Keeps voice working even when the Lovable AI
            // TTS budget runs out. ElevenLabs returns MP3 — we forward it
            // verbatim and let the client's audio element handle it.
            const elevenKey = process.env.ELEVENLABS_API_KEY;
            const shouldFallback =
              elevenKey && (upstream.status === 402 || upstream.status === 429 || upstream.status === 403 || upstream.status === 503);
            if (shouldFallback) {
              try {
                const elevenVoiceId = "JBFqnCBsd6RMkjVDRZzb"; // friendly default
                const eleven = await fetch(
                  `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}/stream?output_format=mp3_44100_128`,
                  {
                    method: "POST",
                    headers: {
                      "xi-api-key": elevenKey,
                      "Content-Type": "application/json",
                      Accept: "audio/mpeg",
                    },
                    body: JSON.stringify({
                      text: input,
                      model_id: "eleven_turbo_v2_5",
                      voice_settings: { stability: 0.4, similarity_boost: 0.75 },
                    }),
                    signal: request.signal,
                  },
                );
                if (eleven.ok && eleven.body) {
                  return new Response(eleven.body, {
                    headers: {
                      "Content-Type": "audio/mpeg",
                      "Cache-Control": "no-cache, no-transform",
                      "X-Accel-Buffering": "no",
                      "X-Voice-Provider": "elevenlabs",
                    },
                  });
                }
              } catch (e) {
                console.error("[voice] ElevenLabs fallback failed", e);
              }
            }

            return jsonError(
              detail.slice(0, 200) || "TTS upstream failed",
              upstream.status,
              upstream.status === 402 ? "credits_exhausted" :
              upstream.status === 429 ? "rate_limited" :
              upstream.status === 403 ? "voice_disabled" :
              "tts_failed",
            );
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
              "X-Voice-Provider": "lovable",
            },
          });

        } catch (e) {
          console.error("[voice] fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500, "fatal");
        }
      },
    },
  },
});
