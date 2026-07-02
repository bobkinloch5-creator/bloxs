import { useState } from "react";
import {
  Sparkles, Clock, Zap, Play, X, Pencil, Check,
  Plus, Trash2, Box, Wand2, Loader2,
} from "lucide-react";
import type { PlanStep } from "@/lib/build-planner.functions";

type Plan = {
  id: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  estCredits: number;
  estSeconds: number;
  prompt: string;
  status?: string;
};

const KIND_COLOR: Record<PlanStep["kind"], string> = {
  terrain: "from-emerald-500/30 to-emerald-500/10 text-emerald-200",
  assets: "from-indigo-500/30 to-indigo-500/10 text-indigo-200",
  scripts: "from-amber-500/30 to-amber-500/10 text-amber-200",
  ui: "from-pink-500/30 to-pink-500/10 text-pink-200",
  npcs: "from-rose-500/30 to-rose-500/10 text-rose-200",
  lighting: "from-yellow-500/30 to-yellow-500/10 text-yellow-200",
  systems: "from-violet-500/30 to-violet-500/10 text-violet-200",
  audio: "from-cyan-500/30 to-cyan-500/10 text-cyan-200",
  polish: "from-fuchsia-500/30 to-fuchsia-500/10 text-fuchsia-200",
  other: "from-slate-500/30 to-slate-500/10 text-slate-200",
};

export function BuildPlannerCard({
  plan,
  busy,
  onStart,
  onCancel,
  onChange,
}: {
  plan: Plan;
  busy?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onChange: (steps: PlanStep[]) => void;
}) {
  const [editing, setEditing] = useState(false);

  const totalCredits = plan.steps.reduce((n, s) => n + (s.estCredits ?? 0), 0);
  const totalSeconds = plan.steps.reduce((n, s) => n + (s.estSeconds ?? 0), 0);

  function updateStep(id: string, patch: Partial<PlanStep>) {
    onChange(plan.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeStep(id: string) {
    onChange(plan.steps.filter((s) => s.id !== id));
  }
  function addStep() {
    onChange([
      ...plan.steps,
      {
        id: `step_${Date.now().toString(36)}`,
        kind: "other",
        label: "New step",
        detail: "",
        assetQuery: "",
        quantity: 1,
        estCredits: 2,
        estSeconds: 6,
      },
    ]);
  }

  return (
    <div className="my-3 rounded-2xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500/10 via-black/40 to-black/60 p-4 shadow-[0_8px_40px_-12px_rgba(99,102,241,0.45)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/30 text-indigo-200">
            <Wand2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">AI Build Planner</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                Preview
              </span>
            </div>
            <h3 className="truncate text-base font-semibold text-white">{plan.title}</h3>
            <p className="mt-0.5 line-clamp-2 text-sm text-white/70">{plan.summary}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Cancel plan"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Totals */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Pill icon={<Box className="h-3.5 w-3.5" />} label={`${plan.steps.length} steps`} />
        <Pill icon={<Zap className="h-3.5 w-3.5" />} label={`~${totalCredits} credits`} />
        <Pill icon={<Clock className="h-3.5 w-3.5" />} label={`~${formatSec(totalSeconds)}`} />
      </div>

      {/* Steps */}
      <ul className="mt-3 space-y-1.5">
        {plan.steps.map((step, idx) => (
          <li
            key={step.id}
            className="group flex items-start gap-2 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 transition hover:border-indigo-400/30"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/5 text-[10px] font-semibold text-white/60">
              {idx + 1}
            </span>
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center rounded-md bg-gradient-to-br px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_COLOR[step.kind]}`}
            >
              {step.kind}
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-1">
                  <input
                    value={step.label}
                    onChange={(e) => updateStep(step.id, { label: e.target.value })}
                    className="w-full rounded-md bg-white/5 px-2 py-1 text-sm text-white outline-none ring-0 focus:bg-white/10"
                    placeholder="Step label"
                  />
                  <div className="flex gap-1.5">
                    {step.assetQuery !== undefined && (
                      <input
                        value={step.assetQuery ?? ""}
                        onChange={(e) => updateStep(step.id, { assetQuery: e.target.value })}
                        className="flex-1 rounded-md bg-white/5 px-2 py-1 text-xs text-white/80 outline-none focus:bg-white/10"
                        placeholder="Toolbox query (optional)"
                      />
                    )}
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={step.quantity}
                      onChange={(e) => updateStep(step.id, { quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                      className="w-16 rounded-md bg-white/5 px-2 py-1 text-xs text-white/80 outline-none focus:bg-white/10"
                      title="Quantity"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm text-white">
                      {step.label}
                      {step.quantity > 1 && (
                        <span className="ml-1 text-xs text-indigo-300">×{step.quantity}</span>
                      )}
                    </span>
                    {step.assetQuery ? (
                      <span className="truncate text-[11px] italic text-white/40">"{step.assetQuery}"</span>
                    ) : null}
                  </div>
                  {step.detail && (
                    <p className="line-clamp-1 text-[11px] text-white/45">{step.detail}</p>
                  )}
                </>
              )}
            </div>
            <span className="mt-0.5 shrink-0 text-[10px] text-white/40">~{step.estCredits}c</span>
            {editing && (
              <button
                type="button"
                aria-label="Remove step"
                onClick={() => removeStep(step.id)}
                className="rounded p-1 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <button
          type="button"
          onClick={addStep}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/60 transition hover:border-indigo-400/50 hover:text-white"
        >
          <Plus className="h-3 w-3" /> Add step
        </button>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editing ? "Done editing" : "Edit plan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={busy || plan.steps.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Start build
        </button>
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10">
      {icon}
      {label}
    </span>
  );
}

function formatSec(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export function BuildPlannerToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      title={enabled ? "Build planner is on — preview each build before it runs" : "Build planner is off — builds run immediately"}
      className={`group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
        enabled
          ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25"
          : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
      }`}
    >
      <Sparkles className={`h-3 w-3 ${enabled ? "text-indigo-300" : ""}`} />
      Planner {enabled ? "on" : "off"}
    </button>
  );
}
