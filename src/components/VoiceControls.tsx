import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeVoice } from "@/lib/voice.functions";

type Status = "idle" | "listening" | "speaking" | "loading";

function getVoiceErrorMessage(error?: string) {
  if (error === "voice_not_configured") return "Voice is not configured yet.";
  if (error === "credits_exhausted") return "Voice credits are exhausted.";
  if (error === "voice_disabled") return "Voice is disabled for this workspace.";
  if (error === "rate_limited") return "Voice is rate-limited. Try again in a moment.";
  return "Could not play BloxSmith's voice.";
}

export function VoiceControls({
  ttsEnabled,
  setTtsEnabled,
  onTranscript,
  busy,
}: {
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  onTranscript: (text: string, send: boolean) => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // expose stop-speak globally so the chat hook can interrupt on new turn
  useEffect(() => {
    (window as any).__bloxsmithStopSpeak = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setStatus((s) => (s === "speaking" ? "idle" : s));
    };
    return () => {
      (window as any).__bloxsmithStopSpeak = undefined;
    };
  }, []);

  function startListening() {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    try {
      const rec = new SR();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        const text = e.results?.[0]?.[0]?.transcript ?? "";
        if (text.trim()) onTranscript(text.trim(), true);
      };
      rec.onerror = () => setStatus("idle");
      rec.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));
      rec.start();
      recRef.current = rec;
      setStatus("listening");
    } catch {
      setStatus("idle");
    }
  }

  function stopListening() {
    try {
      recRef.current?.stop();
    } catch {}
    setStatus("idle");
  }

  const label =
    status === "listening" ? "Listening…" :
    status === "speaking" ? "Speaking…" :
    busy ? "Thinking…" : "";

  return (
    <>
      <button
        type="button"
        className="bs-icon-btn"
        title={status === "listening" ? "Stop listening" : "Talk to BloxSmith"}
        onClick={() => (status === "listening" ? stopListening() : startListening())}
        style={status === "listening" ? { color: "var(--bs-danger)" } : undefined}
      >
        {status === "listening" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      <button
        type="button"
        className="bs-icon-btn"
        title={ttsEnabled ? "Mute BloxSmith voice" : "Turn on real BloxSmith voice"}
        onClick={() => {
          if (ttsEnabled) (window as any).__bloxsmithStopSpeak?.();
          else setVoiceError(null);
          setTtsEnabled(!ttsEnabled);
        }}
        style={ttsEnabled ? { color: "var(--bs-primary)" } : undefined}
      >
        {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>

      {(status === "speaking" || status === "loading") && (
        <button
          type="button"
          className="bs-icon-btn"
          title="Stop speaking"
          onClick={() => (window as any).__bloxsmithStopSpeak?.()}
        >
          <Square className="h-4 w-4" />
        </button>
      )}

      {(label || voiceError || ttsEnabled) && (
        <span className="ml-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          {voiceError || label || "Voice on"}
        </span>
      )}
    </>
  );
}

/** Hook used by the chat to speak assistant replies. */
export function useBloxSmithSpeaker(enabled: boolean) {
  const synth = useServerFn(synthesizeVoice);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!enabled || !text?.trim()) return;
    // strip code blocks and the bloxsmith-actions JSON
    const cleaned = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<bloxsmith-actions>[\s\S]*?<\/bloxsmith-actions>/gi, " ")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    if (!cleaned) return;

    try {
      // stop anything playing first
      stop();
      setError(null);
      setLoading(true);
      const res: any = await synth({ data: { text: cleaned } });
      if (!res?.ok) {
        setError(getVoiceErrorMessage(res?.error));
        return;
      }
      const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
      audioRef.current = audio;
      (window as any).__bloxsmithStopSpeak = () => {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
        setSpeaking(false);
        setLoading(false);
      };
      audio.onended = () => {
        audioRef.current = null;
        setSpeaking(false);
      };
      setLoading(false);
      setSpeaking(true);
      await audio.play();
    } catch {
      setError("Click the speaker button once, then send a message again so your browser allows audio.");
      setSpeaking(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, stop, synth]);

  return { speak, stop, speaking, loading, error };
}
