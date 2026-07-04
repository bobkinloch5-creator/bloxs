import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateQaReport, listQaReports } from "@/lib/qa-report.functions";
import { listProjectAssets, saveProjectAsset, deleteProjectAsset } from "@/lib/project-assets.functions";
import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";
import {
  ShieldCheck, Loader2, Sparkles, AlertTriangle, CheckCircle2, ImageIcon, X, Download, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { supabase } from "@/integrations/supabase/client";
import logoPreview from "@/assets/visual-presets/logo.png";
import thumbnailPreview from "@/assets/visual-presets/thumbnail.jpg";
import iconPreview from "@/assets/visual-presets/icon.jpg";
import loadingPreview from "@/assets/visual-presets/loading.jpg";
import skyboxPreview from "@/assets/visual-presets/skybox.jpg";
import npcPreview from "@/assets/visual-presets/npc.jpg";
import badgePreview from "@/assets/visual-presets/badge.png";

export function QaAndVisualsCard({ projectId, projectName, gameType }: { projectId: string; projectName: string; gameType: string }) {
  const [tab, setTab] = useState<"qa" | "visuals">("qa");
  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-white/10">
        {([["qa", ShieldCheck, "Quality Report"], ["visuals", ImageIcon, "Visuals"]] as const).map(([k, Icon, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition ${
              tab === k ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === "qa" && <QaTab projectId={projectId} />}
        {tab === "visuals" && <VisualsTab projectId={projectId} projectName={projectName} gameType={gameType} />}
      </div>
    </div>
  );
}

/* ───────────── QA Report ───────────── */

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-yellow-400";
  if (s >= 40) return "text-orange-400";
  return "text-red-400";
}
function scoreBg(s: number) {
  if (s >= 80) return "from-emerald-500/30 to-emerald-500/5";
  if (s >= 60) return "from-yellow-500/30 to-yellow-500/5";
  if (s >= 40) return "from-orange-500/30 to-orange-500/5";
  return "from-red-500/30 to-red-500/5";
}

function QaTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listQaReports);
  const runFn = useServerFn(generateQaReport);
  const key = ["qa-reports", projectId];
  const { data: reports = [] } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { project_id: projectId, limit: 5 } }) });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { project_id: projectId } }),
    onSuccess: () => { toast.success("QA report ready"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const latest = reports[0];

  return (
    <div className="space-y-3">
      <button
        onClick={() => runMut.mutate()}
        disabled={runMut.isPending}
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {runMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing project…</> : <><Sparkles className="h-4 w-4" /> Run AI Quality Report</>}
      </button>

      {!latest && !runMut.isPending && (
        <div className="text-xs text-center text-muted-foreground py-4">
          No reports yet. Click above to score performance, bugs, security, mobile & UI.
        </div>
      )}

      {latest && (
        <div className="space-y-3">
          <div className={`rounded-xl border border-white/10 bg-gradient-to-br ${scoreBg(latest.overall_score)} p-4`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall</div>
            <div className={`text-4xl font-extrabold tabular-nums ${scoreColor(latest.overall_score)}`}>{latest.overall_score}<span className="text-sm text-muted-foreground">/100</span></div>
            <div className="text-[10px] text-muted-foreground mt-1">{new Date(latest.created_at).toLocaleString()}</div>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {["performance", "bugs", "security", "mobile", "ui"].map((k) => {
              const v = Number(latest.scores?.[k] ?? 0);
              return (
                <div key={k} className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
                  <div className={`text-base font-bold tabular-nums ${scoreColor(v)}`}>{v}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                </div>
              );
            })}
          </div>

          {Array.isArray(latest.issues) && latest.issues.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">Issues</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {latest.issues.map((it: any, i: number) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <AlertTriangle className={`h-3.5 w-3.5 ${it.severity === "high" ? "text-red-400" : it.severity === "medium" ? "text-yellow-400" : "text-muted-foreground"}`} />
                      <span className="font-semibold">{it.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{it.area}</span>
                    </div>
                    {it.detail && <div className="text-xs text-muted-foreground mt-1">{it.detail}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(latest.recommendations) && latest.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">Recommendations</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {latest.recommendations.map((r: any, i: number) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-semibold">{r.title}</span>
                      {r.auto_fixable && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300">auto-fixable</span>}
                    </div>
                    {r.detail && <div className="text-xs text-muted-foreground mt-1">{r.detail}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {reports.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Previous reports ({reports.length - 1})</summary>
              <div className="mt-2 space-y-1">
                {reports.slice(1).map((r: any) => (
                  <div key={r.id} className="flex justify-between rounded bg-white/5 px-2 py-1">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    <span className={`tabular-nums font-bold ${scoreColor(r.overall_score)}`}>{r.overall_score}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Visuals ───────────── */

const VISUAL_PRESETS = [
  { kind: "logo",           label: "Logo",         hint: "transparent, bold, central icon",          preview: logoPreview,      aspect: "square", tint: "from-fuchsia-500/30 to-violet-500/10" },
  { kind: "thumbnail",      label: "Thumbnail",    hint: "16:9 epic Roblox-style cover art",          preview: thumbnailPreview, aspect: "wide",   tint: "from-rose-500/30 to-orange-500/10" },
  { kind: "icon",           label: "App Icon",     hint: "square 1024x1024 app-icon style",           preview: iconPreview,      aspect: "square", tint: "from-sky-500/30 to-blue-500/10" },
  { kind: "loading_screen", label: "Loading",      hint: "16:9 atmospheric loading background",       preview: loadingPreview,   aspect: "wide",   tint: "from-amber-500/30 to-red-500/10" },
  { kind: "skybox",         label: "Skybox",       hint: "panoramic painted sky",                     preview: skyboxPreview,    aspect: "wide",   tint: "from-pink-500/30 to-purple-500/10" },
  { kind: "npc_portrait",   label: "NPC",          hint: "character bust, neutral pose",              preview: npcPreview,       aspect: "square", tint: "from-emerald-500/30 to-teal-500/10" },
  { kind: "badge",          label: "Badge",        hint: "achievement medal, transparent",            preview: badgePreview,     aspect: "square", tint: "from-yellow-500/30 to-orange-500/10" },
] as const;

function VisualsTab({ projectId, projectName, gameType }: { projectId: string; projectName: string; gameType: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectAssets);
  const saveFn = useServerFn(saveProjectAsset);
  const delFn = useServerFn(deleteProjectAsset);
  const key = ["proj-assets", projectId];
  const { data: assets = [] } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { project_id: projectId } }) });

  const [kind, setKind] = useState<typeof VISUAL_PRESETS[number]["kind"]>("logo");
  const [extra, setExtra] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const preset = VISUAL_PRESETS.find((p) => p.kind === kind)!;
  const buildPrompt = () => {
    const base = `Roblox game "${projectName}" (${gameType}). ${preset.label} art: ${preset.hint}.`;
    const flavor = extra.trim() ? ` Style notes: ${extra.trim()}.` : "";
    return `${base}${flavor} Clean, high-quality, game-asset suitable.`;
  };
  const sizeFor = (k: string) =>
    k === "thumbnail" || k === "loading_screen" ? "1536x1024"
    : k === "skybox" ? "1536x1024"
    : "1024x1024";

  async function generate() {
    setGenerating(true);
    setPreviewDataUrl(null);
    setIsFinal(false);
    setErrMsg(null);
    const prompt = buildPrompt();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to generate images.");
      const res = await fetch("/api/visuals/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt, size: sizeFor(kind) }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`${res.status}: ${await res.text().catch(() => "failed")}`);
      }
      let finalUrl: string | null = null;
      const parser = createParser({
        onEvent(ev) {
          let payload: any = null;
          try { payload = JSON.parse(ev.data); } catch {}
          if (ev.event === "error" || payload?.type === "error") {
            setErrMsg(payload?.error?.message || "Image generation failed");
            return;
          }
          if (
            ev.event === "image_generation.partial_image" ||
            ev.event === "image_generation.completed"
          ) {
            const final = ev.event === "image_generation.completed";
            const mediaType = typeof payload?.media_type === "string" ? payload.media_type : "image/png";
            const url = `data:${mediaType};base64,${payload.b64_json}`;
            flushSync(() => { setPreviewDataUrl(url); if (final) setIsFinal(true); });
            if (final) finalUrl = url;
          }
        },
      });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
      if (finalUrl) {
        try {
          await saveFn({ data: { project_id: projectId, kind, prompt, data_url: finalUrl } });
          qc.invalidateQueries({ queryKey: key });
          toast.success(`${preset.label} saved`);
        } catch (e) { toast.error(friendlyError(e)); }
      }
    } catch (e: any) {
      setErrMsg(e?.message || "failed");
      toast.error(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const filtered = assets;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {VISUAL_PRESETS.map((p) => {
          const active = kind === p.kind;
          return (
            <button
              key={p.kind}
              onClick={() => setKind(p.kind)}
              className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                active
                  ? "border-violet-400 ring-2 ring-violet-400/40 shadow-lg shadow-violet-500/20"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <div className={`relative ${p.aspect === "wide" ? "aspect-[16/9]" : "aspect-square"} overflow-hidden bg-gradient-to-br ${p.tint}`}>
                <img
                  src={p.preview}
                  alt={`${p.label} preset preview`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-white drop-shadow">{p.label}</div>
                    {active && (
                      <div className="rounded-full bg-violet-500 p-0.5">
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="text-[9px] text-white/70 truncate">{p.hint}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <input
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="Style notes (optional) — e.g. low poly, anime, neon"
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30 transition"
      />
      <button
        onClick={generate}
        disabled={generating}
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
      >
        {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating {preset.label}…</> : <><Wand2 className="h-4 w-4" /> Generate {preset.label}</>}
      </button>

      {errMsg && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{errMsg}</div>}

      {previewDataUrl && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-2">
          <img
            src={previewDataUrl}
            alt="preview"
            className={`w-full rounded-lg transition-[filter] duration-300 ${isFinal ? "" : "blur-xl"}`}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">Saved visuals ({filtered.length})</div>
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {filtered.map((a: any) => (
              <div key={a.id} className="group relative rounded-lg overflow-hidden border border-white/10 bg-white/5">
                <img src={a.data_url} alt={a.kind} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white">{a.kind.replace("_", " ")}</div>
                  <div className="flex gap-1">
                    <a href={a.data_url} download={`${a.kind}.png`} className="flex-1 text-[10px] rounded bg-white/20 hover:bg-white/30 text-white px-2 py-1 flex items-center justify-center gap-1">
                      <Download className="h-3 w-3" /> Save
                    </a>
                    <button
                      onClick={() => delFn({ data: { asset_id: a.id } }).then(() => qc.invalidateQueries({ queryKey: key }))}
                      className="text-[10px] rounded bg-red-500/30 hover:bg-red-500/50 text-white px-2 py-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
