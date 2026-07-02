// Smart Asset Picker — top Toolbox matches with thumbnails + one-click Insert.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles, CheckCircle2, ImageOff, Boxes } from "lucide-react";
import { listProjectActions } from "@/lib/chat.functions";
import { searchToolboxAssets, queueToolboxInsert } from "@/lib/toolbox.functions";

type Category = "Model" | "Audio" | "Decal" | "Mesh";

type ToolboxRow = {
  id: number;
  name: string;
  creatorName?: string;
  verifiedCreator?: boolean;
  endorsed?: boolean;
  thumbnail?: string | null;
  qualityTier?: string;
  score?: number;
  upVotePercent?: number | null;
  hasScripts?: boolean;
  sourceQuery?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initialQuery?: string;
}

export function SmartAssetPicker({ open, onOpenChange, projectId, initialQuery = "" }: Props) {
  const queryClient = useQueryClient();
  const search = useServerFn(searchToolboxAssets);
  const insert = useServerFn(queueToolboxInsert);
  const listActions = useServerFn(listProjectActions);

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<Category>("Model");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ToolboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<number | null>(null);
  const [insertedIds, setInsertedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setInsertedIds(new Set());
    }
  }, [open, initialQuery]);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res: any = await search({
        data: { query: q, category, limit: 6, singleAssetOnly: true },
      });
      setResults((res?.results ?? []).slice(0, 6));
    } catch (e: any) {
      setError(e?.message ?? "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function pick(row: ToolboxRow) {
    setInsertingId(row.id);
    setError(null);
    try {
      const res = await insert({
        data: {
          projectId,
          assets: [{
            id: row.id,
            name: row.name,
            creatorName: row.creatorName,
            sourceQuery: row.sourceQuery ?? query.trim(),
          }],
        },
      });
      if (!res?.ok || (res.queued ?? 0) <= 0) {
        const reason = res && "reason" in res ? res.reason : undefined;
        const message = reason === "no_authorized_assets"
          ? "That Toolbox asset is locked/private, so it was not sent to Studio. Pick another asset and try again."
          : "No Toolbox asset was queued. Reconnect the Studio plugin and try again.";
        setError(message);
        toast.error(message);
        return;
      }
      setInsertedIds((prev) => new Set(prev).add(row.id));
      toast.success(`Queued ${row.name} → Studio. The plugin will insert it on the next poll.`);
      if (res.actionIds?.length && typeof window !== "undefined") {
        const toastId = toast.loading(`Waiting for Studio plugin to insert ${row.name}…`);
        let polls = 0;
        const timer = window.setInterval(async () => {
          polls += 1;
          try {
            const rows = (await listActions({ data: { projectId } })) as Array<{ id: string; status?: string | null; error?: string | null }>;
            const tracked = rows.filter((item) => res.actionIds.includes(item.id));
            const failed = tracked.find((item) => item.status === "failed");
            if (failed) {
              window.clearInterval(timer);
              toast.error(`Studio could not insert ${row.name}: ${failed.error ?? "plugin reported a failure"}`, { id: toastId });
              return;
            }
            if (tracked.length === res.actionIds.length && tracked.every((item) => item.status === "done")) {
              window.clearInterval(timer);
              toast.success(`Inserted into Studio: ${row.name}`, { id: toastId });
              return;
            }
            if (polls >= 45) {
              window.clearInterval(timer);
              toast.warning(`Queued ${row.name}, but Studio has not confirmed it yet. Keep the BloxSmith plugin open and connected.`, { id: toastId });
            }
          } catch {
            if (polls >= 45) {
              window.clearInterval(timer);
              toast.warning(`Queued ${row.name}, but confirmation could not be checked. Reopen the Studio plugin if nothing appears.`, { id: toastId });
            }
          }
        }, 2000);
      }
      queryClient.invalidateQueries({ queryKey: ["plugin-actions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["build-execution-status", projectId] });
    } catch (e: any) {
      const message = e?.message ?? "Insert failed.";
      setError(message);
      toast.error(message);
    } finally {
      setInsertingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Smart Asset Picker
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pick the exact Toolbox asset you want — no auto-selection.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="e.g. medieval house, oak tree, sci-fi door…"
              className="flex-1 border-white/10 bg-white/5"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-sm"
            >
              <option value="Model">Model</option>
              <option value="Mesh">Mesh</option>
              <option value="Decal">Decal</option>
              <option value="Audio">Audio</option>
            </select>
            <Button onClick={runSearch} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span className="ml-1">Search</span>
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {results.length === 0 && !loading && (
              <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center text-sm text-zinc-500">
                <Boxes className="h-8 w-8" />
                <div>Search the Toolbox to see the top matches.</div>
              </div>
            )}
            {results.map((r) => {
              const inserted = insertedIds.has(r.id);
              return (
                <div
                  key={r.id}
                  className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-2 transition hover:border-indigo-400/40 hover:bg-white/[0.07]"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    {r.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnail} alt={r.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-600">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="truncate text-[11px] text-zinc-400">
                      by {r.creatorName ?? "Unknown"}
                      {r.verifiedCreator && <span className="ml-1 text-blue-400">✓</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.qualityTier && (
                        <Badge variant="outline" className="border-white/15 px-1 py-0 text-[10px] capitalize">
                          {r.qualityTier}
                        </Badge>
                      )}
                      {typeof r.upVotePercent === "number" && (
                        <Badge variant="outline" className="border-white/15 px-1 py-0 text-[10px]">
                          {Math.round(r.upVotePercent)}% 👍
                        </Badge>
                      )}
                      {r.hasScripts && (
                        <Badge variant="outline" className="border-amber-500/40 px-1 py-0 text-[10px] text-amber-300">
                          scripts
                        </Badge>
                      )}
                    </div>
                    <div className="mt-auto pt-2">
                      <Button
                        size="sm"
                        className="h-7 w-full text-xs"
                        disabled={insertingId === r.id || inserted}
                        onClick={() => pick(r)}
                      >
                        {inserted ? (
                          <><CheckCircle2 className="mr-1 h-3 w-3" /> Queued</>
                        ) : insertingId === r.id ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Inserting…</>
                        ) : (
                          "Insert this one"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SmartAssetPickerButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 border-indigo-400/30 bg-indigo-500/10 text-xs text-indigo-200 hover:bg-indigo-500/20"
      onClick={onClick}
    >
      <Sparkles className="h-3 w-3" />
      Pick asset
    </Button>
  );
}
