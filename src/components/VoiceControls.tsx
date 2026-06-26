import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";


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
  voiceSpeaking = false,
  voiceLoading = false,
  voiceError: externalVoiceError = null,
}: {
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  onTranscript: (text: string, send: boolean) => void;
  busy: boolean;
  voiceSpeaking?: boolean;
  voiceLoading?: boolean;
  voiceError?: string | null;
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

  const activeVoiceError = externalVoiceError || voiceError;
  const label =
    status === "listening" ? "Listening…" :
    voiceLoading ? "Making voice…" :
    voiceSpeaking ? "Speaking…" :
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

      {(voiceSpeaking || voiceLoading || status === "speaking" || status === "loading") && (
        <button
          type="button"
          className="bs-icon-btn"
          title="Stop speaking"
          onClick={() => (window as any).__bloxsmithStopSpeak?.()}
        >
          <Square className="h-4 w-4" />
        </button>
      )}

      {(label || activeVoiceError || ttsEnabled) && (
        <span className="ml-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          {activeVoiceError || label || "Voice on"}
        </span>
      )}
    </>
  );
}

/**
 * Hook used by the chat to speak assistant replies.
 *
 * Streams PCM (24kHz 16-bit mono) chunks over SSE from /api/voice and schedules
 * each chunk on a single AudioContext so playback starts within a few hundred
 * milliseconds of the first byte — instead of waiting for the full mp3 file.
 */
export function useBloxSmithSpeaker(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    for (const s of sourcesRef.current) {
      try { s.stop(); } catch {}
      try { s.disconnect(); } catch {}
    }
    sourcesRef.current = [];
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!enabled || !text?.trim()) return;
    const cleaned = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<bloxsmith-actions>[\s\S]*?<\/bloxsmith-actions>/gi, " ")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    if (!cleaned) return;

    stop();
    setError(null);
    setLoading(true);

    try {
      // Lazy-create one AudioContext per session so the user gesture that opens
      // the chat counts as the unlock.
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setError("Sign in again to use voice.");
        setLoading(false);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;
      (window as any).__bloxsmithStopSpeak = () => stop();

      const res = await fetch("/api/voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleaned }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let code = "tts_failed";
        try { const j = await res.json(); code = j?.code ?? code; } catch {}
        setError(getVoiceErrorMessage(code));
        setLoading(false);
        return;
      }

      let playhead = 0;
      let pending = new Uint8Array(0);
      let firstChunkPlayed = false;
      let activeSources = 0;

      const playChunk = (incoming: Uint8Array) => {
        const bytes = new Uint8Array(pending.length + incoming.length);
        bytes.set(pending);
        bytes.set(incoming, pending.length);
        const usable = bytes.length - (bytes.length % 2);
        pending = bytes.slice(usable);
        if (usable === 0) return;
        const samples = new Int16Array(bytes.buffer, 0, usable / 2);
        const floats = Float32Array.from(samples, (s) => s / 32768);
        const buffer = ctx.createBuffer(1, floats.length, 24000);
        buffer.copyToChannel(floats, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        if (playhead === 0) {
          // Tiny lead-in so the first samples aren't clipped by the output device.
          playhead = ctx.currentTime + 0.04;
        } else {
          playhead = Math.max(playhead, ctx.currentTime);
        }
        source.start(playhead);
        playhead += buffer.duration;
        activeSources++;
        sourcesRef.current.push(source);
        source.onended = () => {
          activeSources--;
          if (activeSources <= 0) {
            setSpeaking(false);
          }
        };
        if (!firstChunkPlayed) {
          firstChunkPlayed = true;
          setLoading(false);
          setSpeaking(true);
        }
      };

      const parser = createParser({
        onEvent(event) {
          let payload: { type: string; audio?: string };
          try { payload = JSON.parse(event.data); } catch { return; }
          if (payload.type !== "speech.audio.delta" || !payload.audio) return;
          const binary = atob(payload.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          playChunk(bytes);
        },
      });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError("Click the speaker button once, then send a message again so your browser allows audio.");
      setSpeaking(false);
      setLoading(false);
    }
  }, [enabled, stop]);

  return { speak, stop, speaking, loading, error };
}

