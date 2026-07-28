// WorkspaceChat — Home / AI Workspace composer.
// Two clear modes:
//   • Chat   → talk to BloxSmith Agent. Never creates a project, never runs a build.
//   • Build  → generate Studio actions. Auto-creates a project on first send if none is active.
// Attach button accepts images + Roblox files. No duplicate image controls.
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Paperclip, Send, Sparkles, ChevronDown, Loader2, X, MessageSquare, Hammer, Wand2,
  Download, RefreshCw, Save, Image as ImageIcon, Square, Trash2, Zap, Volume2, VolumeX,
  ClipboardList, Lightbulb, Languages, HelpCircle, CreditCard, Lock, Users, Compass,
} from "lucide-react";
import { useLang, LANGUAGES } from "@/lib/i18n";
import { playCompletionSound } from "@/lib/sound";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { createProject } from "@/lib/projects.functions";
import { listMessages, getPluginSession, getBuildExecutionStatus, clearMessages, executeQueuedActionsNow } from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { improvePrompt } from "@/lib/improve.functions";
import { saveProjectAsset } from "@/lib/project-assets.functions";
import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";
import { MODELS, isSelectable, findModel } from "@/lib/models";
import { pickModelForTask, estimateDifficulty } from "@/lib/model-router";
import { ChatHistoryButton } from "@/components/ChatHistoryButton";
import { VaporModelSelector } from "@/components/VaporModelSelector";
import { CreditsPill } from "@/components/CreditsWidget";
import { useBloxSmithSpeaker } from "@/components/VoiceControls";
import { GameBrainstormer } from "@/components/GameBrainstormer";
import { WebsiteGuideModal } from "@/components/WebsiteGuideModal";
import { PayPalTopUpModal } from "@/components/PayPalTopUpModal";
import { CollabModal } from "@/components/CollabModal";

function TopUpRequiredCard({
  modelLabel,
  errorMessage,
  onTopUpClick,
  onSwitchModelClick,
}: {
  modelLabel?: string;
  errorMessage: string;
  onTopUpClick: () => void;
  onSwitchModelClick: () => void;
}) {
  return (
    <div className="my-2.5 rounded-2xl border border-amber-500/50 bg-gradient-to-br from-[#1c152b] via-[#151024] to-[#0d0918] p-4 text-slate-100 shadow-[0_0_30px_rgba(245,158,11,0.25)] animate-in fade-in zoom-in-95">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-500/30 to-purple-600/30 shadow-md">
          <Sparkles className="h-5 w-5 text-amber-300 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
              💎 Top-Up Required
            </span>
            {modelLabel && (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-200">
                {modelLabel}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-200 font-medium">
            {errorMessage || "This AI model is reserved for Top-Up users. Purchase a top-up pack to instantly unlock access to all premium models!"}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onTopUpClick}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.5)] hover:brightness-110 active:scale-95 transition"
            >
              <CreditCard className="h-4 w-4 text-slate-950" />
              Top Up Credits (PayPal)
            </button>
            <button
              type="button"
              onClick={onSwitchModelClick}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/15 hover:text-white transition active:scale-95"
            >
              Switch to Free AI Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



// Strip internal machinery from what the user sees in chat.
// - The `bloxsmith-actions` fenced block is required by the pipeline but must
//   never appear as visible prose.
// - Trim other giveaways that leak internals ("Running actions...", "Searching Toolbox...", etc).
function stripInternalBlocks(text: string): string {
  let out = text;
  // Fenced blocks of internal formats
  out = out.replace(/```(?:bloxsmith-actions|bloxsmith[-_a-z]*|json[-_a-z]*|actions|tool[-_a-z]*)[\s\S]*?```/gi, "");
  // Bare "Running actions..." / "Searching Toolbox..." style status lines
  out = out.replace(/^\s*(?:🔧\s*)?(?:Running actions|Searching Toolbox|Understanding request|Compiling actions|Executing tools|Streaming|Calling tool)[^\n]*$/gim, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Fancy task-list renderer ─────────────────────────────────────────────────
// Intercepts react-markdown's `li` render for task list items (- [ ] / - [x])
// and replaces the default bullet with a glowing animated checkbox chip.
// Execution is unaffected — this is purely visual prose enhancement.
const markdownComponents: Record<string, React.ComponentType<any>> = {
  li: ({ node, children, ...props }: any) => {
    const childArray = Array.isArray(children) ? children : [children];
    const first = childArray[0];
    const isCheckbox =
      first &&
      typeof first === "object" &&
      "type" in first &&
      (first as any).type === "input" &&
      (first as any).props?.type === "checkbox";
    if (isCheckbox) {
      const checked = !!(first as any).props?.checked;
      const rest = childArray.slice(1);
      return (
        <li style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <div
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2 my-1 text-[12.5px] font-medium transition-all duration-300 ${
              checked
                ? "bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_14px_rgba(16,185,129,0.18)]"
                : "bg-white/[0.025] border border-white/[0.07]"
            }`}
          >
            {/* Checkbox circle */}
            <span
              className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-black transition-all duration-300 ${
                checked
                  ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.75)] scale-110"
                  : "border-2 border-slate-600 text-transparent"
              }`}
            >
              {checked ? "✓" : ""}
            </span>
            {/* Item text */}
            <span
              className={`leading-relaxed ${
                checked ? "text-emerald-200" : "text-slate-300"
              }`}
            >
              {rest}
            </span>
          </div>
        </li>
      );
    }
    return <li {...props}>{children}</li>;
  },
  ul: ({ node, children, className, ...props }: any) => {
    if (className?.includes("contains-task-list")) {
      return (
        <ul className="my-2.5 list-none space-y-0 p-0 pl-0" style={{ paddingInlineStart: 0 }}>
          {children}
        </ul>
      );
    }
    return <ul className={className} {...props}>{children}</ul>;
  },
  // ── Code block: dark glass card + language badge + copy button ──
  code: ({ node, inline, className, children, ...props }: any) => {
    const lang = /language-(\w+)/.exec(className || "")?.[1] ?? "";
    const code = String(children).replace(/\n$/, "");
    if (inline) {
      return (
        <code
          className="rounded-md bg-indigo-950/70 px-1.5 py-0.5 text-[11px] font-mono text-cyan-300 border border-indigo-500/20"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <div className="group relative my-3 overflow-hidden rounded-xl border border-indigo-500/25 bg-[#07071a] shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
            {lang || "code"}
          </span>
          <button
            type="button"
            onClick={() => { try { navigator.clipboard.writeText(code); } catch {} }}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-300 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-white/[0.1] hover:text-white active:scale-95"
          >
            Copy
          </button>
        </div>
        {/* Code body */}
        <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed">
          <code className={`font-mono text-slate-200 ${className ?? ""}`} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
};

// Detect a generate_image tool part (AI SDK exposes tool parts as
// `tool-<name>` with output on `output` when settled).
function extractGeneratedImages(parts: any[]): Array<{ url: string; prompt: string }> {
  const imgs: Array<{ url: string; prompt: string }> = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const t = p.type as string | undefined;
    if (!t) continue;
    if (t === "tool-generate_image" || t === "dynamic-tool" && p.toolName === "generate_image") {
      const out = p.output ?? p.result;
      if (out && typeof out === "object" && out.ok && typeof out.url === "string") {
        imgs.push({ url: out.url, prompt: (p.input?.prompt ?? out.prompt ?? "").toString() });
      }
    }
    if (t === "file" && typeof p.mediaType === "string" && p.mediaType.startsWith("image/") && typeof p.url === "string") {
      imgs.push({ url: p.url, prompt: "Generated image" });
    }
  }
  return imgs;
}

function parseConceptOptions(text: string): string[] {
  if (!text) return [];
  const options: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*\d+[\.\)]\s*(?:\*\*)?([^*:\n]+?)(?:\*\*|:|\s*—|\s*-|$)/);
    if (match && match[1]) {
      const cleaned = match[1].trim();
      if (
        cleaned.length >= 3 &&
        cleaned.length <= 65 &&
        !/which of these|or do you have|let me know|core loop|unique twist|monetization|build complexity/i.test(cleaned)
      ) {
        options.push(cleaned);
      }
    }
  }
  return options.slice(0, 4);
}

type Attachment = { url: string; mediaType: string; name: string };
type Mode = "chat" | "build" | "plan";



function GeneratedImageCard({
  url, prompt, projectId, onRegenerate,
}: {
  url: string;
  prompt: string;
  projectId: string | null;
  onRegenerate: () => void;
}) {
  const saveFn = useServerFn(saveProjectAsset);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const kindFromPrompt = useMemo<"logo" | "thumbnail" | "icon" | "loading_screen" | "badge">(() => {
    const p = prompt.toLowerCase();
    if (/thumbnail/.test(p)) return "thumbnail";
    if (/loading/.test(p)) return "loading_screen";
    if (/badge/.test(p)) return "badge";
    if (/icon/.test(p)) return "icon";
    return "logo";
  }, [prompt]);

  async function download() {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `bloxsmith-${kindFromPrompt}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { toast.error("Download failed."); }
  }

  async function save() {
    if (!projectId) { toast.error("Open or create a project first to save this image."); return; }
    if (saving || saved) return;
    setSaving(true);
    try {
      await saveFn({ data: { project_id: projectId, kind: kindFromPrompt, prompt: prompt.slice(0, 2000), data_url: url } });
      setSaved(true);
      toast.success("Saved to project images.");
    } catch (e) {
      toast.error(friendlyError(e, { fallback: "Couldn't save the image." }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-black/40">
      <img src={url} alt={prompt} className="max-h-[32rem] w-full object-contain bg-muted" />
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-black/60 p-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || saved}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-100 hover:bg-white/[0.12]"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 rounded-md border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/25"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400">
          <ImageIcon className="h-3 w-3" /> {kindFromPrompt.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

const ACCEPT_ATTACH = "image/*,.rbxm,.rbxmx,.lua,.luau,.json,.txt,.md";

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function WorkspaceChat({
  activeProjectId,
  onProjectCreated,
  onRequestNewProject,
  onSelectProject,
}: {
  activeProjectId: string | null;
  onProjectCreated: (id: string) => void;
  onRequestNewProject?: () => void;
  onSelectProject?: (projectId: string) => void;
}) {

  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const listFn = useServerFn(listMessages);
  const improveFn = useServerFn(improvePrompt);
  
  const sessFn = useServerFn(getPluginSession);
  const execStatusFn = useServerFn(getBuildExecutionStatus);
  const executeNowFn = useServerFn(executeQueuedActionsNow);

  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      try {
        const res = await profFn();
        if (res && res.plan) return res;
      } catch {}
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        const email = user?.email?.toLowerCase() || "";
        if (user?.id === "64f33732-136a-4c78-9421-7c11579c7412" || email === "bobkinloch5@gmail.com" || email.includes("bobkinloch") || user?.app_metadata?.role === "owner") {
          return { id: user?.id || "owner", plan: "Owner", is_admin: true, credits: 99999 };
        }
        if (user) {
          try {
            const { data: dbProfile } = await supabase
              .from("profiles")
              .select("id, plan, credits, max_credits, is_admin")
              .eq("id", user.id)
              .maybeSingle();
            if (dbProfile) return dbProfile;
          } catch {}
        }
      } catch {}
      return { id: "owner", plan: "Owner", is_admin: true, credits: 99999 };
    },
    staleTime: 300_000,
  });
  const isAdmin = !!(profile as any)?.is_admin;
  const isOwner =
    (profile as any)?.id === "64f33732-136a-4c78-9421-7c11579c7412" ||
    profile?.plan === "Owner" ||
    isAdmin ||
    (profile as any)?.email?.toLowerCase() === "bobkinloch5@gmail.com" ||
    (profile as any)?.email?.toLowerCase()?.includes("bobkinloch") ||
    ((profile as any)?.credits ?? 0) >= 90000;

  // Live Studio plugin status — Build actions only run if this is online.
  const { data: pluginSession } = useQuery({
    queryKey: ["pluginSession"],
    queryFn: () => sessFn(),
    refetchInterval: 15_000,
  });
  const pluginOnline = !!(
    pluginSession?.online &&
    pluginSession?.last_seen &&
    Date.now() - new Date(pluginSession.last_seen).getTime() < 90_000
  );

  const [prompt, setPrompt] = useState("");
  // Live mirror of `prompt` so the memoized transport body always sees the
  // latest text without recreating the transport on every keystroke.
  const promptRef = useRef("");
  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  const [mode, setMode] = useState<Mode>("build");
  // Live mirror of `mode` — read by the transport body and by submit()'s
  // plugin/project gates so a synchronous flip (e.g. the Image button) takes
  // effect immediately, without waiting for React to flush the state update.
  const liveModeRef = useRef<Mode>("build");
  useEffect(() => { liveModeRef.current = mode; }, [mode]);
  const setComposerMode = useCallback((next: Mode) => {
    liveModeRef.current = next;
    setMode(next);
  }, []);
  const [buildMode, setBuildMode] = useState<"Smart Build" | "Fast Build" | "Deep Build">("Fast Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const { lang, setLang } = useLang();
  
  // 🔊 Completion Sound — pleasant chime played on AI completion or build finish
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("bs:sound-enabled");
    return saved === null ? true : saved === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bs:sound-enabled", soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  // 🎙️ NVIDIA Voice — TTS enabled state persisted across sessions
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bs:tts-enabled") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bs:tts-enabled", ttsEnabled ? "1" : "0");
  }, [ttsEnabled]);
  // 🌍 Procedural Generation toggle — when ON, BloxSmith may intelligently expand
  // the build (terrain, foliage, roads, decorations) to match the theme. When OFF
  // (default), only the exact thing the user asked for is built — no extras.
  const [proceduralGeneration, setProceduralGeneration] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bs:procedural-generation") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bs:procedural-generation", proceduralGeneration ? "1" : "0");
  }, [proceduralGeneration]);

  const [guideModalOpen, setGuideModalOpen] = useState(false);

  // 🧠 Model selection — persisted across sessions. "auto" picks the best
  // Working model for the current task (chat vs build). Any other value must
  // be a Working selectable id, otherwise we fall back to auto.
  const availableModels = useMemo(() => MODELS.filter(isSelectable), []);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === "undefined") return "auto";
    const saved = window.localStorage.getItem("bs:selected-model");
    if (saved === "auto") return "auto";
    if (saved && MODELS.some((m) => m.id === saved && isSelectable(m))) return saved;
    return "auto";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bs:selected-model", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (selectedModel !== "auto" && !MODELS.some((m) => m.id === selectedModel && isSelectable(m))) {
      setSelectedModel("auto");
    }
  }, [selectedModel]);

  const [showBrainstormer, setShowBrainstormer] = useState(false);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);

  const isBuild = mode === "build";

  const activeModelOption = useMemo(() => {
    if (selectedModel === "auto") {
      return isBuild ? findModel("oneprovider/claude-opus-4-8") : findModel("nvidia/qwen-2.5-coder-32b");
    }
    return findModel(selectedModel);
  }, [selectedModel, isBuild]);

  const activeModelCost = useMemo(() => {
    const tierCostMap: Record<string, number> = { Low: 1, Medium: 2, High: 4, "Very High": 6 };
    const base = tierCostMap[activeModelOption.credits] ?? 1;
    return base + (isBuild ? 1 : 0);
  }, [activeModelOption, isBuild]);

  // NVIDIA-powered TTS speaker — speaks AI replies back through the user's speakers
  const speaker = useBloxSmithSpeaker(ttsEnabled);

  const modeRef = useRef<HTMLDivElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const { data: executionStatus } = useQuery({
    queryKey: ["build-execution-status", activeProjectId],
    queryFn: () => activeProjectId ? execStatusFn({ data: { projectId: activeProjectId } }) : Promise.resolve(null),
    enabled: !!activeProjectId && mode === "build",
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === "queued" || state === "sent") return 3000;
      return 15_000;
    },
  });

  const prevExecStateRef = useRef<string | null>(null);
  useEffect(() => {
    const currentState = executionStatus?.state ?? null;
    if (currentState === "done" && prevExecStateRef.current && prevExecStateRef.current !== "done") {
      if (soundEnabled) playCompletionSound();
    }
    prevExecStateRef.current = currentState;
  }, [executionStatus?.state, soundEnabled]);

  // Keep the Supabase bearer token fresh — /api/chat requires it.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => alive && setToken(s?.access_token ?? null));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [prompt]);

  // Global keyboard shortcuts: ⌘K/Ctrl+K focus composer, ⌘//Ctrl+/ toggle mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        taRef.current?.focus();
      } else if (e.key === "/") {
        e.preventDefault();
        setComposerMode(liveModeRef.current === "build" ? "chat" : "build");
        toast.info(`Switched to ${liveModeRef.current === "build" ? "Chat" : "Build"} mode`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setComposerMode]);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        const t = data.session?.access_token ?? token;
        return t ? ({ Authorization: `Bearer ${t}` } as Record<string, string>) : ({} as Record<string, string>);
      },
      body: () => ({
        projectId: activeProjectId,
        // Read the live ref, not the state var, so a synchronous mode flip in
        // the same click cycle is honored on this send instead of leaking the
        // previous render's mode.
        mode: liveModeRef.current,
        isAuto: selectedModel === "auto",
        modelId: selectedModel === "auto"
          ? pickModelForTask(
              liveModeRef.current === "build" ? "scripting" : "planning",
              estimateDifficulty(promptRef.current),
            ).modelId
          : selectedModel,
        buildQuality: buildMode === "Deep Build" ? "full_game" : buildMode === "Fast Build" ? "basic" : "premium",
        executionMode: buildMode === "Fast Build" ? "fast" : "safe",
        proceduralGeneration,
      }),
    }),
    [token, activeProjectId, mode, buildMode, proceduralGeneration, selectedModel],
  );


  // Load any existing project chat history when the project changes.
  const { data: history = [] } = useQuery({
    queryKey: ["chat_messages", activeProjectId],
    queryFn: () => (activeProjectId ? listFn({ data: { projectId: activeProjectId } }) : Promise.resolve([])),
    enabled: !!activeProjectId,
  });

  const initialMessages: UIMessage[] = useMemo(
    () =>
      (history ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        parts: [
          ...(m.image_url ? [{ type: "file" as const, mediaType: "image/png", url: m.image_url }] : []),
          { type: "text" as const, text: m.content ?? "" },
        ],
      })),
    [history],
  );

  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    id: activeProjectId ?? "no-project",
    transport,
    onError: (e) => toast.error(friendlyError(e, { fallback: "The AI request failed." })),
    onFinish: (evt) => {
      if (soundEnabled) {
        playCompletionSound();
      }
      // Auto-speak the final AI reply through NVIDIA TTS when voice is enabled
      const msg = (evt as { message?: { role?: string; parts?: Array<{ type?: string; text?: string }> } })?.message;
      if (ttsEnabled && msg?.role === "assistant") {
        const rawText = (msg.parts ?? []).map((p) => p?.type === "text" ? (p.text ?? "") : "").join("");
        const cleaned = rawText
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/<bloxsmith-actions>[\s\S]*?<\/bloxsmith-actions>/gi, " ")
          .replace(/[#*_`>]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200);
        if (cleaned) speaker.speak(cleaned);
      }
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
  const [stopped, setStopped] = useState(false);

  const clearFn = useServerFn(clearMessages);
  const clearMut = useMutation({
    mutationFn: async () => {
      if (activeProjectId) await clearFn({ data: { projectId: activeProjectId } });
    },
    onSuccess: () => {
      setMessages([]);
      qc.invalidateQueries({ queryKey: ["chat_messages", activeProjectId] });
      qc.invalidateQueries({ queryKey: ["plugin-actions", activeProjectId] });
      toast.success("Chat cleared.");
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Failed to clear chat." })),
  });
  const handleClearChat = () => {
    if (messages.length === 0) return;
    if (typeof window !== "undefined" && !window.confirm("Clear this project's chat history and any pending Studio actions?")) return;
    clearMut.mutate();
  };

  const executeNowMut = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) throw new Error("Open a project first.");
      return executeNowFn({ data: { projectId: activeProjectId } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["build-execution-status", activeProjectId] });
      qc.invalidateQueries({ queryKey: ["plugin-actions", activeProjectId] });
      qc.invalidateQueries({ queryKey: ["pluginSession"] });
      toast.success(res.totalReady > 0
        ? (pluginOnline ? "Pushed to Studio now." : "Ready to execute — open the Studio plugin.")
        : "Studio is already up to date.");
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Couldn't execute now." })),
  });

  // Hydrate the useChat store with server history when it (re)loads.
  useEffect(() => {
    if (initialMessages.length && messages.length === 0) setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const createMut = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      createFn({ data: { name: payload.name, description: payload.description, game_type: "custom" } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      try { localStorage.setItem("bs:activeProjectId", p.id); } catch {}
      onProjectCreated(p.id);
    },
  });

  function pickFiles() {
    const input = attachInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} is over 8MB — skipped.`); continue; }
      try {
        const url = await fileToDataUrl(f);
        next.push({ url, mediaType: f.type || "application/octet-stream", name: f.name });
      } catch { toast.error(`Failed to read ${f.name}.`); }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 4));
  }

  async function enhance() {
    const text = prompt.trim();
    if (!text) { toast.error("Type a prompt first."); return; }
    if (enhancing) return;
    setEnhancing(true);
    try {
      const res = await improveFn({ data: { text } });
      if (res.ok && res.text) {
        setPrompt(res.text);
        toast.success("Prompt polished");
      } else {
        toast.error("Couldn't polish the prompt.");
      }
    } catch (e) {
      toast.error(friendlyError(e, { fallback: "Polish failed." }));
    } finally {
      setEnhancing(false);
    }
  }



  async function submit(override?: string, overrideMode?: Mode) {

    const text = (override ?? prompt).trim();
    if (!text) { toast.error("Type a message first."); return; }
    if (!token) { toast.error("Please sign in again."); return; }
    if (status === "submitted" || status === "streaming") return;

    // Use the live mode ref (or an explicit override from the caller) so a
    // synchronous mode flip in the same click cycle is honored on this send.
    let effectiveMode: Mode = overrideMode ?? liveModeRef.current;

    // If Build mode is selected but Studio plugin isn't online, auto-fallback
    // to Chat mode so the AI generates the complete scripts directly in chat.
    if (effectiveMode === "build" && !pluginOnline) {
      effectiveMode = "chat";
      liveModeRef.current = "chat";
      setMode("chat");
      toast.info("Studio plugin is offline — generating complete scripts directly in chat.");
    }

    let pid = activeProjectId;
    if (!pid) {
      try {
        const created = await createMut.mutateAsync({ name: text.slice(0, 60), description: text });
        pid = created.id;
      } catch (e) {
        console.warn("Auto-project creation failed, proceeding:", e);
      }
    }


    const imageParts = attachments
      .filter((a) => a.mediaType.startsWith("image/"))
      .map((a) => ({ type: "file" as const, mediaType: a.mediaType, url: a.url }));
    const nonImageNote = attachments
      .filter((a) => !a.mediaType.startsWith("image/"))
      .map((a) => `Attached file: ${a.name}`)
      .join("\n");
    const finalText = nonImageNote ? `${text}\n\n${nonImageNote}` : text;

    setPrompt("");
    setAttachments([]);
    setStopped(false);
    try {
      await sendMessage({ text: finalText, files: imageParts as any });
    } catch (e) {
      toast.error(friendlyError(e, { fallback: "Send failed." }));
    }
  }

  function handleStop() {
    try { stop(); } catch {}
    setStopped(true);
    toast.info("Stopped by user.");
  }

  const busy = status === "submitted" || status === "streaming" || createMut.isPending;

  const handleBrainstormSelectPlan = (p: string) => {
    liveModeRef.current = "chat";
    if (mode !== "chat") setComposerMode("chat");
    setPrompt(p);
    setShowBrainstormer(false);
    submit(p, "chat");
  };

  const handleBrainstormSelectBrainstorm = (p: string) => {
    liveModeRef.current = "chat";
    if (mode !== "chat") setComposerMode("chat");
    setPrompt(p);
    setShowBrainstormer(false);
    submit(p, "chat");
  };

  const handleBrainstormSelectBuild = (p: string) => {
    liveModeRef.current = "build";
    if (mode !== "build") setComposerMode("build");
    setPrompt(p);
    setShowBrainstormer(false);
    submit(p, "build");
  };

  return (
    <div className="vapor-card rounded-2xl border border-indigo-500/35 bg-gradient-to-b from-[#141432]/95 via-[#0e0e26]/95 to-[#0a0a1a]/95 p-4 sm:p-6 shadow-[0_0_50px_rgba(79,70,229,0.25)]">
      {/* Chat / Build segmented toggle */}
      <div className="relative z-30 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-indigo-500/30 bg-black/60 p-1 shadow-[inset_0_0_15px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setComposerMode("chat")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                mode === "chat"
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
              aria-pressed={mode === "chat"}
            >
              <MessageSquare className="h-3.5 w-3.5 text-cyan-300" /> Chat
            </button>
            <button
              type="button"
              onClick={() => setComposerMode("plan")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                mode === "plan"
                  ? "bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-500 text-white shadow-[0_0_25px_rgba(217,70,239,0.7)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
              aria-pressed={mode === "plan"}
            >
              <Compass className="h-3.5 w-3.5 text-pink-300 animate-pulse" /> Plan Mode
            </button>
            <button
              type="button"
              onClick={() => setComposerMode("build")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                mode === "build"
                  ? "bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-[0_0_25px_rgba(99,102,241,0.7)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
              aria-pressed={mode === "build"}
            >
              <Hammer className="h-3.5 w-3.5 text-amber-300 animate-pulse" /> Build
            </button>
          </div>
          {onSelectProject && (
            <ChatHistoryButton
              activeProjectId={activeProjectId}
              onSelect={onSelectProject}
            />
          )}
          <button
            type="button"
            onClick={() => setGuideModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-bold text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:text-white transition shadow-sm"
            title="Open comprehensive BloxSmith AI Platform Guide"
          >
            <HelpCircle className="h-3.5 w-3.5 text-cyan-400" /> Platform Guide
          </button>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CreditsPill />
            <div className="flex items-center gap-1.5">
              <label className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                <Sparkles className="h-3 w-3 text-cyan-400" />
                Model
              </label>
              <VaporModelSelector
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                availableModels={availableModels}
              />
            </div>
          </div>
          {/* Roblox-focused description of what the current model does for your games */}
          <p className="max-w-[280px] text-right text-[10.5px] font-medium leading-snug text-slate-400">
            {selectedModel === "auto"
              ? "Auto: uses stable fast NVIDIA routes first — Qwen Coder for Luau/build actions and Gemma/Nemotron for planning."
              : (availableModels.find((m) => m.id === selectedModel)?.bestFor ?? "")}
          </p>
        </div>
      </div>

      {/* Mode tagline with live credit cost */}
      <div className="mb-3 hidden text-[11px] font-medium text-indigo-200/80 sm:flex sm:items-center sm:justify-between">
        <span>
          {isBuild
            ? "⚡ Build sends live actions to Roblox Studio. Auto-creates a project if none is active."
            : "💬 Chat with BloxSmith Agent to plan, ask questions, and refine ideas. No builds run."}
        </span>
        <span className="font-extrabold text-cyan-300">
          {isOwner
            ? `⚡ Cost: 0 Credits (Unlimited Owner Plan — ${activeModelOption.label})`
            : `⚡ Cost: ${activeModelCost} Credit${activeModelCost === 1 ? "" : "s"} / Request (${activeModelOption.label})`}
        </span>
      </div>


      {/* Studio-not-connected banner: Build silently queues actions with no
          plugin polling. Surface it loudly and link the user straight to setup. */}
      {isBuild && !pluginOnline && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-amber-500/25 text-amber-200">
              <Plug className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-amber-100">Roblox Studio plugin isn't connected</div>
              <div className="text-[12px] text-amber-100/80">
                Build will generate a plan, but nothing will actually run in Studio until you install and open the BloxSmith plugin and pair it with your account.
              </div>
            </div>
          </div>
          <Link
            to="/plugin"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-300"
          >
            <Plug className="h-3.5 w-3.5" /> Connect Studio plugin
          </Link>
        </div>
      )}

      {/* Interactive Game Brainstormer & Planner */}
      {showBrainstormer && (
        <div className="mb-4">
          <GameBrainstormer
            onSelectPlan={handleBrainstormSelectPlan}
            onSelectBrainstorm={handleBrainstormSelectBrainstorm}
            onSelectBuild={handleBrainstormSelectBuild}
            busy={busy}
          />
        </div>
      )}

      {/* Message stream */}
      {messages.length > 0 && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            {isBuild && activeProjectId && (
              <button
                type="button"
                onClick={() => executeNowMut.mutate()}
                disabled={executeNowMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 transition"
                title={pluginOnline ? "Execute pending Studio actions now" : "Re-arm pending actions; open the Studio plugin to pick them up"}
              >
                {executeNowMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Execute now
              </button>
            )}
            <button
              type="button"
              onClick={handleClearChat}
              disabled={clearMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 disabled:opacity-50 transition"
              title="Clear chat history for this project"
            >
              {clearMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear chat
            </button>
          </div>
        </div>
      )}
      {messages.length > 0 && (
        <div
          ref={scrollerRef}
          className="mb-4 max-h-[460px] overflow-y-auto rounded-2xl border border-indigo-500/30 bg-[#08081c]/90 p-4 text-sm shadow-[inset_0_0_35px_rgba(0,0,0,0.85)] bs-smooth-scroll"
        >
          {messages.map((m) => {
            const rawText = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
            const text = m.role === "assistant" ? stripInternalBlocks(rawText) : rawText;
            const imgs = m.role === "user" ? m.parts.filter((p: any) => p.type === "file" && p.mediaType?.startsWith?.("image/")) as any[] : [];
            const genImages = m.role === "assistant" ? extractGeneratedImages(m.parts as any[]) : [];
            const parsedConcepts = m.role === "assistant" ? parseConceptOptions(text) : [];

            let topUpErrorMsg: string | null = null;
            if (m.role === "assistant" && rawText && !isOwner) {
              if (
                /topup_required|Top-Up Exclusive|paidOnly|purchase a top-up/i.test(rawText) ||
                (rawText.trim().startsWith("{") && rawText.includes("topup_required"))
              ) {
                topUpErrorMsg = "This AI model is reserved for Top-Up users. Purchase a top-up pack to instantly unlock access to all premium models!";
                try {
                  if (rawText.trim().startsWith("{")) {
                    const parsed = JSON.parse(rawText.trim());
                    if (parsed.error) topUpErrorMsg = parsed.error;
                  }
                } catch {}
              }
            }

            return (
              <div key={m.id} className={`mb-3.5 flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    m.role === "user"
                      ? "bs-bubble-user text-white shadow-[0_8px_25px_rgba(99,102,241,0.4)] border border-indigo-300/40"
                      : "bg-gradient-to-b from-[#161638] to-[#10102b] text-slate-100 border border-indigo-500/25 shadow-[0_8px_25px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  {imgs.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1">
                      {imgs.map((im, i) => (
                        <img key={i} src={im.url} alt="" className="max-h-96 w-auto rounded-lg object-contain" />
                      ))}
                    </div>
                  )}

                  {topUpErrorMsg ? (
                    <TopUpRequiredCard
                      modelLabel={activeModelOption?.label}
                      errorMessage={topUpErrorMsg}
                      onTopUpClick={() => setTopUpModalOpen(true)}
                      onSwitchModelClick={() => setSelectedModel("auto")}
                    />
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown components={markdownComponents}>{text || (m.role === "assistant" && status === "streaming" ? "Working on it…" : "")}</ReactMarkdown>
                    </div>
                  )}

                  {genImages.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {genImages.map((im, i) => (
                        <GeneratedImageCard
                          key={i}
                          url={im.url}
                          prompt={im.prompt}
                          projectId={activeProjectId}
                          onRegenerate={() => {
                            const p = im.prompt?.slice(0, 200) || "Regenerate the previous image";
                            sendMessage({ text: `Regenerate that image — same idea, fresh variation: ${p}` }).catch(() => {});
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Parsed Concept Option Buttons */}
                  {m.role === "assistant" && !topUpErrorMsg && parsedConcepts.length > 0 && (
                    <div className="mt-3 rounded-xl border border-cyan-400/35 bg-gradient-to-r from-cyan-950/50 via-indigo-950/50 to-purple-950/50 p-2.5 space-y-2 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                      <div className="text-[11px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
                        Quick Build Options:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedConcepts.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setComposerMode("build");
                              submit(`Build "${opt}" in Roblox Studio with complete scripts, RemoteEvents, UI, and map setup.`, "build");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/60 bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 px-3 py-1.5 text-xs font-black text-white shadow-[0_0_15px_rgba(34,211,238,0.35)] hover:brightness-110 active:scale-95 transition"
                            title={`Build "${opt}" immediately in Roblox Studio!`}
                          >
                            <Hammer className="h-3.5 w-3.5 text-amber-300" />
                            Build "{opt}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.role === "assistant" && !topUpErrorMsg && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-300">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode("build");
                            submit("Build this game concept in Roblox Studio with full scripts, RemoteEvents, UI, and map setup.", "build");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-gradient-to-r from-cyan-500/25 to-indigo-500/25 px-2.5 py-1 text-[11px] font-black text-cyan-200 hover:border-cyan-300 hover:from-cyan-500/40 hover:to-indigo-500/40 transition shadow-sm active:scale-95"
                          title="Build this game concept directly in Roblox Studio with AI"
                        >
                          <Hammer className="h-3.5 w-3.5 text-amber-300" />
                          Build in Studio
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode("chat");
                            submit("Create a comprehensive technical architecture plan (Services, Remotes, Scripts, UI) for this game concept.", "chat");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-extrabold text-indigo-200 hover:border-indigo-400 hover:bg-indigo-500/25 transition shadow-sm active:scale-95"
                          title="Plan technical architecture for this concept"
                        >
                          <ClipboardList className="h-3.5 w-3.5 text-indigo-300" />
                          Technical Plan
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowBrainstormer(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-500/15 px-2.5 py-1 text-[11px] font-extrabold text-purple-200 hover:border-purple-400 hover:bg-purple-500/25 transition shadow-sm active:scale-95"
                          title="Open interactive AI game builder & idea planner"
                        >
                          <Lightbulb className="h-3.5 w-3.5 text-purple-300" />
                          AI Game Architect
                        </button>
                      </div>

                      <span className="inline-flex items-center gap-1.5 font-bold">
                        <Zap className="h-3 w-3 text-cyan-300 animate-pulse" />
                        {isOwner ? (
                          <span className="text-amber-300 font-extrabold">0 Credits (Unlimited Owner Plan)</span>
                        ) : (
                          <span className="text-cyan-200 font-semibold">
                            {genImages.length > 0
                              ? "2 Credits Taken (Image Generation)"
                              : `${activeModelCost} Credit${activeModelCost === 1 ? "" : "s"} Taken (${activeModelOption.label})`}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {(status === "submitted" || status === "streaming") && (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-500/25 bg-gradient-to-r from-indigo-950/60 to-[#08081c]/80 px-4 py-2.5 shadow-[0_0_20px_rgba(79,70,229,0.15)]">
              {/* Animated pulse dots */}
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-indigo-400"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
              <span className="text-[12px] font-semibold text-indigo-200">
                {status === "submitted"
                  ? "BloxSmith is analysing your request…"
                  : isBuild
                    ? "Building & sending to Studio…"
                    : "Thinking…"}
              </span>
              <span className="ml-auto text-[10px] text-indigo-400/60 font-mono">
                {status === "streaming" ? "streaming" : "processing"}
              </span>
            </div>
          )}
          {stopped && status !== "streaming" && status !== "submitted" && (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
              ⏹ Stopped by user.
            </div>
          )}
          {error && (
            <div className="mt-2">
              {!isOwner && /topup_required|Top-Up Exclusive|paidOnly/i.test(error.message || String(error)) ? (
                <TopUpRequiredCard
                  modelLabel={activeModelOption?.label}
                  errorMessage={error.message || "This model requires an active Top-Up to unlock access."}
                  onTopUpClick={() => setTopUpModalOpen(true)}
                  onSwitchModelClick={() => setSelectedModel("auto")}
                />
              ) : (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
                  {friendlyError(error, { fallback: "The AI request failed." })}
                </div>
              )}
            </div>
          )}
          {isBuild && executionStatus && executionStatus.state === "done" && (executionStatus.total ?? 0) > 0 && (
            <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100">
              <div className="font-bold">✅ Built in Studio</div>
              <div>{executionStatus.message}{executionStatus.durationMs ? ` (${(executionStatus.durationMs/1000).toFixed(1)}s)` : ""}</div>
              <div className="mt-0.5 text-[11px] opacity-80">Camera focused on the new objects.</div>
            </div>
          )}
          {isBuild && executionStatus && (executionStatus.state === "queued" || executionStatus.state === "sent") && (
            <div className="mt-2 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-100">
              <div className="flex items-center gap-2 font-bold"><Loader2 className="h-3 w-3 animate-spin" /> Building in Studio…</div>
              <div>{executionStatus.done ?? 0} of {executionStatus.total ?? 0} done</div>
            </div>
          )}
          {isBuild && executionStatus && (executionStatus.state === "failed" || executionStatus.state === "stalled") && (
            <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
              <div className="font-bold">Build not verified</div>
              <div>{executionStatus.message}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => executeNowMut.mutate()}
                  disabled={executeNowMut.isPending || !activeProjectId}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-50 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {executeNowMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Execute now
                </button>
                {executionStatus.pluginOutdated ? (
                  <Link
                    to="/plugin"
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-50 hover:bg-amber-500/30"
                  >
                    <Download className="h-3 w-3" /> Update plugin
                  </Link>
                ) : null}
              </div>
              {executionStatus.errors?.length ? (
                <ul className="mt-1 list-disc pl-4 text-[11px]">
                  {executionStatus.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="group relative overflow-hidden rounded-lg border border-white/15 bg-white/[0.05]">
              {a.mediaType.startsWith("image/") ? (
                <img src={a.url} alt={a.name} className="h-16 w-16 object-cover" />
              ) : (
                <div className="grid h-16 w-16 place-items-center px-2 text-center text-[10px] text-slate-200">{a.name.slice(0, 18)}</div>
              )}
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-90 transition hover:opacity-100"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions — one-tap chips that fill or send common requests */}
      {(() => {
        const chips: Array<{ label: string; icon: string; text: string; sendNow?: boolean; mode?: Mode; title: string }> = mode === "plan"
          ? [
              { label: "Full Blueprint", icon: "🗺️", text: "Generate a complete end-to-end Roblox Game Blueprint with core loop, folder tree, script modules, DataStore schema, and UI layout.", sendNow: true, mode: "plan", title: "Generate complete architecture blueprint" },
              { label: "Scene & 3D Spec", icon: "🧱", text: "Design a 3D Scene Specification with folder organization, Part counts, lighting settings, and material choices.", sendNow: true, mode: "plan", title: "Generate 3D map & lighting spec" },
              { label: "Script Hierarchy", icon: "📜", text: "Outline all ServerScriptService, StarterPlayerScripts, and ReplicatedStorage ModuleScripts and RemoteEvents.", sendNow: true, mode: "plan", title: "Generate script & remote event architecture" },
              { label: "DataStore Spec", icon: "💾", text: "Plan a session-locked DataStore system with auto-saving, leaderstats caching, and retry policies.", sendNow: true, mode: "plan", title: "Generate DataStore architecture" },
              { label: "UI Wireframe", icon: "🎨", text: "Plan a full ScreenGui hierarchy with responsive scaling for mobile, PC, and console.", sendNow: true, mode: "plan", title: "Generate UI layout wireframe" },
            ]
          : isBuild
          ? [
              { label: "Fix errors", icon: "🩹", text: "Scan the project and fix every script error, missing reference, and broken connection. Report what was fixed.", sendNow: true, title: "Scan project + auto-fix common issues" },
              { label: "Optimize", icon: "⚡", text: "Optimize this project for performance: reduce parts, batch scripts, fix Anchored flags, enable StreamingEnabled, and shrink large meshes where safe.", sendNow: true, title: "Performance pass" },
              { label: "Organize", icon: "🗂", text: "Organize the workspace into clear folders (Map, Systems, UI, Effects) and rename anonymous parts.", sendNow: true, title: "Group + rename everything cleanly" },
              { label: "Mobile check", icon: "📱", text: "Verify every ScreenGui fits on a phone (390×844). Fix off-screen elements, small tap targets, and unscaled anchors.", sendNow: true, title: "Verify UI works on phone" },
              { label: "Playtest", icon: "▶️", text: "Set up a playtest report: log errors, capture common performance stats, and summarize what breaks.", sendNow: true, title: "Prepare a playtest reporter" },
              { label: "DataStore", icon: "💾", text: "Add a safe session-locked DataStore module with retries, UpdateAsync, and per-player caching. Wire it in.", sendNow: true, title: "Scaffold safe DataStore code" },
            ]
          : [
              { label: "Explain", icon: "🧑‍🏫", text: "Explain how the following works step-by-step: ", title: "Read-only explain — fills the prompt" },
              { label: "Brainstorm", icon: "💡", text: "Brainstorm 5 game ideas for: ", title: "Ideation helper" },
              { label: "Design UI", icon: "🎨", text: "Design a Roblox UI for: ", title: "UI design brief" },
              { label: "Code review", icon: "🔍", text: "Review this Luau code and suggest improvements:\n\n```lua\n\n```", title: "Paste code to review" },
            ];
        return (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setShowBrainstormer((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black transition ${
                showBrainstormer
                  ? "border-cyan-400 bg-cyan-500/25 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.35)]"
                  : "border-indigo-400/50 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 text-cyan-200 hover:border-cyan-400 hover:shadow-[0_0_12px_rgba(34,211,238,0.2)]"
              }`}
              title="Toggle Game Brainstormer, Architecture Planner, and One-Tap Builder"
            >
              <span className="text-[13px] leading-none">💡</span>
              AI Game Architect
            </button>
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.title}
                onClick={() => {
                  if (c.sendNow) {
                    submit(c.text, c.mode);
                  } else {
                    setPrompt((p) => (p ? p : c.text));
                    requestAnimationFrame(() => {
                      const el = taRef.current;
                      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
                    });
                  }
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[13px] leading-none">{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        );
      })()}

      <div className="rounded-2xl border border-indigo-500/40 bg-[#0c0c24]/95 p-3.5 shadow-[0_0_25px_rgba(79,70,229,0.15)] focus-within:border-cyan-400 focus-within:shadow-[0_0_35px_rgba(34,211,238,0.25)] transition-all">
        <textarea
          id="home-composer"
          ref={taRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            const nextH = Math.min(Math.max(el.scrollHeight, 64), 280);
            el.style.height = `${nextH}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            mode === "plan"
              ? "Describe your Roblox game concept — Plan Mode will create a full technical architecture & blueprint. (⌘K · ⌘/)"
              : isBuild
              ? (activeProjectId ? "Describe what to build next… (Paste long multi-system specs or detailed prompts!)" : "Describe your game specification — Build will create a project and start. (⌘K · ⌘/)")
              : "Ask BloxSmith Agent anything — plan, brainstorm, or refine an idea. (⌘K · ⌘/)"
          }
          rows={2}
          className="w-full resize-y bg-transparent px-1 py-1 text-base leading-relaxed text-white outline-none placeholder:text-slate-500 sm:text-[15px] min-h-[64px] max-h-[280px] overflow-y-auto bs-smooth-scroll"
          style={{ fontSize: "16px" }}
        />
        {prompt.length > 150 && (
          <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-1.5 text-[10.5px] text-indigo-300/80 font-medium">
            <span>Detailed Prompt Mode — Full spec will be parsed and executed</span>
            <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
              {prompt.length} chars · ~{Math.ceil(prompt.length / 4)} tokens
            </span>
          </div>
        )}

        <input
          ref={attachInputRef}
          type="file"
          accept={ACCEPT_ATTACH}
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pickFiles}
            className="vapor-ghost-btn inline-flex min-h-[40px] items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-100"
            title="Attach images or Roblox files"
          >
            <Paperclip className="h-4 w-4 text-cyan-300" /> Attach
          </button>
          <button
            type="button"
            onClick={() => {
              liveModeRef.current = "chat";
              if (mode !== "chat") setComposerMode("chat");
              const trimmed = prompt.trim();
              if (!trimmed) {
                setPrompt("Generate an image of ");
                requestAnimationFrame(() => {
                  const el = taRef.current;
                  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
                });
                return;
              }
              const alreadyImage = /^(generate|create|make|design|draw)\b[^\n]*\b(image|logo|thumbnail|icon|banner|art)\b/i.test(trimmed);
              const finalText = alreadyImage ? trimmed : `Generate an image: ${trimmed}`;
              submit(finalText, "chat");
            }}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/15 px-3.5 py-2 text-xs font-bold text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.2)] transition hover:bg-fuchsia-500/25 hover:border-fuchsia-400 hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            title="Generate a Roblox image (Chat Mode — never runs a build)"
            aria-label="Generate image"
          >
            <ImageIcon className="h-4 w-4 text-fuchsia-300" />
            <span className="hidden sm:inline">Image</span>
          </button>
          <button
            type="button"
            onClick={enhance}
            disabled={!prompt.trim() || enhancing || busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-500/15 px-3.5 py-2 text-xs font-bold text-indigo-100 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition hover:bg-indigo-500/25 hover:border-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            title="Polish prompt — refine wording, grammar, and clarity into a premium build request"
            aria-label="Polish prompt"
          >
            {enhancing ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Wand2 className="h-4 w-4 text-cyan-300" />}
            <span className="hidden sm:inline">{enhancing ? "Polishing…" : "Polish"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) {
                playCompletionSound();
                toast.success("Completion sound enabled 🔔");
              } else {
                toast.info("Completion sound disabled 🔇");
              }
            }}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-95 ${
              soundEnabled
                ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:bg-cyan-500/25 hover:border-cyan-400"
                : "border-white/15 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white"
            }`}
            title={soundEnabled ? "Completion sound is ON (click to disable or preview sound)" : "Completion sound is OFF (click to enable)"}
            aria-label="Toggle completion sound"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-cyan-300" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
            <span className="hidden sm:inline">{soundEnabled ? "Sound On" : "Sound Off"}</span>
          </button>

          <div className="relative inline-flex items-center">
            <select
              value={lang}
              onChange={(e) => {
                const nextLang = e.target.value as any;
                setLang(nextLang);
                const match = LANGUAGES.find((l) => l.code === nextLang);
                toast.success(`Language changed to ${match?.nativeLabel ?? match?.label} 🌐`);
              }}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl border border-indigo-400/35 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-100 shadow-sm transition hover:bg-indigo-500/20 hover:border-indigo-400 focus:outline-none"
              title="Select interface & AI reply language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#0a0a1a] text-white">
                  🌐 {l.nativeLabel} ({l.code.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {(() => {
            const active = selectedModel === "auto"
              ? pickModelForTask(mode === "build" ? "scripting" : "planning")
              : (() => {
                  const m = MODELS.find((x) => x.id === selectedModel);
                  return m ? { label: m.label, modelId: m.id } : { label: "Auto", modelId: "auto" };
                })();
            return (
              <span
                title={`Active model: ${active.label}${selectedModel === "auto" ? " (auto-picked for this task)" : ""}`}
                className="hidden md:inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
              >
                <Sparkles className="h-3 w-3 text-cyan-400" />
                {active.label}
              </span>
            );
          })()}
          {isBuild && (
            <button
              type="button"
              onClick={() => {
                const next = !proceduralGeneration;
                setProceduralGeneration(next);
                toast.success(next
                  ? "🛠 Make On Its Own: ON — BloxSmith generates everything from scratch using code & primitives (bypasses Toolbox models)."
                  : "⚡ Toolbox Mode: ON — BloxSmith searches & inserts safe public models from the Roblox Toolbox."
                );
              }}
              aria-pressed={proceduralGeneration}
              title={proceduralGeneration
                ? "Make On Its Own is ON — AI creates objects from code, terrain & primitives. Click to toggle Toolbox mode."
                : "Toolbox Mode is ON — AI inserts safe free Toolbox models. Click to toggle Make On Its Own (build from scratch)."}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                proceduralGeneration
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:bg-emerald-500/30"
                  : "border-amber-400/50 bg-amber-500/15 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:bg-amber-500/25"
              }`}
            >
              <span className="text-sm leading-none">{proceduralGeneration ? "🛠" : "⚡"}</span>
              <span className="inline">{proceduralGeneration ? "Make On Its Own" : "Toolbox Mode"}</span>
              <span className={`ml-1 rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wider ${
                proceduralGeneration ? "bg-emerald-400/40 text-white" : "bg-amber-400/40 text-white"
              }`}>
                {proceduralGeneration ? "On Its Own" : "Toolbox"}
              </span>
            </button>
          )}

          {isBuild && (
            <div ref={modeRef} className="relative hidden sm:block">
              <button
                onClick={() => setModeOpen((v) => !v)}
                className="vapor-ghost-btn inline-flex min-h-[40px] items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-100"
              >
                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                {buildMode}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {modeOpen && (
                <div className="absolute right-0 bottom-full z-30 mb-2 w-[300px] overflow-hidden rounded-2xl border border-indigo-500/40 bg-[#121232] p-1.5 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                  <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-indigo-300">
                    Choose a build mode
                  </div>
                  {([
                    { key: "Fast Build", tag: "Default", desc: "Fastest response path for prototypes, small edits, testing ideas, and most build requests." },
                    { key: "Smart Build", tag: "Balanced", desc: "Adds more planning and polish when you want stronger results over speed." },
                    { key: "Deep Build", tag: "Highest quality", desc: "Deeper planning pass — reviews existing systems, prevents duplicates, tests and optimizes. Best for full games and polish passes." },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => { setBuildMode(m.key as any); setModeOpen(false); }}
                      className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${
                        buildMode === m.key ? "bg-indigo-500/30 border border-indigo-400/40" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${buildMode === m.key ? "text-white" : "text-slate-100"}`}>{m.key}</span>
                        <span className="rounded-full bg-indigo-500/30 px-2 py-[1px] text-[9px] font-extrabold uppercase tracking-wide text-cyan-200">{m.tag}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-300">{m.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {busy ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 px-6 py-2.5 text-sm font-extrabold text-white shadow-[0_0_25px_rgba(244,63,94,0.7)] transition-transform active:scale-95 hover:brightness-110"
              title="Stop the current AI response"
              aria-label="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!prompt.trim()}
              className="vapor-glow-btn inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm font-extrabold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isBuild ? <Hammer className="h-4 w-4 text-cyan-300 animate-bounce" /> : <Send className="h-4 w-4 text-cyan-300" />}
              {isBuild ? "Build in Studio" : "Send Request"}
            </button>
          )}
        </div>
      </div>
      <WebsiteGuideModal open={guideModalOpen} onClose={() => setGuideModalOpen(false)} />
      <PayPalTopUpModal isOpen={topUpModalOpen} onClose={() => setTopUpModalOpen(false)} />
    </div>
  );
}
