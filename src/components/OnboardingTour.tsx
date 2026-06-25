import { useEffect, useState } from "react";
import { ArrowRight, X, Sparkles } from "lucide-react";

export type TourStep = {
  title: string;
  body: string;
  cta?: string;
};

type Props = {
  storageKey: string;
  steps: TourStep[];
  /** Called when the user clicks the final CTA. */
  onFinish?: () => void;
  /** Force-show even if already completed (e.g. "Replay tour" button). */
  force?: boolean;
};

export function OnboardingTour({ storageKey, steps, onFinish, force }: Props) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (force) { setOpen(true); setI(0); return; }
    const done = localStorage.getItem(storageKey);
    if (!done) setOpen(true);
  }, [storageKey, force]);

  function close(finished: boolean) {
    setOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, finished ? "done" : "skipped");
    }
    if (finished) onFinish?.();
  }

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 backdrop-blur-sm p-4">
      <div className="glass relative w-full max-w-lg rounded-2xl p-7 shadow-2xl ring-1 ring-primary/20">
        <button
          onClick={() => close(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Step {i + 1} of {steps.length}
        </div>
        <h2 className="font-display mt-2 text-2xl font-bold">{step.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-6 flex items-center gap-1.5">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 flex-1 rounded-full transition ${
                idx <= i ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => close(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? close(true) : setI(i + 1))}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {step.cta ?? (last ? "Let's go" : "Next")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
