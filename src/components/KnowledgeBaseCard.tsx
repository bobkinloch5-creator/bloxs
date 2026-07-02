import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getKbStatus, seedKnowledgeBase } from "@/lib/kb.functions";

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (/credits.*exhausted/i.test(msg)) return "AI credits exhausted — add credits and try again.";
  if (/rate.?limit|429/i.test(msg)) return "Rate-limited by the AI gateway. Try again in a moment.";
  if (/network|fetch|reach/i.test(msg)) return "Couldn't reach the AI gateway. Check your connection.";
  if (/unauthorized|401|403/i.test(msg)) return "You aren't authorized to do that. Try signing back in.";
  return msg.slice(0, 160);
}

export function KnowledgeBaseCard() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getKbStatus);
  const seedFn = useServerFn(seedKnowledgeBase);

  const { data, isLoading, error: statusError } = useQuery({
    queryKey: ["kb-status"],
    queryFn: () => statusFn({}),
    retry: 1,
  });

  const seedMutation = useMutation({
    mutationFn: () => seedFn({}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["kb-status"] });
      if (res.ok && res.inserted > 0) toast.success(res.message);
      else if (res.ok) toast(res.message);
      else toast.error(res.message);
    },
    onError: (err) => toast.error(friendlyError(err)),
  });

  const indexed = data?.indexed ?? 0;
  const target = data?.target ?? 0;
  const ready = target > 0 && indexed >= target;

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
        Verified Roblox API references + Luau examples that the Scripter, World Builder, and UI Designer agents retrieve from before writing code. Kills hallucinated method names.
      </p>

      {statusError && (
        <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          <AlertCircle className="w-3 h-3 mt-px shrink-0" />
          <span>Couldn't load index status. The button still works.</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => seedMutation.mutate()}
        disabled={seedMutation.isPending || isLoading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-medium py-2 transition disabled:opacity-50"
      >
        {seedMutation.isPending ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Embedding corpus…</>
        ) : ready ? (
          <><RefreshCw className="w-3.5 h-3.5" /> Re-index knowledge base</>
        ) : (
          <><BookOpen className="w-3.5 h-3.5" /> Index knowledge base</>
        )}
      </button>

      {seedMutation.data && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-white/50">
            +{seedMutation.data.inserted} new · {seedMutation.data.alreadyIndexed} already indexed
            {seedMutation.data.failed > 0 ? ` · ${seedMutation.data.failed} failed` : ""}
          </p>
          {seedMutation.data.firstError && seedMutation.data.failed > 0 && (
            <p className="text-[11px] text-amber-300/80 line-clamp-2" title={seedMutation.data.firstError}>
              {friendlyError(seedMutation.data.firstError)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
