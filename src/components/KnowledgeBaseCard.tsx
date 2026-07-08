import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, CheckCircle2, RefreshCw, AlertCircle, ScrollText, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";
import {
  getKbStatus,
  seedKnowledgeBaseBatch,
  getKbSeedAuditLog,
  type SeedBatchResult,
  type KbSeedAuditEntry,
} from "@/lib/kb.functions";

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (/credits.*exhausted/i.test(msg)) return "AI credits exhausted — add credits and try again.";
  if (/rate.?limit|429/i.test(msg)) return "Rate-limited by the AI gateway. Try again in a moment.";
  if (/forbidden/i.test(msg)) return "Only owners and admins can seed the knowledge base.";
  if (/network|fetch|reach/i.test(msg)) return "Couldn't reach the AI gateway. Check your connection.";
  if (/unauthorized|401|403/i.test(msg)) return "You aren't authorized to do that. Try signing back in.";
  return msg.slice(0, 160);
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function KnowledgeBaseCard() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getKbStatus);
  const batchFn = useServerFn(seedKnowledgeBaseBatch);
  const auditFn = useServerFn(getKbSeedAuditLog);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SeedBatchResult | null>(null);
  const [showLog, setShowLog] = useState(false);
  const cancelRef = useRef(false);

  const { data: status, isLoading, error: statusError } = useQuery({
    queryKey: ["kb-status"],
    queryFn: () => statusFn({}),
    retry: 1,
  });

  const { data: audit, refetch: refetchAudit } = useQuery({
    queryKey: ["kb-seed-audit"],
    queryFn: () => auditFn({}),
    enabled: showLog,
    staleTime: 10_000,
  });

  const indexed = progress?.totalIndexed ?? status?.indexed ?? 0;
  const target = status?.target ?? progress?.target ?? 0;
  const ready = target > 0 && indexed >= target && !running;
  const percent = target > 0 ? Math.min(100, Math.round((indexed / target) * 100)) : 0;

  const runSeeding = useCallback(async () => {
    if (running) return;
    setRunning(true);
    cancelRef.current = false;
    setProgress(null);
    let totalInserted = 0;
    let totalFailed = 0;
    try {
      while (!cancelRef.current) {
        const res: SeedBatchResult = await batchFn({ data: { batchSize: 5 } });
        totalInserted += res.inserted;
        totalFailed += res.failed;
        setProgress(res);
        queryClient.invalidateQueries({ queryKey: ["kb-status"] });
        if (res.done) {
          if (res.ok && totalInserted > 0) toast.success(`Indexed ${totalInserted} new chunks.`);
          else if (!res.ok) toast.error(res.message);
          else toast(res.message);
          break;
        }
        // Small breather between batches so the UI feels responsive.
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelRef.current) {
        toast(`Cancelled — ${totalInserted} indexed, ${totalFailed} failed so far.`);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["kb-status"] });
      refetchAudit();
    }
  }, [batchFn, queryClient, refetchAudit, running]);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const oneShot = useMutation({
    mutationFn: () => runSeeding(),
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-white">Knowledge Base (RAG)</h3>
        </div>
        {ready ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Indexed
          </span>
        ) : (
          <span className="text-xs text-white/50">{indexed}/{target} indexed</span>
        )}
      </div>
      <p className="text-xs text-white/60 leading-relaxed mb-3">
        Verified Roblox API references, game-system playbooks, and Luau examples the agents retrieve from before writing code. Owner/admin only. Seeding is audit-logged.
      </p>

      {statusError && (
        <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          <AlertCircle className="w-3 h-3 mt-px shrink-0" />
          <span>Couldn't load index status. The button still works.</span>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full transition-all duration-300 ${
              running ? "bg-cyan-400" : ready ? "bg-emerald-400" : "bg-cyan-500/60"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
          <span>{percent}% complete</span>
          {running && progress?.currentTitle && (
            <span className="truncate ml-2 max-w-[60%]" title={progress.currentTitle}>
              embedding · {progress.currentTitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => oneShot.mutate()}
          disabled={running || isLoading}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-medium py-2 transition disabled:opacity-50"
        >
          {running ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Seeding {progress?.totalIndexed ?? indexed}/{target}…</>
          ) : ready ? (
            <><RefreshCw className="w-3.5 h-3.5" /> Re-index knowledge base</>
          ) : (
            <><BookOpen className="w-3.5 h-3.5" /> Seed knowledge base</>
          )}
        </button>
        {running && (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-100 text-xs font-medium px-3 py-2 transition"
          >
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
      </div>

      {progress && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-white/60">{progress.message}</p>
          {progress.firstError && progress.failed > 0 && (
            <p className="text-[11px] text-amber-300/80 line-clamp-2" title={progress.firstError}>
              {friendlyError(progress.firstError)}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowLog((v) => !v)}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 transition"
      >
        <ScrollText className="w-3 h-3" />
        {showLog ? "Hide audit log" : "Show audit log"}
      </button>

      {showLog && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-white/5 bg-black/30 p-2 space-y-1">
          {(audit?.entries ?? []).length === 0 && (
            <p className="text-[11px] text-white/40 text-center py-2">No seeding events yet.</p>
          )}
          {(audit?.entries ?? []).map((e: KbSeedAuditEntry) => (
            <div key={e.id} className="text-[11px] flex items-start justify-between gap-2 py-1 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={
                    e.action === "kb_seed.complete" ? "text-emerald-300"
                    : e.action === "kb_seed.oneshot" ? "text-cyan-300"
                    : "text-white/70"
                  }>{e.action.replace("kb_seed.", "")}</span>
                  {e.creditExhausted && <span className="text-amber-300">· credits out</span>}
                  {e.failed > 0 && <span className="text-rose-300">· {e.failed} failed</span>}
                </div>
                <div className="text-white/40 truncate" title={e.actor_email ?? ""}>
                  +{e.inserted} · {e.actor_email ?? "unknown"}
                </div>
              </div>
              <span className="text-white/40 shrink-0">{timeAgo(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
