import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProject } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import {
  getModelStatus,
  startModelGeneration,
  pollModelGeneration,
  animateModel,
  ANIMATION_PRESETS,
} from "@/lib/models3d.functions";
import { PageShell } from "@/components/PageShell";
import { Box, Loader2, Sparkles, Image as ImageIcon, Type, Timer, Download, ExternalLink, AlertCircle, CheckCircle2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/models/$projectId")({
  head: () => ({ meta: [{ title: "3D Models — BloxSmith" }] }),
  component: ModelsPage,
});

// Load Google's <model-viewer> web component once
function useModelViewerScript() {
  useEffect(() => {
    if (document.querySelector('script[data-mv="1"]')) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    s.setAttribute("data-mv", "1");
    document.head.appendChild(s);
  }, []);
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "Ready";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ModelsPage() {
  useModelViewerScript();
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const profileFn = useServerFn(getMyProfile);
  const statusFn = useServerFn(getModelStatus);
  const startFn = useServerFn(startModelGeneration);
  const pollFn = useServerFn(pollModelGeneration);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => projectFn({ data: { id: projectId } }) });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["models3d", projectId],
    queryFn: () => statusFn({ data: { projectId } }),
    refetchInterval: 15_000,
  });

  const [mode, setMode] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [artStyle, setArtStyle] = useState<"realistic" | "sculpture">("realistic");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 1s ticker for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = useMemo(() => {
    if (!status) return 0;
    return Math.max(0, status.remainingMs - (Date.now() - now > 0 ? 0 : 0) - (now - (Date.now() - (status.cooldownMs - status.remainingMs))));
  }, [status, now]);

  // Simpler & correct countdown: derive from nextAvailableAt
  const liveRemaining = useMemo(() => {
    if (!status?.nextAvailableAt) return 0;
    return Math.max(0, new Date(status.nextAvailableAt).getTime() - now);
  }, [status?.nextAvailableAt, now]);

  // Poll any in-progress generations every 5s
  useEffect(() => {
    if (!status?.models) return;
    const pending = status.models.filter((m: any) => m.status !== "SUCCEEDED" && m.status !== "FAILED");
    if (pending.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(pending.map((m: any) => pollFn({ data: { generationId: m.id } }).catch(() => null)));
      qc.invalidateQueries({ queryKey: ["models3d", projectId] });
    }, 5000);
    return () => clearInterval(id);
  }, [status?.models, pollFn, qc, projectId]);

  async function handleFile(file: File) {
    if (file.size > 6 * 1024 * 1024) {
      setErr("Image must be under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function onGenerate() {
    setErr(null);
    setBusy(true);
    try {
      await startFn({ data: { projectId, mode, prompt: prompt.trim() || undefined, imageUrl: imageUrl || undefined, artStyle } });
      setPrompt("");
      setImageUrl("");
      await refetchStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start generation.");
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = !!status?.canGenerate && !busy;

  return (
    <PageShell
      title="3D Models"
      description={project ? `Generate 3D models for "${project.name}". One free model every 24 hours.` : "Generate 3D models for your Roblox project."}
      accent="chat"
      activeKey="chat"
      isAdmin={!!profile?.is_admin}
      actions={
        <Link to="/project/$projectId" params={{ projectId }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.08]">
          ← Back to project
        </Link>
      }
    >
      {/* Cooldown banner */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-transparent to-blue-500/10 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-300">Generation limit</div>
              <div className="text-sm text-muted-foreground">1 model every 24 hours.</div>
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 text-center font-mono text-lg font-bold ${canGenerate ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
            {canGenerate ? "Ready to generate" : `Next in ${formatRemaining(liveRemaining)}`}
          </div>
        </div>
      </section>

      {/* Generator */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("text")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "text" ? "bg-violet-500/20 text-violet-200 border border-violet-400/40" : "bg-white/[0.04] text-muted-foreground border border-white/10"}`}
          >
            <Type className="h-3.5 w-3.5" /> Text → 3D
          </button>
          <button
            onClick={() => setMode("image")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "image" ? "bg-blue-500/20 text-blue-200 border border-blue-400/40" : "bg-white/[0.04] text-muted-foreground border border-white/10"}`}
          >
            <ImageIcon className="h-3.5 w-3.5" /> Image → 3D
          </button>
        </div>

        {mode === "text" ? (
          <div className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A low-poly stylized treasure chest with gold trim"
              className="w-full min-h-[100px] resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-violet-400/60"
              maxLength={600}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Art style:</span>
              {(["realistic", "sculpture"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setArtStyle(s)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${artStyle === s ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-muted-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={imageUrl.startsWith("data:") ? "" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste a public image URL (https://…)"
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-400/60"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.08]"
              >
                <ImageIcon className="h-3.5 w-3.5" /> Upload image (≤6 MB)
              </button>
              {imageUrl && (
                <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Image ready
                </span>
              )}
            </div>
            {imageUrl && (
              <img src={imageUrl} alt="preview" className="max-h-40 rounded-lg border border-white/10" />
            )}
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {err}
          </div>
        )}

        <button
          disabled={!canGenerate}
          onClick={onGenerate}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Starting…" : canGenerate ? "Generate 3D model" : `Wait ${formatRemaining(liveRemaining)}`}
        </button>
      </section>

      {/* Gallery */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Your models</h2>
        {!status?.models?.length ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            <Box className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No 3D models yet — generate your first one above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {status.models.map((m: any) => (
              <ModelCard key={m.id} m={m} projectId={projectId} onChange={() => qc.invalidateQueries({ queryKey: ["models3d", projectId] })} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function ModelCard({ m, projectId, onChange }: { m: any; projectId: string; onChange: () => void }) {
  const animateFn = useServerFn(animateModel);
  const [animBusy, setAnimBusy] = useState(false);
  const [animErr, setAnimErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const done = m.status === "SUCCEEDED" && m.model_url;
  const failed = m.status === "FAILED";
  const isAnimation = m.mode === "animation";

  async function runAnimate(anim: string) {
    setAnimBusy(true);
    setAnimErr(null);
    try {
      await animateFn({ data: { projectId, sourceId: m.id, animation: anim as any } });
      setPicking(false);
      onChange();
    } catch (e) {
      setAnimErr(e instanceof Error ? e.message : "Failed to start animation.");
    } finally {
      setAnimBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="aspect-square bg-black/40 relative">
        {done ? (
          // @ts-expect-error - web component
          <model-viewer
            src={m.model_url}
            camera-controls
            auto-rotate={!isAnimation}
            autoplay={isAnimation}
            ar
            style={{ width: "100%", height: "100%", background: "transparent" }}
          />
        ) : m.thumbnail_url ? (
          <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover opacity-70" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {failed ? <AlertCircle className="h-8 w-8 text-rose-400" /> : <Loader2 className="h-8 w-8 animate-spin" />}
          </div>
        )}
        {isAnimation && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-fuchsia-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-100 backdrop-blur">
            <PlayCircle className="h-3 w-3" /> {m.animation_name ?? "animation"}
          </span>
        )}
        {!done && !failed && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2">
            <div className="flex items-center justify-between text-[10px] font-semibold text-white">
              <span>{m.status}</span><span>{m.progress ?? 0}%</span>
            </div>
            <div className="mt-1 h-1 rounded bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-400 to-blue-400" style={{ width: `${m.progress ?? 0}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">
          {m.prompt || (m.mode === "image" ? "Image → 3D" : "Untitled")}
        </div>
        {failed && m.error && <div className="text-[11px] text-rose-300">{m.error}</div>}
        {animErr && <div className="text-[11px] text-rose-300">{animErr}</div>}
        {done && (
          <div className="flex flex-wrap items-center gap-2">
            <a href={m.model_url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] px-2.5 py-1.5 text-[11px] font-semibold text-white">
              <Download className="h-3 w-3" /> GLB
            </a>
            <a href={m.model_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] px-2.5 py-1.5 text-[11px] font-semibold text-white">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
            {!isAnimation && (
              <div className="relative">
                <button
                  onClick={() => setPicking((v) => !v)}
                  disabled={animBusy}
                  className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-200 disabled:opacity-50"
                >
                  {animBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                  Animate
                </button>
                {picking && !animBusy && (
                  <div className="absolute z-10 mt-1 right-0 w-36 rounded-lg border border-white/10 bg-black/90 backdrop-blur p-1 shadow-xl">
                    {ANIMATION_PRESETS.map((a) => (
                      <button
                        key={a}
                        onClick={() => runAnimate(a)}
                        className="block w-full text-left rounded px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 capitalize"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

