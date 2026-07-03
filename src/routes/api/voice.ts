// Voice TTS route.
// Preferred path: NVIDIA Magpie TTS through Build.NVIDIA.com/NVCF when an
// NVIDIA key is configured. Fallback path: Lovable AI Gateway SSE, then
// ElevenLabs MP3 if available.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

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

          // 1. NVIDIA Chatterbox (Resemble.AI) — most human-sounding, tried first
          const chatterboxVoice = await tryNvidiaChatterboxTts(input, request);
          if (chatterboxVoice) return chatterboxVoice;

          // 2. NVIDIA Magpie TTS — multilingual fallback
          const nvidiaVoice = await tryNvidiaMagpieTts(input, request);
          if (nvidiaVoice) return nvidiaVoice;

          return jsonError("NVIDIA voice is unavailable right now.", 503, "nvidia_voice_unavailable");

        } catch (e) {
          console.error("[voice] fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500, "fatal");
        }
      },
    },
  },
});
