import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, Sparkles, ChevronRight, Send, CircleDot, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { runSmartBrain } from "@/lib/smart-brain.functions";

type Result = Awaited<ReturnType<typeof runSmartBrain>>;

interface Props {
  projectId: string;
  onSendPrompt?: (text: string) => void;
}

const STAGES = [
  "Analyzing intent",
  "Reading project + memory",
  "Drafting architecture",
  "Consulting specialists",
  "Merging + validating",
];

export function SmartBrainCard({ projectId, onSendPrompt }: Props) {
  const brainFn = useServerFn(runSmartBrain);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function think() {
    const trimmed = goal.trim();
    if (!trimmed) {
      toast.error("Describe what you want built.");
      return;
    }
    setBusy(true);
    setResult(null);
    setStage(0);
    // Cosmetic stage ticker — the server call runs synchronously through all stages.
    const ticker = setInterval(() => setStage((s) => (s < STAGES.length - 1 ? s + 1 : s)), 900);
    try {
      const res = await brainFn({ data: { projectId, goal: trimmed } });
      clearInterval(ticker);
      setStage(STAGES.length - 1);
      setResult(res);
    } catch (err: any) {
      clearInterval(ticker);
      setStage(-1);
      toast.error(err?.message ?? "Smart Brain failed to plan this build.");
    } finally {
      setBusy(false);
    }
  }

  function sendToStudio() {
    if (!result || !onSendPrompt) return;
    onSendPrompt(result.directive);
    toast.success("Smart Brain directive sent to the executor.");
  }

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-fuchsia-300" />
          <div className="text-sm font-semibold">Smart Brain</div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80">
          Plan → Specialists → Build
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
        Runs a 5-stage pipeline before Studio touches your project: intent,
        context, architecture, specialists, validation. Sends a locked plan
        to the executor so the model builds instead of guesses.
      </p>

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="e.g. Add a working shop with 6 items, currency saving, and mobile controls."
        rows={3}
        disabled={busy}
        className="mt-3 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-fuchsia-400/40"
        style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}
      />

      <button
        type="button"
        onClick={think}
        disabled={busy || !goal.trim()}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Thinking…" : "Think, then plan the build"}
      </button>

      {(busy || result) && (
        <ol className="mt-3 space-y-1 text-[11px]">
          {STAGES.map((s, i) => {
            const done = stage > i || (result && i <= STAGES.length - 1);
            const active = busy && stage === i;
            return (
              <li key={s} className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin text-fuchsia-300" />
                ) : (
                  <CircleDot className="h-3 w-3 text-white/30" />
                )}
                <span className={done ? "text-white/80" : active ? "text-fuchsia-200" : "text-white/40"}>
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 text-[11px]" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
          <div className="mb-1 flex items-center justify-between">
            <div className="font-semibold text-white/90">
              {result.intent.category.replace("_", " ")} · {result.intent.complexity}
            </div>
            <div className="text-fuchsia-300">
              {Math.round(result.confidence * 100)}% confidence
            </div>
          </div>
          <div className="text-white/70">{result.intent.summary}</div>

          <div className="mt-2 flex flex-wrap gap-1">
            {result.specialists.map((s) => (
              <span
                key={s.task}
                title={`${s.modelLabel} — ${s.reason}`}
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white/80"
                style={{ borderColor: "var(--bs-border)", background: "rgba(255,255,255,0.03)" }}
              >
                {s.label} · {s.modelLabel}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-fuchsia-300 hover:text-fuchsia-200"
          >
            <ChevronRight className={`h-3 w-3 transition ${expanded ? "rotate-90" : ""}`} />
            {expanded ? "Hide" : "Show"} full plan & briefs
          </button>

          {expanded && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-white/5 bg-black/30 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap text-white/70">
              {result.plan}
              {result.specialists.map((s) => `\n\n[${s.label} — ${s.modelLabel}]\n${s.notes}`).join("")}
            </div>
          )}

          <button
            type="button"
            onClick={sendToStudio}
            disabled={!onSendPrompt}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-bold text-fuchsia-100 transition hover:bg-fuchsia-500/20 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Build this plan in Studio
          </button>
          <div className="mt-1 text-center text-[10px] text-white/40">
            {(result.ranMs / 1000).toFixed(1)}s · executor will follow the locked plan
          </div>
        </div>
      )}
    </div>
  );
}
