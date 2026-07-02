import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Loader2, RefreshCcw, ScrollText, CheckCircle2, Circle, Send } from "lucide-react";
import { generateRoadmap, getRoadmap, toggleMilestone, getAutoChangelog } from "@/lib/project-manager.functions";


type Milestone = { id: string; title: string; detail: string; prompt: string; done: boolean };

export function ProjectManagerCard({ projectId }: { projectId: string }) {
  const fetchRoadmap = useServerFn(getRoadmap);
  const fetchChangelog = useServerFn(getAutoChangelog);
  const generate = useServerFn(generateRoadmap);
  const toggle = useServerFn(toggleMilestone);
  

  const [tab, setTab] = useState<"roadmap" | "changelog">("roadmap");
  const [roadmap, setRoadmap] = useState<{ milestones: Milestone[]; total: number; done: number; percent: number }>({ milestones: [], total: 0, done: 0, percent: 0 });
  const [changelog, setChangelog] = useState<Array<{ id: string; ts: string; kind: string; label: string; detail?: string }>>([]);
  const [busy, setBusy] = useState<"none" | "load" | "gen" | "send">("none");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy("load");
    setErr(null);
    try {
      const [r, c] = await Promise.all([
        fetchRoadmap({ data: { projectId } }),
        fetchChangelog({ data: { projectId } }),
      ]);
      setRoadmap(r);
      setChangelog(c.entries);
    } catch (e: any) {
      setErr(e?.message || "Could not load project data.");
    } finally {
      setBusy("none");
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function onGenerate() {
    setBusy("gen");
    setErr(null);
    try {
      const res = await generate({ data: { projectId } });
      setRoadmap({ milestones: res.milestones, total: res.milestones.length, done: 0, percent: 0 });
    } catch (e: any) {
      setErr(e?.message || "Could not generate roadmap.");
    } finally {
      setBusy("none");
    }
  }

  async function onToggle(m: Milestone) {
    try {
      await toggle({ data: { projectId, milestoneId: m.id, done: !m.done } });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not update milestone.");
    }
  }

  async function buildMilestone(m: Milestone) {
    setBusy("send");
    setErr(null);
    try {
      await navigator.clipboard.writeText(m.prompt);
      window.dispatchEvent(new CustomEvent("bs:prefill-chat", { detail: { text: m.prompt } }));
    } catch (e: any) {
      setErr(e?.message || "Could not copy prompt.");
    } finally {
      setBusy("none");
    }
  }


  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">AI Project Manager</div>
        <button onClick={load} className="rounded-md p-1 hover:bg-white/5" title="Refresh">
          {busy === "load" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
        </button>
      </div>

      <div className="mt-2 flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
        {(["roadmap", "changelog"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="flex-1 rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition"
            style={tab === t ? { background: "var(--bs-primary)", color: "var(--bs-on-primary)" } : { color: "var(--bs-muted-fg)" }}>
            {t === "roadmap" ? <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" />Roadmap</span> : <span className="inline-flex items-center gap-1"><ScrollText className="h-3 w-3" />Changelog</span>}
          </button>
        ))}
      </div>

      {err && <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{err}</div>}

      {tab === "roadmap" && (
        <div className="mt-3 space-y-2">
          {roadmap.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
                <span>{roadmap.done}/{roadmap.total} done</span>
                <span>{roadmap.percent}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${roadmap.percent}%`, background: "var(--bs-primary)" }} />
              </div>
            </div>
          )}
          {roadmap.milestones.length === 0 && (
            <div className="rounded-xl border border-dashed p-3 text-center text-[11px]" style={{ borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)" }}>
              No roadmap yet. The AI will plan 6–10 milestones from your project prompt.
            </div>
          )}
          {roadmap.milestones.map((m) => (
            <div key={m.id} className="rounded-xl border p-2" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              <div className="flex items-start gap-2">
                <button onClick={() => onToggle(m)} className="mt-0.5">
                  {m.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4" style={{ color: "var(--bs-muted-fg)" }} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold ${m.done ? "line-through opacity-60" : ""}`}>{m.title}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{m.detail}</div>
                  <button onClick={() => buildMilestone(m)} disabled={busy === "send"}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold hover:opacity-90 disabled:opacity-50"
                    style={{ borderColor: "var(--bs-border)" }}>
                    <Send className="h-2.5 w-2.5" /> Copy build prompt
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={onGenerate} disabled={busy !== "none"}
            className="w-full rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--bs-primary)", color: "var(--bs-on-primary)" }}>
            {busy === "gen" ? "Planning…" : roadmap.total > 0 ? "Regenerate Roadmap" : "Generate AI Roadmap"}
          </button>
        </div>
      )}

      {tab === "changelog" && (
        <div className="mt-3 space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {changelog.length === 0 && (
            <div className="rounded-xl border border-dashed p-3 text-center text-[11px]" style={{ borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)" }}>
              No activity yet. Once you build, every action will show here.
            </div>
          )}
          {changelog.map((e) => (
            <div key={e.id} className="rounded-lg border p-2" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
                <span className="font-mono">{e.kind}</span>
                <span>{new Date(e.ts).toLocaleString()}</span>
              </div>
              <div className="text-[11px]">{e.label}</div>
              {e.detail && <div className="text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>{e.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
