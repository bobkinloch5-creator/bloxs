import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, CheckCircle2, RefreshCw, AlertCircle, ScrollText, XCircle, Zap, Infinity as InfinityIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";
import {
  getKbStatus,
  seedKnowledgeBaseBatch,
  getKbSeedAuditLog,
  cancelKbSeed,
  getKbSeedProgress,
  type SeedBatchResult,
  type KbSeedAuditEntry,
  type KbSeedProgress,
} from "@/lib/kb.functions";
import { getMyProfile } from "@/lib/profile.functions";

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
  const profileFn = useServerFn(getMyProfile);
  const cancelFn = useServerFn(cancelKbSeed);
  const progressFn = useServerFn(getKbSeedProgress);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SeedBatchResult | null>(null);
  const [livePos, setLivePos] = useState<KbSeedProgress | null>(null);
  const [showLog, setShowLog] = useState(false);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

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

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 15_000,
  });

  // Real-time seeding progress — polls every 700ms while a run is active so
  // the UI shows per-chunk updates (title, inserted/failed counts) instead of
  // only updating between full batches.
  useQuery({
    queryKey: ["kb-seed-progress"],
    queryFn: async () => {
      const p = await progressFn({});
      setLivePos(p);
      return p;
    },
    enabled: running,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const liveIndexed = running && livePos?.status === "running"
    ? livePos.current_index
    : (progress?.totalIndexed ?? status?.indexed ?? 0);
  const indexed = liveIndexed;
  const target = status?.target ?? progress?.target ?? 0;
  const remaining = Math.max(0, target - indexed);
  const ready = target > 0 && indexed >= target && !running;
  const percent = target > 0 ? Math.min(100, Math.round((indexed / target) * 100)) : 0;

  const isOwner = profile?.plan === "Owner" || !!profile?.is_admin;
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  // ~1 embedding call per chunk. NVIDIA embeddings on the gateway bill ~1 credit
  // per call — treat as a conservative upper bound for the preview.
  const estCreditCost = remaining;
  const notEnoughCredits = !isOwner && !ready && estCreditCost > credits;

  const runSeeding = useCallback(async () => {
    if (running) return;
    setRunning(true);
    cancelRef.current = false;
    setProgress(null);
    let totalInserted = 0;
    let totalFailed = 0;
    try {
      while (!cancelRef.current) {
        const controller = new AbortController();
        abortRef.current = controller;
        let res: SeedBatchResult;
        try {
          res = await batchFn({ data: { batchSize: 5 }, signal: controller.signal });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (cancelRef.current || /aborted|AbortError/i.test(msg)) break;
          throw e;
        } finally {
          abortRef.current = null;
        }
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
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelRef.current) {
        toast(`Cancelled — ${totalInserted} indexed, ${totalFailed} failed so far.`);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
      setLivePos(null);
      abortRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["kb-status"] });
      refetchAudit();
    }
  }, [batchFn, queryClient, refetchAudit, running]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
    // Fire-and-forget cancellation audit; don't block the UI.
    cancelFn({ data: { reason: "user_cancelled" } }).catch(() => {});
  }, [cancelFn]);

  const exportAuditCsv = useCallback(async () => {
    try {
      const res = await auditFn({});
      const entries = res?.entries ?? [];
      if (entries.length === 0) {
        toast("No seeding events to export yet.");
        return;
      }
      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        "id", "created_at", "action", "actor_email",
        "inserted", "failed", "remaining", "totalIndexed",
        "creditExhausted", "firstError",
      ];
      const rows = entries.map((e) => [
        e.id, e.created_at, e.action, e.actor_email ?? "",
        e.inserted, e.failed, e.remaining ?? "", e.totalIndexed ?? "",
        e.creditExhausted, e.firstError ?? "",
      ].map(esc).join(","));
      const csv = [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `kb-seed-audit-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${entries.length} audit ${entries.length === 1 ? "entry" : "entries"}.`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }, [auditFn]);

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
          {running && (livePos?.current_title || progress?.currentTitle) && (
            <span className="truncate ml-2 max-w-[60%]" title={livePos?.current_title ?? progress?.currentTitle ?? ""}>
              embedding · {livePos?.current_title ?? progress?.currentTitle}
            </span>
          )}
        </div>
        {running && livePos?.status === "running" && (
          <div className="mt-1 text-[10px] text-white/40 flex items-center justify-between">
            <span>{livePos.message ?? ""}</span>
            <span>+{livePos.inserted} indexed · {livePos.failed} failed</span>
          </div>
        )}
      </div>


      {/* Pre-flight preview: chunks-to-process + credits available */}
      {!ready && !running && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Chunks to process</div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              {remaining} <span className="text-[10px] font-normal text-white/40">of {target}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-white/40">
              {remaining === 0 ? "Nothing new to embed" : `~${estCreditCost} embedding call${estCreditCost === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className={`rounded-lg border px-2.5 py-2 ${notEnoughCredits ? "border-rose-400/40 bg-rose-500/10" : "border-white/10 bg-black/20"}`}>
            <div className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Your credits
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white flex items-center gap-1">
              {isOwner ? (
                <><InfinityIcon className="w-3.5 h-3.5" /> <span className="text-[10px] font-normal text-white/40">Owner</span></>
              ) : (
                <>{credits}<span className="text-[10px] font-normal text-white/40">/{maxCredits}</span></>
              )}
            </div>
            <div className={`mt-0.5 text-[10px] ${notEnoughCredits ? "text-rose-200" : "text-white/40"}`}>
              {isOwner ? "Unmetered" : notEnoughCredits ? `Short ~${estCreditCost - credits} credit${estCreditCost - credits === 1 ? "" : "s"}` : "Enough to finish"}
            </div>
          </div>
        </div>
      )}



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

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 transition"
        >
          <ScrollText className="w-3 h-3" />
          {showLog ? "Hide audit log" : "Show audit log"}
        </button>
        <button
          type="button"
          onClick={exportAuditCsv}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 transition"
        >
          <Download className="w-3 h-3" />
          Export audit logs
        </button>
      </div>

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
