import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles, Loader2, Bot, ShieldAlert, ShieldCheck, AlertTriangle,
  ChevronDown, ChevronUp, ScanEye, Zap, Bug,
} from "lucide-react";
import { runAiPlaytest, listAiPlaytest } from "@/lib/ai-playtest.functions";
import { friendlyError } from "@/lib/friendly-error";

type Finding = {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  path?: string;
  suggested_fix?: string;
};

type Summary = {
  verdict?: "clean" | "warnings" | "broken";
  headline?: string;
  score?: number;
  narrative?: string;
  highlights?: string[];
  next_steps?: string[];
};

type Report = {
  id: string;
  created_at: string;
  summary: Summary | any;
  findings: Finding[] | any;
  metrics: { scripts_analyzed?: number; critical?: number; high?: number; medium?: number; low?: number } | any;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  high: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  low: "border-sky-400/40 bg-sky-500/10 text-sky-200",
};

function timeAgo(d: string): string {
  const t = new Date(d).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AiPlaytestCard({ projectId, projectName }: { projectId: string | null; projectName?: string }) {
  const runFn = useServerFn(runAiPlaytest);
  const listFn = useServerFn(listAiPlaytest);
  const qc = useQueryClient();

  const listQ = useQuery<Report[]>({
    queryKey: ["ai-playtest", projectId],
    enabled: !!projectId,
    queryFn: () => (projectId ? listFn({ data: { project_id: projectId, limit: 5 } }) : Promise.resolve([])),
  });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { project_id: projectId! } }),
    onSuccess: () => {
      toast.success("AI playtest complete");
      qc.invalidateQueries({ queryKey: ["ai-playtest", projectId] });
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "AI playtest failed" })),
  });

  const latest = listQ.data?.[0];
  const [expanded, setExpanded] = useState(true);

  if (!projectId) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <Bot className="h-4 w-4 text-indigo-300" /> AI Playtest
        </div>
        <p className="mt-2 text-xs text-slate-400">Open a project to let the AI playtest it for you.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/10 via-white/[0.02] to-fuchsia-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/20 text-indigo-200">
            <ScanEye className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-indigo-100">
              AI Playtest <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-200">Vision</span>
            </div>
            <div className="text-xs text-slate-400">
              The AI reads your scripts + scene and reports back what it "sees" — errors, risks, and next steps.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.7)] transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {runMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {runMut.isPending ? "Playtesting…" : latest ? "Run again" : "Start AI Playtest"}
          </button>
        </div>
      </div>

      {runMut.isPending && (
        <div className="mx-5 mt-4 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3 text-xs text-indigo-100">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            The AI is opening {projectName ? `“${projectName}”` : "your project"}, reading each script, tracing remotes, and hunting for bugs…
          </div>
        </div>
      )}

      {!latest && !runMut.isPending && (
        <div className="px-5 py-6 text-center text-sm text-slate-400">
          No AI playtest yet. Click <span className="font-semibold text-indigo-200">Start AI Playtest</span> and the model
          will scan your project for errors, security issues, and gameplay bugs.
        </div>
      )}

      {latest && <ReportView report={latest} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />}

      {listQ.data && listQ.data.length > 1 && (
        <details className="border-t border-white/5 px-5 py-3">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200">
            Previous AI playtests ({listQ.data.length - 1})
          </summary>
          <ul className="mt-2 space-y-1">
            {listQ.data.slice(1).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                <span className="truncate text-slate-300">{r.summary?.headline || "Playtest"}</span>
                <span className="shrink-0 text-slate-500">{timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ReportView({ report, expanded, onToggle }: { report: Report; expanded: boolean; onToggle: () => void }) {
  const summary = (report.summary ?? {}) as Summary;
  const metrics = report.metrics ?? {};
  const findings = useMemo(
    () => (Array.isArray(report.findings) ? report.findings : []) as Finding[],
    [report.findings]
  );
  const verdict = summary.verdict ?? "warnings";
  const score = typeof summary.score === "number" ? summary.score : 0;

  const verdictBadge =
    verdict === "clean" ? { icon: ShieldCheck, tint: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200", label: "Clean" } :
    verdict === "broken" ? { icon: ShieldAlert, tint: "border-rose-400/40 bg-rose-500/10 text-rose-200", label: "Broken" } :
    { icon: AlertTriangle, tint: "border-amber-400/40 bg-amber-500/10 text-amber-200", label: "Warnings" };
  const V = verdictBadge.icon;

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${verdictBadge.tint}`}>
          <V className="h-3.5 w-3.5" /> {verdictBadge.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold text-slate-200">
          Score {score}/100
        </span>
        <span className="text-[11px] text-slate-500">{timeAgo(report.created_at)}</span>
      </div>

      {summary.headline && (
        <p className="mt-3 text-base font-bold leading-snug text-white">{summary.headline}</p>
      )}
      {summary.narrative && (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{summary.narrative}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MiniStat label="Scripts read" value={metrics.scripts_analyzed ?? 0} tint="text-slate-200" />
        <MiniStat label="Critical" value={metrics.critical ?? 0} tint="text-rose-300" />
        <MiniStat label="High" value={metrics.high ?? 0} tint="text-orange-300" />
        <MiniStat label="Medium" value={metrics.medium ?? 0} tint="text-amber-200" />
        <MiniStat label="Low" value={metrics.low ?? 0} tint="text-sky-300" />
      </div>

      {(summary.highlights?.length || summary.next_steps?.length) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {!!summary.highlights?.length && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <Zap className="h-3 w-3" /> What works
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
                {summary.highlights.map((h, i) => (<li key={i}>• {h}</li>))}
              </ul>
            </div>
          )}
          {!!summary.next_steps?.length && (
            <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                <Sparkles className="h-3 w-3" /> Next steps
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
                {summary.next_steps.map((h, i) => (<li key={i}>→ {h}</li>))}
              </ul>
            </div>
          )}
        </div>
      )}

      {findings.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-slate-200"
          >
            <span className="flex items-center gap-2"><Bug className="h-3.5 w-3.5" /> Findings ({findings.length})</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {expanded && (
            <ul className="divide-y divide-white/5 border-t border-white/5">
              {findings.map((f, i) => (
                <li key={i} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.medium}`}>
                      {f.severity}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
                      {f.category}
                    </span>
                    <span className="text-sm font-bold text-white">{f.title}</span>
                  </div>
                  {f.detail && <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{f.detail}</p>}
                  {f.path && (
                    <div className="mt-1.5 truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-indigo-200">
                      {f.path}
                    </div>
                  )}
                  {f.suggested_fix && (
                    <div className="mt-1.5 text-[11px] text-emerald-300">
                      Fix: <span className="text-emerald-100">{f.suggested_fix}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className={`text-lg font-black ${tint}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}
