// "Why did it do that?" — surfaces the Smart Brain's most recent analysis
// (intent, plan, specialist model picks, confidence) for the current project
// so users can understand why the AI chose its approach.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, ChevronDown, Sparkles, Cpu, Target, Loader2 } from "lucide-react";
import { getSmartBrainLastRun } from "@/lib/smart-brain-history.functions";

export function WhyDidItPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const fetchLast = useServerFn(getSmartBrainLastRun);
  const { data, isLoading } = useQuery({
    queryKey: ["smart-brain-last", projectId],
    queryFn: () => fetchLast({ data: { projectId } }),
    enabled: !!projectId && open,
    staleTime: 30_000,
  });

  const confidencePct = Math.round((data?.confidence ?? 0) * 100);

  return (
    <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 via-white/[0.02] to-fuchsia-500/10 p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/25 text-indigo-200">
          <Brain className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-100">Why did it do that?</div>
          <div className="text-[11px] text-slate-400">Peek inside the Smart Brain's last decision.</div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading last run…
            </div>
          )}
          {!isLoading && !data && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-3 text-xs text-slate-400">
              The Smart Brain hasn't analyzed this project yet. Ask it to build something and this will fill in.
            </div>
          )}
          {!isLoading && data && (
            <>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  <Target className="h-3 w-3" /> Goal
                </div>
                <div className="mt-1 text-xs text-slate-200">{data.goal || "(unspecified)"}</div>
              </div>

              {data.intent && (
                <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                    <Sparkles className="h-3 w-3" /> Intent
                  </div>
                  <div className="mt-1 text-xs text-slate-200">{data.intent.summary}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                      {data.intent.category}
                    </span>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                      {data.intent.complexity}
                    </span>
                    {(data.intent.systems ?? []).slice(0, 6).map((s, i) => (
                      <span key={i} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {s}
                      </span>
                    ))}
                  </div>
                  {(data.intent.risks ?? []).length > 0 && (
                    <div className="mt-2 text-[10px] text-amber-300">
                      ⚠ Risks flagged: {data.intent.risks.slice(0, 3).join("; ")}
                    </div>
                  )}
                </div>
              )}

              {(data.specialist_models ?? []).length > 0 && (
                <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    <Cpu className="h-3 w-3" /> Specialist models consulted
                  </div>
                  <ul className="mt-2 space-y-1">
                    {data.specialist_models.map((s, i) => (
                      <li key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300">{s.task}</span>
                        <span className="font-mono text-slate-400">{s.model}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Confidence</span>
                  <span className={confidencePct >= 70 ? "text-emerald-300" : confidencePct >= 40 ? "text-amber-300" : "text-rose-300"}>
                    {confidencePct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${confidencePct >= 70 ? "bg-emerald-400" : confidencePct >= 40 ? "bg-amber-400" : "bg-rose-400"}`}
                    style={{ width: `${Math.max(4, confidencePct)}%` }}
                  />
                </div>
                <div className="mt-2 text-[10px] text-slate-500">
                  Analyzed {new Date(data.at).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
