import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { generateRobloxUi } from "@/lib/ui-generator.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { LayoutDashboard, Send, Loader2, Copy, Check, AlertTriangle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/ui-generator")({
  head: () => ({ meta: [
    { title: "UI Generator — BloxSmith" },
    { name: "description", content: "Generate complete, ready-to-paste Roblox ScreenGui Luau scripts from a prompt." },
  ]}),
  component: UiGenerator,
});

const STYLES = ["Modern", "Cartoon", "Sci-Fi", "Retro", "Minimal", "Neon", "Cute", "Dark"];
const EXAMPLES = [
  "Shop with 6 item cards, coin balance in the top-right, and a Buy button on each card",
  "Battle pass screen with tier track, locked/unlocked rewards, claim button, and progress bar",
  "Inventory grid 4x5 with item rarity borders, item count badge, and equip/unequip buttons",
  "Pause menu with Resume, Settings, How To Play, and Quit, all with hover animations",
];

type Generated = { id: string; prompt: string; style: string; code: string; createdAt: number };

function UiGenerator() {
  const profFn = useServerFn(getMyProfile);
  const genFn = useServerFn(generateRobloxUi);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Modern");
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const gen = useMutation({
    mutationFn: async (vars: { prompt: string; style: string }) =>
      genFn({ data: vars }),
    onSuccess: (out, vars) => {
      setGenerated((g) => [
        { id: crypto.randomUUID(), prompt: vars.prompt, style: vars.style, code: out.code, createdAt: Date.now() },
        ...g,
      ]);
      setPrompt("");
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "Generation failed. Try a different prompt or model."),
  });

  function generate(p?: string) {
    const value = (p ?? prompt).trim();
    if (!value || gen.isPending) return;
    gen.mutate({ prompt: value, style });
  }

  return (
    <PageShell
      title="UI Generator"
      description="Describe a Roblox screen. Get a complete Luau ScreenGui script you can paste straight into StarterPlayerScripts."
      accent="ui"
      activeKey="ui"
      isAdmin={!!profile?.is_admin}
    >
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-6 backdrop-blur-sm">
        <label className="text-xs font-semibold uppercase tracking-wider text-violet-300">Describe the UI</label>
        <div className="mt-2 flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Generate
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                style === s ? "bg-violet-500/25 text-violet-200" : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
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
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/[0.07]"
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
      </section>

      {generated.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No UI generated yet"
          description="Describe a Roblox screen above and hit Generate. The full Luau script appears here, ready to paste into a LocalScript."
        />
      ) : (
        <div className="space-y-4">
          {generated.map((g) => (
            <ResultCard key={g.id} result={g} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ResultCard({ result }: { result: Generated }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-100">{result.prompt}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {result.style} · {new Date(result.createdAt).toLocaleTimeString()}
          </div>
        </div>
        <button
          onClick={async () => {
            try { await navigator.clipboard.writeText(result.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy Luau"}
        </button>
      </div>
      <pre className="mt-3 max-h-[400px] overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-[11px] leading-relaxed text-slate-200">
        <code>{result.code}</code>
      </pre>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Paste into <span className="font-mono text-violet-300">StarterPlayer › StarterPlayerScripts</span> as a LocalScript and press Play.
      </p>
    </div>
  );
}
