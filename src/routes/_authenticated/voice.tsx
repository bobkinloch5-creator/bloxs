import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { Mic, MicOff, Loader2, Radio, AlertTriangle, Sparkles } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getMyProfile } from "@/lib/profile.functions";
import { getVoiceAgentToken } from "@/lib/voice-agent.functions";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({ meta: [
    { title: "Voice Agent — BloxSmith" },
    { name: "description", content: "Talk to your BloxSmith AI assistant in real time." },
  ]}),
  component: VoicePage,
});

type Transcript = { id: string; who: "you" | "bloxsmith"; text: string };

function VoicePage() {
  const profFn = useServerFn(getMyProfile);
  const tokenFn = useServerFn(getVoiceAgentToken);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onDisconnect: () => {},
    onError: (e: unknown) => setError(typeof e === "string" ? e : (e as Error)?.message ?? "Voice error"),
    onMessage: (msg: any) => {
      const t = msg?.message ?? msg?.text;
      const src = msg?.source ?? msg?.type;
      if (!t) return;
      if (src === "user" || src === "user_transcript") {
        setTranscript((p) => [...p, { id: crypto.randomUUID(), who: "you", text: t }]);
      } else if (src === "ai" || src === "agent_response") {
        setTranscript((p) => [...p, { id: crypto.randomUUID(), who: "bloxsmith", text: t }]);
      }
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const connected = status === "connected";

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await tokenFn();
      if (!res.ok) {
        setError(
          res.error === "agent_not_found"
            ? "Agent ID not found in your ElevenLabs account. Create a Conversational AI agent and update BLOXSMITH_AGENT_ID."
            : res.error === "auth_failed"
            ? "ElevenLabs API key rejected."
            : res.error === "voice_not_configured"
            ? "ElevenLabs is not connected."
            : `Could not start voice agent (${res.error}).`,
        );
        return;
      }
      await conversation.startSession({
        conversationToken: res.token,
        connectionType: "webrtc",
      });
    } catch (e: any) {
      setError(e?.message ?? "Could not access microphone");
    } finally {
      setStarting(false);
    }
  }, [conversation, tokenFn]);

  const stop = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  useEffect(() => () => { try { void conversation.endSession(); } catch {} }, []); // eslint-disable-line

  return (
    <PageShell
      title="Voice Agent"
      description="Real-time voice chat with your BloxSmith assistant."
      accent="chat"
      activeKey="voice"
      isAdmin={!!profile?.is_admin}
    >
      <section className="vapor-card overflow-hidden p-0">
        <div className="relative grid place-items-center gap-6 px-6 py-12 sm:py-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.18),transparent_60%)]" />

          <div className={`relative grid h-40 w-40 place-items-center rounded-full border transition ${
            connected
              ? isSpeaking
                ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_60px_rgba(34,211,238,0.45)]"
                : "border-emerald-300/50 bg-emerald-400/10 shadow-[0_0_50px_rgba(52,211,153,0.35)]"
              : "border-white/10 bg-white/[0.03]"
          }`}>
            {connected ? (
              isSpeaking ? <Radio className="h-14 w-14 animate-pulse text-cyan-200" /> : <Mic className="h-14 w-14 text-emerald-200" />
            ) : (
              <MicOff className="h-14 w-14 text-white/40" />
            )}
            {connected && (
              <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/30" />
            )}
          </div>

          <div className="relative text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              {connected
                ? isSpeaking ? "BloxSmith is speaking…" : "Listening — go ahead"
                : starting ? "Connecting…" : "Tap to start a voice session"}
            </div>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Ask BloxSmith to brainstorm games, explain Roblox APIs, or walk you through your next build — out loud.
            </p>
          </div>

          <div className="relative flex gap-3">
            {!connected ? (
              <button
                onClick={start}
                disabled={starting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {starting ? "Connecting" : "Start Voice Chat"}
              </button>
            ) : (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-6 py-3 text-sm font-bold text-rose-100 transition hover:bg-rose-500/20"
              >
                <MicOff className="h-4 w-4" /> End Session
              </button>
            )}
          </div>

          {error && (
            <div className="relative flex max-w-lg items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>

      <section className="vapor-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-200" style={{ fontFamily: "Space Mono, monospace" }}>
            Live Transcript
          </h3>
          {transcript.length > 0 && (
            <button onClick={() => setTranscript([])} className="text-[11px] text-white/50 hover:text-white">
              Clear
            </button>
          )}
        </div>
        {transcript.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your conversation will appear here.</p>
        ) : (
          <div className="space-y-3">
            {transcript.map((m) => (
              <div key={m.id} className={`rounded-xl border px-4 py-2.5 text-sm ${
                m.who === "you"
                  ? "border-white/10 bg-white/[0.03] text-white/90"
                  : "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-50"
              }`}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
                  {m.who === "you" ? "You" : "BloxSmith"}
                </div>
                {m.text}
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
