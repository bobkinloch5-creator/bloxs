import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProject, listProjects } from "@/lib/projects.functions";
import { listMessages, listProjectActions, getPluginSession, clearMessages } from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODELS, DEFAULT_MODEL_ID } from "@/lib/models";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, CheckCircle2, AlertCircle, Radio, Sparkles, MessageSquare,
  FileCode, Paperclip, Wrench, Wand2, HelpCircle, Save, Crown,
  Sun, Moon, ChevronDown, Zap, Timer, Box, X, Infinity as InfinityIcon,
  Folder, Lightbulb, LayoutDashboard, Search, Settings as SettingsIcon,
  Plug, History, Users, Bell, Plus, ExternalLink, RefreshCw, ImageIcon,
  Cpu, Music, BookOpen, Upload, RotateCcw,
} from "lucide-react";
import bloxLogo from "@/assets/bloxsmith-logo.png.asset.json";
import { OnboardingTour } from "@/components/OnboardingTour";
import { VoiceControls, useBloxSmithSpeaker } from "@/components/VoiceControls";
import { improvePrompt } from "@/lib/improve.functions";

export const Route = createFileRoute("/_authenticated/project/$projectId")({
  head: () => ({ meta: [{ title: "Build — BloxSmith" }] }),
  component: ProjectPage,
});

type Theme = "default" | "grey" | "light";

const QUICK_PROMPTS = [
  { label: "Build a tycoon game", icon: Sparkles, prompt: "Make a tycoon with droppers, an upgrade shop, and a save system." },
  { label: "Create an obby",      icon: Sparkles, prompt: "Build a 10-stage obby with checkpoints and a leaderboard." },
  { label: "Make a pet simulator", icon: Sparkles, prompt: "Make a pet simulator with eggs, rebirths, and a coin shop." },
  { label: "RPG quest system",     icon: Sparkles, prompt: "Add an NPC quest system with multiple quests, rewards, and a quest log GUI." },
  { label: "More ideas",           icon: Lightbulb, prompt: "Give me 5 unique Roblox game ideas I haven't seen before." },
];

const COMPOSER_ACTIONS = [
  { label: "Toolbox",      icon: Box,        prompt: "Search the Toolbox for relevant Roblox assets for this project and list the top results I should use." },
  { label: "UI Generator", icon: LayoutDashboard, prompt: "Generate a clean Roblox GUI for the current project — include the ScreenGui, Frames, and TextLabels." },
  { label: "Improve",      icon: Wand2,      prompt: "Improve the most recent changes — cleaner code, better performance, nicer UX." },
  { label: "Fix Errors",   icon: Wrench,     prompt: "Inspect the current scripts and fix any errors or warnings you find." },
  { label: "Explain",      icon: HelpCircle, prompt: "Explain what was just built and how the scripts work, step by step." },
];

const BUILD_STEPS = [
  { key: "planning",  label: "Planning game systems",     icon: Cpu },
  { key: "assets",    label: "Searching Toolbox assets",  icon: Search },
  { key: "scripts",   label: "Generating scripts & systems", icon: FileCode },
  { key: "ui",        label: "Creating UI",               icon: LayoutDashboard },
  { key: "actions",   label: "Preparing Studio actions",  icon: Box },
  { key: "sending",   label: "Sending to Roblox Studio",  icon: Upload },
  { key: "testing",   label: "Testing & fixing",          icon: Wrench },
] as const;

const SIDEBAR_NAV: { label: string; icon: typeof Box; to?: string; soon?: boolean; key: string }[] = [
  { key: "chat",   label: "AI Chat",         icon: MessageSquare, to: "/chat" },
  { key: "proj",   label: "Projects",        icon: Folder,    to: "/dashboard" },
  { key: "ideas",  label: "Game Ideas",      icon: Lightbulb, to: "/ideas" },
  { key: "ui",     label: "UI Generator",    icon: LayoutDashboard, to: "/ui-generator" },
  { key: "mcp",    label: "MCP / Tools",     icon: Plug,      to: "/mcp" },
  { key: "co",     label: "Collaborators",   icon: Users,     to: "/collaborators" },
  { key: "plug",   label: "Studio Plugin",   icon: Radio,     to: "/plugin" },
  { key: "hist",   label: "History",         icon: History,   to: "/history" },
  { key: "set",    label: "Settings",        icon: SettingsIcon, to: "/settings" },
];

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const projectsFn = useServerFn(listProjects);
  const messagesFn = useServerFn(listMessages);
  const actionsFn  = useServerFn(listProjectActions);
  const sessionFn  = useServerFn(getPluginSession);
  const profileFn  = useServerFn(getMyProfile);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => projectFn({ data: { id: projectId } }) });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: history = [] } = useQuery({ queryKey: ["messages", projectId], queryFn: () => messagesFn({ data: { projectId } }) });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", projectId],
    queryFn: () => actionsFn({ data: { projectId } }),
    refetchInterval: 4000,
  });
  const { data: pluginSession } = useQuery({
    queryKey: ["pluginSession"],
    queryFn: () => sessionFn(),
    refetchInterval: 6000,
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn(), refetchInterval: 30000 });

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [autoExecute, setAutoExecute] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "default";
    return (localStorage.getItem("bs-chat-theme") as Theme) || "default";
  });
  useEffect(() => { localStorage.setItem("bs-chat-theme", theme); }, [theme]);

  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const initialMessages = useMemo(
    () => history.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    })),
    [history],
  );

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: async ({ messages, id, body, headers, trigger, messageId }) => {
      const { data } = await supabase.auth.getSession();
      const freshToken = data.session?.access_token;
      return {
        body: { ...(body ?? {}), id, messages, trigger, messageId },
        headers: freshToken ? { ...headers, Authorization: `Bearer ${freshToken}` } : headers,
      };
    },
  }), []);

  const { messages, sendMessage, status, error, stop } = useChat({
    id: projectId,
    transport,
    messages: initialMessages,
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["messages", projectId] });
      qc.invalidateQueries({ queryKey: ["actions", projectId] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => { textareaRef.current?.focus(); }, [projectId, status]);

  // Screenshot-to-game attachment
  type Attachment = { dataUrl: string; mediaType: string; name: string; build: boolean };
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  async function attachImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 6 * 1024 * 1024) {
      alert("Image is too large — please pick an image under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (!url) return;
      setAttachment({ dataUrl: url, mediaType: file.type || "image/png", name: file.name || "screenshot.png", build: true });
    };
    reader.readAsDataURL(file);
  }

  const busy = status === "submitted" || status === "streaming";

  async function submit(text?: string) {
    const value = (text ?? input).trim();
    const att = attachment;
    if (!value && !att) return;
    if (busy) return;
    const { data } = await supabase.auth.getSession();
    const freshToken = data.session?.access_token ?? null;
    setToken(freshToken);
    if (!freshToken) return;

    if (att) {
      const modeHeader = att.build
        ? "[SCREENSHOT MODE: BUILD] The user attached a reference screenshot. Analyze the layout, colors, and gameplay/UI elements, then plan and queue Roblox build actions to recreate it as closely as possible."
        : "[SCREENSHOT MODE: ANALYZE ONLY] The user attached a reference screenshot. Describe what it shows, what Roblox systems would recreate it, and outline a build plan. Do NOT queue or execute build actions for this message.";
      const promptText = value || (att.build ? "Build a Roblox game/UI that matches this screenshot." : "Analyze this screenshot.");
      sendMessage(
        {
          role: "user",
          parts: [
            { type: "text", text: `${modeHeader}\n\n${promptText}` },
            { type: "file", mediaType: att.mediaType, url: att.dataUrl } as any,
          ],
        } as any,
        { body: { projectId, modelId, autoExecute: att.build && autoExecute } },
      );
    } else {
      sendMessage(
        { text: value },
        { body: { projectId, modelId, autoExecute } },
      );
    }
    setInput("");
    setAttachment(null);
  }


  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000));

  const isAdmin = !!profile?.is_admin;
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  const lowCredits = !isAdmin && maxCredits > 0 && credits / maxCredits < 0.2;
  const resetAt = profile?.credits_reset_at ? new Date(profile.credits_reset_at).getTime() : 0;
  const [resetLabel, setResetLabel] = useState<string>("");
  useEffect(() => {
    if (isAdmin || !resetAt) return;
    const tick = () => {
      const ms = Math.max(0, resetAt - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setResetLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAdmin, resetAt]);
  const [showTour, setShowTour] = useState(false);

  // ── voice mode (BloxSmith speaks replies via ElevenLabs) ──
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const { speak, stop: stopSpeak } = useBloxSmithSpeaker(ttsEnabled);
  const spokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsEnabled) return;
    if (status !== "ready") return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last || spokenIdRef.current === last.id) return;
    const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
    if (!text.trim()) return;
    spokenIdRef.current = last.id;
    speak(text);
  }, [messages, status, ttsEnabled, speak]);
  useEffect(() => {
    if (!ttsEnabled) stopSpeak();
  }, [ttsEnabled, stopSpeak]);

  // build step progression (visual only)
  const buildStepIndex = useMemo(() => {
    if (status === "submitted") return 0;
    if (status === "streaming") {
      const recent = actions[0];
      if (!recent) return 1;
      if (recent.status === "sent") return 5;
      if (recent.status === "failed") return 6;
      if (recent.status === "pending") return 4;
      return 2;
    }
    return -1;
  }, [status, actions]);
  const buildPct = buildStepIndex < 0 ? 100 : Math.round(((buildStepIndex + 1) / BUILD_STEPS.length) * 100);
  const buildLabel = buildStepIndex < 0 ? "Idle — ready for your next prompt" : BUILD_STEPS[Math.min(buildStepIndex, BUILD_STEPS.length - 1)].label;

  // theme class on root
  const themeClass = theme === "light" ? "bloxchat-light" : theme === "grey" ? "bloxchat-grey" : "bloxchat-dark";

  return (
    <div className={`${themeClass} flex h-screen min-h-0 w-full overflow-hidden`} style={{ color: "var(--bs-fg)" }}>
      <OnboardingTour
        storageKey="bs-onboarding-project"
        force={showTour}
        onFinish={() => setShowTour(false)}
        steps={[
          { title: "Welcome to BloxSmith 🛠️", body: "This is your AI command center for Roblox. Describe what you want — tycoons, obbies, RPGs — and BloxSmith plans it, writes the Luau, and queues it for Studio." },
          { title: "Roblox Studio", body: "The right panel shows whether your Studio plugin is connected. If it's offline, click 'Studio Plugin' in the left nav to install it and paste your token." },
          { title: "Quick actions", body: "Bottom bar has Toolbox, UI Generator, Improve, Fix Errors, and Explain. They're one-tap follow-ups that send a smart prompt for you." },
          { title: "Credits & timer", body: "Everyone gets 100 free credits that refill every 24 hours — you'll see a live countdown in the header. Owners get unlimited.", cta: "Start building" },
        ]}
      />

      {/* LEFT SIDEBAR */}
      <LeftSidebar
        theme={theme}
        setTheme={setTheme}
        credits={credits}
        maxCredits={maxCredits}
        isAdmin={isAdmin}
        resetLabel={resetLabel}
      />

      {/* MAIN COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          project={project}
          projects={projects}
          modelId={modelId}
          setModelId={setModelId}
          credits={credits}
          maxCredits={maxCredits}
          isAdmin={isAdmin}
          resetLabel={resetLabel}
          profile={profile}
          onTour={() => setShowTour(true)}
        />

        <div className="flex min-h-0 flex-1">
          {/* CENTER — chat */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bs-primary)" }}>
                  <Sparkles className="h-4 w-4" /> AI Chat
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Clear this project's chat history and queued actions? This can't be undone.")) return;
                      try {
                        await clearMessagesFn({ data: { projectId } });
                        await qc.invalidateQueries({ queryKey: ["messages", projectId] });
                        await qc.invalidateQueries({ queryKey: ["actions", projectId] });
                        window.location.reload();
                      } catch (e) {
                        alert("Failed to clear chat: " + (e instanceof Error ? e.message : String(e)));
                      }
                    }}
                    className="bs-quick"
                    title="Wipe chat memory and queued plugin actions for this project"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear chat
                  </button>
                </div>

                {messages.length === 0 && (
                  <WelcomeCard
                    name={profile?.display_name || profile?.username || "builder"}
                    onPrompt={(p) => submit(p)}
                  />
                )}

                {messages.map((m) => {
                  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                  const isUser = m.role === "user";
                  return isUser ? (
                    <UserBubble key={m.id} text={text} profile={profile} />
                  ) : (
                    <AssistantCard key={m.id} text={text} pluginOnline={pluginOnline} />
                  );
                })}

                {busy && (
                  <BuildProgressCard
                    stepIndex={buildStepIndex}
                    onStop={stop}
                    onAction={(p: string) => submit(p)}
                  />
                )}

                {error && (
                  <div
                    className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "color-mix(in oklab, var(--bs-danger) 40%, transparent)",
                      background: "color-mix(in oklab, var(--bs-danger) 10%, transparent)",
                      color: "var(--bs-danger)",
                    }}
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Something went wrong</div>
                      <div className="opacity-80">{error.message || "Please try again."}</div>
                    </div>
                    <button
                      onClick={() => {
                        const lastUser = [...messages].reverse().find((mm) => mm.role === "user");
                        const t = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
                        submit(t);
                      }}
                      className="bs-quick shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Composer
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              busy={busy}
              token={token}
              autoExecute={autoExecute}
              setAutoExecute={setAutoExecute}
              onSubmit={() => submit()}
              onStop={() => stop()}
              onAction={(p: string) => submit(p)}
              modelId={modelId}
              setModelId={setModelId}
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              onVoiceTranscript={(t: string) => submit(t)}
              attachment={attachment}
              setAttachment={setAttachment}
              onAttachFile={attachImageFile}
            />

          </div>

          {/* RIGHT SIDEBAR */}
          <RightSidebar
            project={project}
            pluginOnline={pluginOnline}
            pluginSession={pluginSession}
            actions={actions}
            buildPct={buildPct}
            buildLabel={buildLabel}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────── LEFT SIDEBAR ────────────────── */
function LeftSidebar({
  theme, setTheme, credits, maxCredits, isAdmin, resetLabel,
}: {
  theme: Theme; setTheme: (t: Theme) => void;
  credits: number; maxCredits: number; isAdmin: boolean; resetLabel: string;
}) {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r p-3 md:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
          <img src={bloxLogo.url} alt="BloxSmith" className="bs-logo-float h-10 w-10 object-contain" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold tracking-tight">BloxSmith</div>
          <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--bs-muted-fg)" }}>AI game builder</div>
        </div>
      </Link>

      <nav className="mt-4 flex flex-col gap-0.5 text-sm">
        {isAdmin && (
          <Link to="/admin">
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--bs-card-2)]" style={{ color: "var(--bs-primary)" }}>
              <Crown className="h-4 w-4" />
              <span className="flex-1 truncate">Owner Admin</span>
            </div>
          </Link>
        )}
        {SIDEBAR_NAV.map((item) => {
          const Inner = (
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--bs-card-2)]" style={{ color: "var(--bs-fg)" }}>
              <item.icon className="h-4 w-4 opacity-75" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.soon && (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>
                  soon
                </span>
              )}
            </div>
          );
          return item.to
            ? <Link key={item.key} to={item.to}>{Inner}</Link>
            : <div key={item.key} className="cursor-not-allowed opacity-90">{Inner}</div>;
        })}
      </nav>

      <div className="flex-1" />

      {/* 100% Free Forever */}
      <div className="bs-soft relative mb-3 overflow-hidden p-4">
        <div className="absolute inset-0 opacity-25" style={{ background: "var(--bs-grad)" }} />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bs-primary)" }}>
            <Sparkles className="h-3 w-3" /> 100% Free Forever
          </div>
          <p className="mt-1 text-xs leading-snug" style={{ color: "var(--bs-muted-fg)" }}>
            No hidden limits. Build anything you imagine. Always free.
          </p>
        </div>
      </div>

      {/* Credits */}
      <div className="bs-soft mb-3 p-4">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Your Credits</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          {isAdmin ? (
            <>
              <InfinityIcon className="h-5 w-5" style={{ color: "var(--bs-primary)" }} />
              <span className="text-2xl font-bold" style={{ color: "var(--bs-primary)" }}>Unlimited</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" style={{ color: "var(--bs-primary)" }} />
              <span className="text-2xl font-bold" style={{ color: "var(--bs-primary)" }}>{credits}</span>
              <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>/ {maxCredits}</span>
            </>
          )}
        </div>
        {!isAdmin && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (credits / Math.max(1, maxCredits)) * 100)}%`, background: "var(--bs-grad)" }} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              <Timer className="h-3 w-3" /> Resets in {resetLabel || "…"}
            </div>
          </>
        )}
      </div>

      {/* Theme */}
      <div className="bs-soft p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Theme</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["default", "grey", "light"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="bs-quick justify-center"
              style={theme === t ? { background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)", color: "var(--bs-primary)" } : {}}
            >
              {t === "light" ? <Sun className="h-3 w-3" /> : t === "grey" ? <Moon className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ────────────────── TOP BAR ────────────────── */
function TopBar({
  project, projects, modelId, setModelId, credits, maxCredits, isAdmin, resetLabel, profile, onTour,
}: any) {
  return (
    <header
      className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-5"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
    >
      {/* Project selector */}
      <div className="bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5">
        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
        <div className="hidden text-[10px] uppercase tracking-wider sm:block" style={{ color: "var(--bs-muted-fg)" }}>Project</div>
        <select
          value={project?.id ?? ""}
          onChange={(e) => { if (e.target.value) window.location.assign(`/project/${e.target.value}`); }}
          className="max-w-[180px] truncate bg-transparent text-sm font-semibold outline-none"
          style={{ color: "var(--bs-fg)" }}
        >
          {projects.map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="ml-1 hidden items-center gap-1 text-[11px] sm:flex" style={{ color: "var(--bs-success)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bs-success)" }} /> Saved
        </span>
      </div>

      {/* Model selector */}
      <div className="hidden lg:block">
        <ModelPicker modelId={modelId} setModelId={setModelId} variant="bar" />
      </div>

      <div className="flex-1" />

      {/* Credits */}
      {isAdmin ? (
        <div className="bs-soft hidden items-center gap-1.5 px-2.5 py-1.5 sm:flex" title="Unlimited (owner)">
          <InfinityIcon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--bs-primary)" }}>Unlimited</span>
        </div>
      ) : (
        <div className="bs-soft hidden items-center gap-1.5 px-2.5 py-1.5 sm:flex">
          <Zap className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
          <span className="text-sm font-bold">{credits}</span>
          <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>/ {maxCredits}</span>
          <button className="ml-1 grid h-5 w-5 place-items-center rounded-md hover:bg-[var(--bs-card-2)]" title="Buy more">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Reset timer */}
      {!isAdmin && resetLabel && (
        <div className="bs-soft hidden items-center gap-1.5 px-2.5 py-1.5 md:flex" title="Time until credits refill">
          <Timer className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Resets in</div>
            <div className="text-xs font-semibold">{resetLabel}</div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <button className="bs-icon-btn" title="Notifications" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </button>
      {/* Help / Tour */}
      <button onClick={onTour} className="bs-icon-btn" title="Replay tour" aria-label="Help">
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* User profile */}
      <div className="bs-soft flex items-center gap-2 px-2 py-1.5">
        <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: "var(--bs-grad)" }}>
          {(profile?.display_name || profile?.username || "U").slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="flex items-center gap-1 text-xs font-semibold">
            {profile?.display_name || profile?.username || "You"}
            {isAdmin && <span title="Owner" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in oklab, var(--bs-warning) 18%, transparent)", color: "var(--bs-warning)" }}><Crown className="h-2.5 w-2.5" /> Owner</span>}
          </div>
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--bs-success)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bs-success)" }} /> Online
          </div>
        </div>
      </div>
    </header>
  );
}

/* ────────────────── CENTER — chat pieces ────────────────── */
function WelcomeCard({ name, onPrompt }: { name: string; onPrompt: (s: string) => void }) {
  const display = (name || "builder").charAt(0).toUpperCase() + (name || "builder").slice(1);
  return (
    <div className="bs-card bs-msg-in relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: "var(--bs-grad)" }} />
      <div className="relative flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
          <img src={bloxLogo.url} alt="BloxSmith" className="bs-logo-float h-16 w-16 object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-2xl font-bold">Hi {display}! <span className="text-2xl">👋</span></h2>
          <p className="mt-1 text-sm" style={{ color: "var(--bs-muted-fg)" }}>I'm BloxSmith, your AI Roblox game developer.</p>
          <p className="text-sm" style={{ color: "var(--bs-muted-fg)" }}>Tell me your game idea and I'll build it step by step!</p>
        </div>
      </div>
      <div className="bs-stagger mt-5 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            onClick={() => onPrompt(q.prompt)}
            className="bs-quick"
            style={{ borderColor: "var(--bs-border)" }}
          >
            <q.icon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} /> {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text, profile }: { text: string; profile: any }) {
  return (
    <div className="bs-msg-in flex justify-end gap-2.5">
      <div
        className="max-w-[78%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm"
        style={{ background: "var(--bs-primary)", color: "var(--bs-primary-fg)" }}
      >
        {text}
      </div>
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white" style={{ background: "var(--bs-grad)" }}>
        {(profile?.display_name || profile?.username || "U").slice(0, 1).toUpperCase()}
      </div>
    </div>
  );
}

function AssistantCard({ text, pluginOnline }: { text: string; pluginOnline?: boolean }) {
  // Strip the trailing bloxsmith-actions JSON block — it's executed by the
  // plugin, not meant for the user to read. Surface a friendly build banner instead.
  const actionsMatch = text.match(/```bloxsmith-actions\s*\n?([\s\S]*?)```/i);
  let displayText = text;
  let actionCount = 0;
  let rawActions = "";
  if (actionsMatch) {
    rawActions = actionsMatch[1].trim();
    displayText = text.replace(actionsMatch[0], "").trimEnd();
    try {
      const parsed = JSON.parse(rawActions);
      if (Array.isArray(parsed)) actionCount = parsed.length;
    } catch {
      actionCount = 0;
    }
  }
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="bs-msg-in flex gap-2.5">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
        <img src={bloxLogo.url} alt="BloxSmith" className="h-8 w-8 object-contain" />
      </div>
      <div className="bs-card max-w-[88%] flex-1 rounded-2xl p-4">
        <div className="bs-prose text-sm leading-relaxed">
          <ReactMarkdown>{displayText || "_…_"}</ReactMarkdown>
        </div>
        {actionCount > 0 && (
          <div className="mt-3 space-y-2">
            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: pluginOnline
                  ? "color-mix(in oklab, var(--bs-success) 40%, transparent)"
                  : "color-mix(in oklab, var(--bs-danger) 40%, transparent)",
                background: pluginOnline
                  ? "color-mix(in oklab, var(--bs-success) 10%, transparent)"
                  : "color-mix(in oklab, var(--bs-danger) 10%, transparent)",
                color: pluginOnline ? "var(--bs-success)" : "var(--bs-danger)",
              }}
            >
              {pluginOnline ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Building {actionCount} {actionCount === 1 ? "action" : "actions"} in Roblox Studio now…
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Roblox Studio plugin is not connected. Open Studio and reconnect — {actionCount} {actionCount === 1 ? "action is" : "actions are"} queued and will run on connect.
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs underline opacity-60 hover:opacity-100"
              style={{ color: "var(--bs-muted-fg)" }}
            >
              {showRaw ? "Hide" : "View"} build actions (advanced)
            </button>
            {showRaw && (
              <pre className="max-h-64 overflow-auto rounded-lg border p-3 text-[11px]" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
                {rawActions}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildProgressCard({ stepIndex, onStop, onAction }: { stepIndex: number; onStop: () => void; onAction: (p: string) => void }) {
  return (
    <div className="bs-msg-in flex gap-2.5">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
        <img src={bloxLogo.url} alt="BloxSmith" className="h-8 w-8 object-contain" />
      </div>
      <div className="bs-card flex-1 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="bs-typing"><span /><span /><span /></span>
          Building your game…
        </div>
        <ol className="mt-3 grid gap-1.5">
          {BUILD_STEPS.map((s, i) => {
            const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "idle";
            return (
              <li key={s.key} className="flex items-center gap-2.5 text-xs" style={{ opacity: state === "idle" ? 0.55 : 1 }}>
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${state === "active" ? "bs-step-active" : ""}`}
                  style={{
                    background: state === "done" ? "color-mix(in oklab, var(--bs-success) 18%, transparent)"
                              : state === "active" ? "var(--bs-primary-soft)" : "var(--bs-card-2)",
                    color: state === "done" ? "var(--bs-success)" : state === "active" ? "var(--bs-primary)" : "var(--bs-muted-fg)",
                  }}
                >
                  {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </span>
                <span style={{ fontWeight: state === "active" ? 600 : 400 }}>{s.label}</span>
                {state === "active" && <Loader2 className="ml-auto h-3 w-3 animate-spin" style={{ color: "var(--bs-primary)" }} />}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <button onClick={onStop} className="bs-quick" style={{ color: "var(--bs-danger)", borderColor: "color-mix(in oklab, var(--bs-danger) 40%, transparent)" }}>
            <X className="h-3 w-3" /> Stop
          </button>
          <button onClick={() => onAction("Explain the plan you just produced in plain English.")} className="bs-quick">
            <HelpCircle className="h-3 w-3" /> Explain plan
          </button>
          <button onClick={() => onAction("List the Toolbox assets you used or recommended.")} className="bs-quick">
            <Box className="h-3 w-3" /> Show assets
          </button>
          <button onClick={() => onAction("Re-queue the latest build for the Roblox Studio plugin.")} className="bs-quick">
            <Upload className="h-3 w-3" /> Send to Studio
          </button>
          <button onClick={() => onAction("Inspect the current scripts and fix any errors or warnings you find.")} className="bs-quick">
            <Wrench className="h-3 w-3" /> Fix errors
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── BOTTOM COMPOSER ────────────────── */
function Composer({
  input, setInput, textareaRef, busy, token, autoExecute, setAutoExecute,
  onSubmit, onStop, onAction, modelId, setModelId,
  ttsEnabled, setTtsEnabled, onVoiceTranscript,
  attachment, setAttachment, onAttachFile,
}: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = !!token && !busy && (input.trim().length > 0 || !!attachment);
  return (
    <div
      className="border-t px-3 pb-4 pt-3 sm:px-6"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
    >
      <div className="mx-auto w-full max-w-3xl">
        {attachment && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border p-2"
               style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
            <img src={attachment.dataUrl} alt={attachment.name} className="h-14 w-14 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold" style={{ color: "var(--bs-fg)" }}>
                {attachment.name}
              </div>
              <div className="mt-1 inline-flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--bs-border)" }}>
                <button
                  type="button"
                  onClick={() => setAttachment({ ...attachment, build: true })}
                  className="px-2 py-1 text-[11px] font-bold"
                  style={{
                    background: attachment.build ? "var(--bs-primary)" : "transparent",
                    color: attachment.build ? "white" : "var(--bs-muted-fg)",
                  }}
                >
                  Build it
                </button>
                <button
                  type="button"
                  onClick={() => setAttachment({ ...attachment, build: false })}
                  className="px-2 py-1 text-[11px] font-bold"
                  style={{
                    background: !attachment.build ? "var(--bs-primary)" : "transparent",
                    color: !attachment.build ? "white" : "var(--bs-muted-fg)",
                  }}
                >
                  Just analyze
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="bs-icon-btn"
              title="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="bs-input-wrap flex flex-col gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
            }}
            onPaste={(e: any) => {
              const file = Array.from(e.clipboardData?.files || []).find((f: any) => (f as File).type?.startsWith("image/")) as File | undefined;
              if (file) { e.preventDefault(); onAttachFile?.(file); }
            }}
            rows={1}
            placeholder={attachment ? (attachment.build ? "Optional: describe what you want built from this screenshot…" : "Optional: what should I analyze about this screenshot?") : "Describe anything you want to build…"}
            className="max-h-44 min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:opacity-60"
            style={{ color: "var(--bs-fg)" }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button className="bs-icon-btn" title="New" type="button" onClick={() => setInput("")}>
              <Plus className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAttachFile?.(f);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              className="bs-icon-btn"
              title="Attach screenshot (AI will analyze or build from it)"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <ImprovePromptButton input={input} setInput={setInput} disabled={busy} />
            <VoiceControls
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              onTranscript={(t: string, send: boolean) => {
                if (send) onVoiceTranscript?.(t);
                else setInput(t);
              }}
              busy={busy}
            />

            {COMPOSER_ACTIONS.map((a) => (
              <button
                key={a.label}
                disabled={busy}
                onClick={() => onAction(a.prompt)}
                className="bs-quick"
                title={a.label}
              >
                <a.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{a.label}</span>
              </button>
            ))}

            <div className="flex-1" />

            <div className="lg:hidden">
              <ModelPicker modelId={modelId} setModelId={setModelId} variant="compact" />
            </div>

            <label
              className="ml-1 flex cursor-pointer select-none items-center gap-2 text-xs"
              style={{ color: "var(--bs-muted-fg)" }}
              title="When on, AI plans + queues actions automatically"
            >
              <span
                role="switch"
                aria-checked={autoExecute}
                className="bs-toggle"
                data-on={autoExecute ? "true" : "false"}
                onClick={() => setAutoExecute((v: boolean) => !v)}
              />
              <span className="hidden sm:inline">Auto-execute</span>
            </label>

            {busy ? (
              <button onClick={onStop} className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium"
                style={{ background: "var(--bs-danger)", boxShadow: "none" }}>
                <X className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button onClick={onSubmit} disabled={!canSend}
                className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          <span>Enter to send · Shift+Enter for new line</span>
          <span className="hidden sm:inline">BloxSmith can make mistakes. Always test in Roblox Studio.</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── RIGHT SIDEBAR ────────────────── */
function RightSidebar({
  project, pluginOnline, pluginSession, actions, buildPct, buildLabel, busy,
}: any) {
  const recent = (actions ?? []).slice(0, 6);
  return (
    <aside
      className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3 xl:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      {/* Roblox Studio card */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Roblox Studio</div>
            <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              Plugin {pluginSession?.plugin_version || "v1.0"}
            </div>
          </div>
          <div className={`flex items-center gap-1 text-[11px] font-semibold ${pluginOnline ? "" : ""}`}
               style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }} />
            {pluginOnline ? "Connected" : "Offline"}
          </div>
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>
          Project: <span style={{ color: "var(--bs-fg)" }}>{project?.name ?? "—"}</span>
        </div>
        <Link to="/plugin" className="bs-send-btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium">
          {pluginOnline ? <><ExternalLink className="h-4 w-4" /> Open in Roblox Studio</> : <><RefreshCw className="h-4 w-4" /> Connect plugin</>}
        </Link>
      </div>

      {/* Build progress */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Build Progress</div>
          <div className="text-sm font-bold" style={{ color: "var(--bs-primary)" }}>{busy ? `${buildPct}%` : "Idle"}</div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: busy ? `${buildPct}%` : "100%", background: busy ? "var(--bs-grad)" : "color-mix(in oklab, var(--bs-success) 60%, transparent)" }} />
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{buildLabel}</div>
      </div>

      {/* Toolbox search (visual — no fake imports) */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Toolbox Search</div>
          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>Soon</span>
        </div>
        <div className="bs-input-wrap mt-2 flex items-center gap-2 px-2 py-1.5">
          <Search className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
          <input
            disabled
            placeholder="Search models, assets, scripts…"
            className="w-full bg-transparent text-xs outline-none placeholder:opacity-60"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {[
            { l: "Models",  i: Box },
            { l: "Plugins", i: Plug },
            { l: "Audio",   i: Music },
            { l: "Images",  i: ImageIcon },
          ].map((t) => (
            <span key={t.l} className="bs-quick"><t.i className="h-3 w-3" /> {t.l}</span>
          ))}
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          The AI uses real Toolbox lookups when generating builds. A standalone search panel is coming soon.
        </p>
      </div>

      {/* Recent Actions */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Recent Actions</div>
          <BookOpen className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
        </div>
        {recent.length === 0 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            Actions generated by the AI will appear here, waiting for the Studio plugin to pick them up.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-xs">
            {recent.map((a: any) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
                  background: a.status === "done" ? "var(--bs-success)" :
                              a.status === "failed" ? "var(--bs-danger)" :
                              a.status === "sent" ? "var(--bs-accent)" : "var(--bs-warning)",
                }} />
                <span className="flex-1 truncate">
                  <span className="opacity-70">{a.kind}</span> <span className="font-medium">{a.name}</span>
                </span>
                <span className="text-[10px] capitalize" style={{ color: "var(--bs-muted-fg)" }}>{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ────────────────── MODEL PICKER (real models) ────────────────── */
function ModelPicker({
  modelId, setModelId, variant = "bar",
}: { modelId: string; setModelId: (id: string) => void; variant?: "bar" | "compact" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = MODELS.find((m) => m.id === modelId) ?? MODELS[0];

  const creditColor = (c: string) =>
    c === "Low" ? "#22c55e" : c === "Medium" ? "#eab308" : c === "High" ? "#f97316" : "#ef4444";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "bar"
            ? "bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
            : "bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-left max-w-[260px]"
        }
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
        {variant === "bar" && (
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Model</span>
        )}
        <span className="truncate text-sm font-semibold" style={{ color: "var(--bs-fg)" }}>
          {current?.label}
        </span>
        <span className="hidden sm:inline text-[10px] rounded-md px-1.5 py-0.5"
          style={{ background: "color-mix(in oklab, var(--bs-fg) 8%, transparent)", color: "var(--bs-muted-fg)" }}>
          {current?.provider}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
      </button>

      {open && (
        <div
          className="scrollbar-thin absolute right-0 z-50 mt-1.5 max-h-[70vh] w-[360px] overflow-y-auto rounded-xl border p-1.5 shadow-2xl"
          style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)", color: "var(--bs-fg)" }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
            Real models · via Lovable AI Gateway
          </div>
          {MODELS.map((m) => {
            const active = m.id === modelId;
            const disabled = m.status !== "Working";
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) { setModelId(m.id); setOpen(false); } }}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={active
                  ? { background: "var(--bs-primary)", color: "var(--bs-primary-fg)" }
                  : { color: "var(--bs-fg)" }}
                onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = "var(--bs-card-2)"; }}
                onMouseLeave={(e) => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{m.label}</span>
                    <span className="text-[10px] rounded-md px-1.5 py-0.5 shrink-0"
                      style={active
                        ? { background: "color-mix(in oklab, var(--bs-primary-fg) 22%, transparent)", color: "var(--bs-primary-fg)" }
                        : { background: "color-mix(in oklab, var(--bs-fg) 8%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.provider}
                    </span>
                    {disabled && (
                      <span className="text-[10px] rounded-md px-1.5 py-0.5 shrink-0"
                        style={{ background: "color-mix(in oklab, #eab308 18%, transparent)", color: "#eab308" }}>
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px]"
                    style={active ? { color: "var(--bs-primary-fg)", opacity: 0.85 } : { color: "var(--bs-muted-fg)" }}>
                    {m.bestFor}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="rounded px-1.5 py-0.5"
                      style={{ background: "color-mix(in oklab, var(--bs-fg) 6%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.speed}
                    </span>
                    <span className="rounded px-1.5 py-0.5"
                      style={{ background: "color-mix(in oklab, var(--bs-fg) 6%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.quality}
                    </span>
                    <span className="rounded px-1.5 py-0.5 font-medium"
                      style={{ background: `color-mix(in oklab, ${creditColor(m.credits)} 18%, transparent)`, color: creditColor(m.credits) }}>
                      {m.credits} credits
                    </span>
                  </div>
                </div>
                {active && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────── IMPROVE PROMPT BUTTON ────────────────── */
function ImprovePromptButton({
  input, setInput, disabled,
}: { input: string; setInput: (v: string) => void; disabled: boolean }) {
  const improve = useServerFn(improvePrompt);
  const [busy, setBusy] = useState(false);
  async function run() {
    const text = input.trim();
    if (!text || busy || disabled) return;
    setBusy(true);
    try {
      const res: any = await improve({ data: { text } });
      if (res?.ok && res.text) setInput(res.text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className="bs-icon-btn"
      title={input.trim() ? "Improve this prompt with AI" : "Type a prompt first, then click to improve it"}
      onClick={run}
      disabled={busy || disabled || !input.trim()}
      style={busy ? { color: "var(--bs-primary)" } : undefined}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
    </button>
  );
}
