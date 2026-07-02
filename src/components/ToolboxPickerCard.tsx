import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import {
  Box, Search, Loader2, CheckCircle2, ShieldCheck, AlertTriangle, BadgeCheck,
  Sparkles, Plus, ChevronDown, Star, Clock, Hash, RefreshCw, Repeat2,
} from "lucide-react";
import { listProjectActions } from "@/lib/chat.functions";
import { searchToolboxAssets, queueToolboxInsert } from "@/lib/toolbox.functions";

type AssetCategory = "Model" | "Audio" | "Decal" | "Mesh";

type ToolboxAsset = {
  id: number;
  name: string;
  creatorName: string;
  creatorType: string;
  verifiedCreator: boolean;
  endorsed: boolean;
  thumbnail: string | null;
  assetType: string | null;
  qualityTier: "excellent" | "good" | "usable";
  score: number;
  relevance: number;
  hasScripts: boolean;
  scriptCount: number;
  upVotePercent: number | null;
  reason: string | null;
  sourceQuery: string;
};

type SavedAsset = Pick<ToolboxAsset, "id" | "name" | "creatorName" | "thumbnail"> & { sourceQuery?: string };

const QUICK_QUERIES = ["medieval village", "city street", "tycoon kit", "sci-fi base", "horror house", "racing track"];
const FAV_KEY = (p: string) => `bs-toolbox-fav-${p}`;
const RECENT_KEY = (p: string) => `bs-toolbox-recent-${p}`;
const MAX_RECENT = 8;

const friendly = (err: unknown) => friendlyError(err, { context: "Toolbox" });

function loadList(key: string): SavedAsset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function saveList(key: string, list: SavedAsset[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 40))); } catch {}
}

export function ToolboxPickerCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<{ q: string; cat: AssetCategory; nonce: number } | null>(null);
  const [category, setCategory] = useState<AssetCategory>("Model");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [skipIds, setSkipIds] = useState<Set<number>>(new Set());
  const [replaceMode, setReplaceMode] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [tab, setTab] = useState<"search" | "saved" | "recent">("search");

  const [favorites, setFavorites] = useState<SavedAsset[]>([]);
  const [recent, setRecent] = useState<SavedAsset[]>([]);

  useEffect(() => {
    setFavorites(loadList(FAV_KEY(projectId)));
    setRecent(loadList(RECENT_KEY(projectId)));
  }, [projectId]);

  const searchFn = useServerFn(searchToolboxAssets);
  const insertFn = useServerFn(queueToolboxInsert);
  const listActionsFn = useServerFn(listProjectActions);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["toolbox-search", submittedQuery?.q, submittedQuery?.cat, submittedQuery?.nonce],
    queryFn: () => searchFn({ data: { query: submittedQuery!.q, category: submittedQuery!.cat, limit: 12 } }),
    enabled: !!submittedQuery,
    staleTime: 60_000,
  });

  const rawResults = (data?.results ?? []) as ToolboxAsset[];
  const results = useMemo(() => rawResults.filter((r) => !skipIds.has(r.id)), [rawResults, skipIds]);

  const toRecent = (assets: SavedAsset[]) => {
    const merged = [...assets, ...recent.filter((r) => !assets.some((a) => a.id === r.id))].slice(0, MAX_RECENT);
    setRecent(merged);
    saveList(RECENT_KEY(projectId), merged);
  };

  const watchQueuedActions = (actionIds: string[] | undefined, label: string) => {
    if (!actionIds?.length || typeof window === "undefined") return;
    const toastId = toast.loading(`Waiting for Studio plugin to insert ${label}…`);
    let polls = 0;
    const timer = window.setInterval(async () => {
      polls += 1;
      try {
        const rows = (await listActionsFn({ data: { projectId } })) as Array<{ id: string; status?: string | null; error?: string | null; name?: string | null }>;
        const tracked = rows.filter((row) => actionIds.includes(row.id));
        const failed = tracked.find((row) => row.status === "failed");
        if (failed) {
          window.clearInterval(timer);
          toast.error(`Studio could not insert ${failed.name ?? label}: ${failed.error ?? "plugin reported a failure"}`, { id: toastId });
          queryClient.invalidateQueries({ queryKey: ["plugin-actions", projectId] });
          return;
        }
        if (tracked.length === actionIds.length && tracked.every((row) => row.status === "done")) {
          window.clearInterval(timer);
          toast.success(`Inserted into Studio: ${label}`, { id: toastId });
          queryClient.invalidateQueries({ queryKey: ["plugin-actions", projectId] });
          return;
        }
        if (polls >= 45) {
          window.clearInterval(timer);
          toast.warning(`Queued ${label}, but Studio has not confirmed it yet. Keep the BloxSmith plugin open and connected.`, { id: toastId });
        }
      } catch {
        if (polls >= 45) {
          window.clearInterval(timer);
          toast.warning(`Queued ${label}, but confirmation could not be checked. Reopen the Studio plugin if nothing appears.`, { id: toastId });
        }
      }
    }, 2000);
  };

  const insertMutation = useMutation({
    mutationFn: async (assets: SavedAsset[]) =>
      insertFn({
        data: {
          projectId,
          folderName: `BloxSmith_${(submittedQuery?.q ?? assets[0]?.sourceQuery ?? "Picks").replace(/\s+/g, "_").slice(0, 40)}`,
          assets: assets.map((a) => ({ id: a.id, name: a.name, creatorName: a.creatorName, sourceQuery: a.sourceQuery })),
        },
      }),
    onSuccess: (res, vars) => {
      if (!res?.ok || (res.queued ?? 0) <= 0) {
        const reason = res && "reason" in res ? res.reason : undefined;
        const message = reason === "no_authorized_assets"
          ? "That Toolbox asset is locked/private, so it was not sent to Studio. Try another result or paste a public asset ID."
          : "No Toolbox asset was queued. Try another result or reconnect the Studio plugin.";
        toast.error(message);
        return;
      }
      toast.success(`Queued ${res.queued} asset${res.queued === 1 ? "" : "s"} → Studio (plugin inserts automatically on next poll, usually within 2s).`);
      watchQueuedActions(res.actionIds, vars.length === 1 ? vars[0]?.name ?? "asset" : `${vars.length} assets`);
      toRecent(vars);
      if (replaceMode) {
        toast.message("Replace mode: open Studio and delete the old asset — the plugin will drop the new one in on the next poll.");
        setReplaceMode(false);
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["plugin-actions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["build-execution-status", projectId] });
    },
    onError: (err) => toast.error(friendly(err)),
  });

  const submit = (q: string, cat: AssetCategory = category) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setQuery(trimmed);
    setSubmittedQuery({ q: trimmed, cat, nonce: Date.now() });
    setSelected(new Set());
    setSkipIds(new Set());
    setTab("search");
  };

  const tryAnother = () => {
    // Skip current top result; if backend returns same set, force re-fetch
    const top = results[0];
    if (top) setSkipIds((s) => new Set(s).add(top.id));
    if (results.length <= 1) {
      setSubmittedQuery((sq) => (sq ? { ...sq, nonce: Date.now() } : sq));
      void refetch();
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFavorite = (a: ToolboxAsset | SavedAsset) => {
    const exists = favorites.some((f) => f.id === a.id);
    const next = exists
      ? favorites.filter((f) => f.id !== a.id)
      : [{ id: a.id, name: a.name, creatorName: a.creatorName, thumbnail: a.thumbnail ?? null, sourceQuery: a.sourceQuery }, ...favorites];
    setFavorites(next);
    saveList(FAV_KEY(projectId), next);
  };

  const insertManual = () => {
    const id = Number(manualId.replace(/[^\d]/g, ""));
    if (!id || !Number.isFinite(id)) { toast.error("Enter a numeric Roblox asset id."); return; }
    const name = manualName.trim() || `ToolboxAsset_${id}`;
    insertMutation.mutate([{ id, name, creatorName: "manual import", thumbnail: null, sourceQuery: "manual" }]);
    setManualId(""); setManualName("");
  };

  const bestMatch = results[0];
  const selectedAssets = results.filter((r) => selected.has(r.id));

  return (
    <div className="bs-card rounded-2xl p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
          <Box className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Smart Toolbox Engine</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            Safe free assets · preview · favorites · manual ID
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--bs-muted-fg)" }} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.04))", border: "1px solid var(--bs-border)" }}>
            {([["search","Search",Search],["saved","Saved",Star],["recent","Recent",Clock]] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${tab === k ? "text-white" : ""}`}
                style={tab === k ? { background: "var(--bs-grad)" } : { color: "var(--bs-muted-fg)" }}
              >
                <Icon className="h-3 w-3" /> {label}
                {k === "saved" && favorites.length > 0 && <span className="opacity-70">({favorites.length})</span>}
                {k === "recent" && recent.length > 0 && <span className="opacity-70">({recent.length})</span>}
              </button>
            ))}
          </div>

          {tab === "search" && (
            <>
              {/* Search bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--bs-muted-fg)" }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(query); }}
                    placeholder='e.g. "police car", "medieval castle"'
                    className="bs-input w-full rounded-lg pl-8 pr-3 py-2 text-xs"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AssetCategory)}
                  className="bs-input rounded-lg px-2 py-2 text-xs"
                  title="Asset category"
                >
                  <option value="Model">Models</option>
                  <option value="Mesh">Meshes</option>
                  <option value="Decal">Decals</option>
                  <option value="Audio">Audio</option>
                </select>
                <button
                  onClick={() => submit(query)}
                  disabled={query.trim().length < 2 || isFetching}
                  className="grid h-9 w-9 place-items-center rounded-lg text-white disabled:opacity-50"
                  style={{ background: "var(--bs-grad)" }}
                  title="Search"
                >
                  {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <ShieldCheck className="h-2.5 w-2.5" /> Free + safe only
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} className="h-3 w-3" />
                  <Repeat2 className="h-3 w-3" /> Replace mode
                </label>
                {submittedQuery && results.length > 0 && (
                  <button onClick={tryAnother} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold hover:opacity-80" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.06))", border: "1px solid var(--bs-border)", color: "var(--bs-fg)" }}>
                    <RefreshCw className="h-3 w-3" /> Try another
                  </button>
                )}
              </div>

              {/* Manual ID import */}
              <details className="rounded-lg border" style={{ borderColor: "var(--bs-border)" }}>
                <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold" style={{ color: "var(--bs-muted-fg)" }}>
                  <Hash className="mr-1 inline h-3 w-3" /> Manual asset ID
                </summary>
                <div className="flex gap-1.5 p-2 pt-0">
                  <input
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="123456789"
                    inputMode="numeric"
                    className="bs-input w-28 rounded-md px-2 py-1.5 text-xs"
                  />
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Name (optional)"
                    className="bs-input flex-1 rounded-md px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={insertManual}
                    disabled={insertMutation.isPending || !manualId.trim()}
                    className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--bs-grad)" }}
                  >
                    Insert
                  </button>
                </div>
              </details>

              {/* Quick chips */}
              {!submittedQuery && (
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_QUERIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => submit(q)}
                      className="rounded-full px-2.5 py-1 text-[10.5px] font-medium transition hover:opacity-80"
                      style={{ background: "var(--bs-card-2, rgba(255,255,255,0.04))", color: "var(--bs-muted-fg)", border: "1px solid var(--bs-border)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {error && <div className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">{friendly(error)}</div>}

              {/* Best Match banner */}
              {bestMatch && submittedQuery && (
                <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(139,92,246,0.05))", border: "1px solid rgba(139,92,246,0.35)" }}>
                  <Sparkles className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
                  <div className="min-w-0 flex-1 text-[11px]">
                    <span className="font-semibold" style={{ color: "#a78bfa" }}>Best match:</span>{" "}
                    <span className="truncate">{bestMatch.name}</span>
                    <span className="opacity-60"> · by {bestMatch.creatorName}</span>
                  </div>
                  <button
                    onClick={() => insertMutation.mutate([bestMatch])}
                    disabled={insertMutation.isPending}
                    className="shrink-0 rounded-md px-2 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--bs-grad)" }}
                  >
                    {insertMutation.isPending ? "Inserting…" : replaceMode ? "Replace with this" : "Insert Best Match"}
                  </button>
                </div>
              )}

              {/* Results grid */}
              {submittedQuery && (
                <div className="grid grid-cols-2 gap-2">
                  {isFetching && results.length === 0 ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-square animate-pulse rounded-lg" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.04))" }} />
                    ))
                  ) : results.length === 0 ? (
                    <div className="col-span-2 rounded-lg px-3 py-4 text-center text-[11px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
                      No safe matches found. Try a more specific term like "wooden barrel" or "city road" — or paste a manual asset ID above.
                    </div>
                  ) : (
                    results.map((r) => (
                      <AssetCard
                        key={r.id}
                        asset={r}
                        selected={selected.has(r.id)}
                        favorited={favorites.some((f) => f.id === r.id)}
                        onToggle={() => toggle(r.id)}
                        onFavorite={() => toggleFavorite(r)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Footer actions */}
              {results.length > 0 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>
                    {selected.size > 0 ? `${selected.size} selected` : `${results.length} results · pick to insert`}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => insertMutation.mutate(selectedAssets)}
                      disabled={selected.size === 0 || insertMutation.isPending}
                      className="rounded-md px-2 py-1 text-[10.5px] font-semibold transition disabled:opacity-50"
                      style={{ background: "var(--bs-card-2, rgba(255,255,255,0.06))", color: "var(--bs-fg)", border: "1px solid var(--bs-border)" }}
                    >
                      Insert Selected
                    </button>
                    <button
                      onClick={() => insertMutation.mutate(results.slice(0, 8))}
                      disabled={insertMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--bs-grad)" }}
                    >
                      {insertMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Insert All
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "saved" && (
            <SavedGrid
              list={favorites}
              empty="No favorites yet. Tap the ⭐ on any asset to save it."
              onInsert={(a) => insertMutation.mutate([a])}
              onRemove={(a) => toggleFavorite(a)}
              pending={insertMutation.isPending}
            />
          )}

          {tab === "recent" && (
            <SavedGrid
              list={recent}
              empty="No recent inserts yet."
              onInsert={(a) => insertMutation.mutate([a])}
              pending={insertMutation.isPending}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset, selected, favorited, onToggle, onFavorite,
}: {
  asset: ToolboxAsset; selected: boolean; favorited: boolean;
  onToggle: () => void; onFavorite: () => void;
}) {
  const tierColor = asset.qualityTier === "excellent" ? "#22c55e" : asset.qualityTier === "good" ? "#3b82f6" : "#94a3b8";
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-lg text-left transition hover:opacity-95"
      style={{
        background: "var(--bs-card-2, rgba(255,255,255,0.04))",
        border: `1px solid ${selected ? "rgba(139,92,246,0.6)" : "var(--bs-border)"}`,
        boxShadow: selected ? "0 0 0 2px rgba(139,92,246,0.25)" : undefined,
      }}
    >
      <button onClick={onToggle} className="relative aspect-square w-full overflow-hidden text-left" style={{ background: "rgba(0,0,0,0.25)" }}>
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.name} loading="lazy" className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="grid h-full w-full place-items-center" style={{ color: "var(--bs-muted-fg)" }}>
            <Box className="h-6 w-6 opacity-40" />
          </div>
        )}
        {selected && (
          <div className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full" style={{ background: "rgba(139,92,246,0.95)", color: "#fff" }}>
            <CheckCircle2 className="h-3 w-3" />
          </div>
        )}
        <div className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: `${tierColor}cc`, color: "#fff" }}>
          {asset.qualityTier}
        </div>
      </button>
      <button
        onClick={onFavorite}
        title={favorited ? "Remove favorite" : "Save to favorites"}
        className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full backdrop-blur"
        style={{ background: favorited ? "rgba(245,158,11,0.9)" : "rgba(0,0,0,0.45)", color: "#fff" }}
      >
        <Star className={`h-3 w-3 ${favorited ? "fill-current" : ""}`} />
      </button>
      <div className="p-1.5">
        <div className="truncate text-[11px] font-semibold">{asset.name}</div>
        <div className="flex items-center gap-1 truncate text-[9.5px]" style={{ color: "var(--bs-muted-fg)" }}>
          {asset.verifiedCreator && <BadgeCheck className="h-2.5 w-2.5 shrink-0" style={{ color: "#60a5fa" }} />}
          <span className="truncate">{asset.creatorName}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[9px]" style={{ color: "var(--bs-muted-fg)" }}>
          {asset.hasScripts ? (
            <span className="inline-flex items-center gap-0.5" title={`${asset.scriptCount} script(s) — will be quarantined`}>
              <AlertTriangle className="h-2.5 w-2.5" style={{ color: "#f59e0b" }} />
              {asset.scriptCount} scr
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5" title="Script-free">
              <ShieldCheck className="h-2.5 w-2.5" style={{ color: "#22c55e" }} />
              safe
            </span>
          )}
          {typeof asset.upVotePercent === "number" && asset.upVotePercent > 0 && (
            <span className="opacity-70">· {Math.round(asset.upVotePercent)}%👍</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SavedGrid({
  list, empty, onInsert, onRemove, pending,
}: {
  list: SavedAsset[]; empty: string;
  onInsert: (a: SavedAsset) => void; onRemove?: (a: SavedAsset) => void; pending: boolean;
}) {
  if (list.length === 0) {
    return (
      <div className="rounded-lg px-3 py-6 text-center text-[11px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
        {empty}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {list.map((a) => (
        <div key={a.id} className="flex flex-col overflow-hidden rounded-lg" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.04))", border: "1px solid var(--bs-border)" }}>
          <div className="relative aspect-square w-full overflow-hidden" style={{ background: "rgba(0,0,0,0.25)" }}>
            {a.thumbnail ? (
              <img src={a.thumbnail} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center" style={{ color: "var(--bs-muted-fg)" }}>
                <Box className="h-6 w-6 opacity-40" />
              </div>
            )}
          </div>
          <div className="p-1.5">
            <div className="truncate text-[11px] font-semibold">{a.name}</div>
            <div className="truncate text-[9.5px]" style={{ color: "var(--bs-muted-fg)" }}>{a.creatorName}</div>
            <div className="mt-1.5 flex gap-1">
              <button
                onClick={() => onInsert(a)}
                disabled={pending}
                className="flex-1 rounded-md px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--bs-grad)" }}
              >
                Insert
              </button>
              {onRemove && (
                <button onClick={() => onRemove(a)} title="Remove" className="rounded-md px-2 py-1 text-[10px] font-semibold" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.06))", color: "var(--bs-muted-fg)", border: "1px solid var(--bs-border)" }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
