import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Mic, MicOff, X, AlertTriangle, Sparkles } from "lucide-react";

type Props = {
  /** Called with each finalized user utterance. The chat will auto-send it. */
  onUtterance: (text: string) => void;
  /** Enables BloxSmith TTS so the AI's reply is spoken aloud. */
  setTtsEnabled?: (v: boolean) => void;
  disabled?: boolean;
};

type MicDevice = { deviceId: string; label: string };

/**
 * Hands-free voice loop for the project chat:
 *  • Listens via the browser SpeechRecognition API on explicit Start click
 *  • Auto-follows the OS default input device (or a specific one the user picks)
 *  • Refreshes automatically when devices are plugged/unplugged or the OS default changes
 *  • Auto-enables BloxSmith TTS so the assistant's reply is spoken back through speakers
 */
export function VoiceBuildButton({ onUtterance, setTtsEnabled, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>("");
  const [interim, setInterim] = useState<string>("");
  const [devices, setDevices] = useState<MicDevice[]>([]);
  // "" = follow the OS default input device automatically
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [activeMicLabel, setActiveMicLabel] = useState<string>("");
  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wantOnRef = useRef(false);
  // Keep onUtterance in a ref so the recognition callback never captures a stale version
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);

  const getSR = () =>
    (typeof window !== "undefined" &&
      ((window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition)) ||
    null;

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      const mics: MicDevice[] = list
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
      setDevices(mics);
    } catch {
      // ignore
    }
  }, []);

  // Track device changes (mic plugged/unplugged, OS default switched)
  useEffect(() => {
    refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => {
      refreshDevices();
      // If listening and user is following the system default, restart the
      // capture stream so we pick up the newly-selected default device.
      if (wantOnRef.current && selectedDeviceId === "") {
        restartCapture().catch(() => {});
      }
    };
    md.addEventListener("devicechange", handler);
    return () => md.removeEventListener("devicechange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDevices, selectedDeviceId]);

  // Open a mic stream honouring the user's selection (or the OS default).
  // Keeping this stream alive while SpeechRecognition runs hints the browser
  // to route recognition audio through the same device on Chromium.
  const openMicStream = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.();
    const label = track?.label || devices.find((d) => d.deviceId === settings?.deviceId)?.label || "System default mic";
    setActiveMicLabel(label);
    return stream;
  }, [selectedDeviceId, devices]);

  const restartCapture = useCallback(async () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    try {
      streamRef.current = await openMicStream();
    } catch {
      // ignore — recognition will still try the OS default
    }
  }, [openMicStream]);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    setListening(false);
  }, []);

  // start() must only be called from a real click handler — browsers block
  // getUserMedia inside useEffect because it lacks a user-gesture signal.
  const start = useCallback(async () => {
    setError(null);
    setLastHeard("");
    setInterim("");

    const SR = getSR();
    if (!SR) {
      setError("Voice input isn't supported here. Try Chrome, Edge, or Brave.");
      return;
    }

    // Request mic on the selected (or default) device — MUST come from a direct click event.
    try {
      streamRef.current = await openMicStream();
      // labels are only exposed after permission is granted — refresh now
      refreshDevices();
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setError("Microphone blocked. Click the 🔒 icon in your browser address bar and allow mic access, then try again.");
      } else if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") {
        setError("Selected microphone isn't available. Switch to another mic or 'System default'.");
      } else {
        setError("Could not access the microphone. Check your browser settings.");
      }
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
          onUtteranceRef.current(t);
        }
      };

      rec.onerror = (ev: any) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          setError("Microphone blocked. Enable it in your browser site settings.");
          wantOnRef.current = false;
          setListening(false);
        } else if (ev?.error === "no-speech" || ev?.error === "aborted") {
          // Benign — recognizer restarts via onend
        } else {
          setError(`Voice error: ${ev?.error ?? "unknown"}`);
        }
      };

      rec.onend = () => {
        if (wantOnRef.current) {
          // Restart automatically — continuous mode ends after pauses
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
  }, [openMicStream, refreshDevices]);

  // If the user changes mic while already listening, re-open the capture stream on the new device.
  useEffect(() => {
    if (wantOnRef.current) restartCapture().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  // Enable TTS when panel opens
  useEffect(() => {
    if (open) {
      setTtsEnabled?.(true);
      refreshDevices();
    }
  }, [open, setTtsEnabled, refreshDevices]);

  // Stop recognition when panel closes
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

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
                {listening
                  ? "🎙️ Listening — speak and BloxSmith will build it in Studio"
                  : "Click Start, allow mic access, then speak"}
              </div>

              {/* Mic picker — defaults to the OS default input device */}
              <div className="w-full">
                <label className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                  <span>Input device</span>
                  {listening && activeMicLabel && (
                    <span className="normal-case tracking-normal text-emerald-300/80" title={activeMicLabel}>
                      ● {activeMicLabel.length > 28 ? activeMicLabel.slice(0, 26) + "…" : activeMicLabel}
                    </span>
                  )}
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full rounded-lg border bg-white/[0.03] px-2 py-1.5 text-xs text-white/90 outline-none [color-scheme:dark]"
                  style={{ borderColor: "var(--bs-border)" }}
                >
                  <option value="" style={{ background: "#0b1220", color: "#fff" }}>System default (auto-follow)</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} style={{ background: "#0b1220", color: "#fff" }}>{d.label}</option>
                  ))}
                </select>

                <p className="mt-1 text-[10px] text-white/35">
                  Auto-follows whatever mic your OS is currently using (webcam, headset, speakers combo, etc.). Pick a specific device to override.
                </p>
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
                  <button
                    type="button"
                    onClick={start}
                    className="bs-send-btn flex h-9 items-center gap-1.5 px-4 text-xs font-semibold"
                  >
                    <Mic className="h-3.5 w-3.5" /> Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stop}
                    className="bs-quick"
                    style={{ borderColor: "var(--bs-danger)", color: "var(--bs-danger)" }}
                  >
                    <MicOff className="h-3.5 w-3.5" /> Mute
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="bs-quick">Close</button>
              </div>

              <p className="text-center text-[10px] text-white/40">
                Everything you say is sent to BloxSmith. It builds in Studio and speaks its reply back.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

