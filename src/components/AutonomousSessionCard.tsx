// Autonomous Development Session card — start a goal-driven session, watch
// specialized AI agents execute a plan, and (optionally) auto-run each task
// through the existing chat pipeline.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot, Play, Square, Loader2, CheckCircle2, Circle, Zap, PauseCircle,
} from "lucide-react";
import {
  listActiveDevSession, startDevSession, stopDevSession,
  advanceDevSession, setDevSessionAutoRun,
} from "@/lib/dev-session.functions";

type Task = {
  id: string;
  position: number;
  agent: string;
  title: string;
  instruction: string;
  status: "pending" | "in_progress" | "done" | "failed";
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
};
type Session = {
  id: string;
  goal: string;
  status: "planning" | "active" | "paused" | "complete" | "stopped";
  auto_run: boolean;
  summary: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

const AGENT_LABEL: Record<string, string> = {
  world_builder: "World Builder", scripter: "Scripter", ui_designer: "UI Designer",
  asset_manager: "Asset Manager", toolbox_search: "Toolbox Search",
  performance_optimizer: "Performance", qa_tester: "QA Tester",
  security_auditor: "Security", audio_designer: "Audio",
  lighting_designer: "Lighting", game_designer: "Game Design",
  economy_designer: "Economy", quest_designer: "Quests", generalist: "Generalist",
};

const STATUS_TINT: Record<Session["status"], string> = {
  planning: "#f59e0b", active: "#22c55e", paused: "#94a3b8",
  complete: "#3b82f6", stopped: "#94a3b8",
};

export function AutonomousSessionCard({
  projectId,
  onSendPrompt,
}: {
  projectId: string;
  onSendPrompt?: (prompt: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listActiveDevSession);
  const startFn = useServerFn(startDevSession);
  const stopFn = useServerFn(stopDevSession);
  const advanceFn = useServerFn(advanceDevSession);
  const setAutoRunFn = useServerFn(setDevSessionAutoRun);

  const [goal, setGoal] = useState("");
  const [quality, setQuality] = useState<"draft" | "polished" | "premium">("polished");
  const sentTaskIds = useRef<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["dev-session", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
    refetchInterval: 8000,
  });
  const session = (data?.session ?? null) as Session | null;
  const tasks = (data?.tasks ?? []) as Task[];
  const isActive = session?.status === "active";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dev-session", projectId] });

  const start = useMutation({
    mutationFn: async () => startFn({ data: { project_id: projectId, goal: goal.trim(), quality_target: quality } }),
    onSuccess: () => { setGoal(""); sentTaskIds.current = new Set(); invalidate(); },
  });
  const stop = useMutation({
    mutationFn: async () => stopFn({ data: { session_id: session!.id, status: "stopped" } }),
    onSuccess: invalidate,
  });
  const advance = useMutation({
    mutationFn: async (force: boolean) => advanceFn({ data: { session_id: session!.id, force } }),
    onSuccess: (res: any) => {
      if (res?.task?.instruction && onSendPrompt && !sentTaskIds.current.has(res.task.id)) {
        sentTaskIds.current.add(res.task.id);
        const prefix = `[${AGENT_LABEL[res.task.agent] ?? res.task.agent}] `;
        onSendPrompt(prefix + res.task.instruction);
      }
      invalidate();
    },
  });
  const toggleAuto = useMutation({
    mutationFn: async (auto: boolean) => setAutoRunFn({ data: { session_id: session!.id, auto_run: auto } }),
    onSuccess: invalidate,
  });

  // Auto-run poller: every 15s ask the server to advance. Server decides
  // whether the current in-progress task has finished (via execution_reports).
  useEffect(() => {
    if (!session || !isActive || !session.auto_run) return;
    const has_in_progress = tasks.some((t) => t.status === "in_progress");
    // First tick: start the first task immediately.
    if (!has_in_progress && tasks.some((t) => t.status === "pending")) {
      advance.mutate(false);
    }
    const iv = setInterval(() => {
      if (advance.isPending) return;
      advance.mutate(false);
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.auto_run, isActive, tasks.length]);

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Autonomous Session</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            AI agents plan, build, test, and improve toward a goal
          </div>
        </div>
        {session && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${STATUS_TINT[session.status]}22`, color: STATUS_TINT[session.status] }}>
            {session.status}
          </span>
        )}
      </div>

      {!session || session.status !== "active" ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Goal — e.g. Make this obby feel premium with mobile support and a leaderboard"
            rows={2}
            className="bs-input w-full resize-none rounded-md px-2 py-1.5 text-[11px]"
          />
          <div className="flex items-center gap-2">
            <select value={quality} onChange={(e) => setQuality(e.target.value as any)} className="bs-input rounded-md px-1.5 py-1 text-[10.5px]">
              <option value="draft">Draft</option>
              <option value="polished">Polished</option>
              <option value="premium">Premium</option>
            </select>
            <button
              onClick={() => start.mutate()}
              disabled={!goal.trim() || start.isPending}
              className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--bs-grad)" }}
            >
              {start.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Start Development
            </button>
          </div>
          {start.isError && (
            <div className="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
              {(start.error as Error).message}
            </div>
          )}
          {session && session.status !== "active" && tasks.length > 0 && (
            <div className="mt-2 rounded-lg px-2 py-1.5 text-[10.5px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
              Last session: {done}/{tasks.length} tasks · {session.status}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg px-2 py-1.5" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}>
            <div className="text-[11px] font-semibold">{session.goal}</div>
            {session.summary && (
              <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>{session.summary}</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.06))" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--bs-grad)" }} />
            </div>
            <div className="text-[10px] font-semibold" style={{ color: "var(--bs-muted-fg)" }}>{done}/{tasks.length}</div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => toggleAuto.mutate(!session.auto_run)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold"
              style={{ background: session.auto_run ? "var(--bs-grad)" : "var(--bs-card-2)", color: session.auto_run ? "white" : "var(--bs-muted-fg)" }}
            >
              {session.auto_run ? <Zap className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
              {session.auto_run ? "Auto-run on" : "Auto-run off"}
            </button>
            <button
              onClick={() => advance.mutate(true)}
              disabled={advance.isPending}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold"
              style={{ background: "var(--bs-card-2)", color: "var(--bs-fg, inherit)" }}
              title="Mark current task done and start next"
            >
              {advance.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Next
            </button>
            <button
              onClick={() => stop.mutate()}
              disabled={stop.isPending}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold text-red-400"
              style={{ background: "rgba(239,68,68,0.1)" }}
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {tasks.map((t) => {
              const Icon = t.status === "done" ? CheckCircle2 : t.status === "in_progress" ? Loader2 : Circle;
              const tint = t.status === "done" ? "#22c55e" : t.status === "in_progress" ? "#3b82f6" : "#94a3b8";
              return (
                <div key={t.id} className="flex items-start gap-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}>
                  <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${t.status === "in_progress" ? "animate-spin" : ""}`} style={{ color: tint }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${tint}22`, color: tint }}>
                        {AGENT_LABEL[t.agent] ?? t.agent}
                      </span>
                      <span className="truncate text-[11px] font-semibold">{t.title}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
                      {t.instruction}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && !session && (
        <div className="mt-3 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>Loading…</div>
      )}
    </div>
  );
}
