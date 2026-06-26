import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeVoice } from "@/lib/voice.functions";

type Status = "idle" | "listening" | "speaking";

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
        title={ttsEnabled ? "Mute BloxSmith voice" : "Enable BloxSmith voice"}
        onClick={() => {
          if (ttsEnabled) (window as any).__bloxsmithStopSpeak?.();
          setTtsEnabled(!ttsEnabled);
        }}
      >
        {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>

      {status === "speaking" && (
        <button
          type="button"
          className="bs-icon-btn"
          title="Stop speaking"
          onClick={() => (window as any).__bloxsmithStopSpeak?.()}
        >
          <Square className="h-4 w-4" />
        </button>
      )}

      {label && (
        <span className="ml-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          {label}
        </span>
      )}
    </>
  );
}

/** Hook used by the chat to speak assistant replies. */
export function useBloxSmithSpeaker(enabled: boolean) {
  const synth = useServerFn(synthesizeVoice);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function speak(text: string) {
    if (!enabled || !text?.trim()) return;
    // strip code blocks and the bloxsmith-actions JSON
    const cleaned = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    if (!cleaned) return;

    try {
      // stop anything playing first
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const res: any = await synth({ data: { text: cleaned } });
      if (!res?.ok) return;
      const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
      audioRef.current = audio;
      (window as any).__bloxsmithStopSpeak = () => {
        audio.pause();
        audioRef.current = null;
      };
      await audio.play().catch(() => {});
    } catch {
      // silent fallback
    }
  }

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }

  return { speak, stop };
}
