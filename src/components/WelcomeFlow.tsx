// Premium 7-step onboarding overlay. Persists completion in localStorage.
// Shown once per user; can be replayed from Settings via `force`.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Rocket, PlugZap, Sparkles, Gamepad2, Wand2, Cpu,
  Send, PartyPopper, ArrowRight, X, Check,
} from "lucide-react";

const STORAGE_KEY = "bs-welcome-v1";

type Props = { force?: boolean; onClose?: () => void };

const BUILD_IDEAS = [
  { label: "RPG", prompt: "Build an RPG with quests, inventory, and combat" },
  { label: "Simulator", prompt: "Build a simulator with pets, currency, and rebirths" },
  { label: "Obby", prompt: "Build an obby with checkpoints and leaderboard" },
  { label: "Horror", prompt: "Build a horror game with jump scares and lighting" },
  { label: "Tycoon", prompt: "Build a tycoon with droppers, upgrades, and shop" },
  { label: "Survival", prompt: "Build a survival game with hunger, crafting, and PvP" },
];

const STYLES = [
  { key: "prototype", label: "Quick Prototype", hint: "Fastest path to playable." },
  { key: "production", label: "Production Quality", hint: "Polished, ready to publish." },
  { key: "mobile", label: "Mobile Optimized", hint: "Touch controls + performance." },
  { key: "perf", label: "Performance Optimized", hint: "Lean, low-poly, high-FPS." },
  { key: "beginner", label: "Beginner Friendly", hint: "Simple systems, well-commented." },
  { key: "advanced", label: "Advanced", hint: "Server-authoritative, modular." },
];

const BUILD_STAGES = [
  { icon: "🧠", label: "Planning" },
  { icon: "🏗", label: "Building" },
  { icon: "📦", label: "Finding Assets" },
  { icon: "💻", label: "Writing Scripts" },
  { icon: "🎨", label: "Building UI" },
  { icon: "🧪", label: "Testing" },
  { icon: "⚡", label: "Optimizing" },
];

export function WelcomeFlow({ force, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("production");
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (force) { setOpen(true); setStep(0); return; }
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, [force]);

  function close(finished: boolean) {
    setOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, finished ? "done" : "skipped");
      if (finished && prompt) localStorage.setItem("bs-onboarding-prompt", prompt);
    }
    onClose?.();
  }

  function next() { setStep((s) => Math.min(s + 1, 6)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-background/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-2xl">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

        <button
          onClick={() => close(false)}
          className="absolute right-4 top-4 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Skip"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="relative px-8 pt-8">
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-primary">
            Step {step + 1} of 7
          </div>
        </div>

        <div className="relative px-8 pb-8 pt-4 min-h-[420px]">
          {/* Step 1 – Welcome */}
          {step === 0 && (
            <div className="text-center py-8">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30">
                <Sparkles className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Welcome to BloxSmith</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Describe your game idea in plain English and BloxSmith builds it in Roblox Studio.
              </p>
              <button
                onClick={next}
                className="mx-auto mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90"
              >
                <Rocket className="h-4 w-4" /> Get Started
              </button>
            </div>
          )}

          {/* Step 2 – Connect plugin */}
          {step === 1 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><PlugZap className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="font-display text-xl font-bold">Connect Roblox Studio</h2>
                  <p className="text-xs text-muted-foreground">Link the plugin to send builds directly into Studio.</p>
                </div>
              </div>
              <ol className="space-y-2 text-sm">
                {["Install the BloxSmith plugin", "Open Roblox Studio", "Click Connect in the plugin panel", "Confirm connection here"].map((s, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/40 px-4 py-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> Waiting for plugin…</span>
                <button onClick={() => navigate({ to: "/plugin" })} className="text-xs font-semibold text-primary hover:underline">Open plugin page →</button>
              </div>
            </div>
          )}

          {/* Step 3 – First project */}
          {step === 2 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><Gamepad2 className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="font-display text-xl font-bold">What do you want to build?</h2>
                  <p className="text-xs text-muted-foreground">Pick an idea or write your own.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUILD_IDEAS.map((b) => (
                  <button
                    key={b.label}
                    onClick={() => setPrompt(b.prompt)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      prompt === b.prompt ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-secondary"
                    }`}
                  >
                    <div className="font-semibold">{b.label}</div>
                  </button>
                ))}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, 400))}
                placeholder="Or describe your own idea…"
                className="mt-4 min-h-[80px] w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Step 4 – Build style */}
          {step === 3 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><Wand2 className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="font-display text-xl font-bold">Choose your build style</h2>
                  <p className="text-xs text-muted-foreground">This tunes how the AI plans and executes.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStyle(s.key)}
                    className={`rounded-xl border p-3 text-left transition ${
                      style === s.key ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{s.label}</span>
                      {style === s.key && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5 – Watch the AI work */}
          {step === 4 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><Cpu className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="font-display text-xl font-bold">Watch the AI work</h2>
                  <p className="text-xs text-muted-foreground">Every build is a live pipeline, not a loading spinner.</p>
                </div>
              </div>
              <div className="space-y-2">
                {BUILD_STAGES.map((s, i) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/40 px-4 py-2 opacity-0 animate-in fade-in slide-in-from-left-4"
                    style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
                  >
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{i < 3 ? "queued" : "next"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 6 – Push to Studio */}
          {step === 5 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><Send className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="font-display text-xl font-bold">Push to Studio</h2>
                  <p className="text-xs text-muted-foreground">When the build is ready, one click sends everything to Studio.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Scripts", value: "14" },
                  { label: "Assets", value: "27" },
                  { label: "UI Screens", value: "5" },
                  { label: "Systems", value: "8" },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
                    <div className="font-display text-2xl font-bold text-primary">{k.value}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Build Quality</span>
                  <span className="rounded-full bg-primary/20 px-3 py-0.5 text-xs font-bold text-primary">A+</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-border overflow-hidden"><div className="h-full w-[92%] bg-gradient-to-r from-primary to-accent" /></div>
              </div>
            </div>
          )}

          {/* Step 7 – Success */}
          {step === 6 && (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 animate-bounce">
                <PartyPopper className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="font-display text-2xl font-bold">🎉 You&apos;re ready.</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Your first Roblox game is one prompt away.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                {["Improve My Game", "Add Multiplayer", "Generate UI", "Add Quests", "Optimize Performance", "Playtest"].map((a) => (
                  <div key={a} className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">{a}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-secondary/30 px-8 py-4">
          <button onClick={() => close(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={back} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">Back</button>
            )}
            {step < 6 ? (
              <button
                onClick={next}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => close(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Start Building <Rocket className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
