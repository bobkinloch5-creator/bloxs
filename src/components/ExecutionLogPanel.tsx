import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectActions } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  ScrollText,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Radio,
  FileCode,
  Box,
  Layers,
  Trash2,
  Wrench,
  Search as SearchIcon,
  Play,
  Camera,
  MousePointer,
  Move,
  Sparkles,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────
interface ActionRow {
  id: string;
  message_id: string | null;
  kind: string;
  name: string;
  parent_path: string | null;
  status: string; // pending | sent | done | failed
  error: string | null;
  result: unknown;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
}

interface Props {
  projectId: string;
  projectName?: string;
}

// ── Presentation helpers ───────────────────────────────────────────────────
function kindIcon(kind: string) {
  const k = kind.toLowerCase();
  if (/script|module|local|run_lua|patch/.test(k)) return FileCode;
  if (/part|model|terrain|insert_asset|tool/.test(k)) return Box;
  if (/gui|frame|label|button|screengui|image/.test(k)) return Layers;
  if (/delete/.test(k)) return Trash2;
  if (/autofix|organize|set_propert|rename|move|setting/.test(k)) return Wrench;
  if (/scan|playtest/.test(k)) return SearchIcon;
  if (/run\b/.test(k)) return Play;
  if (/camera/.test(k)) return Camera;
  if (/select/.test(k)) return MousePointer;
  if (/transform/.test(k)) return Move;
  return Sparkles;
}

function statusMeta(status: string) {
  switch (status) {
    case "done":
      return { label: "Applied", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2, spin: false };
    case "failed":
      return { label: "Failed", cls: "text-rose-300 bg-rose-500/10 border-rose-500/20", Icon: XCircle, spin: false };
    case "sent":
      return { label: "Executing", cls: "text-sky-300 bg-sky-500/10 border-sky-500/20", Icon: Loader2, spin: true };
    default:
      return { label: "Queued", cls: "text-amber-300 bg-amber-500/10 border-amber-500/20", Icon: Clock, spin: false };
  }
}

function prettyKind(kind: string) {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function durationMs(row: ActionRow): number | null {
  if (!row.completed_at) return null;
  const start = row.sent_at ?? row.created_at;
  const d = new Date(row.completed_at).getTime() - new Date(start).getTime();
  return Number.isFinite(d) && d >= 0 ? d : null;
}

// ── Component ───────────────────────────────────────────────────────────────
export function ExecutionLogPanel({ projectId, projectName }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectActions);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [live, setLive] = useState(false);

  const queryKey = ["execution-log", projectId];

  const { data: actions = [], isFetching, refetch } = useQuery<ActionRow[]>({
    queryKey,
    queryFn: async () => {
      if (!projectId) return [];
      const rows = (await listFn({ data: { projectId } })) as ActionRow[];
      return rows;
    },
    enabled: Boolean(projectId),
    // Realtime drives updates; this poll is a safety net if the socket drops.
    refetchInterval: 5000,
  });

  // Realtime: any insert/update/delete on this project's actions refreshes the
  // log instantly and also nudges the chat's build-status banner.
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`exec-log-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plugin_actions", filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey });
          qc.invalidateQueries({ queryKey: ["build-execution-status", projectId] });
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(ch);
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const counts = useMemo(() => {
    let done = 0, failed = 0, running = 0, queued = 0;
    for (const a of actions) {
      if (a.status === "done") done += 1;
      else if (a.status === "failed") failed += 1;
      else if (a.status === "sent") running += 1;
      else queued += 1;
    }
    return { done, failed, running, queued, total: actions.length };
  }, [actions]);

  return (
    <div className="flex flex-col rounded-2xl border border-white/8 bg-slate-900/60 shadow-xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-200">
            <ScrollText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              Execution Log
              <span
                title={live ? "Live — updates in real time" : "Reconnecting…"}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  live ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
                }`}
              >
                <Radio className={`h-2.5 w-2.5 ${live ? "animate-pulse" : ""}`} />
                {live ? "Live" : "Idle"}
              </span>
            </div>
            <div className="truncate text-[11px] text-slate-400">
              Every change the AI makes to {projectName ?? "your game"}
            </div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
          title="Refresh log"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary chips */}
      {counts.total > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/8 px-4 py-2 text-[11px]">
          <span className="rounded-md bg-white/[0.04] px-2 py-0.5 font-semibold text-slate-300">{counts.total} total</span>
          {counts.done > 0 && <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">{counts.done} applied</span>}
          {counts.running > 0 && <span className="rounded-md bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-300">{counts.running} executing</span>}
          {counts.queued > 0 && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-300">{counts.queued} queued</span>}
          {counts.failed > 0 && <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-300">{counts.failed} failed</span>}
        </div>
      )}

      {/* List */}
      <div className="max-h-[460px] overflow-y-auto p-2">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Send className="mb-3 h-8 w-8 text-slate-600" />
            <div className="text-sm font-semibold text-slate-300">No actions yet</div>
            <p className="mt-1 text-xs text-slate-500">
              When the AI edits your game, every action shows up here in real time — what it did, where, and whether it succeeded.
            </p>
          </div>
        ) : (
          <ol className="space-y-1">
            {actions.map((a) => {
              const meta = statusMeta(a.status);
              const KindIcon = kindIcon(a.kind);
              const isOpen = !!expanded[a.id];
              const dur = durationMs(a);
              const hasDetail = !!a.error || !!a.parent_path || !!a.result;
              return (
                <li key={a.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
                  <button
                    onClick={() => hasDetail && setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}
                    className={`flex w-full items-start gap-2 px-2.5 py-2 text-left ${hasDetail ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default"}`}
                  >
                    <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-white/[0.05] text-slate-300">
                      <KindIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-slate-100">{a.name || prettyKind(a.kind)}</span>
                        <span className="flex-shrink-0 rounded bg-white/[0.05] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                          {prettyKind(a.kind)}
                        </span>
                      </div>
                      {a.parent_path && (
                        <div className="truncate text-[11px] text-slate-500" title={a.parent_path}>
                          {a.parent_path}
                        </div>
                      )}
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{relTime(a.completed_at ?? a.sent_at ?? a.created_at)}</span>
                        {dur != null && <span>· {dur < 1000 ? `${dur}ms` : `${(dur / 1000).toFixed(1)}s`}</span>}
                      </div>
                    </div>
                    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                      <meta.Icon className={`h-3 w-3 ${meta.spin ? "animate-spin" : ""}`} />
                      {meta.label}
                    </span>
                    {hasDetail && (
                      <span className="mt-0.5 flex-shrink-0 text-slate-500">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </button>
                  {isOpen && hasDetail && (
                    <div className="border-t border-white/5 px-2.5 py-2 text-[11px]">
                      {a.error && (
                        <div className="mb-1 rounded bg-rose-500/10 px-2 py-1 text-rose-200">
                          <span className="font-semibold">Error: </span>
                          {a.error}
                        </div>
                      )}
                      {a.parent_path && (
                        <div className="text-slate-400">
                          <span className="font-semibold text-slate-300">Target: </span>
                          {a.parent_path}
                          {a.name ? `.${a.name}` : ""}
                        </div>
                      )}
                      {a.result != null && (
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] leading-relaxed text-slate-400">
                          {typeof a.result === "string" ? a.result : JSON.stringify(a.result, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export default ExecutionLogPanel;
