import { useCallback, useEffect, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Mic, MicOff, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { getVoiceAgentToken } from "@/lib/voice-agent.functions";

type Props = {
  /** Called with each finalized user utterance. The chat will auto-send it. */
  onUtterance: (text: string) => void;
  disabled?: boolean;
};

/**
 * Live voice button for the project chat composer.
 * Opens a floating panel that streams the user's mic into the ElevenLabs
 * Conversational AI agent for fast, accurate transcription. Each finalized
 * user transcript is pushed into the chat as a normal message, which then
 * runs through BloxSmith AI and queues real build actions.
 */
export function VoiceBuildButton({ onUtterance, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>("");
  const tokenFn = useServerFn(getVoiceAgentToken);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onError: (e: unknown) => setError(typeof e === "string" ? e : (e as Error)?.message ?? "Voice error"),
    onMessage: (msg: any) => {
      const text: string | undefined =
        msg?.message ??
        msg?.text ??
        msg?.user_transcription_event?.user_transcript;
      const src = msg?.source ?? msg?.type;
      if (!text) return;
      if (src === "user" || src === "user_transcript") {
        setLastHeard(text);
        onUtterance(text);
      }
    },
  });

  const status = conversation.status;
  const connected = status === "connected";
  const isSpeaking = conversation.isSpeaking;

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await tokenFn();
      if (!res.ok) {
        setError(
          res.error === "agent_not_found"
            ? "Voice agent not configured. Create an ElevenLabs Conversational AI agent and update BLOXSMITH_AGENT_ID."
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
    try { await conversation.endSession(); } catch {}
  }, [conversation]);

  // Auto-start when opened; auto-stop when closed.
  useEffect(() => {
    if (open && status === "disconnected" && !starting) {
      void start();
    }
    if (!open && status === "connected") {
      void stop();
    }
  }, [open, status, starting, start, stop]);

  // Cleanup on unmount.
  useEffect(() => () => { try { void conversation.endSession(); } catch {} }, []); // eslint-disable-line

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Talk to BloxSmith — your voice goes straight into the chat and builds"
        className="bs-quick"
        style={open ? { borderColor: "var(--bs-primary)", background: "var(--bs-primary-soft)", color: "var(--bs-primary)" } : undefined}
      >
        <Radio className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{open ? "Voice On" : "Voice Build"}</span>
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-4 sm:bottom-6 sm:right-6 sm:left-auto sm:px-0">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-[var(--bs-card)] shadow-2xl" style={{ borderColor: "var(--bs-border)" }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bs-border)" }}>
              <div className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4" style={{ color: "var(--bs-primary)" }} />
                Voice Build
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-white/60 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid place-items-center gap-3 px-6 py-7">
              <div className={`relative grid h-24 w-24 place-items-center rounded-full border transition ${
                connected
                  ? isSpeaking
                    ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_40px_rgba(34,211,238,0.45)]"
                    : "border-emerald-300/50 bg-emerald-400/10 shadow-[0_0_30px_rgba(52,211,153,0.35)]"
                  : "border-white/10 bg-white/[0.03]"
              }`}>
                {starting ? (
                  <Loader2 className="h-9 w-9 animate-spin text-white/60" />
                ) : connected ? (
                  isSpeaking ? <Radio className="h-9 w-9 animate-pulse text-cyan-200" /> : <Mic className="h-9 w-9 text-emerald-200" />
                ) : (
                  <MicOff className="h-9 w-9 text-white/40" />
                )}
                {connected && <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/30" />}
              </div>

              <div className="text-center text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                {starting ? "Connecting…" :
                 connected ? (isSpeaking ? "Listening to the agent…" : "Speak — your words will build the game") :
                 "Tap mic to start"}
              </div>

              {lastHeard && (
                <div className="w-full rounded-lg border bg-white/[0.03] px-3 py-2 text-xs" style={{ borderColor: "var(--bs-border)" }}>
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Heard</div>
                  <div className="text-white/85">{lastHeard}</div>
                </div>
              )}

              {error && (
                <div className="flex w-full items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                {!connected ? (
                  <button onClick={start} disabled={starting} className="bs-send-btn flex h-9 items-center gap-1.5 px-4 text-xs font-semibold">
                    <Mic className="h-3.5 w-3.5" /> Start
                  </button>
                ) : (
                  <button onClick={stop} className="bs-quick" style={{ borderColor: "var(--bs-danger)", color: "var(--bs-danger)" }}>
                    <MicOff className="h-3.5 w-3.5" /> Mute
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="bs-quick">Close</button>
              </div>

              <p className="text-center text-[10px] text-white/40">
                Each thing you say is auto-sent into the chat and built inside Roblox Studio.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
