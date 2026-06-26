// Low-latency voice TTS streaming route.
// Streams PCM audio chunks via SSE from Lovable AI Gateway directly to the browser
// so playback can start within a few hundred ms instead of waiting for the full file.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { chargeCredits, VOICE_COST } from "@/lib/credits.server";

const DEFAULT_VOICE = "alloy";

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return jsonError("Voice not configured.", 500, "voice_not_configured");

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

          // Forward the gateway SSE body straight to the browser.
          // PCM (24kHz 16-bit mono) so the client can decode + play chunk by chunk.
          let upstream: Response;
          try {
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
            throw err;
          }

          if (!upstream.ok || !upstream.body) {
            const detail = await upstream.text().catch(() => "");
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
