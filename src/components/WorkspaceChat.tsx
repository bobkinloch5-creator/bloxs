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
  Download, RefreshCw, Save, Image as ImageIcon, Square, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { createProject } from "@/lib/projects.functions";
import { listMessages, getPluginSession, getBuildExecutionStatus, clearMessages } from "@/lib/chat.functions";
import { improvePrompt } from "@/lib/improve.functions";
import { saveProjectAsset } from "@/lib/project-assets.functions";
import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { VoiceBuildButton } from "@/components/VoiceBuildButton";
import { useBloxSmithSpeaker } from "@/components/VoiceControls";
import { friendlyError } from "@/lib/friendly-error";
import { MODELS, isSelectable } from "@/lib/models";
import { pickModelForTask } from "@/lib/model-router";


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
  }
  return imgs;
}


type Attachment = { url: string; mediaType: string; name: string };
type Mode = "chat" | "build";



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
}: {
  activeProjectId: string | null;
  onProjectCreated: (id: string) => void;
  onRequestNewProject?: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const listFn = useServerFn(listMessages);
  const improveFn = useServerFn(improvePrompt);
  const sessFn = useServerFn(getPluginSession);
  const execStatusFn = useServerFn(getBuildExecutionStatus);

  // Live Studio plugin status — Build actions only run if this is online.
  const { data: pluginSession } = useQuery({
    queryKey: ["pluginSession"],
    queryFn: () => sessFn(),
    refetchInterval: 6000,
  });
  const pluginOnline = !!(
    pluginSession?.online &&
    pluginSession?.last_seen &&
    Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000
  );

  const [prompt, setPrompt] = useState("");
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
  const [buildMode, setBuildMode] = useState<"Smart Build" | "Fast Build" | "Deep Build">("Smart Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
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
    refetchInterval: 2500,
  });

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
        // the same click (Image button → "chat") is honored on the very next
        // send instead of leaking the previous render's mode.
        mode: liveModeRef.current,
        modelId: selectedModel === "auto"
          ? pickModelForTask(liveModeRef.current === "build" ? "scripting" : "planning").modelId
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
    if (typeof window !== "undefined" && !window.confirm("Clear this project's chat history and any queued plugin actions?")) return;
    clearMut.mutate();
  };

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
        toast.success("Prompt improved");
      } else {
        toast.error("Couldn't improve the prompt.");
      }
    } catch (e) {
      toast.error(friendlyError(e, { fallback: "Improve failed." }));
    } finally {
      setEnhancing(false);
    }
  }

  const handleVoiceUtterance = useCallback((text: string) => {
    // Voice utterances always go to Build mode so they execute in Studio
    setComposerMode("build");
    setTimeout(() => {
      submit(text, "build");
    }, 0);
  }, [token, status, activeProjectId, onRequestNewProject, createMut, sendMessage]);

  async function submit(override?: string, overrideMode?: Mode) {

    const text = (override ?? prompt).trim();
    if (!text) { toast.error("Type a message first."); return; }
    if (!token) { toast.error("Please sign in again."); return; }
    if (status === "submitted" || status === "streaming") return;

    // Use the live mode ref (or an explicit override from the caller) so a
    // synchronous mode flip in the same click cycle is honored on this send.
    const effectiveMode: Mode = overrideMode ?? liveModeRef.current;
    liveModeRef.current = effectiveMode;

    // Build mode is a no-op if the Studio plugin isn't connected — actions
    // would just pile up in the queue with nothing polling for them. Block
    // the send, tell the user exactly why, and point them at /plugin.
    if (effectiveMode === "build" && !pluginOnline) {
      toast.error("Roblox Studio plugin isn't connected — install and open the BloxSmith plugin in Studio, then try Build again.");
      return;
    }

    // Only Build needs a project. If none is active, prompt for the new-project
    // modal instead of silently spinning one up from the prompt text.
    let pid = activeProjectId;
    if (!pid && effectiveMode === "build") {
      if (onRequestNewProject) {
        onRequestNewProject();
        toast.info("Create a project first — the details help the AI build the right game.");
        return;
      }
      try {
        const created = await createMut.mutateAsync({ name: text.slice(0, 60), description: text });
        pid = created.id;
      } catch (e) {
        toast.error(friendlyError(e, { fallback: "Could not create a project." }));
        return;
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
  const isBuild = mode === "build";

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-3 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] sm:p-5">
      {/* Chat / Build segmented toggle */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-white/15 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setComposerMode("chat")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              mode === "chat"
                ? "bg-indigo-500 text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.9)]"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
            aria-pressed={mode === "chat"}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </button>
          <button
            type="button"
            onClick={() => setComposerMode("build")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              mode === "build"
                ? "bg-indigo-500 text-white shadow-[0_6px_18px_-8px_rgba(99,102,241,0.9)]"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
            aria-pressed={mode === "build"}
          >
            <Hammer className="h-3.5 w-3.5" /> Build
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Sparkles className="h-3 w-3 text-indigo-300" />
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="max-w-[220px] rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
            title="Choose which AI model handles your next messages. Auto picks the best model for what you're doing."
          >
            <option value="auto" className="bg-slate-900 text-slate-100">
              ⚡ Auto — pick best for task
            </option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-slate-900 text-slate-100">
                {m.label} · {m.provider}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode tagline */}
      <div className="mb-3 hidden text-[11px] text-slate-400 sm:block">
        {isBuild
          ? "Build sends actions to Studio. Auto-creates a project if none is active."
          : "Chat with BloxSmith Agent to plan, ask questions, and refine ideas. No builds run."}
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

      {/* Message stream */}
      {messages.length > 0 && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
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
      )}
      {messages.length > 0 && (
        <div
          ref={scrollerRef}
          className="mb-3 max-h-[420px] overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
        >
          {messages.map((m) => {
            const rawText = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
            const text = m.role === "assistant" ? stripInternalBlocks(rawText) : rawText;
            const imgs = m.parts.filter((p: any) => p.type === "file" && p.mediaType?.startsWith?.("image/")) as any[];
            const genImages = m.role === "assistant" ? extractGeneratedImages(m.parts as any[]) : [];
            return (
              <div key={m.id} className={`mb-3 flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-indigo-500 text-white"
                      : "bg-white/[0.06] text-slate-100 border border-white/10"
                  }`}
                >
                  {imgs.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1">
                      {imgs.map((im, i) => (
                        <img key={i} src={im.url} alt="" className="max-h-96 w-auto rounded-lg object-contain" />
                      ))}
                    </div>
                  )}
                  <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{text || (m.role === "assistant" && status === "streaming" ? "Working on it…" : "")}</ReactMarkdown>
                  </div>
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
                </div>
              </div>
            );
          })}
          {(status === "submitted" || status === "streaming") && (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status === "submitted" ? "Planning your build…" : "Building and sending to Studio…"}
            </div>
          )}
          {stopped && status !== "streaming" && status !== "submitted" && (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
              ⏹ Stopped by user.
            </div>
          )}
          {error && (
            <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
              {friendlyError(error, { fallback: "The AI request failed." })}
            </div>
          )}
          {isBuild && executionStatus && executionStatus.state !== "idle" && (
            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
              executionStatus.state === "done"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : executionStatus.state === "failed" || executionStatus.state === "stalled"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-100"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-100"
            }`}>
              <div className="font-bold">
                {executionStatus.state === "done" ? "Build verified" : executionStatus.state === "failed" || executionStatus.state === "stalled" ? "Build not verified" : "Waiting for Studio confirmation"}
              </div>
              <div>{executionStatus.message}</div>
              <div className="mt-1 text-[11px] opacity-80">
                queued {executionStatus.total ?? 0} · sent {executionStatus.sent ?? 0} · done {executionStatus.done ?? 0} · failed {executionStatus.failed ?? 0}
                {executionStatus.durationMs ? ` · ${Math.round(executionStatus.durationMs / 100) / 10}s` : ""}
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

      <textarea
        id="home-composer"
        ref={taRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
        placeholder={
          isBuild
            ? (activeProjectId ? "Describe what to build next…" : "Describe your game — Build will create a project and start.")
            : "Ask BloxSmith Agent anything — plan, brainstorm, or refine an idea."
        }
        rows={2}
        className="w-full resize-none bg-transparent px-1 py-1 text-base leading-relaxed text-white outline-none placeholder:text-slate-400 sm:text-[15px]"
        style={{ fontSize: "16px" }}
      />

      <input
        ref={attachInputRef}
        type="file"
        accept={ACCEPT_ATTACH}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* 🎙️ NVIDIA Voice Build Button — speak to BloxSmith, it builds in Studio and speaks back */}
          <VoiceBuildButton
            onUtterance={handleVoiceUtterance}
            setTtsEnabled={setTtsEnabled}
            disabled={busy}
          />
          <button
            type="button"
            onClick={pickFiles}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.12] hover:border-white/30 active:scale-[0.98]"
            title="Attach images or Roblox files"
          >
            <Paperclip className="h-4 w-4" /> Attach
          </button>
          <button
            type="button"
            onClick={() => {
              // Image generation is a Chat Mode feature — never trigger Build /
              // Studio actions from this button. Flip the live mode ref
              // synchronously (so this send goes out as chat), mirror it into
              // React state for UI, and pass an explicit "chat" override to
              // submit() so its plugin/project gates use chat semantics even
              // if the state hasn't flushed yet.
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
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20 hover:border-fuchsia-400/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            title="Generate a Roblox image (Chat Mode — never runs a build)"
            aria-label="Generate image"
          >
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Image</span>
          </button>
          <button
            type="button"
            onClick={enhance}
            disabled={!prompt.trim() || enhancing || busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/20 hover:border-indigo-400/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            title="Improve prompt — expand into a detailed build brief"
            aria-label="Improve prompt"
          >
            {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{enhancing ? "Improving…" : "Improve"}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isBuild && (
            <button
              type="button"
              onClick={() => {
                const next = !proceduralGeneration;
                setProceduralGeneration(next);
                toast.success(next
                  ? "🌍 Procedural Generation: ON — BloxSmith may expand builds with terrain, foliage, roads, and matching details."
                  : "🌍 Procedural Generation: OFF — BloxSmith will build only exactly what you ask for."
                );
              }}
              aria-pressed={proceduralGeneration}
              title={proceduralGeneration
                ? "Procedural Generation is ON — click to disable. When ON, the AI may add supporting terrain, foliage, roads, and decorations to match the theme."
                : "Procedural Generation is OFF — click to enable. When OFF, only the exact thing you ask for is built (no extras)."}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                proceduralGeneration
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                  : "border-white/20 bg-white/[0.06] text-slate-200 hover:bg-white/[0.12] hover:border-white/30"
              }`}
            >
              <span className="text-sm leading-none">🌍</span>
              <span className="hidden sm:inline">Procedural</span>
              <span className={`ml-1 rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wider ${
                proceduralGeneration ? "bg-emerald-400/30 text-emerald-50" : "bg-white/10 text-slate-300"
              }`}>
                {proceduralGeneration ? "On" : "Off"}
              </span>
            </button>
          )}
          {isBuild && (
            <div ref={modeRef} className="relative hidden sm:block">
              <button
                onClick={() => setModeOpen((v) => !v)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/[0.12] hover:border-white/30"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                {buildMode}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {modeOpen && (
                <div className="absolute right-0 bottom-full z-30 mb-2 w-[300px] overflow-hidden rounded-xl border border-white/15 bg-[#12122a] shadow-2xl">
                  <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300">
                    Choose a build mode
                  </div>
                  {([
                    { key: "Smart Build", tag: "Recommended", desc: "Balanced speed + quality. The AI plans, builds, and optimizes automatically — best default for most prompts." },
                    { key: "Fast Build", tag: "Fastest", desc: "Ships as quickly as possible for quick prototypes, small edits, and testing ideas." },
                    { key: "Deep Build", tag: "Highest quality", desc: "Deeper planning pass — reviews existing systems, prevents duplicates, tests and optimizes. Best for full games and polish passes." },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => { setBuildMode(m.key as any); setModeOpen(false); }}
                      className={`block w-full px-3 py-2.5 text-left transition ${
                        buildMode === m.key ? "bg-indigo-500/20" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${buildMode === m.key ? "text-white" : "text-slate-100"}`}>{m.key}</span>
                        <span className="rounded-full bg-indigo-500/25 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-indigo-100">{m.tag}</span>
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
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(244,63,94,0.8)] transition active:scale-[0.98] hover:bg-rose-400"
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
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.8)] transition active:scale-[0.98] hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBuild ? <Hammer className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {isBuild ? "Build" : "Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
