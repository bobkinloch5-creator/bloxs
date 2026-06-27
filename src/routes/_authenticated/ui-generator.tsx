import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { deleteSavedRobloxUi, generateRobloxUi, listSavedRobloxUis } from "@/lib/ui-generator.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { LayoutDashboard, Send, Loader2, Copy, Check, AlertTriangle, Sparkles, Shuffle, Download, ExternalLink, Trash2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/ui-generator")({
  head: () => ({ meta: [
    { title: "UI Generator — BloxSmith" },
    { name: "description", content: "Generate complete, ready-to-paste Roblox ScreenGui Luau scripts from a prompt." },
  ]}),
  component: UiGenerator,
});

const STYLES = [
  "Modern", "Premium", "Futuristic", "Sci-Fi", "Neon",
  "Cartoon", "Cute", "Fantasy", "RPG", "Horror", "Retro", "Minimal", "Light", "Dark",
];
const EXAMPLES = [
  "Simulator HUD with a big animated coins counter, multiplier and rebirth pills, and a side button rail (Shop, Pets, Rebirth)",
  "RPG HUD with health, mana and stamina bars, an XP bar with level badge, and an ability hotbar with cooldowns",
  "Loading screen with a centered logo, animated progress bar, and rotating gameplay tips",
  "Main menu with a big title, Play / Shop / Settings buttons, and hover animations",
  "Shop with 6 item cards, coin balance top-right, and a Buy button on each card",
  "Inventory grid 4x5 with item rarity borders, count badges, and equip/unequip buttons",
];

type Generated = { id: string; prompt: string; style: string; code: string; conceptImageUrl?: string | null; createdAt: number | string; projectId?: string | null };

function safeFileName(input: string, ext: string) {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 42) || "bloxsmith-ui";
  return `${base}.${ext}`;
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UiGenerator() {
  const profFn = useServerFn(getMyProfile);
  const genFn = useServerFn(generateRobloxUi);
  const listFn = useServerFn(listSavedRobloxUis);
  const delFn = useServerFn(deleteSavedRobloxUi);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const savedQuery = useQuery({
    queryKey: ["saved-roblox-uis"],
    queryFn: () => listFn({ data: { limit: 30 } }),
  });

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Modern");
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const gen = useMutation({
    mutationFn: async (vars: { prompt: string; style: string; modelPrompt?: string }) => {
      const request = genFn({ data: { prompt: vars.modelPrompt || vars.prompt, style: vars.style } });
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Generation timed out while preparing the preview. Try again, or switch style/model if the provider is slow.")), 120_000);
      });
      return Promise.race([request, timeout]);
    },
    onSuccess: (out, vars) => {
      setGenerated((g) => [
        { id: out.id || crypto.randomUUID(), prompt: vars.prompt, style: vars.style, code: out.code, conceptImageUrl: out.conceptImageUrl, createdAt: out.createdAt || Date.now() },
        ...g,
      ]);
      setPrompt("");
      setErr(null);
      savedQuery.refetch();
    },
    onError: (e: any) => setErr(e?.message || "Generation failed. Try a different prompt or model."),
  });

  const del = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: (_out, id) => {
      setGenerated((rows) => rows.filter((row) => row.id !== id));
      savedQuery.refetch();
    },
    onError: (e: any) => setErr(e?.message || "Could not delete saved UI."),
  });

  useEffect(() => {
    if (!savedQuery.data) return;
    setGenerated(savedQuery.data as Generated[]);
  }, [savedQuery.data]);

  function generate(p?: string) {
    const value = (p ?? prompt).trim();
    if (!value || gen.isPending) return;
    const variantPrompt = `${value}\nUnique visual variant #${shuffleSeed + 1}: make the composition, colors, panel shapes, and button style noticeably different from the last generation.`;
    setShuffleSeed((n) => n + 1);
    gen.mutate({ prompt: value, modelPrompt: variantPrompt, style });
  }

  return (
    <PageShell
      title="UI Generator"
      description="Describe a Roblox screen. BloxSmith creates a premium concept image and a real responsive Roblox ScreenGui script."
      accent="ui"
      activeKey="ui"
      isAdmin={!!profile?.is_admin}
    >
      <section className="rounded-2xl border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,.88),rgba(5,5,12,.96))] p-6 shadow-2xl shadow-violet-950/30 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Premium randomized Roblox UI
            </div>
            <h2 className="mt-3 text-xl font-black text-white">Generate a real Roblox interface</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              BloxSmith creates a fresh concept image, then returns a full responsive Luau ScreenGui script with animations and working buttons.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
              const st = STYLES[Math.floor(Math.random() * STYLES.length)];
              setPrompt(ex);
              setStyle(st);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.1]"
          >
            <Shuffle className="h-3.5 w-3.5" /> Random idea
          </button>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-violet-300">Describe the UI</label>
        <div className="mt-2 flex gap-2 rounded-2xl border border-white/10 bg-black/35 p-2 ring-1 ring-violet-300/10">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
            placeholder="e.g. A shop with 6 items, currency display, and a Buy button"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => generate()}
            disabled={gen.isPending || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-900/30 disabled:opacity-50"
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Generate
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${
                style === s ? "border-violet-300/45 bg-violet-500/25 text-violet-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${style === s ? "bg-cyan-300" : "bg-violet-300/50"}`} />
              {s}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/70">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setPrompt(ex); }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/[0.08]"
            >
              {ex.length > 60 ? ex.slice(0, 58) + "…" : ex}
            </button>
          ))}
        </div>
        {err && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertTriangle className="h-3.5 w-3.5" /> {err}
          </div>
        )}
        {gen.isPending && (
          <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] p-3 text-xs text-cyan-100">
            <div className="flex items-center justify-between gap-3 font-bold">
              <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing preview and Luau...</span>
              <span>Live generation</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300" />
            </div>
          </div>
        )}
      </section>

      {generated.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No UI generated yet"
          description={savedQuery.isLoading ? "Loading your saved UI generations..." : "Describe a Roblox screen above and hit Generate. Saved UI scripts and previews appear here so you can reuse them later."}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">Saved UI Library</h2>
              <p className="mt-1 text-xs text-muted-foreground">These are saved to your account and stay available after refresh.</p>
            </div>
            <button
              onClick={() => savedQuery.refetch()}
              disabled={savedQuery.isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.1] disabled:opacity-50"
            >
              {savedQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
          </div>
          {generated.map((g) => (
            <ResultCard key={g.id} result={g} onDelete={(id) => del.mutate(id)} deleting={del.isPending} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ResultCard({ result, onDelete, deleting }: { result: Generated; onDelete: (id: string) => void; deleting?: boolean }) {
  const [copied, setCopied] = useState(false);
  const createdLabel = typeof result.createdAt === "number"
    ? new Date(result.createdAt).toLocaleString()
    : new Date(result.createdAt).toLocaleString();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-100">{result.prompt}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {result.style} · saved concept · {createdLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(result.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Luau"}
          </button>
          <button
            onClick={() => downloadText(result.code, safeFileName(result.prompt, "client.lua"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-500/25"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this saved UI generation?")) onDelete(result.id);
            }}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </div>
      </div>
      {result.conceptImageUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
          <div className="flex items-center justify-between border-b border-white/10 bg-black/55 px-3 py-2 text-[11px] font-bold text-white">
            <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-cyan-200" /> Roblox UI preview</span>
            <div className="flex gap-1.5">
              <a href={result.conceptImageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
                <ExternalLink className="h-3 w-3" /> Open
              </a>
              <a href={result.conceptImageUrl} download={safeFileName(result.prompt, "png")} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
                <Download className="h-3 w-3" /> Image
              </a>
            </div>
          </div>
          <img
            src={result.conceptImageUrl}
            alt="Generated Roblox UI concept"
            className="max-h-[420px] w-full object-contain"
          />
        </div>
      )}
      <pre className="mt-3 max-h-[400px] overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-[11px] leading-relaxed text-slate-200">
        <code>{result.code}</code>
      </pre>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Paste into <span className="font-mono text-violet-300">StarterPlayer › StarterPlayerScripts</span> as a LocalScript and press Play.
      </p>
    </div>
  );
}
