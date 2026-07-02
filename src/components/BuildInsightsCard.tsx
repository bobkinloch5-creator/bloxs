// Post-build AI insights: shows execution health + AI-suggested improvements.
// Auto-generates on mount if none exist yet.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Loader2, RefreshCw, X, ShieldAlert, ShieldCheck, Wrench, Sparkles } from "lucide-react";
import {
  listBuildInsights,
  generateBuildInsights,
  dismissBuildSuggestion,
} from "@/lib/build-insights.functions";

type Suggestion = {
  id: string;
  area: string;
  severity: string;
  title: string;
  detail: string | null;
  suggested_prompt: string | null;
  auto_fixable: boolean;
  source: string;
  dismissed_at: string | null;
  created_at: string;
};

type Report = {
  id: string;
  created_at: string;
  total: number;
  ok_count: number;
  fail_count: number;
  skip_count: number;
  repair_count: number;
  retry_count: number;
  duration_ms: number;
  summary: string | null;
};

const SEV_TINT: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const AREA_ICON: Record<string, typeof Lightbulb> = {
  performance: Sparkles,
  bugs: ShieldAlert,
  security: ShieldAlert,
  mobile: Sparkles,
  ui: Sparkles,
  structure: Wrench,
  polish: Sparkles,
  systems: Wrench,
  general: Lightbulb,
};

export function BuildInsightsCard({
  projectId,
  onSendPrompt,
}: {
  projectId: string;
  onSendPrompt?: (prompt: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBuildInsights);
  const genFn = useServerFn(generateBuildInsights);
  const dismissFn = useServerFn(dismissBuildSuggestion);

  const { data, isLoading } = useQuery({
    queryKey: ["build-insights", projectId],
    queryFn: () => listFn({ data: { project_id: projectId, limit: 12 } }),
    refetchInterval: 30_000,
  });

  const gen = useMutation({
    mutationFn: async () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["build-insights", projectId] }),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["build-insights", projectId] }),
  });

  const suggestions = (data?.suggestions ?? []) as Suggestion[];
  const reports = (data?.reports ?? []) as Report[];
  const latest = reports[0];

  // Auto-generate once when we land here and nothing exists yet, if there is
  // at least one completed build to reason about.
  useEffect(() => {
    if (isLoading || gen.isPending) return;
    if (suggestions.length === 0 && reports.length > 0) {
      gen.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, reports.length, suggestions.length]);

  const health = latest
    ? Math.max(0, Math.min(100, latest.total === 0 ? 100 : Math.round((latest.ok_count / Math.max(1, latest.total)) * 100)))
    : null;
  const healthTint = health == null ? "#94a3b8" : health >= 90 ? "#22c55e" : health >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Build Insights</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            AI reviews every build and suggests improvements
          </div>
        </div>
        <button
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          className="grid h-7 w-7 place-items-center rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--bs-grad)" }}
          title="Regenerate insights"
        >
          {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Health strip */}
      {latest && (
        <div className="mt-3 flex items-center gap-2 rounded-lg px-2 py-2" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}>
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: healthTint }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold">
              Last build · <span style={{ color: healthTint }}>{health}%</span> healthy
            </div>
            <div className="truncate text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
              {latest.ok_count} ok · {latest.fail_count} failed · {latest.repair_count} repaired · {(latest.duration_ms / 1000).toFixed(1)}s
            </div>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 ? (
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {suggestions.map((s) => {
            const Icon = AREA_ICON[s.area] ?? Lightbulb;
            const tint = SEV_TINT[s.severity] ?? "#94a3b8";
            return (
              <div key={s.id} className="rounded-lg p-2" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded p-1" style={{ background: `${tint}22`, color: tint }}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${tint}22`, color: tint }}>
                        {s.severity}
                      </span>
                      <span className="text-[10px] uppercase" style={{ color: "var(--bs-muted-fg)" }}>
                        {s.area}
                      </span>
                    </div>
                    <div className="mt-1 text-[11.5px] font-semibold">{s.title}</div>
                    {s.detail && (
                      <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>
                        {s.detail}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {s.suggested_prompt && onSendPrompt && (
                        <button
                          onClick={() => onSendPrompt(s.suggested_prompt!)}
                          className="rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: "var(--bs-grad)" }}
                        >
                          Apply
                        </button>
                      )}
                      <button
                        onClick={() => dismiss.mutate(s.id)}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ color: "var(--bs-muted-fg)" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <button onClick={() => dismiss.mutate(s.id)} className="opacity-60 hover:opacity-100" title="Dismiss">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg px-2 py-2 text-[11px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
          {isLoading || gen.isPending
            ? "Analyzing your project…"
            : reports.length === 0
              ? "Run a build in Studio — insights will appear here automatically."
              : "No open suggestions. Your project looks clean."}
        </div>
      )}

      {gen.isError && (
        <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
          {(gen.error as Error).message}
        </div>
      )}
    </div>
  );
}
