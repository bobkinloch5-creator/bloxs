import { useEffect, useRef, useState } from "react";
import { ChevronDown, Zap, Brain, Rocket, Check } from "lucide-react";

export type BuildQuality = "basic" | "better" | "premium" | "full_game";

type Mode = {
  key: BuildQuality;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Zap;
  speed: number;
  quality: number;
  recommended?: boolean;
};

const MODES: Mode[] = [
  {
    key: "basic",
    title: "Fast Build",
    tagline: "Quick prototypes and testing.",
    description:
      "Generates your game as quickly as possible while keeping core functionality. Best for testing ideas, quick scripts, and small updates.",
    icon: Zap,
    speed: 5,
    quality: 3,
  },
  {
    key: "better",
    title: "Smart Build",
    tagline: "Best balance of speed and quality.",
    description:
      "Uses the BloxSmith Agent to plan, build, and optimize automatically. Picks the best AI models behind the scenes for great results at a solid pace.",
    icon: Brain,
    speed: 4,
    quality: 4,
    recommended: true,
  },
  {
    key: "premium",
    title: "Deep Build",
    tagline: "Maximum quality with deeper planning.",
    description:
      "Performs a deeper analysis before building — reviews existing systems, prevents duplicates, tests, and optimizes for the highest quality output. Best for full games, tycoons, MMOs, and major polish passes.",
    icon: Rocket,
    speed: 2,
    quality: 5,
  },
];

function Stars({ value, tone }: { value: number; tone: "speed" | "quality" }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${tone} ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="text-[10px] leading-none"
          style={{
            color: n <= value ? (tone === "speed" ? "var(--bs-primary)" : "var(--bs-accent)") : "var(--bs-border)",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function BuildModeSelector({
  value,
  onChange,
}: {
  value: BuildQuality;
  onChange: (v: BuildQuality) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = MODES.find((m) => m.key === value) ?? MODES[1];
  const CurrentIcon = current.icon;

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${current.title} — ${current.tagline}`}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition"
        style={{
          borderColor: "var(--bs-border)",
          background: "color-mix(in oklab, var(--bs-accent) 12%, transparent)",
          color: "var(--bs-accent)",
        }}
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{current.title}</span>
        {current.recommended && (
          <span
            className="hidden rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wide xl:inline"
            style={{ background: "var(--bs-accent)", color: "var(--bs-accent-fg, #0b0616)" }}
          >
            Rec
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full right-0 z-50 mb-2 w-[320px] overflow-hidden rounded-xl border shadow-2xl"
          style={{
            borderColor: "var(--bs-border)",
            background: "var(--bs-surface, #0b0616)",
            boxShadow: "0 24px 60px -20px rgba(0,0,0,0.6)",
          }}
        >
          <div
            className="px-3 py-2 text-[10px] font-black uppercase tracking-wider"
            style={{ color: "var(--bs-muted-fg)", borderBottom: "1px solid var(--bs-border)" }}
          >
            Choose a build mode
          </div>
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = m.key === value;
            return (
              <button
                key={m.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(m.key);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-white/[0.04]"
                style={{
                  background: active ? "color-mix(in oklab, var(--bs-accent) 10%, transparent)" : "transparent",
                }}
              >
                <div
                  className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg"
                  style={{
                    background: "color-mix(in oklab, var(--bs-accent) 18%, transparent)",
                    color: "var(--bs-accent)",
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-black" style={{ color: "var(--bs-fg)" }}>
                      {m.title}
                    </span>
                    {m.recommended && (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wide"
                        style={{ background: "var(--bs-accent)", color: "var(--bs-accent-fg, #0b0616)" }}
                      >
                        ★ Recommended
                      </span>
                    )}
                    {active && <Check className="h-3.5 w-3.5" style={{ color: "var(--bs-accent)" }} />}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4" style={{ color: "var(--bs-muted-fg)" }}>
                    {m.tagline}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-4" style={{ color: "var(--bs-muted-fg)" }}>
                    {m.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-bold" style={{ color: "var(--bs-muted-fg)" }}>
                    <span className="inline-flex items-center gap-1">
                      Speed <Stars value={m.speed} tone="speed" />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Quality <Stars value={m.quality} tone="quality" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
