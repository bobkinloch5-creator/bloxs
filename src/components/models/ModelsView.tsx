import { Link } from "@tanstack/react-router";
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
  retextureModel,
  registerTripoBridgeModel,
  uploadBridgeModelToRoblox,
  checkRobloxUploadOperation,
  queueBridgeModelToStudio,
  deleteModelGeneration,
  ANIMATION_PRESETS,
} from "@/lib/models3d.functions";
import { PageShell } from "@/components/PageShell";
import { Box, Loader2, Sparkles, Image as ImageIcon, Type, Timer, Download, ExternalLink, AlertCircle, CheckCircle2, PlayCircle, Palette, Maximize2, UploadCloud, Plug, Link as LinkIcon, ShieldCheck, RefreshCw, Trash2, X } from "lucide-react";

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

const EXPORT_FORMATS: { key: string; label: string; ext: string }[] = [
  { key: "glb", label: "GLB", ext: "glb" },
  { key: "fbx", label: "FBX", ext: "fbx" },
  { key: "obj", label: "OBJ", ext: "obj" },
  { key: "usdz", label: "USDZ", ext: "usdz" },
  { key: "stl", label: "STL", ext: "stl" },
  { key: "blend", label: "BLEND", ext: "blend" },
  { key: "mtl", label: "MTL", ext: "mtl" },
];

const BRIDGE_FORMATS = ["glb", "gltf", "fbx", "rbxm", "rbxmx"] as const;

const STYLE_PRESETS: { key: string; label: string; modifier: string }[] = [
  { key: "roblox", label: "Roblox-style", modifier: "stylized blocky Roblox-style low-poly game asset, flat shading, clean topology" },
  { key: "lowpoly", label: "Low-poly", modifier: "low-poly geometric, faceted surfaces, minimal triangles, stylized game-ready" },
  { key: "cartoon", label: "Cartoon", modifier: "cartoon, exaggerated proportions, bold colors, hand-painted textures" },
  { key: "cute", label: "Cute / Chibi", modifier: "cute chibi style, soft rounded shapes, pastel colors, oversized head" },
  { key: "realistic", label: "Realistic", modifier: "photorealistic, PBR materials, fine surface detail, studio lighting" },
  { key: "fantasy", label: "Fantasy", modifier: "high-fantasy ornate, glowing runes, intricate filigree, magical aura" },
  { key: "medieval", label: "Medieval", modifier: "medieval craftsmanship, worn metal and stone, leather straps, rustic" },
  { key: "scifi", label: "Sci-Fi", modifier: "sci-fi futuristic, brushed metal panels, glowing accents, hi-tech greebles" },
  { key: "modern", label: "Modern", modifier: "modern minimalist, clean surfaces, matte finish, neutral palette" },
  { key: "horror", label: "Horror", modifier: "horror, decayed, blood-stained, eerie, desaturated, distressed surfaces" },
  { key: "simulator", label: "Simulator", modifier: "bright candy-colored simulator game asset, smooth surfaces, oversized appeal" },
  { key: "rpg", label: "RPG", modifier: "RPG hero-grade prop, ornate detail, rich materials, level-3-rarity look" },
];

async function forceDownload(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function safeName(m: any, ext: string) {
  const base = (m.prompt || m.mode || "model").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "model";
  return `${base}-${String(m.id).slice(0, 6)}.${ext}`;
}

export function ModelsView({ projectId }: { projectId?: string }) {
  useModelViewerScript();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const profileFn = useServerFn(getMyProfile);
  const statusFn = useServerFn(getModelStatus);
  const startFn = useServerFn(startModelGeneration);
  const pollFn = useServerFn(pollModelGeneration);
  const registerBridgeFn = useServerFn(registerTripoBridgeModel);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectFn({ data: { id: projectId! } }),
    enabled: !!projectId,
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const queryKey = ["models3d", projectId ?? "all"] as const;
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey,
    queryFn: () => statusFn({ data: projectId ? { projectId } : {} }),
    refetchInterval: 15_000,
  });

  const [mode, setMode] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [artStyle, setArtStyle] = useState<"realistic" | "sculpture">("realistic");
  const [stylePreset, setStylePreset] = useState<string>("");
  const [topology, setTopology] = useState<"triangle" | "quad">("triangle");
  const [poly, setPoly] = useState(30000);
  const [busy, setBusy] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bridgeErr, setBridgeErr] = useState<string | null>(null);
  const [bridgeSource, setBridgeSource] = useState<"tripo_api" | "tripo_bridge" | "external_model">("tripo_bridge");
  const [bridgeName, setBridgeName] = useState("");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeFormat, setBridgeFormat] = useState<typeof BRIDGE_FORMATS[number]>("glb");
  const [bridgeAssetId, setBridgeAssetId] = useState("");
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveRemaining = useMemo(() => {
    if (!status?.nextAvailableAt) return 0;
    return Math.max(0, new Date(status.nextAvailableAt).getTime() - now);
  }, [status?.nextAvailableAt, now]);

  useEffect(() => {
    if (!status?.models) return;
    const pending = status.models.filter((m: any) => m.status !== "SUCCEEDED" && m.status !== "FAILED");
    if (pending.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(pending.map((m: any) => pollFn({ data: { generationId: m.id } }).catch(() => null)));
      qc.invalidateQueries({ queryKey });
    }, 5000);
    return () => clearInterval(id);
  }, [status?.models, pollFn, qc, projectId]);

  async function handleFile(file: File) {
    if (file.size > 6 * 1024 * 1024) { setErr("Image must be under 6 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function onGenerate() {
    setErr(null);
    setBusy(true);
    try {
      const basePrompt = prompt.trim();
      const styledPrompt = stylePreset && basePrompt
        ? `${basePrompt}, ${STYLE_PRESETS.find(s => s.key === stylePreset)?.modifier ?? ""}`
        : basePrompt;
      await startFn({ data: {
        projectId, mode,
        prompt: styledPrompt || undefined,
        negativePrompt: negativePrompt.trim() || undefined,
        imageUrl: imageUrl || undefined,
        artStyle, topology, targetPolycount: poly, autoRefine: true,
      } });
      setPrompt(""); setNegativePrompt(""); setImageUrl("");
      await refetchStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start generation.");
    } finally { setBusy(false); }
  }

  async function onRegisterBridgeModel() {
    setBridgeErr(null);
    setBridgeBusy(true);
    try {
      await registerBridgeFn({ data: {
        projectId,
        prompt: bridgeName.trim() || "Tripo DCC Bridge model",
        modelUrl: bridgeUrl.trim(),
        format: bridgeFormat,
        robloxAssetId: bridgeAssetId.trim() || undefined,
        source: bridgeSource,
      } });
      setBridgeName("");
      setBridgeUrl("");
      setBridgeAssetId("");
      await refetchStatus();
    } catch (e) {
      setBridgeErr(e instanceof Error ? e.message : "Could not register Tripo bridge model.");
    } finally {
      setBridgeBusy(false);
    }
  }

  const canGenerate = !!status?.canGenerate && !busy;

  return (
    <PageShell
      title="3D Models"
      description={projectId
        ? (project ? `Generate 3D models for "${project.name}". One free model every 24 hours.` : "Generate 3D models for your Roblox project.")
        : "Generate 3D models for any of your Roblox projects. One free model every 24 hours."}
      accent="chat"
      activeKey="models"
      isAdmin={!!profile?.is_admin}
      actions={projectId ? (
        <Link to="/project/$projectId" params={{ projectId }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.08]">
          ← Back to project
        </Link>
      ) : undefined}
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
              <div className="text-sm text-muted-foreground">1 brand-new model every 24 hours. Animations and re-textures are free.</div>
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 text-center font-mono text-lg font-bold ${canGenerate ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
            {canGenerate ? "Ready to generate" : `Next in ${formatRemaining(liveRemaining)}`}
          </div>
        </div>
      </section>

      {/* Tripo / DCC bridge */}
      <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-200">
              <Plug className="h-3.5 w-3.5" /> Tripo DCC Bridge + Roblox import
            </div>
            <h2 className="mt-3 text-lg font-bold text-white">BloxSmith Bridge workflow</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Use Tripo API credits or Tripo web/DCC credits, preview the GLB/FBX here, approve it, upload it to Roblox/Open Cloud, then send the confirmed Roblox asset ID to the Studio plugin.
            </p>
          </div>
          <div className="grid gap-1.5 text-[11px] text-cyan-100">
            {["Connected/Waiting", "Model Received", "Preview Ready", "Uploading", "Importing", "Inserted/Failed"].map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-md bg-black/30 px-2 py-1"><ShieldCheck className="h-3 w-3" /> {s}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["tripo_bridge", "DCC / web credits"],
                ["tripo_api", "Tripo API"],
                ["external_model", "External GLB/FBX"],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setBridgeSource(key)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${bridgeSource === key ? "bg-cyan-400/20 text-cyan-100 border border-cyan-300/40" : "bg-white/[0.04] text-muted-foreground border border-white/10"}`}>
                  {label}
                </button>
              ))}
            </div>
            <input value={bridgeName} onChange={(e) => setBridgeName(e.target.value)} placeholder="Model name, e.g. Tripo cyber sword" className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-cyan-300/60" maxLength={200} />
            <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
              <input value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="Paste GLB/FBX/RBXM/RBXMX URL from Tripo export or local bridge helper" className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-cyan-300/60" />
              <select value={bridgeFormat} onChange={(e) => setBridgeFormat(e.target.value as any)} className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white outline-none">
                {BRIDGE_FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <input value={bridgeAssetId} onChange={(e) => setBridgeAssetId(e.target.value)} placeholder="Optional Roblox model asset ID if already uploaded" className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-cyan-300/60" maxLength={80} />
            {bridgeErr && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 inline-flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {bridgeErr}</div>}
            <button disabled={bridgeBusy || !bridgeUrl.trim()} onClick={onRegisterBridgeModel} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed">
              {bridgeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />} Add Tripo model to preview
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-muted-foreground">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-cyan-200">Exactly how to use it</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Generate the model in Tripo Studio or through Tripo API.</li>
              <li>Export/download GLB or FBX. Keep the file under Roblox Open Cloud's 20 MB model upload limit.</li>
              <li>Make the file reachable by URL through your local bridge/helper export server, cloud storage, or Tripo result URL.</li>
              <li>Paste that URL here and click <span className="font-semibold text-white">Add Tripo model to preview</span>.</li>
              <li>Inspect the fullscreen 3D preview with drag, rotate, zoom, and pan.</li>
              <li>Click <span className="font-semibold text-white">Upload to Roblox</span> if Open Cloud is configured, or paste an existing Roblox asset ID.</li>
              <li>Click <span className="font-semibold text-white">Send to Studio</span>. The plugin inserts the real asset into <code>Workspace/BloxSmith_Imported_Models</code>.</li>
            </ol>
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-2 text-amber-100">
              Warnings show clearly for: Tripo/API credits missing, local bridge not running, plugin offline, Open Cloud key missing, unsupported format, file over 20 MB, upload failure, or missing Roblox asset ID.
            </div>
          </div>
        </div>
      </section>

      {/* Generator */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setMode("text")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "text" ? "bg-violet-500/20 text-violet-200 border border-violet-400/40" : "bg-white/[0.04] text-muted-foreground border border-white/10"}`}>
            <Type className="h-3.5 w-3.5" /> Text → 3D
          </button>
          <button onClick={() => setMode("image")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "image" ? "bg-blue-500/20 text-blue-200 border border-blue-400/40" : "bg-white/[0.04] text-muted-foreground border border-white/10"}`}>
            <ImageIcon className="h-3.5 w-3.5" /> Image → 3D
          </button>
        </div>

        {mode === "text" ? (
          <div className="space-y-3">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A low-poly stylized treasure chest with gold trim" className="w-full min-h-[100px] resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-violet-400/60" maxLength={600} />
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Style preset (optional — appended to prompt)</div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setStylePreset("")} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${stylePreset === "" ? "bg-violet-500/25 text-violet-200 border border-violet-400/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"}`}>No preset</button>
                {STYLE_PRESETS.map((s) => (
                  <button key={s.key} onClick={() => setStylePreset(s.key)} title={s.modifier} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${stylePreset === s.key ? "bg-violet-500/25 text-violet-200 border border-violet-400/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"}`}>{s.label}</button>
                ))}
              </div>
            </div>
            <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Negative prompt (optional) — e.g. low quality, blurry" className="w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-xs text-white placeholder:text-muted-foreground outline-none focus:border-violet-400/60" maxLength={300} />
          </div>
        ) : (
          <div className="space-y-3">
            <input value={imageUrl.startsWith("data:") ? "" : imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste a public image URL (https://…)" className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-400/60" />
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.08]">
                <ImageIcon className="h-3.5 w-3.5" /> Upload image (≤6 MB)
              </button>
              {imageUrl && (<span className="text-xs text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Image ready</span>)}
            </div>
            {imageUrl && (<img src={imageUrl} alt="preview" className="max-h-40 rounded-lg border border-white/10" />)}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {mode === "text" && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Art style</div>
              <div className="flex gap-1.5">
                {(["realistic", "sculpture"] as const).map((s) => (
                  <button key={s} onClick={() => setArtStyle(s)} className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize ${artStyle === s ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-muted-foreground"}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Topology</div>
            <div className="flex gap-1.5">
              {(["triangle", "quad"] as const).map((t) => (
                <button key={t} onClick={() => setTopology(t)} className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize ${topology === t ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-muted-foreground"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Target polycount: {poly.toLocaleString()}</div>
            <input type="range" min={5000} max={100000} step={5000} value={poly} onChange={(e) => setPoly(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        {err && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {err}
          </div>
        )}

        <button disabled={!canGenerate} onClick={onGenerate} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Starting…" : canGenerate ? "Generate 3D model" : `Wait ${formatRemaining(liveRemaining)}`}
        </button>
        <p className="text-[11px] text-muted-foreground">Auto-refine is on — once the preview finishes, BloxSmith automatically queues a high-detail refined version with full PBR textures.</p>
      </section>

      {/* Gallery */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {projectId ? "Your models in this project" : "All your 3D models"}
        </h2>
        {!status?.models?.length ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            <Box className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No 3D models yet — generate your first one above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {status.models.map((m: any) => (
              <ModelCard key={m.id} m={m} projectId={projectId} onChange={() => qc.invalidateQueries({ queryKey })} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function ModelCard({ m, projectId, onChange }: { m: any; projectId?: string; onChange: () => void }) {
  const animateFn = useServerFn(animateModel);
  const retextureFn = useServerFn(retextureModel);
  const uploadRobloxFn = useServerFn(uploadBridgeModelToRoblox);
  const checkUploadFn = useServerFn(checkRobloxUploadOperation);
  const queueStudioFn = useServerFn(queueBridgeModelToStudio);
  const deleteFn = useServerFn(deleteModelGeneration);
  const [animBusy, setAnimBusy] = useState(false);
  const [robloxBusy, setRobloxBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | "anim" | "texture">(null);
  const [texPrompt, setTexPrompt] = useState("");
  const [texBusy, setTexBusy] = useState(false);

  const done = m.status === "SUCCEEDED" && m.model_url;
  const failed = m.status === "FAILED";
  const isAnimation = m.mode === "animation";
  const isTexture = m.mode === "texture";
  const isRefine = m.mode === "refine";
  const isBridgeModel = m.mode === "tripo_bridge" || m.mode === "tripo_api" || m.mode === "external_model" || !!m.source;
  const urls: Record<string, string> = m.model_urls || {};
  const viewerRef = useRef<HTMLElement | null>(null);

  async function goFullscreen() {
    const el = viewerRef.current as (HTMLElement & { requestFullscreen?: () => Promise<void> }) | null;
    if (!el) return;
    try { await el.requestFullscreen?.(); } catch { /* ignore */ }
  }
  async function runAnimate(anim: string) {
    setAnimBusy(true); setActionErr(null);
    try {
      await animateFn({ data: { projectId, sourceId: m.id, animation: anim as any } });
      setPicking(null); onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to start animation.");
    } finally { setAnimBusy(false); }
  }

  async function runRetexture() {
    if (texPrompt.trim().length < 3) { setActionErr("Describe the texture (3+ chars)."); return; }
    setTexBusy(true); setActionErr(null);
    try {
      await retextureFn({ data: { projectId, sourceId: m.id, texturePrompt: texPrompt.trim(), artStyle: "realistic" } });
      setPicking(null); setTexPrompt(""); onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to start re-texture.");
    } finally { setTexBusy(false); }
  }

  async function uploadToRoblox() {
    setRobloxBusy(true); setActionErr(null);
    try {
      await uploadRobloxFn({ data: { generationId: m.id, displayName: m.prompt || "BloxSmith Tripo Model" } });
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Upload failed.");
    } finally { setRobloxBusy(false); }
  }

  async function checkRobloxUpload() {
    setRobloxBusy(true); setActionErr(null);
    try {
      await checkUploadFn({ data: { generationId: m.id } });
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not check Roblox upload.");
    } finally { setRobloxBusy(false); }
  }

  async function sendToStudio() {
    if (!projectId) { setActionErr("Open this from a project before sending to Roblox Studio."); return; }
    setRobloxBusy(true); setActionErr(null);
    try {
      await queueStudioFn({ data: { projectId, generationId: m.id, name: m.prompt || "BloxSmith Imported Model", scale: 1 } });
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not send model to Studio.");
    } finally { setRobloxBusy(false); }
  }

  async function deleteModel() {
    setDeleteBusy(true); setActionErr(null);
    try {
      await deleteFn({ data: { generationId: m.id, deleteRelated: true } });
      setConfirmDelete(false);
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not delete this model.");
    } finally { setDeleteBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="aspect-square bg-black/40 relative">
        {done ? (
          // @ts-expect-error - web component
          <model-viewer ref={viewerRef} src={m.model_url} camera-controls auto-rotate={!isAnimation} autoplay={isAnimation} ar touch-action="pan-y" interaction-prompt="none" shadow-intensity="1" exposure="1" style={{ width: "100%", height: "100%", background: "transparent" }} />
        ) : m.thumbnail_url ? (
          <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover opacity-70" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {failed ? <AlertCircle className="h-8 w-8 text-rose-400" /> : <Loader2 className="h-8 w-8 animate-spin" />}
          </div>
        )}
        {(isAnimation || isTexture || isRefine) && (
          <span className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${isAnimation ? "bg-fuchsia-500/30 text-fuchsia-100" : isTexture ? "bg-amber-500/30 text-amber-100" : "bg-cyan-500/30 text-cyan-100"}`}>
            {isAnimation ? <><PlayCircle className="h-3 w-3" /> {m.animation_name ?? "animation"}</> : isTexture ? <><Palette className="h-3 w-3" /> retexture</> : <><Sparkles className="h-3 w-3" /> refined</>}
          </span>
        )}
        {isBridgeModel && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-cyan-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100 backdrop-blur">
            <Plug className="h-3 w-3" /> {m.source === "tripo_api" ? "Tripo API" : m.source === "tripo_bridge" ? "DCC Bridge" : "Bridge"}
          </span>
        )}
        {done && (
          <div className="absolute top-2 right-2 flex gap-1">
            <button onClick={goFullscreen} title="Fullscreen 3D preview" className="inline-flex items-center gap-1 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur px-2 py-1 text-[10px] font-bold text-white">
              <Maximize2 className="h-3 w-3" /> Fullscreen
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Delete 3D model" className="grid h-7 w-7 place-items-center rounded-md bg-black/60 text-rose-200 backdrop-blur hover:bg-rose-500/25">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!done && (
          <button onClick={() => setConfirmDelete(true)} title="Delete 3D model" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-rose-200 backdrop-blur hover:bg-rose-500/25">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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
        {confirmDelete && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-[11px] text-rose-100">
            <div className="font-bold">Delete this 3D model?</div>
            <div className="mt-1 text-rose-100/75">
              This removes the BloxSmith model record plus related refined, animated, or re-textured versions. Roblox assets already uploaded to your Roblox account are not deleted.
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={deleteModel} disabled={deleteBusy} className="inline-flex items-center gap-1 rounded-md bg-rose-500/30 px-2 py-1 text-[10px] font-bold text-rose-100 hover:bg-rose-500/40 disabled:opacity-50">
                {deleteBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleteBusy} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-white hover:bg-white/[0.12] disabled:opacity-50">
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}
        {isBridgeModel && (
          <div className="rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-2 text-[11px] text-cyan-100">
            <div className="font-bold">Bridge status: {m.bridge_status || (m.roblox_asset_id ? "Asset ID Ready" : "Preview Ready")}</div>
            <div className="mt-0.5 text-cyan-100/75">
              Format: {(m.source_format || "glb").toUpperCase()}
              {m.roblox_asset_id ? ` · Roblox asset ${m.roblox_asset_id}` : ""}
              {m.roblox_upload_status ? ` · Upload ${m.roblox_upload_status}` : ""}
            </div>
            {m.roblox_upload_error && <div className="mt-1 text-rose-200">{m.roblox_upload_error}</div>}
          </div>
        )}
        {actionErr && <div className="text-[11px] text-rose-300">{actionErr}</div>}
        {done && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {EXPORT_FORMATS.filter(f => urls[f.key]).map(f => (
                <button key={f.key} onClick={() => forceDownload(urls[f.key], safeName(m, f.ext))} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 text-[10px] font-bold text-white">
                  <Download className="h-3 w-3" /> {f.label}
                </button>
              ))}
              {Object.keys(urls).length === 0 && (
                <button onClick={() => forceDownload(m.model_url, safeName(m, "glb"))} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 text-[10px] font-bold text-white">
                  <Download className="h-3 w-3" /> GLB
                </button>
              )}
              <button
                onClick={async () => {
                  const list = Object.keys(urls).length ? EXPORT_FORMATS.filter(f => urls[f.key]) : [{ key: "glb", label: "GLB", ext: "glb" }];
                  for (const f of list) {
                    const u = urls[f.key] || m.model_url;
                    if (u) await forceDownload(u, safeName(m, f.ext));
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-200"
              >
                <Download className="h-3 w-3" /> All formats
              </button>
              <a href={m.model_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 text-[10px] font-bold text-white">
                <ExternalLink className="h-3 w-3" /> Open
              </a>
            </div>
            {isBridgeModel && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                {!m.roblox_asset_id && (
                  <button onClick={uploadToRoblox} disabled={robloxBusy} className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 hover:bg-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-100 disabled:opacity-50">
                    {robloxBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />} Upload to Roblox
                  </button>
                )}
                {m.roblox_operation_path && !m.roblox_asset_id && (
                  <button onClick={checkRobloxUpload} disabled={robloxBusy} className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 px-2 py-1 text-[10px] font-bold text-cyan-100 disabled:opacity-50">
                    {robloxBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Check upload
                  </button>
                )}
                <button onClick={sendToStudio} disabled={robloxBusy || !m.roblox_asset_id || !projectId} title={!projectId ? "Open a project to send this model to Studio." : !m.roblox_asset_id ? "Upload to Roblox or paste a Roblox asset ID first." : "Queue this model for the Studio plugin."} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-100 disabled:opacity-40">
                  {robloxBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Send to Studio
                </button>
              </div>
            )}
            {!isAnimation && !isTexture && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button onClick={() => setPicking(picking === "anim" ? null : "anim")} disabled={animBusy} className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/30 px-2 py-1 text-[10px] font-bold text-fuchsia-200 disabled:opacity-50">
                  {animBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />} Animate
                </button>
                <button onClick={() => setPicking(picking === "texture" ? null : "texture")} disabled={texBusy} className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-200 disabled:opacity-50">
                  {texBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Palette className="h-3 w-3" />} Re-texture
                </button>
              </div>
            )}
            {picking === "anim" && !animBusy && (
              <div className="rounded-lg border border-white/10 bg-black/40 p-1.5 grid grid-cols-3 gap-1">
                {ANIMATION_PRESETS.map((a) => (
                  <button key={a} onClick={() => runAnimate(a)} className="rounded px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/10 capitalize">{a}</button>
                ))}
              </div>
            )}
            {picking === "texture" && (
              <div className="space-y-1.5">
                <input value={texPrompt} onChange={(e) => setTexPrompt(e.target.value)} placeholder="e.g. ancient mossy stone, gold trim" className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white placeholder:text-muted-foreground" maxLength={300} />
                <button onClick={runRetexture} disabled={texBusy} className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-amber-500/30 hover:bg-amber-500/40 px-2 py-1.5 text-[10px] font-bold text-amber-100 disabled:opacity-50">
                  {texBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Palette className="h-3 w-3" />} Apply texture
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
