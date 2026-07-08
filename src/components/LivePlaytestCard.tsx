// Live plugin Playtest card — polls the auto-Playtest loop and shows
// per-phase results, attempt counter, screenshots, and a Stop button.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, Pause, RefreshCcw, Camera } from "lucide-react";
import { getLatestPlaytest } from "@/lib/playtest.functions";
import { getPlaytestRunTimeline, stopPlaytestLoop } from "@/lib/playtest-autofix.functions";
import { friendlyError } from "@/lib/friendly-error";

const PHASES = ["compile", "spawn", "ui", "interactions", "remotes", "datastore", "perf"];

function PhasePill({ name, r }: { name: string; r: any }) {
  const pass = r?.pass !== false;
  const count = r?.finding_count ?? 0;
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
      pass ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
           : "border-rose-400/30 bg-rose-500/10 text-rose-200"
    }`}>
      <span className="font-medium capitalize">{name}</span>
      <span className="opacity-80">{pass ? "pass" : `${count} issue${count === 1 ? "" : "s"}`}</span>
    </div>
  );
}

export function LivePlaytestCard() {
  const latestFn = useServerFn(getLatestPlaytest);
  const timelineFn = useServerFn(getPlaytestRunTimeline);
  const stopFn = useServerFn(stopPlaytestLoop);
  const qc = useQueryClient();

  const latestQ = useQuery<any>({
    queryKey: ["live-playtest-latest"],
    queryFn: () => latestFn({ data: { limit: 1 } }),
    refetchInterval: 5000,
  });

  const runId: string | null =
    latestQ.data?.reports?.[0]?.run_id ?? latestQ.data?.reports?.[0]?.id ?? null;

  const timelineQ = useQuery<any>({
    queryKey: ["live-playtest-timeline", runId],
    enabled: !!runId,
    queryFn: () => timelineFn({ data: { run_id: runId! } }),
    refetchInterval: 3000,
  });

  const stopMut = useMutation({
    mutationFn: (rid: string) => stopFn({ data: { run_id: rid } }),
    onSuccess: () => {
      toast.success("Playtest loop stopped");
      qc.invalidateQueries({ queryKey: ["live-playtest-timeline", runId] });
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Could not stop loop" })),
  });

  const loop = timelineQ.data?.loop;
  const attempts: any[] = timelineQ.data?.reports ?? [];
  const latest = attempts[attempts.length - 1];

  const statusLabel = useMemo(() => {
    if (!loop) return "Idle";
    switch (loop.directive) {
      case "wait_for_ai": return `AI fixing (attempt ${loop.attempt}/${loop.max_attempts})`;
      case "rerun": return `Retrying (${loop.attempt}/${loop.max_attempts})`;
      case "passed": return "Passed";
      case "stuck": return "Stuck — needs human";
      case "stop": return "Stopped";
      default: return loop.directive;
    }
  }, [loop]);

  const statusTone = loop?.directive === "passed"
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : loop?.directive === "wait_for_ai" || loop?.directive === "rerun"
      ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
      : loop?.directive === "stuck" || loop?.directive === "stop"
        ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
        : "border-white/10 bg-white/5 text-white/70";

  if (!latestQ.data?.reports?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/70">
        <div className="mb-1 flex items-center gap-2 font-semibold text-white/90">
          <ShieldCheck className="h-4 w-4 text-emerald-300" /> Live Playtest
        </div>
        No auto-playtests have run yet. They fire automatically after each material build batch from the plugin.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
          {loop?.directive === "wait_for_ai" || loop?.directive === "rerun" ? (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
          ) : loop?.directive === "passed" ? (
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-rose-300" />
          )}
          Live Playtest
          <span className={`ml-1 rounded-full border px-2 py-0.5 text-xs ${statusTone}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {loop && loop.directive !== "passed" && loop.directive !== "stop" && (
            <button
              onClick={() => runId && stopMut.mutate(runId)}
              className="flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
            >
              <Pause className="h-3 w-3" /> Stop
            </button>
          )}
          <button
            onClick={() => timelineQ.refetch()}
            className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
          >
            <RefreshCcw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {loop?.reason && (
        <div className="mb-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          {loop.reason}
        </div>
      )}

      {latest?.phase_results && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PHASES.map((p) => (
            <PhasePill key={p} name={p} r={latest.phase_results[p]} />
          ))}
        </div>
      )}

      {attempts.length > 1 && (
        <div className="mb-3 text-xs text-white/60">
          {attempts.length} attempts run •{" "}
          {attempts.map((a) => (a.status === "passed" ? "✓" : "✗")).join(" ")}
        </div>
      )}

      {latest?.screenshot_urls?.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-1 text-xs text-white/60">
            <Camera className="h-3 w-3" /> Studio captures
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {latest.screenshot_urls.slice(0, 6).map((url: string, i: number) => (
              <div key={i} className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
                {url.startsWith("http") ? (
                  <img src={url} alt={`Playtest frame ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">rbxcapture</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {latest?.findings?.length > 0 && (
        <div className="space-y-1.5">
          {latest.findings.slice(0, 8).map((f: any, i: number) => (
            <div key={i} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white/90">{f.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                  f.severity === "critical" ? "bg-rose-500/20 text-rose-200"
                  : f.severity === "high" ? "bg-orange-500/20 text-orange-200"
                  : "bg-amber-500/20 text-amber-100"
                }`}>{f.severity}</span>
              </div>
              <div className="mt-0.5 text-white/60">{f.detail}</div>
              {f.path && <div className="mt-0.5 font-mono text-[10px] text-white/40">{f.path}</div>}
            </div>
          ))}
        </div>
      )}

      {latest?.summary?.autofix?.plan && (
        <div className="mt-3 rounded-md border border-indigo-400/30 bg-indigo-500/5 p-2 text-xs">
          <div className="mb-1 font-semibold text-indigo-200">AI fix plan</div>
          <div className="text-white/80">{latest.summary.autofix.plan}</div>
          {Array.isArray(latest.summary.autofix.targets) && latest.summary.autofix.targets.length > 0 && (
            <div className="mt-1 text-white/50">Targets: {latest.summary.autofix.targets.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}
