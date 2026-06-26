import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { LayoutDashboard, Wand2, Send, Loader2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/ui-generator")({
  head: () => ({ meta: [
    { title: "UI Generator — BloxSmith" },
    { name: "description", content: "Generate Roblox UI screens from a prompt." },
  ]}),
  component: UiGenerator,
});

const STYLES = ["Modern", "Cartoon", "Sci-Fi", "Retro", "Minimal", "Neon", "Cute", "Dark"];

type Generated = { id: string; prompt: string; style: string; createdAt: number };

function UiGenerator() {
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Modern");
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [busy, setBusy] = useState(false);

  function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    // local "draft" record for now — real Studio push lands in a later turn
    setTimeout(() => {
      setGenerated((g) => [{ id: crypto.randomUUID(), prompt: prompt.trim(), style, createdAt: Date.now() }, ...g]);
      setPrompt("");
      setBusy(false);
    }, 600);
  }

  return (
    <PageShell
      title="UI Generator"
      description="Design Roblox UI screens — shop, inventory, leaderboards, settings — from a single prompt."
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
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Generate
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
      </section>

      {generated.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No UI generated yet"
          description="Describe a Roblox screen above and hit Generate. Your designs will appear here, ready to push to Studio."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {generated.map((g) => (
            <div key={g.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
              <div className="aspect-video rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 p-4">
                <div className="grid h-full place-items-center text-xs font-semibold text-violet-100/80">
                  <Wand2 className="h-8 w-8 opacity-60" />
                </div>
              </div>
              <div className="mt-3 truncate text-sm font-bold">{g.prompt}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{g.style}</span>
                <span>{new Date(g.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
