import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProject, listProjects } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import {
  getModelStatus,
  startModelGeneration,
  pollModelGeneration,
  animateModel,
  rigModel,
  retextureModel,
  registerTripoBridgeModel,
  uploadBridgeModelToRoblox,
  checkRobloxUploadOperation,
  queueBridgeModelToStudio,
  deleteModelGeneration,
  ANIMATION_PRESETS,
} from "@/lib/models3d.functions";
import { searchToolboxAssets, queueToolboxInsert } from "@/lib/toolbox.functions";
import { listProjectActions } from "@/lib/chat.functions";
import { Asset3DPreviewLazy } from "@/components/models/Asset3DPreviewLazy";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { Box, Loader2, Sparkles, Image as ImageIcon, Type, Timer, Download, ExternalLink, AlertCircle, CheckCircle2, PlayCircle, PauseCircle, Palette, Maximize2, UploadCloud, Plug, Link as LinkIcon, ShieldCheck, RefreshCw, Trash2, X, Bone, Search, Package, Copy, Send, Rotate3d, Gauge } from "lucide-react";


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

type ModelViewerEl = HTMLElement & {
  play?: () => void;
  pause?: () => void;
  paused?: boolean;
  timeScale?: number;
  availableAnimations?: string[];
  animationName?: string;
};

function AnimationControls({ viewerRef }: { viewerRef: React.MutableRefObject<HTMLElement | null> }) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState<string | null>(null);

  useEffect(() => {
    const el = viewerRef.current as ModelViewerEl | null;
    if (!el) return;
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const list = el.availableAnimations ?? [];
      setClips(list);
      setClip(el.animationName ?? list[0] ?? null);
      setPlaying(!el.paused);
    };
    sync();
    el.addEventListener("load", sync);
    const id = window.setInterval(sync, 800);
    return () => {
      cancelled = true;
      el.removeEventListener("load", sync);
      window.clearInterval(id);
    };
  }, [viewerRef]);

  const toggle = () => {
    const el = viewerRef.current as ModelViewerEl | null;
    if (!el) return;
    if (el.paused) {
      el.play?.();
      setPlaying(true);
    } else {
      el.pause?.();
      setPlaying(false);
    }
  };

  const changeSpeed = (v: number) => {
    setSpeed(v);
    const el = viewerRef.current as ModelViewerEl | null;
    if (el) el.timeScale = v;
  };

  const changeClip = (name: string) => {
    setClip(name);
    const el = viewerRef.current as ModelViewerEl | null;
    if (!el) return;
    el.setAttribute("animation-name", name);
    el.play?.();
    setPlaying(true);
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-2 py-1.5 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          title={playing ? "Pause" : "Play"}
          className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          {playing ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5" title="Playback speed">
          <Gauge className="h-3 w-3 text-white/70" />
          {[0.5, 1, 1.5, 2].map((v) => (
            <button
              key={v}
              onClick={() => changeSpeed(v)}
              className={`rounded-full px-1.5 text-[10px] font-bold ${speed === v ? "bg-fuchsia-500/40 text-white" : "text-white/70 hover:text-white"}`}
            >
              {v}x
            </button>
          ))}
        </div>
        {clips.length > 1 && (
          <select
            value={clip ?? ""}
            onChange={(e) => changeClip(e.target.value)}
            title="Choose animation clip"
            className="max-w-[120px] truncate rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white outline-none"
          >
            {clips.map((c) => (
              <option key={c} value={c} className="bg-slate-900">{c}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
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
const TEXTURE_LABELS: Record<string, string> = {
  albedo: "Albedo",
  base_color: "Base Color",
  basecolor: "Base Color",
  diffuse: "Diffuse",
  normal: "Normal",
  roughness: "Roughness",
  metallic: "Metallic",
  metalness: "Metalness",
  ao: "AO",
  ambient_occlusion: "AO",
  orm: "ORM",
  displacement: "Displacement",
  opacity: "Opacity",
};

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

const ANIMATION_META: Record<string, { emoji: string; tint: string }> = {
  idle:      { emoji: "🧍", tint: "from-slate-500/20 to-slate-600/20" },
  walking:   { emoji: "🚶", tint: "from-blue-500/20 to-cyan-500/20" },
  running:   { emoji: "🏃", tint: "from-orange-500/20 to-red-500/20" },
  jogging:   { emoji: "🏃‍♂️", tint: "from-amber-500/20 to-orange-500/20" },
  jumping:   { emoji: "🤸", tint: "from-lime-500/20 to-green-500/20" },
  dancing:   { emoji: "💃", tint: "from-pink-500/20 to-fuchsia-500/20" },
  waving:    { emoji: "👋", tint: "from-yellow-500/20 to-amber-500/20" },
  greeting:  { emoji: "🙌", tint: "from-cyan-500/20 to-teal-500/20" },
  clapping:  { emoji: "👏", tint: "from-yellow-500/20 to-orange-500/20" },
  cheering:  { emoji: "🙌", tint: "from-fuchsia-500/20 to-pink-500/20" },
  saluting:  { emoji: "🫡", tint: "from-indigo-500/20 to-blue-500/20" },
  bowing:    { emoji: "🙇", tint: "from-purple-500/20 to-violet-500/20" },
  thinking:  { emoji: "🤔", tint: "from-sky-500/20 to-indigo-500/20" },
  singing:   { emoji: "🎤", tint: "from-rose-500/20 to-pink-500/20" },
  praying:   { emoji: "🙏", tint: "from-amber-500/20 to-yellow-500/20" },
  sitting:   { emoji: "🪑", tint: "from-stone-500/20 to-neutral-500/20" },
  standing:  { emoji: "🧎", tint: "from-slate-500/20 to-zinc-500/20" },
  crouching: { emoji: "🧘", tint: "from-emerald-500/20 to-green-500/20" },
  kneeling:  { emoji: "🧎‍♂️", tint: "from-teal-500/20 to-emerald-500/20" },
  laying:    { emoji: "🛌", tint: "from-indigo-500/20 to-purple-500/20" },
  punching:  { emoji: "🥊", tint: "from-red-500/20 to-rose-500/20" },
  kicking:   { emoji: "🦵", tint: "from-orange-500/20 to-red-500/20" },
  backflip:  { emoji: "🤾", tint: "from-fuchsia-500/20 to-purple-500/20" },
  swimming:  { emoji: "🏊", tint: "from-cyan-500/20 to-blue-500/20" },
  falling:   { emoji: "🪂", tint: "from-sky-500/20 to-blue-500/20" },
};

async function forceDownload(url: string, filename: string) {
  // Meshy signed CDN URLs don't send CORS headers, so a same-origin fetch()
  // fails and the download silently doesn't happen (this was blocking FBX
  // downloads of rigged/animated models). Route the fetch through our
  // /api/public/model-proxy which streams the file with correct headers, and
  // fall back to opening the raw URL if the proxy is unavailable.
  const proxyUrl = `/api/public/model-proxy?url=${encodeURIComponent(url)}`;
  const attempts = [proxyUrl, url];
  for (const target of attempts) {
    try {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch {
      /* try next */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function safeName(m: any, ext: string) {
  const base = (m.prompt || m.mode || "model").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "model";
  return `${base}-${String(m.id).slice(0, 6)}.${ext}`;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function modelTitle(m: any) {
  const prompt = String(m.prompt || "").trim();
  const cleaned = prompt
    .replace(/^Refined\s*[—-]\s*/i, "")
    .replace(/^Retexture:\s*/i, "")
    .split(",")[0]
    .replace(/\b(low[- ]poly|geometric|faceted|minimal triangles|stylized|game[- ]ready|roblox[- ]style|pbr|realistic)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = m.mode === "image" ? "Image to 3D Model"
    : m.mode === "animation" ? `${m.animation_name || "Animated"} Model`
    : m.mode === "tripo_bridge" ? "Tripo Bridge Model"
    : m.mode === "tripo_api" ? "Tripo API Model"
    : "3D Model";
  const base = cleaned || fallback;
  if (m.mode === "refine") return `Refined ${titleCase(base)}`;
  if (m.mode === "texture") return `Retextured ${titleCase(base)}`;
  if (m.mode === "animation") return titleCase(base);
  return titleCase(base);
}

// Some AI provider CDNs (Tripo, signed S3, etc.) don't send CORS headers, so
// <model-viewer>'s fetch fails with "TypeError: Failed to fetch". Route those
// through our public /api/public/model-proxy which re-streams with CORS.
function proxied(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    // Same-origin URLs (our own storage/edge) don't need proxying.
    if (typeof window !== "undefined" && u.origin === window.location.origin) return url;
    return `/api/public/model-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function bestPreviewUrl(m: any, urls: Record<string, string>) {
  const direct = String(m.model_url || "");
  if (urls.glb) return proxied(urls.glb);
  if (urls.gltf) return proxied(urls.gltf);
  if (/\.(glb|gltf)(\?|#|$)/i.test(direct)) return proxied(direct);
  return "";
}

function previewFileLabel(m: any, urls: Record<string, string>) {
  if (urls.glb || /\.glb(\?|#|$)/i.test(String(m.model_url || ""))) return "GLB";
  if (urls.gltf || /\.gltf(\?|#|$)/i.test(String(m.model_url || ""))) return "glTF";
  const first = Object.keys(urls)[0] || String(m.source_format || "").toUpperCase() || "model file";
  return first.toUpperCase();
}

function textureMapEntries(value: unknown) {
  const entries: { key: string; label: string; url: string; ext: string }[] = [];
  const seen = new Set<string>();

  const add = (key: string, url: string) => {
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "texture";
    const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
    entries.push({
      key: cleanKey,
      label: TEXTURE_LABELS[cleanKey] || titleCase(cleanKey.replace(/_/g, " ")),
      url,
      ext: ext && ext.length <= 5 ? ext : "png",
    });
  };

  const visit = (node: unknown, key = "texture") => {
    if (!node) return;
    if (typeof node === "string") {
      add(key, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${key}_${index + 1}`));
      return;
    }
    if (typeof node === "object") {
      Object.entries(node as Record<string, unknown>).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  };

  visit(value);
  return entries;
}

function friendlyErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Something went wrong.");
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : null;
    if (first?.path?.includes?.("modelUrl") && first?.validation === "url") {
      return "Invalid model URL. Paste a full http:// or https:// link to a GLB, FBX, glTF, RBXM, or RBXMX file. Local Windows paths cannot preview in the browser.";
    }
    if (first?.message) return String(first.message);
  } catch {
    // Keep the original message.
  }
  return raw;
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
    const refreshable = status.models.filter((m: any) => {
      if (m.status !== "SUCCEEDED" && m.status !== "FAILED") return true;
      if (m.status !== "SUCCEEDED" || !m.task_id) return false;
      const urls = (m.model_urls || {}) as Record<string, string>;
      return !bestPreviewUrl(m, urls);
    });
    if (refreshable.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(refreshable.map((m: any) => pollFn({ data: { generationId: m.id } }).catch(() => null)));
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
    if (!bridgeUrl.trim() && !bridgeAssetId.trim()) {
      setBridgeErr("Paste a model file URL for preview, or paste a Roblox model asset ID if it is already uploaded.");
      return;
    }
    if (bridgeUrl.trim() && !/^https?:\/\//i.test(bridgeUrl.trim())) {
      setBridgeErr("Invalid model URL. Use a full http:// or https:// link. Local files like C:\\Downloads\\model.glb cannot be previewed by the website.");
      return;
    }
    if (/\/api\/tripo\/bridge\/?(\?|#|$)/i.test(bridgeUrl.trim())) {
      setBridgeErr("That is the BloxSmith bridge receiver URL, not a model file. Paste it into your local Tripo bridge helper. Here, paste the exported GLB, glTF, FBX, RBXM, or RBXMX file URL.");
      return;
    }
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
      setBridgeErr(friendlyErrorMessage(e));
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
      actions={undefined}
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

      {/* Roblox Toolbox library — free + verified assets */}
      <ToolboxLibrary projectId={projectId} />

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
  const rigFn = useServerFn(rigModel);
  const retextureFn = useServerFn(retextureModel);
  const pollFn = useServerFn(pollModelGeneration);
  const uploadRobloxFn = useServerFn(uploadBridgeModelToRoblox);
  const checkUploadFn = useServerFn(checkRobloxUploadOperation);
  const queueStudioFn = useServerFn(queueBridgeModelToStudio);
  const listActionsFn = useServerFn(listProjectActions);
  const deleteFn = useServerFn(deleteModelGeneration);
  const [animBusy, setAnimBusy] = useState(false);
  const [rigBusy, setRigBusy] = useState(false);
  const [robloxBusy, setRobloxBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | "anim" | "texture">(null);
  const [texPrompt, setTexPrompt] = useState("");
  const [texBusy, setTexBusy] = useState(false);

  const urls: Record<string, string> = m.model_urls || {};
  const textureFiles = textureMapEntries(m.texture_urls);
  const previewUrl = bestPreviewUrl(m, urls);
  const title = modelTitle(m);
  const complete = m.status === "SUCCEEDED";
  const hasModelFile = !!m.model_url || Object.keys(urls).length > 0;
  const done = complete;
  const canPreview = complete && !!previewUrl;
  const assetOnly = complete && !hasModelFile && !!m.roblox_asset_id;
  const failed = m.status === "FAILED";
  const primaryFileUrl = previewUrl || urls.glb || urls.gltf || urls.fbx || urls.obj || Object.values(urls)[0] || m.model_url || "";
  const isAnimation = m.mode === "animation";
  const isTexture = m.mode === "texture";
  const isRig = m.mode === "rig";
  const isRefine = m.mode === "refine";
  const isBridgeModel = m.mode === "tripo_bridge" || m.mode === "tripo_api" || m.mode === "external_model" || !!m.source;
  const viewerRef = useRef<HTMLElement | null>(null);
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerProgress, setViewerProgress] = useState(0);

  useEffect(() => {
    setViewerLoaded(false);
    setViewerError(null);
    setViewerProgress(0);
  }, [previewUrl]);

  // Silent auto-poll: when the job is done but no GLB/glTF preview is saved
  // yet, keep asking Meshy for the finished file every few seconds so the
  // interactive viewer appears without any manual "Refresh 3D file" button.
  useEffect(() => {
    if (!done || canPreview || assetOnly || failed || !m.task_id) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || attempts >= 20) return;
      attempts += 1;
      try { await pollFn({ data: { generationId: m.id } }); onChange(); } catch { /* keep retrying */ }
    };
    const id = window.setInterval(tick, 4000);
    // Kick off immediately too
    tick();
    return () => { cancelled = true; window.clearInterval(id); };
  }, [done, canPreview, assetOnly, failed, m.task_id, m.id, pollFn, onChange]);

  useEffect(() => {
    if (!canPreview || !previewUrl) return;
    const el = viewerRef.current as (HTMLElement & {
      loaded?: boolean;
      dismissPoster?: () => void;
      requestUpdate?: () => void;
    }) | null;
    if (!el) return;

    let cancelled = false;
    const markLoaded = () => {
      if (cancelled) return;
      setViewerLoaded(true);
      setViewerProgress(1);
      setViewerError(null);
    };
    const markError = (event: Event) => {
      if (cancelled) return;
      const detail = (event as CustomEvent<any>)?.detail;
      const message = detail?.sourceError?.message || detail?.message || "The preview file could not be loaded by the 3D viewer.";
      setViewerError(String(message));
      setViewerLoaded(false);
    };
    const markProgress = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail;
      const progress = Number(detail?.totalProgress ?? 0);
      if (Number.isFinite(progress)) setViewerProgress(Math.max(0, Math.min(1, progress)));
      if (progress >= 0.98) markLoaded();
    };

    el.addEventListener("load", markLoaded);
    el.addEventListener("model-visibility", markLoaded);
    el.addEventListener("poster-dismissed", markLoaded);
    el.addEventListener("progress", markProgress);
    el.addEventListener("error", markError);

    el.dismissPoster?.();
    el.requestUpdate?.();
    requestAnimationFrame(() => {
      if (!cancelled && el.loaded) markLoaded();
    });
    const recovery = window.setTimeout(() => {
      if (!cancelled && !viewerError) {
        // Some browsers render the WebGL canvas but miss custom-element load events.
        // Remove the blocking overlay so the already-visible model stays usable.
        markLoaded();
      }
    }, 9000);

    return () => {
      cancelled = true;
      window.clearTimeout(recovery);
      el.removeEventListener("load", markLoaded);
      el.removeEventListener("model-visibility", markLoaded);
      el.removeEventListener("poster-dismissed", markLoaded);
      el.removeEventListener("progress", markProgress);
      el.removeEventListener("error", markError);
    };
  }, [canPreview, previewUrl, viewerError]);

  async function goFullscreen() {
    const el = (viewerRef.current || previewShellRef.current) as (HTMLElement & { requestFullscreen?: () => Promise<void> }) | null;
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

  async function runRig() {
    setRigBusy(true); setActionErr(null);
    try {
      await rigFn({ data: { projectId, sourceId: m.id } });
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to start rigging.");
    } finally { setRigBusy(false); }
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
    if (!projectId) {
      const msg = "Open this from a project before sending to Roblox Studio.";
      setActionErr(msg);
      toast.error(msg);
      return;
    }
    if (!m.roblox_asset_id) {
      const msg = "Upload the model to Roblox first (or paste a Roblox asset ID) before sending to Studio.";
      setActionErr(msg);
      toast.error(msg);
      return;
    }
    setRobloxBusy(true); setActionErr(null);
    const label = m.prompt || "3D model";
    const toastId = toast.loading(`Sending ${label} to Studio…`);
    try {
      const res = await queueStudioFn({ data: { projectId, generationId: m.id, name: m.prompt || "BloxSmith Imported Model", scale: 1 } });
      onChange();
      toast.success(`Sent to Studio — plugin will insert it now.`, { id: toastId });
      // Poll for plugin confirmation so the user sees success or failure.
      const actionId = (res as any)?.actionId as string | undefined;
      if (actionId && typeof window !== "undefined") {
        let polls = 0;
        const timer = window.setInterval(async () => {
          polls += 1;
          try {
            const rows = (await listActionsFn({ data: { projectId } })) as Array<{ id: string; status?: string | null; error?: string | null }>;
            const row = rows.find((r) => r.id === actionId);
            if (row?.status === "done") {
              window.clearInterval(timer);
              toast.success(`Inserted into Studio: ${label}`);
              onChange();
            } else if (row?.status === "failed") {
              window.clearInterval(timer);
              toast.error(`Studio could not insert ${label}: ${row.error ?? "plugin reported a failure"}`);
              setActionErr(row.error ?? "Studio plugin reported a failure while inserting this model.");
            } else if (polls >= 45) {
              window.clearInterval(timer);
              toast.warning(`Queued ${label}, but Studio hasn't confirmed yet. Keep the BloxSmith plugin open and connected.`);
            }
          } catch {
            if (polls >= 45) window.clearInterval(timer);
          }
        }, 2000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send model to Studio.";
      setActionErr(msg);
      toast.error(msg, { id: toastId });
    } finally { setRobloxBusy(false); }
  }

  async function refreshPreviewFile() {
    setRefreshBusy(true); setActionErr(null);
    try {
      await pollFn({ data: { generationId: m.id } });
      onChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not refresh the 3D preview file yet.");
    } finally { setRefreshBusy(false); }
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
      <div ref={previewShellRef} className="aspect-square bg-black/40 relative overflow-hidden">
        <div className="absolute left-3 right-14 top-3 z-20 rounded-xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur">
          <div className="truncate text-sm font-extrabold text-white" title={title}>{title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-white/65">
            <span>{m.mode === "image" ? "Image → 3D" : m.mode === "text" ? "Text → 3D" : titleCase(String(m.mode || "model").replace(/_/g, " "))}</span>
            <span>·</span>
            <span>{assetOnly ? "Roblox asset ID ready" : canPreview ? `Preview: ${previewFileLabel(m, urls)}` : failed ? "Failed" : done ? "Preparing preview…" : "Model still processing"}</span>
            {done && (textureFiles.length > 0 || urls.glb || urls.gltf) && (
              <>
                <span>·</span>
                <span>{textureFiles.length > 0 ? `${textureFiles.length} texture map${textureFiles.length === 1 ? "" : "s"}` : "embedded materials"}</span>
              </>
            )}
          </div>
        </div>
        {canPreview ? (
          // @ts-expect-error - web component
          <model-viewer
            ref={viewerRef}
            key={previewUrl}
            src={previewUrl}
            poster={m.thumbnail_url || undefined}
            reveal="auto"
            loading="eager"
            camera-controls
            auto-rotate={!isAnimation}
            autoplay={isAnimation}
            touch-action="pan-y"
            interaction-prompt="auto"
            interaction-prompt-style="wiggle"
            shadow-intensity="1.45"
            shadow-softness="0.65"
            exposure="1.12"
            environment-image="neutral"
            tone-mapping="aces"
            bounds="tight"
            camera-orbit="45deg 65deg auto"
            field-of-view="30deg"
            min-camera-orbit="auto auto 5%"
            max-camera-orbit="auto auto 500%"
            style={{ width: "100%", height: "100%", minHeight: "280px", background: "radial-gradient(circle at 50% 55%, rgba(99,102,241,.18), transparent 45%)", transform: "translateZ(0)", willChange: "transform", contain: "layout paint size" }}
          />
        ) : m.thumbnail_url ? (
          <>
            <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover opacity-60 blur-[0.5px]" />
            <div className="absolute inset-0 grid place-items-center bg-black/25">
              <div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-center text-xs font-semibold text-white shadow-xl backdrop-blur">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-violet-200" />
                Preparing 3D preview…
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {failed ? <AlertCircle className="h-8 w-8 text-rose-400" /> : <Loader2 className="h-8 w-8 animate-spin" />}
          </div>
        )}
        {canPreview && !viewerLoaded && !viewerError && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/25 backdrop-blur-[1px]">
            <div className="rounded-xl border border-white/10 bg-black/65 px-4 py-3 text-center text-xs font-semibold text-white shadow-xl">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-violet-200" />
              Preparing 3D preview…
              <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-300 to-cyan-300 transition-all" style={{ width: `${Math.max(12, Math.round(viewerProgress * 100))}%` }} />
              </div>
            </div>
          </div>
        )}
        {viewerError && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-rose-400/30 bg-rose-500/15 p-3 text-xs text-rose-100 backdrop-blur">
            <div className="font-bold">Preview failed to load</div>
            <div className="mt-1 opacity-85">{viewerError}</div>
            <a href={primaryFileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold underline">
              <ExternalLink className="h-3 w-3" /> Open preview file
            </a>
          </div>
        )}
        {assetOnly && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-emerald-300/25 bg-emerald-500/15 p-3 text-xs text-emerald-100 backdrop-blur">
            <div className="font-bold">Roblox asset ID ready</div>
            <div className="mt-1 opacity-85">This model can be sent to Roblox Studio now.</div>
          </div>
        )}
        {(isAnimation || isTexture || isRefine) && (
          <span className={`absolute left-3 top-20 z-20 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${isAnimation ? "bg-fuchsia-500/30 text-fuchsia-100" : isTexture ? "bg-amber-500/30 text-amber-100" : "bg-cyan-500/30 text-cyan-100"}`}>
            {isAnimation ? <><PlayCircle className="h-3 w-3" /> {m.animation_name ?? "animation"}</> : isTexture ? <><Palette className="h-3 w-3" /> retexture</> : <><Sparkles className="h-3 w-3" /> refined</>}
          </span>
        )}
        {isBridgeModel && (
          <span className="absolute left-3 top-20 z-20 inline-flex items-center gap-1 rounded-md bg-cyan-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100 backdrop-blur">
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
        {isAnimation && canPreview && viewerLoaded && (
          <AnimationControls viewerRef={viewerRef} />
        )}
        {!done && (
          <button onClick={() => setConfirmDelete(true)} title="Delete 3D model" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-rose-200 backdrop-blur hover:bg-rose-500/25">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {!done && !assetOnly && !failed && (
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
        <div>
          <div className="truncate text-sm font-bold text-white" title={title}>{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">
            {m.prompt || (m.mode === "image" ? "Image → 3D" : "Untitled")}
          </div>
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
            <div className="font-bold">Bridge status: {m.bridge_status || (m.roblox_asset_id ? "Asset ID Ready" : canPreview ? "Preview Ready" : failed ? "Failed" : "Model still processing")}</div>
            <div className="mt-0.5 text-cyan-100/75">
              Format: {(m.source_format || "glb").toUpperCase()}
              {m.roblox_asset_id ? ` · Roblox asset ${m.roblox_asset_id}` : ""}
              {m.roblox_upload_status ? ` · Upload ${m.roblox_upload_status}` : ""}
              {!canPreview && !m.roblox_asset_id ? " · Waiting for GLB/glTF preview file" : ""}
            </div>
            {m.roblox_upload_error && <div className="mt-1 text-rose-200">{m.roblox_upload_error}</div>}
          </div>
        )}
        {actionErr && <div className="text-[11px] text-rose-300">{actionErr}</div>}
        {isBridgeModel && assetOnly && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
            <button onClick={sendToStudio} disabled={robloxBusy || !projectId} title={!projectId ? "Open a project to send this model to Studio." : "Queue this model for the Studio plugin."} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-100 disabled:opacity-40">
              {robloxBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Send to Studio
            </button>
          </div>
        )}
        {done && hasModelFile && (
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
                  for (const texture of textureFiles) {
                    await forceDownload(texture.url, safeName(m, texture.ext).replace(/\.[^.]+$/, `-${texture.key}.${texture.ext}`));
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-200"
              >
                <Download className="h-3 w-3" /> All formats
              </button>
              {primaryFileUrl && (
                <a href={primaryFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 text-[10px] font-bold text-white">
                  <ExternalLink className="h-3 w-3" /> Open file
                </a>
              )}
              {m.project_id && (
                <Link to="/project/$projectId" params={{ projectId: m.project_id }} className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 hover:bg-violet-500/30 px-2 py-1 text-[10px] font-bold text-violet-100">
                  <ExternalLink className="h-3 w-3" /> Project
                </Link>
              )}
            </div>
            {textureFiles.length > 0 ? (
              <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/10 p-2 text-[11px] text-emerald-100">
                <div className="flex items-center gap-1 font-bold">
                  <Palette className="h-3.5 w-3.5" /> Texture maps saved
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {textureFiles.map((texture) => (
                    <button
                      key={`${texture.key}-${texture.url}`}
                      onClick={() => forceDownload(texture.url, safeName(m, texture.ext).replace(/\.[^.]+$/, `-${texture.key}.${texture.ext}`))}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-50 hover:bg-emerald-500/30"
                    >
                      <Download className="h-3 w-3" /> {texture.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (urls.glb || urls.gltf) && (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-[11px] text-white/65">
                <span className="font-bold text-white/80">Materials:</span> GLB/glTF files can include embedded textures. Separate texture map downloads appear here when the model provider returns them.
              </div>
            )}
            {isBridgeModel && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                {!m.roblox_asset_id && (
                  <button onClick={uploadToRoblox} disabled={robloxBusy || !canPreview} title={!canPreview ? "Wait until the website 3D preview loads before uploading/importing this model." : "Upload this previewed model to Roblox Open Cloud."} className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 hover:bg-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-100 disabled:opacity-50">
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
            {!isAnimation && !isTexture && !isRig && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button onClick={runRig} disabled={rigBusy} title="Auto-rig this model with Meshy AI — generates a humanoid skeleton and skin weights so it can be animated." className="inline-flex items-center gap-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 px-2 py-1 text-[10px] font-bold text-sky-200 disabled:opacity-50">
                  {rigBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bone className="h-3 w-3" />} Rig
                </button>
                <button onClick={() => setPicking(picking === "anim" ? null : "anim")} disabled={animBusy} title="Apply a preset animation with Meshy AI (works best on rigged humanoid characters)." className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/30 px-2 py-1 text-[10px] font-bold text-fuchsia-200 disabled:opacity-50">
                  {animBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />} Animate
                </button>
                <button onClick={() => setPicking(picking === "texture" ? null : "texture")} disabled={texBusy} title="Re-texture this model with a new material prompt." className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-200 disabled:opacity-50">
                  {texBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Palette className="h-3 w-3" />} Re-texture
                </button>
              </div>
            )}
            {picking === "anim" && !animBusy && (
              <div className="rounded-xl border border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-500/10 via-black/50 to-violet-500/10 p-2">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200 inline-flex items-center gap-1">
                    <PlayCircle className="h-3 w-3" /> Pick an animation
                  </div>
                  <div className="text-[9px] text-white/50">Preview plays automatically after render</div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {ANIMATION_PRESETS.map((a) => {
                    const meta = ANIMATION_META[a] ?? { emoji: "🎬", tint: "from-fuchsia-500/20 to-violet-500/20" };
                    return (
                      <button
                        key={a}
                        onClick={() => runAnimate(a)}
                        title={`Apply "${a}" animation`}
                        className={`group flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-gradient-to-br ${meta.tint} px-1.5 py-2 text-[10px] font-semibold text-white transition hover:border-fuchsia-300/40 hover:scale-[1.04] hover:shadow-lg hover:shadow-fuchsia-500/20`}
                      >
                        <span className="text-lg leading-none transition group-hover:scale-125">{meta.emoji}</span>
                        <span className="capitalize truncate w-full text-center">{a}</span>
                      </button>
                    );
                  })}
                </div>
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

type ToolboxCategoryLite = "Model" | "Mesh" | "Decal" | "Audio";

function ToolboxLibrary({ projectId }: { projectId?: string }) {
  const searchFn = useServerFn(searchToolboxAssets);
  const queueFn = useServerFn(queueToolboxInsert);
  const listProjectsFn = useServerFn(listProjects);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<ToolboxCategoryLite>("Model");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [freeOnly, setFreeOnly] = useState(true); // always free from server; kept as UI reassurance
  const [insertingId, setInsertingId] = useState<number | null>(null);
  const [pickedProjectId, setPickedProjectId] = useState<string | undefined>(projectId);
  const [preview3D, setPreview3D] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => { setPickedProjectId(projectId); }, [projectId]);

  // Load the user's projects so they can insert directly into any of them
  // (including from the standalone /models page).
  const projectsQuery = useQuery({
    queryKey: ["toolbox_projects_picker"],
    queryFn: () => listProjectsFn(),
    staleTime: 60_000,
    enabled: !projectId, // route-bound project already known
  });
  const projects = (projectsQuery.data ?? []) as Array<{ id: string; name: string; plugin_connected?: boolean }>;

  // Default to the most recently updated project when the page isn't
  // opened from inside a specific project.
  useEffect(() => {
    if (!pickedProjectId && projects.length > 0) setPickedProjectId(projects[0].id);
  }, [projects, pickedProjectId]);

  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to page 0 when the search query or category changes.
  useEffect(() => { setPage(0); }, [debounced, category]);

  const { data, isFetching } = useQuery({
    queryKey: ["toolbox_browse", category, debounced, page],
    queryFn: () => searchFn({ data: { query: debounced || "kit", category, limit: 24, page } }),
    enabled: debounced.length >= 2 || debounced.length === 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const filtered = useMemo(() => {
    const rows = (data?.results ?? []) as any[];
    return rows.filter((r) => {
      if (verifiedOnly && !r.verifiedCreator && String(r.creatorName || "").toLowerCase() !== "roblox") return false;
      if (r.hasScripts && (r.scriptCount ?? 0) > 3) return false;
      return true;
    });
  }, [data, verifiedOnly]);

  async function handleInsert(row: any) {
    const target = pickedProjectId;
    if (!target) {
      toast.error("Create or open a project first — inserts need a project to send to Studio.");
      return;
    }
    setInsertingId(row.id);
    try {
      const res = await queueFn({
        data: {
          projectId: target,
          assets: [{ id: row.id, name: row.name, creatorName: row.creatorName, sourceQuery: row.sourceQuery ?? debounced }],
        },
      });
      const projName = projects.find((p) => p.id === target)?.name;
      if (res.ok) {
        const swap = (res as any).replaced?.[0];
        if (swap) {
          toast.success(
            `Sent to Studio${projName ? ` (${projName})` : ""}: swapped in a public replacement (original ${swap.original} was ${humanReason(swap.reason)}).`,
          );
        } else {
          toast.success(`Sent to Studio${projName ? ` (${projName})` : ""}: ${row.name}`);
        }
      } else {
        const reason = humanReason((res as any).dropReason ?? "unauthorized");
        toast.error(`Insert blocked — ${reason}. Try another result or a Roblox-verified asset.`);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/401|unauthor/i.test(msg)) toast.error("Session expired — sign out and back in, then retry.");
      else if (/403|forbid/i.test(msg)) toast.error("Forbidden — you don't have access to this project.");
      else if (/404|not.?found/i.test(msg)) toast.error("Project or asset not found. Reopen the project and try again.");
      else toast.error(msg || "Insert failed.");
    } finally {
      setInsertingId(null);
    }
  }

  function humanReason(code: string): string {
    const c = code.toLowerCase();
    if (c.includes("private") || c.includes("visibility")) return "the asset is private";
    if (c.includes("deleted") || c.includes("moderated")) return "the asset is deleted or moderated";
    if (c.includes("offsale") || c.includes("off_sale") || c.includes("off sale")) return "the asset is off-sale";
    if (c.includes("blacklist")) return "the asset previously failed to load in Studio";
    if (c.includes("missing")) return "the asset ID is missing";
    if (c.includes("network") || c.includes("timeout")) return "Roblox's asset service didn't respond";
    return "the asset couldn't be authorized (private / off-sale / deleted)";
  }



  const quick = [
    // Buildings & structures
    "house", "modern house", "medieval castle", "fortress", "tower", "wizard tower", "shop", "cafe", "hospital", "police station", "school", "church", "temple", "mansion", "cabin", "farmhouse", "windmill", "lighthouse", "bank", "gas station",
    // Nature
    "pine tree", "oak tree", "palm tree", "low poly tree", "bush", "flower", "rock", "boulder", "mountain", "waterfall", "grass patch",
    // Characters / NPCs
    "npc", "zombie", "skeleton", "dragon", "shopkeeper", "guard", "knight", "wizard", "robot", "alien",
    // Weapons
    "sword", "katana", "shield", "bow", "pistol", "rifle", "shotgun", "laser gun", "grenade", "magic staff",
    // Vehicles
    "car", "sports car", "police car", "truck", "motorcycle", "bike", "plane", "helicopter", "boat", "spaceship", "hoverboard", "kart",
    // Props / gameplay
    "chest", "treasure chest", "coin", "gem", "potion", "door", "portal", "checkpoint", "trampoline", "cannon", "trap", "campfire", "torch", "lamp post", "street light", "fence", "bench", "crate", "barrel", "sign", "furniture set",
    // Effects
    "fire effect", "explosion effect", "smoke effect", "magic particle",
    // Maps / kits
    "map", "obby map", "city map", "island map", "dungeon map", "battle arena", "lobby", "tycoon map", "racing track", "parkour map", "spawn area", "training map", "showdown arena", "roleplay town",
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300"><Package className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-bold">Roblox Toolbox library</div>
            <div className="text-[11px] text-muted-foreground">Free, verified, script-safe assets pulled live from Roblox Creator Store — send any into Studio.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {!projectId && (
            <label className="inline-flex items-center gap-1.5">
              <span>Insert into:</span>
              <select
                value={pickedProjectId ?? ""}
                onChange={(e) => setPickedProjectId(e.target.value || undefined)}
                className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-400/60"
              >
                {projects.length === 0 && <option value="">No projects yet</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.plugin_connected ? " 🟢" : ""}</option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" /> Verified creators only</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" disabled /> Free only</label>
        </div>

      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the whole Toolbox — e.g. obby map, medieval castle, city map, low poly tree"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-emerald-400/60"
            maxLength={120}
          />
        </div>
        <div className="flex gap-1">
          {(["Model", "Mesh", "Decal", "Audio"] as ToolboxCategoryLite[]).map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${category === c ? "bg-emerald-500/25 text-emerald-100 border border-emerald-400/40" : "bg-white/[0.04] text-muted-foreground border border-white/10 hover:bg-white/[0.10]"}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {quick.map((q) => (
          <button key={q} onClick={() => setQuery(q)} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] text-muted-foreground hover:bg-white/[0.10] hover:text-white">
            {q}
          </button>
        ))}
      </div>

      {isFetching && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching Roblox Creator Store…
        </div>
      )}

      {!isFetching && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-xs text-muted-foreground">
          No verified free {category.toLowerCase()}s matched that search. Try a broader term.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r: any) => (
            <div key={r.id} className="group rounded-xl border border-white/10 bg-black/30 overflow-hidden flex flex-col">
              <button
                type="button"
                onClick={() => setPreview3D({ id: r.id, name: r.name })}
                title="Open 3D preview"
                className="relative aspect-square w-full bg-black/40 grid place-items-center overflow-hidden group/img"
              >
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt={r.name} loading="lazy" className="h-full w-full object-contain transition-transform group-hover/img:scale-105" />
                ) : (
                  <Box className="h-8 w-8 text-muted-foreground" />
                )}
                {(r.verifiedCreator || String(r.creatorName || "").toLowerCase() === "roblox") && (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-100 border border-emerald-400/40">
                    <ShieldCheck className="h-2.5 w-2.5" /> Verified
                  </span>
                )}
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9.5px] font-bold text-white border border-white/20 opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <Rotate3d className="h-2.5 w-2.5" /> 3D
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-1.5 p-2">
                <div className="line-clamp-2 text-[11.5px] font-semibold text-white leading-tight">{r.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">by {r.creatorName || "Unknown"}</div>
                <div className="mt-auto flex items-center gap-1">
                  <button
                    onClick={() => handleInsert(r)}
                    disabled={!pickedProjectId || insertingId === r.id}
                    title={pickedProjectId ? "Queue for Studio plugin" : "Create or pick a project to enable Studio insert"}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-400/40 px-2 py-1 text-[10.5px] font-bold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {insertingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Insert
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(String(r.id)).then(() => toast.success(`Copied ${r.id}`)).catch(() => toast.error("Copy failed")); }}
                    title="Copy asset ID"
                    className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.12] hover:text-white"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <a
                    href={`https://create.roblox.com/store/asset/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open on Roblox Creator Store"
                    className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.12] hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(filtered.length > 0 || page > 0) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-muted-foreground">
            Page {page + 1}{data?.hasMore ? "" : " (last)"} · showing {filtered.length} verified free {category.toLowerCase()}{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data?.hasMore || isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Next →
            </button>
          </div>
        </div>
      )}

      {preview3D && (
        <Asset3DPreviewLazy
          assetId={preview3D.id}
          name={preview3D.name}
          onClose={() => setPreview3D(null)}
        />
      )}
    </section>
  );
}

