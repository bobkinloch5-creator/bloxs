import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Mic, MicOff, X, AlertTriangle, Sparkles } from "lucide-react";

type Props = {
  /** Called with each finalized user utterance. The chat will auto-send it. */
  onUtterance: (text: string) => void;
  /** Enables BloxSmith TTS so the AI's reply is spoken aloud. */
  setTtsEnabled?: (v: boolean) => void;
  disabled?: boolean;
};

/**
 * Hands-free voice loop for the project chat:
 *  • Continuously listens via the browser SpeechRecognition API
 *  • Auto-sends each finalized utterance into the chat (which then builds in Studio)
 *  • Auto-enables BloxSmith TTS so the assistant's reply is spoken back through speakers
 *
 * No ElevenLabs Conversational AI agent required — this works with the same
 * ElevenLabs voice the chat already uses for text-to-speech.
 */
export function VoiceBuildButton({ onUtterance, setTtsEnabled, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>("");
  const [interim, setInterim] = useState<string>("");
  const recRef = useRef<any>(null);
  const wantOnRef = useRef(false);

  const getSR = () =>
    (typeof window !== "undefined" &&
      ((window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition)) ||
    null;

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const SR = getSR();
    if (!SR) {
      setError("Voice input isn't supported here. Try Chrome, Edge, or Brave.");
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Microphone permission was blocked. Enable it in your browser site settings."
          : e?.name === "NotFoundError"
          ? "No microphone was detected on this device."
          : "Could not access the microphone.",
      );
      return;
    }
    try {
      const rec = new SR();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        let finalText = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interimText += r[0].transcript;
        }
        if (interimText) setInterim(interimText.trim());
        if (finalText.trim()) {
          const t = finalText.trim();
          setLastHeard(t);
          setInterim("");
          onUtterance(t);
        }
      };
      rec.onerror = (ev: any) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          setError("Microphone permission was blocked. Enable it in your browser site settings.");
          wantOnRef.current = false;
          setListening(false);
        } else if (ev?.error === "no-speech" || ev?.error === "aborted") {
          // benign — recogniser will restart via onend
        } else {
          setError(`Voice error: ${ev?.error ?? "unknown"}`);
        }
      };
      rec.onend = () => {
        // restart if user still wants to listen (continuous mode often ends after pauses)
        if (wantOnRef.current) {
          try { rec.start(); } catch {}
        } else {
          setListening(false);
        }
      };
      wantOnRef.current = true;
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (e: any) {
      setError(e?.message ?? "Could not start voice recognition.");
      setListening(false);
    }
  }, [onUtterance]);

  // Open ↔ enable TTS so the AI speaks its replies aloud
  useEffect(() => {
    if (open) setTtsEnabled?.(true);
  }, [open, setTtsEnabled]);

  // Auto-start when panel opens, auto-stop when it closes
  useEffect(() => {
    if (open && !listening) void start();
    if (!open && listening) stop();
  }, [open, listening, start, stop]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Hands-free voice — speak to BloxSmith and it builds your game out loud"
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
                listening
                  ? "border-emerald-300/50 bg-emerald-400/10 shadow-[0_0_30px_rgba(52,211,153,0.35)]"
                  : "border-white/10 bg-white/[0.03]"
              }`}>
                {listening ? <Mic className="h-9 w-9 text-emerald-200" /> : <MicOff className="h-9 w-9 text-white/40" />}
                {listening && <span className="absolute inset-0 animate-ping rounded-full border border-emerald-300/30" />}
              </div>

              <div className="text-center text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                {listening ? "Speak — your words are sent to BloxSmith and built in Studio" : "Tap Start to begin hands-free voice"}
              </div>

              {(interim || lastHeard) && (
                <div className="w-full rounded-lg border bg-white/[0.03] px-3 py-2 text-xs" style={{ borderColor: "var(--bs-border)" }}>
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                    {interim ? "Hearing…" : "Heard"}
                  </div>
                  <div className="text-white/85">{interim || lastHeard}</div>
                </div>
              )}

              {error && (
                <div className="flex w-full items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                {!listening ? (
                  <button onClick={start} className="bs-send-btn flex h-9 items-center gap-1.5 px-4 text-xs font-semibold">
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
                Each thing you say is auto-sent into the chat. BloxSmith speaks its reply back through your speakers.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
