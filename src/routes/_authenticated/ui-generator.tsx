import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { deleteSavedRobloxUi, generateRobloxUi, listSavedRobloxUis } from "@/lib/ui-generator.functions";
import { detectUiKind, kindLabelFor, paletteFor, UI_CANVAS_HEIGHT, UI_CANVAS_WIDTH, UI_KIND_OPTIONS } from "@/lib/roblox-ui-blueprint";
import { PageShell, EmptyState } from "@/components/PageShell";
import { LayoutDashboard, Send, Loader2, Copy, Check, AlertTriangle, Sparkles, Shuffle, Download, ExternalLink, Trash2, RefreshCw, RotateCcw, Monitor, Tablet, Smartphone, Maximize2, Code2, Eye, ZoomIn, ZoomOut, Layers, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { RateLimitNotice, useCountdown } from "@/components/RateLimitNotice";
import { formatCountdown, parseRateLimitError, stripRateLimitMarker, type RateLimitInfo } from "@/lib/rate-limit-client";

export const Route = createFileRoute("/_authenticated/ui-generator")({
  pendingComponent: () => <RouteSkeleton title="UI Generator" columns={2} />,
  pendingMs: 150,
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

async function copyText(content: string) {
  const value = String(content ?? "");
  if (!value.trim()) throw new Error("No Luau code was generated for this UI.");
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const ok = document.execCommand("copy");
  textArea.remove();
  if (!ok) throw new Error("Clipboard copy was blocked by the browser.");
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
  const [screenType, setScreenType] = useState<string>("auto");
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  // Drives the disabled state on the generate button while the window is closed.
  const rateLimited = useCountdown(rateLimit?.resetAt);

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
    onError: (e: any) => {
      const limit = parseRateLimitError(e);
      if (limit) {
        // Not a failure - the request just has to wait, so show the countdown
        // instead of a red error banner.
        setRateLimit(limit);
        setErr(null);
        return;
      }
      setErr(stripRateLimitMarker(e?.message || "") || "Generation failed. Try a different prompt or model.");
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: (_out, id) => {
      setGenerated((rows) => rows.filter((row) => row.id !== id));
      savedQuery.refetch();
    },
    onError: (e: any) => setErr(stripRateLimitMarker(e?.message || "") || "Could not delete saved UI."),
  });

  useEffect(() => {
    if (!savedQuery.data) return;
    setGenerated(savedQuery.data as Generated[]);
  }, [savedQuery.data]);

  const chosenKind = UI_KIND_OPTIONS.find((option) => option.kind === screenType);
  const detectedLabel = prompt.trim()
    ? kindLabelFor(detectUiKind(chosenKind ? chosenKind.label + " - " + prompt : prompt))
    : null;

  function generate(p?: string) {
    const value = (p ?? prompt).trim();
    if (!value || gen.isPending || !rateLimited.expired) return;
    // Prefixing with the picked screen type makes layout selection deterministic.
    const modelPrompt = chosenKind ? chosenKind.label + " - " + value : value;
    gen.mutate({ prompt: value, style, modelPrompt });
  }

  return (
    <PageShell
      title="UI Generator"
      description="Describe a Roblox screen. BloxSmith creates an exact animated Roblox ScreenGui preview and matching Luau script."
      accent="chat"
      activeKey="uigen"
      isAdmin={!!profile?.is_admin}
    >
      <section className="rounded-2xl border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,.88),rgba(5,5,12,.96))] p-6 shadow-2xl shadow-violet-950/30 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Exact animated Roblox UI
            </div>
            <h2 className="mt-3 text-xl font-black text-white">Generate a real Roblox interface</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              BloxSmith renders the preview and the Luau from the same Roblox UI blueprint, with animated buttons, bars, gradients, and game-ready layout.
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
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/35 p-2 ring-1 ring-violet-300/10 focus-within:ring-violet-300/40 transition">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); }
            }}
            placeholder="e.g. Simulator HUD with animated coin counter, multiplier and rebirth pills, and a side rail with Shop / Pets / Rebirth"
            rows={3}
            className="min-h-[92px] w-full resize-y bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 border-t border-white/5 px-2 pt-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/70">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">Enter</kbd>
              <span className="text-muted-foreground">to generate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold tabular-nums ${prompt.length > 1800 ? "text-amber-300" : "text-muted-foreground"}`}>{prompt.length}/2000</span>
              <button
                onClick={() => generate()}
                disabled={gen.isPending || !prompt.trim() || !rateLimited.expired}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-4 py-2 text-xs font-bold tabular-nums text-white shadow-lg shadow-violet-900/30 disabled:opacity-50"
              >
                {!rateLimited.expired ? (
                  <>
                    <Timer className="h-3.5 w-3.5" /> Ready in {formatCountdown(rateLimited.remaining)}
                  </>
                ) : (
                  <>
                    {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STYLES.map((s) => {
            const pal = paletteFor(s);
            const active = style === s;
            return (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${
                  active ? "border-violet-300/60 bg-violet-500/25 text-violet-50 shadow-md shadow-violet-900/30" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:border-white/20"
                }`}
                title={`${s} palette`}
              >
                <span
                  className="h-3 w-3 rounded-full ring-1 ring-white/20"
                  style={{ background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})` }}
                />
                {s}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/70">Screen type:</span>
          <button
            onClick={() => setScreenType("auto")}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${screenType === "auto" ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            title="Detect the screen type from your description"
          >
            Auto detect
          </button>
          {UI_KIND_OPTIONS.map((option) => (
            <button
              key={option.kind}
              onClick={() => setScreenType(option.kind)}
              title={option.hint}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${screenType === option.kind ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {detectedLabel && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100">
            <Layers className="h-3.5 w-3.5" /> Will build: {detectedLabel} layout - {UI_CANVAS_WIDTH}x{UI_CANVAS_HEIGHT} canvas
          </div>
        )}
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
        {rateLimit && (
          <RateLimitNotice info={rateLimit} onExpire={() => setRateLimit(null)} className="mt-3" />
        )}
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
            <ResultCard
              key={g.id}
              result={g}
              onDelete={(id) => del.mutate(id)}
              deleting={del.isPending}
              onRegenerate={() => { setPrompt(g.prompt); setStyle(g.style); gen.mutate({ prompt: g.prompt, style: g.style }); }}
              onRemix={() => { setPrompt(g.prompt); setStyle(g.style); }}
              regenerating={gen.isPending}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ResultCard({ result, onDelete, deleting, onRegenerate, onRemix, regenerating }: {
  result: Generated;
  onDelete: (id: string) => void;
  deleting?: boolean;
  onRegenerate?: () => void;
  onRemix?: () => void;
  regenerating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const kindLabel = useMemo(() => kindLabelFor(detectUiKind(result.prompt)), [result.prompt]);
  const codeLines = useMemo(() => String(result.code || "").split("\n").length, [result.code]);
  const swatch = useMemo(() => paletteFor(result.style), [result.style]);
  const createdLabel = typeof result.createdAt === "number"
    ? new Date(result.createdAt).toLocaleString()
    : new Date(result.createdAt).toLocaleString();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm transition hover:border-white/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-100">{result.prompt}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
              style={{ background: `linear-gradient(135deg, ${swatch.accent}, ${swatch.accent2})` }}
            />
            {result.style} · saved concept · {createdLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              title="Generate a fresh variant of this exact prompt and style"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/15 px-2.5 py-1.5 text-[11px] font-bold text-violet-100 hover:bg-violet-500/25 disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Regenerate
            </button>
          )}
          {onRemix && (
            <button
              onClick={onRemix}
              title="Load this prompt back into the composer to edit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
            >
              <Shuffle className="h-3.5 w-3.5" /> Remix
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await copyText(result.code);
                setCopyError(null);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch (err: any) {
                setCopied(false);
                setCopyError(err?.message || "Copy failed. Use Download instead.");
              }
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
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setTab("preview")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${tab === "preview" ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          onClick={() => setTab("code")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${tab === "code" ? "border-violet-300/50 bg-violet-400/15 text-violet-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
        >
          <Code2 className="h-3.5 w-3.5" /> Luau ({codeLines} lines)
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-slate-300">
          <Layers className="h-3.5 w-3.5" /> {kindLabel}
        </span>
      </div>

      {tab === "preview" ? (
        result.conceptImageUrl ? (
          <UiPreview src={result.conceptImageUrl} prompt={result.prompt} kindLabel={kindLabel} />
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-muted-foreground">
            No preview image was stored for this generation. Regenerate to build one.
          </div>
        )
      ) : (
        <pre className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-[11px] leading-relaxed text-slate-200">
          <code>{result.code}</code>
        </pre>
      )}
      {copyError && (
        <div className="mt-2 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100">
          {copyError}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Paste into <span className="font-mono text-violet-300">StarterPlayer › StarterPlayerScripts</span> as a LocalScript and press Play.
      </p>
    </div>
  );
}

const PREVIEW_DEVICES = [
  { id: "desktop", label: "Desktop", w: 1280, h: 720, icon: Monitor },
  { id: "tablet", label: "Tablet", w: 1024, h: 768, icon: Tablet },
  { id: "phone", label: "Phone", w: 844, h: 390, icon: Smartphone },
] as const;

// The generated LocalScript builds a fixed 1280x720 canvas that is centered and
// uniformly scaled to the viewport. object-contain inside a device-aspect box
// reproduces that exactly, so this preview matches Roblox pixel for pixel.
function UiPreview({ src, prompt, kindLabel }: { src: string; prompt: string; kindLabel: string }) {
  const [deviceId, setDeviceId] = useState<string>("desktop");
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const device = PREVIEW_DEVICES.find((d) => d.id === deviceId) ?? PREVIEW_DEVICES[0];

  const stage = (
    <div className="overflow-auto">
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/50"
        style={{
          width: `${Math.round(100 * zoom)}%`,
          aspectRatio: `${device.w} / ${device.h}`,
          background: "linear-gradient(180deg,#1b2b4a 0%,#0e1730 55%,#070b16 100%)",
        }}
      >
        <img src={src} alt={`Roblox ${kindLabel} preview for ${prompt}`} className="absolute inset-0 h-full w-full object-contain" />
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold text-white/75">
          {device.label} {device.w}x{device.h} - canvas {UI_CANVAS_WIDTH}x{UI_CANVAS_HEIGHT}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/55 px-3 py-2 text-[11px] font-bold text-white">
        <div className="flex flex-wrap items-center gap-1.5">
          {PREVIEW_DEVICES.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                onClick={() => setDeviceId(d.id)}
                title={`${d.label} ${d.w}x${d.h}`}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${deviceId === d.id ? "bg-cyan-400/20 text-cyan-100" : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.12]"}`}
              >
                <Icon className="h-3 w-3" /> {d.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))} title="Zoom out" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="tabular-nums text-slate-300">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} title="Zoom in" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
            <ZoomIn className="h-3 w-3" />
          </button>
          <button onClick={() => setFull(true)} title="Fullscreen preview" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
            <Maximize2 className="h-3 w-3" /> Full
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
            <ExternalLink className="h-3 w-3" /> Open
          </a>
          <a href={src} download={safeFileName(prompt, "svg")} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 hover:bg-white/[0.12]">
            <Download className="h-3 w-3" /> Image
          </a>
        </div>
      </div>
      <div className="p-3">{stage}</div>
      {full && (
        <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-black/92 p-4 backdrop-blur-sm" role="dialog">
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-cyan-200" /> {kindLabel} - {device.label} {device.w}x{device.h}</span>
            <button onClick={() => setFull(false)} className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">Close</button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div
              className="relative max-h-full w-full overflow-hidden rounded-xl border border-white/10"
              style={{ aspectRatio: `${device.w} / ${device.h}`, maxWidth: "min(1680px, 96vw)", background: "linear-gradient(180deg,#1b2b4a 0%,#0e1730 55%,#070b16 100%)" }}
            >
              <img src={src} alt={`Roblox ${kindLabel} fullscreen preview`} className="absolute inset-0 h-full w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
