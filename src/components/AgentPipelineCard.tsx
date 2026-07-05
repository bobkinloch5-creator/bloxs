import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import {
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Send,
  Target,
  Brain,
  Hammer,
  FileCode,
  LayoutDashboard,
  Bug,
  Gavel,
  Wrench,
  FlaskConical,
  ShieldCheck,
  Play,
  ChevronDown,
} from "lucide-react";
import {
  startAgentPipeline,
  listAgentPipelines,
  runPipelineRepair,
  queueManualPlaytest,
} from "@/lib/agent-pipeline.functions";

const friendlyPipelineError = (err: unknown) => friendlyError(err, { context: "Director" });



type AgentRow = {
  agent: string;
  status: string;
  summary: string | null;
  actions_count: number;
  position: number;
  started_at: string | null;
  completed_at: string | null;
};
type PipelineRow = {
  id: string;
  prompt: string;
  status: string;
  total_actions: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  verification_status?: string | null;
  latest_report_id?: string | null;
  repair_actions_count?: number | null;
  agents: AgentRow[];
};

const AGENT_META: Record<string, { label: string; verb: string; icon: typeof Brain; tint: string }> = {
  planner: { label: "Planner", verb: "Planning the build", icon: Brain, tint: "#8b5cf6" },
  world_builder: { label: "World Builder", verb: "Building the world", icon: Hammer, tint: "#22c55e" },
  scripter: { label: "Scripter", verb: "Writing gameplay scripts", icon: FileCode, tint: "#3b82f6" },
  ui_designer: { label: "UI Designer", verb: "Designing the UI", icon: LayoutDashboard, tint: "#f59e0b" },
  qa: { label: "QA", verb: "Testing the build", icon: Bug, tint: "#ef4444" },
  critic: { label: "Critic", verb: "Reviewing the result", icon: Gavel, tint: "#ec4899" },
};
const AGENT_ORDER = ["planner", "world_builder", "scripter", "ui_designer", "qa", "critic"];

export function AgentPipelineCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [showCrew, setShowCrew] = useState(false);

  const listFn = useServerFn(listAgentPipelines);
  const startFn = useServerFn(startAgentPipeline);
  const repairFn = useServerFn(runPipelineRepair);

  const { data } = useQuery({
    queryKey: ["agent-pipelines", projectId],
    queryFn: () => listFn({ data: { projectId, limit: 3 } }),
    refetchInterval: (q) => {
      const pipelines = (q.state.data as { pipelines?: PipelineRow[] } | undefined)?.pipelines ?? [];
      const hasRunning = pipelines.some(
        (p) =>
          p.status === "running" ||
          p.status === "pending" ||
          p.verification_status === "awaiting" ||
          p.verification_status === "report_ready" ||
          p.verification_status === "repairing" ||
          p.agents.some((a) => a.status === "running" || a.status === "pending"),
      );
      return hasRunning ? 1500 : false;
    },
  });

  const repairFiredRef = useRef<Set<string>>(new Set());
  const repairMutation = useMutation({
    mutationFn: (pipelineId: string) => repairFn({ data: { pipelineId } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["agent-pipelines", projectId] });
      if (res.skipped) return;
      if (res.fixesQueued > 0) {
        toast.success(`Auto-repair: ${res.fixesQueued} fix${res.fixesQueued === 1 ? "" : "es"} sent to Studio.`);
      }
    },
    onError: (err) => toast.error(friendlyPipelineError(err)),
  });

  useEffect(() => {
    const pipelines = (data?.pipelines ?? []) as PipelineRow[];
    for (const p of pipelines) {
      if (p.verification_status === "report_ready" && !repairFiredRef.current.has(p.id)) {
        repairFiredRef.current.add(p.id);
        repairMutation.mutate(p.id);
      }
    }
  }, [data, repairMutation]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const trimmed = prompt.trim();
      if (trimmed.length < 3) throw new Error("Prompt is too short. Describe what to build in at least 3 characters.");
      if (trimmed.length > 4000) throw new Error("Prompt is too long — keep it under 4000 characters.");
      return startFn({ data: { projectId, prompt: trimmed } });
    },
    onSuccess: () => {
      setPrompt("");
      queryClient.invalidateQueries({ queryKey: ["agent-pipelines", projectId] });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["agent-pipelines", projectId] }), 500);
      toast.success("Director is on it — the crew is rolling.");
    },
    onError: (err) => toast.error(friendlyPipelineError(err)),
  });

  const pipelines = (data?.pipelines ?? []) as PipelineRow[];
  const latest = pipelines[0];
  const running = startMutation.isPending || latest?.status === "running" || latest?.status === "pending";

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">AI Game Director</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            Plans · Builds · Tests · Reviews — all live
          </div>
        </div>
        {running && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--bs-muted-fg)" }} />}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim() && !running) startMutation.mutate();
          }}
          placeholder="e.g. Build a pirate island with cannons"
          disabled={running}
          className="bs-input flex-1 rounded-lg px-3 py-2 text-xs"
        />
        <button
          onClick={() => startMutation.mutate()}
          disabled={running || prompt.trim().length < 3}
          className="grid h-9 w-9 place-items-center rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--bs-grad)" }}
          title="Direct the crew"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      {startMutation.isError && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
          <AlertCircle className="w-3 h-3 mt-px shrink-0" />
          <span>{friendlyPipelineError(startMutation.error)}</span>
        </div>
      )}

      {latest && <DirectorFeed pipeline={latest} showCrew={showCrew} setShowCrew={setShowCrew} projectId={projectId} />}

      {!latest && !startMutation.isPending && (
        <div className="mt-3 flex items-start gap-2 rounded-lg px-2 py-2 text-[11px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-primary, #8b5cf6)" }} />
          <span>
            Tell the director what to build. The crew plans, builds, tests, and reviews — you watch it happen.
          </span>
        </div>
      )}
    </div>
  );
}

type Step = {
  key: string;
  label: string;
  icon: typeof Brain;
  tint: string;
  status: "done" | "running" | "pending" | "failed";
  detail?: string;
};

function DirectorFeed({
  pipeline,
  showCrew,
  setShowCrew,
  projectId,
}: {
  pipeline: PipelineRow;
  showCrew: boolean;
  setShowCrew: (v: boolean) => void;
  projectId: string;
}) {
  const steps: Step[] = useMemo(() => {
    return AGENT_ORDER.map((agent) => {
      const row = pipeline.agents.find((a) => a.agent === agent);
      const meta = AGENT_META[agent];
      const status = (row?.status ?? "pending") as Step["status"];
      const detail =
        status === "running"
          ? firstLine(row?.summary) ?? meta.verb + "…"
          : status === "done"
            ? firstLine(row?.summary) ?? "Done"
            : status === "failed"
              ? firstLine(row?.summary) ?? "Failed"
              : "Queued";
      return { key: agent, label: meta.label, icon: meta.icon, tint: meta.tint, status, detail };
    });
  }, [pipeline]);

  const goalState: "planning" | "building" | "done" | "failed" =
    pipeline.status === "failed"
      ? "failed"
      : pipeline.status === "done"
        ? "done"
        : steps.some((s) => s.key !== "planner" && s.status === "running")
          ? "building"
          : "planning";

  const goalCopy: Record<typeof goalState, { label: string; tint: string; Icon: typeof Brain }> = {
    planning: { label: "Planning the build…", tint: "#8b5cf6", Icon: Brain },
    building: { label: "Crew is building live…", tint: "#3b82f6", Icon: Hammer },
    done: { label: "Goal achieved ✓", tint: "#22c55e", Icon: CheckCircle2 },
    failed: { label: "Hit a snag", tint: "#ef4444", Icon: AlertCircle },
  };
  const g = goalCopy[goalState];
  const GIcon = g.Icon;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;

  return (
    <div className="mt-4 space-y-3">
      {/* Goal banner */}
      <div
        className="rounded-xl px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg, ${g.tint}1a, ${g.tint}05)`,
          border: `1px solid ${g.tint}33`,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
            style={{ background: `${g.tint}22`, color: g.tint }}
          >
            {goalState === "planning" || goalState === "building" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GIcon className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: g.tint }}>
              <Target className="h-2.5 w-2.5" /> Goal
            </div>
            <div className="truncate text-[12.5px] font-semibold leading-tight">"{pipeline.prompt}"</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-semibold" style={{ color: g.tint }}>
              {g.label}
            </div>
            <div className="text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
              {doneCount}/{totalCount} steps · {pipeline.total_actions} actions
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: `${g.tint}1a` }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(doneCount / totalCount) * 100}%`,
              background: `linear-gradient(90deg, ${g.tint}, ${g.tint}cc)`,
            }}
          />
        </div>
      </div>

      {/* Director checklist */}
      <div className="space-y-1">
        {steps.map((step, i) => (
          <DirectorStep key={step.key} step={step} index={i} />
        ))}
      </div>

      {/* Crew details (collapsible) */}
      <button
        onClick={() => setShowCrew(!showCrew)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[10.5px] font-semibold transition hover:opacity-80"
        style={{ color: "var(--bs-muted-fg)" }}
      >
        <Users className="h-3 w-3" />
        {showCrew ? "Hide" : "Show"} crew reasoning
        <ChevronDown className={`h-3 w-3 transition-transform ${showCrew ? "rotate-180" : ""}`} />
      </button>

      {showCrew && (
        <div className="space-y-1.5">
          {AGENT_ORDER.map((agent) => {
            const row = pipeline.agents.find((a) => a.agent === agent);
            const meta = AGENT_META[agent];
            const Icon = meta.icon;
            const status = row?.status ?? "pending";
            const showSummary = row?.summary && (status === "done" || status === "failed" || status === "running");
            return (
              <div
                key={agent}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}
              >
                <div
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                  style={{ background: `${meta.tint}22`, color: meta.tint }}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span>{meta.label}</span>
                    {row && row.actions_count > 0 && (
                      <span className="text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
                        +{row.actions_count}
                      </span>
                    )}
                  </div>
                  {showSummary && (
                    <div
                      className={`mt-0.5 whitespace-pre-wrap text-[10.5px] ${status === "running" ? "line-clamp-4" : "line-clamp-3"}`}
                      style={{ color: status === "running" ? meta.tint : "var(--bs-muted-fg)" }}
                    >
                      {row.summary}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pipeline.status === "done" && <VerificationBadge pipeline={pipeline} projectId={projectId} />}
      {pipeline.error_message && (
        <div className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-500">
          {pipeline.error_message}
        </div>
      )}
    </div>
  );
}

function firstLine(s?: string | null): string | undefined {
  if (!s) return undefined;
  const line = s.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return undefined;
  return line.length > 90 ? line.slice(0, 87) + "…" : line;
}

function DirectorStep({ step, index }: { step: Step; index: number }) {
  const Icon = step.icon;
  const running = step.status === "running";
  const done = step.status === "done";
  const failed = step.status === "failed";
  const pending = step.status === "pending";

  const stateTint = failed ? "#ef4444" : done ? "#22c55e" : running ? step.tint : "#64748b";

  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all"
      style={{
        background: running ? `${step.tint}10` : "transparent",
        border: running ? `1px solid ${step.tint}33` : "1px solid transparent",
        animation: running ? "pulse 2s ease-in-out infinite" : undefined,
      }}
    >
      {/* Status marker */}
      <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: `${stateTint}22`, color: stateTint }}>
        {running ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : failed ? (
          <AlertCircle className="h-3 w-3" />
        ) : (
          <span className="text-[9px] font-bold opacity-60">{index + 1}</span>
        )}
      </div>

      {/* Agent icon */}
      <div
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
        style={{ background: `${step.tint}1a`, color: pending ? "#64748b" : step.tint, opacity: pending ? 0.5 : 1 }}
      >
        <Icon className="h-2.5 w-2.5" />
      </div>

      {/* Label + live detail */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[11.5px] font-semibold ${pending ? "opacity-50" : ""}`}>{step.label}</span>
          {running && (
            <span className="text-[9.5px] font-medium uppercase tracking-wider" style={{ color: step.tint }}>
              live
            </span>
          )}
        </div>
        {step.detail && (
          <div
            className="truncate text-[10.5px] leading-snug"
            style={{ color: running ? step.tint : pending ? "var(--bs-muted-fg)" : "var(--bs-muted-fg)", opacity: pending ? 0.5 : 1 }}
          >
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function VerificationBadge({ pipeline, projectId }: { pipeline: PipelineRow; projectId: string }) {
  const queryClient = useQueryClient();
  const playtestFn = useServerFn(queueManualPlaytest);
  const playtestMutation = useMutation({
    mutationFn: () => playtestFn({ data: { projectId, pipelineId: pipeline.id } }),
    onSuccess: () => {
      toast.success("Playtest queued — open Studio and hit Sync to run it.");
      queryClient.invalidateQueries({ queryKey: ["agent-pipelines", projectId] });
    },
    onError: (err) => toast.error(friendlyPipelineError(err)),
  });

  const completedAt = pipeline.completed_at ? new Date(pipeline.completed_at).getTime() : 0;
  const stale = completedAt > 0 && Date.now() - completedAt > 90_000;

  const v = pipeline.verification_status ?? "none";
  const fixCount = pipeline.repair_actions_count ?? 0;
  if (v === "none") return null;

  const config: Record<string, { Icon: typeof Brain; tint: string; label: string; sub: string }> = {
    awaiting: stale
      ? {
          Icon: FlaskConical,
          tint: "#94a3b8",
          label: "Waiting for Studio playtest…",
          sub: "Open the BloxSmith plugin in Roblox Studio and hit Sync, or click Test now.",
        }
      : {
          Icon: FlaskConical,
          tint: "#60a5fa",
          label: "Auto-playtesting in Studio…",
          sub: "Plugin is auditing the place. Findings will trigger a repair pass.",
        },
    report_ready: {
      Icon: Wrench,
      tint: "#f59e0b",
      label: "Issues found — preparing fixes…",
      sub: "Sending blocking issues back to the Scripter for an auto-repair pass.",
    },
    repairing: {
      Icon: Wrench,
      tint: "#f59e0b",
      label: "Auto-repairing…",
      sub: "Scripter is writing fix actions based on the playtest report.",
    },
    repaired: {
      Icon: Wrench,
      tint: "#4ade80",
      label: fixCount > 0 ? `Auto-repair queued ${fixCount} fix${fixCount === 1 ? "" : "es"}` : "Auto-repair: no blockers",
      sub: fixCount > 0 ? "Open Studio and hit Sync to apply the repair pass." : "Playtest came back clean — nothing to fix.",
    },
    clean: {
      Icon: ShieldCheck,
      tint: "#4ade80",
      label: "Verified clean ✓",
      sub: "Studio auto-playtest found no critical or high-severity issues.",
    },
  };
  const c = config[v] ?? config.awaiting;
  const Icon = c.Icon;
  const isLoading = (v === "awaiting" && !stale) || v === "report_ready" || v === "repairing";
  const canTestNow = v === "awaiting" || v === "clean" || v === "repaired";

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-2.5 py-2"
      style={{ background: `${c.tint}14`, border: `1px solid ${c.tint}33` }}
    >
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${c.tint}22`, color: c.tint }}>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold leading-tight" style={{ color: c.tint }}>{c.label}</div>
        <div className="mt-0.5 text-[10.5px] leading-snug" style={{ color: "var(--bs-muted-fg)" }}>{c.sub}</div>
      </div>
      {canTestNow && (
        <button
          onClick={() => playtestMutation.mutate()}
          disabled={playtestMutation.isPending}
          className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition hover:opacity-80 disabled:opacity-50"
          style={{ background: `${c.tint}22`, color: c.tint, border: `1px solid ${c.tint}55` }}
          title="Queue a fresh AI playtest"
        >
          {playtestMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Test now
        </button>
      )}
    </div>
  );
}
