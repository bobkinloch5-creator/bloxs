import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProject } from "@/lib/projects.functions";
import { listMessages, listProjectActions, getPluginSession } from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODELS, DEFAULT_MODEL_ID } from "@/lib/models";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Radio, Sparkles,
  FileCode, Paperclip, Mic, Wrench, Wand2, HelpCircle, RotateCcw, Save,
  Upload, Sun, Moon, ChevronDown, Zap, BookOpen, Cpu, Box, X,
} from "lucide-react";
import bloxLogo from "@/assets/bloxsmith-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/project/$projectId")({
  head: () => ({ meta: [{ title: "Build — BloxSmith" }] }),
  component: ProjectPage,
});

type Theme = "light" | "grey";

const QUICK_PROMPTS: { label: string; icon: typeof Wrench; prompt: string }[] = [
  { label: "Fix errors",     icon: Wrench,     prompt: "Inspect the current scripts and fix any errors or warnings you find." },
  { label: "Improve",        icon: Wand2,      prompt: "Improve the most recent changes — cleaner code, better performance, nicer UX." },
  { label: "Explain",        icon: HelpCircle, prompt: "Explain what was just built and how the scripts work, step by step." },
  { label: "Send to Studio", icon: Upload,     prompt: "Re-queue the latest build so the Roblox Studio plugin can apply it." },
  { label: "Regenerate",     icon: RotateCcw,  prompt: "Regenerate the previous answer with a different approach." },
  { label: "Save project",   icon: Save,       prompt: "Summarize the project so far and save a checkpoint of what's been built." },
];

const BUILD_STEPS = [
  { key: "reading",   label: "Reading project",      icon: BookOpen },
  { key: "planning",  label: "Planning build",        icon: Cpu },
  { key: "scripts",   label: "Generating scripts",    icon: FileCode },
  { key: "actions",   label: "Creating Studio actions", icon: Box },
  { key: "sending",   label: "Sending to Roblox Studio", icon: Upload },
  { key: "testing",   label: "Testing & fixing errors", icon: Wrench },
] as const;

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const messagesFn = useServerFn(listMessages);
  const actionsFn  = useServerFn(listProjectActions);
  const sessionFn  = useServerFn(getPluginSession);
  const profileFn  = useServerFn(getMyProfile);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => projectFn({ data: { id: projectId } }) });
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
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [autoExecute, setAutoExecute] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "grey";
    return (localStorage.getItem("bs-chat-theme") as Theme) || "grey";
  });
  useEffect(() => { localStorage.setItem("bs-chat-theme", theme); }, [theme]);

  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
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
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), [token]);

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

  const busy = status === "submitted" || status === "streaming";

  function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value || busy || !token) return;
    sendMessage(
      { text: value },
      { body: { projectId, modelId, autoExecute } },
    );
    setInput("");
  }

  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000));

  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  const lowCredits = maxCredits > 0 && credits / maxCredits < 0.2;

  // Compute current build "step" from pending/sent actions of the latest run.
  const buildStepIndex = useMemo(() => {
    if (status === "submitted") return 0; // reading
    if (status === "streaming") {
      const pending = actions.filter((a) => a.status === "pending" || a.status === "sent").length;
      const recent = actions[0];
      if (!recent) return 1; // planning
      if (recent.status === "pending") return 3; // creating actions
      if (recent.status === "sent") return 4;    // sending
      if (recent.status === "failed") return 5;  // testing/fixing
      if (pending > 0) return 3;
      return 2; // generating scripts
    }
    return -1;
  }, [status, actions]);

  const themeClass = theme === "light" ? "bloxchat-light" : "bloxchat-grey";

  return (
    <div className={`${themeClass} flex h-screen min-h-0 w-full overflow-hidden`}>
      {/* Left sidebar */}
      <ChatSidebar theme={theme} setTheme={setTheme} pluginOnline={pluginOnline} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-3 sm:flex sm:px-6"
          style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/dashboard"
              className="bs-icon-btn shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bs-card-2)] ring-1 ring-[var(--bs-border)]">
              <img src={bloxLogo.url} alt="BloxSmith" className="h-9 w-9 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-base font-semibold leading-tight">
                {project?.name ?? "Loading…"}
              </h1>
              <div className="truncate text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                {project?.game_type ?? "Roblox build"}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            <Link
              to="/plugin"
              className={pluginOnline ? "bs-chip bs-chip-on" : "bs-chip"}
              title={pluginOnline ? "Studio plugin connected" : "Open plugin setup"}
            >
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">{pluginOnline ? "Studio online" : "Plugin offline"}</span>
            </Link>
            <div className={lowCredits ? "bs-chip bs-chip-warn" : "bs-chip"} title="Free messages remaining">
              <Zap className="h-3 w-3" />
              <span>{credits}{maxCredits ? ` / ${maxCredits}` : ""}</span>
            </div>
          </div>
        </header>

        {/* Chat + Action panel */}
        <div className="flex min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5 sm:px-6 lg:px-10"
            style={{ background: "var(--bs-bg)" }}
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.length === 0 && <EmptyState onPrompt={(p) => submit(p)} />}

              {messages.map((m) => {
                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`bs-msg-in flex gap-2.5 ${isUser ? "justify-end" : ""}`}>
                    {!isUser && <AssistantAvatar />}
                    <div className={`${isUser ? "bs-bubble-user" : "bs-bubble-ai"} max-w-[85%] px-4 py-3 sm:max-w-[78%]`}>
                      <div className="bs-prose">
                        <ReactMarkdown>{text || "_…_"}</ReactMarkdown>
                      </div>
                    </div>
                    {isUser && <UserAvatar name={profile?.display_name || profile?.username} />}
                  </div>
                );
              })}

              {busy && (
                <BuildProgress
                  status={status}
                  stepIndex={buildStepIndex}
                  onStop={stop}
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

          <ActionQueuePanel actions={actions} />
        </div>

        {/* Composer */}
        <div
          className="border-t px-3 pb-4 pt-3 sm:px-6"
          style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
        >
          <div className="mx-auto w-full max-w-3xl">
            {/* Quick-action chips */}
            <div className="scrollbar-thin -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  disabled={busy}
                  onClick={() => submit(q.prompt)}
                  className="bs-quick shrink-0"
                >
                  <q.icon className="h-3.5 w-3.5" />
                  {q.label}
                </button>
              ))}
            </div>

            <div className="bs-input-wrap flex flex-col px-3 py-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                rows={1}
                placeholder="Describe what to build, fix, or add…"
                className="max-h-44 min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:opacity-60"
                style={{ color: "var(--bs-fg)" }}
              />

              <div className="flex items-center gap-1.5">
                <button className="bs-icon-btn" title="Attach image" type="button">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button className="bs-icon-btn" title="Voice input" type="button">
                  <Mic className="h-4 w-4" />
                </button>

                <div className="relative">
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="bs-select max-w-[160px] truncate sm:max-w-none"
                    title="Model"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
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
                    onClick={() => setAutoExecute((v) => !v)}
                  />
                  <span className="hidden sm:inline">Auto-execute</span>
                </label>

                <div className="flex-1" />

                {busy ? (
                  <button
                    onClick={() => stop()}
                    className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium"
                    style={{ background: "var(--bs-danger)", boxShadow: "none" }}
                  >
                    <X className="h-4 w-4" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={() => submit()}
                    disabled={!input.trim() || !token}
                    className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              <span>Enter to send · Shift+Enter for new line</span>
              <span className="hidden sm:inline">
                {autoExecute ? "Auto-execute on — actions will queue automatically" : "Manual mode — review before sending"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── subcomponents ───────────────────────── */

function ChatSidebar({
  theme, setTheme, pluginOnline,
}: { theme: Theme; setTheme: (t: Theme) => void; pluginOnline: boolean }) {
  return (
    <aside
      className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      <Link to="/dashboard" className="flex items-center gap-2.5">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bs-card-2)] ring-1 ring-[var(--bs-border)]">
          <img src={bloxLogo.url} alt="BloxSmith logo" className="h-10 w-10 object-contain" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold tracking-tight">BloxSmith</div>
          <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--bs-muted-fg)" }}>AI Roblox game builder</div>
        </div>
      </Link>

      <nav className="mt-6 flex flex-col gap-1 text-sm">
        <SidebarLink to="/dashboard" icon={Box} label="Projects" />
        <SidebarLink to="/plugin" icon={Radio} label="Studio plugin" badge={pluginOnline ? "on" : undefined} />
        <SidebarLink to="/settings" icon={Cpu} label="Settings" />
      </nav>

      <div className="flex-1" />

      <div className="bs-soft p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Theme</div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setTheme("light")}
            className="bs-quick flex-1 justify-center"
            style={theme === "light" ? { background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)", color: "var(--bs-primary)" } : {}}
          >
            <Sun className="h-3.5 w-3.5" /> Light
          </button>
          <button
            onClick={() => setTheme("grey")}
            className="bs-quick flex-1 justify-center"
            style={theme === "grey" ? { background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)", color: "var(--bs-primary)" } : {}}
          >
            <Moon className="h-3.5 w-3.5" /> Grey
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label, badge }: { to: string; icon: typeof Box; label: string; badge?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-[var(--bs-card-2)]"
      style={{ color: "var(--bs-fg)" }}
    >
      <Icon className="h-4 w-4 opacity-70" />
      <span className="flex-1">{label}</span>
      {badge === "on" && <span className="h-2 w-2 rounded-full" style={{ background: "var(--bs-success)" }} />}
    </Link>
  );
}

function AssistantAvatar() {
  return (
    <div
      className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-md"
      style={{ background: "var(--bs-grad)" }}
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );
}
function UserAvatar({ name }: { name?: string | null }) {
  const letter = (name || "U").trim().slice(0, 1).toUpperCase();
  return (
    <div
      className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold"
      style={{ background: "var(--bs-card-2)", color: "var(--bs-fg)", border: "1px solid var(--bs-border)" }}
    >
      {letter}
    </div>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (s: string) => void }) {
  const ideas = [
    "Make a tycoon with droppers, an upgrade shop, and a save system.",
    "Add a sprint + stamina system to the default character.",
    "Build a round-based round timer with a leaderboard.",
    "Create a daily rewards GUI that gives coins on join.",
  ];
  return (
    <div className="bs-card bs-msg-in mx-auto w-full max-w-2xl p-6 text-center sm:p-10">
      <img
        src={bloxLogo.url}
        alt="BloxSmith"
        className="bs-logo-float mx-auto h-24 w-24 object-contain"
      />
      <h2 className="font-display mt-4 text-xl font-bold sm:text-2xl">Let's build your Roblox game.</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--bs-muted-fg)" }}>
        Describe what you want and I'll plan it, write the Luau, and queue it for your Studio plugin.
      </p>
      <div className="bs-stagger mt-5 grid gap-2 sm:grid-cols-2">
        {ideas.map((i) => (
          <button key={i} onClick={() => onPrompt(i)} className="bs-soft px-3 py-2.5 text-left text-sm hover:bg-[var(--bs-primary-soft)]">
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}

function BuildProgress({ status, stepIndex, onStop }: { status: string; stepIndex: number; onStop: () => void }) {
  const label =
    status === "submitted" ? "Thinking" :
    stepIndex === 0 ? "Reading project" :
    stepIndex === 1 ? "Planning build" :
    stepIndex === 2 ? "Generating scripts" :
    stepIndex === 3 ? "Creating Studio actions" :
    stepIndex === 4 ? "Sending to Roblox Studio" :
    stepIndex === 5 ? "Testing & fixing" : "Building";

  return (
    <div className="flex gap-2.5">
      <AssistantAvatar />
      <div className="bs-bubble-ai w-full max-w-[85%] overflow-hidden px-4 py-3 sm:max-w-[78%]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="bs-typing"><span /><span /><span /></span>
            <span>{label}…</span>
          </div>
          <button onClick={onStop} className="bs-quick">
            <X className="h-3 w-3" /> Stop
          </button>
        </div>

        <ol className="mt-3 grid gap-1.5">
          {BUILD_STEPS.map((s, i) => {
            const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "idle";
            return (
              <li key={s.key} className="flex items-center gap-2.5 text-xs">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${state === "active" ? "bs-step-active" : ""}`}
                  style={{
                    background: state === "done" ? "color-mix(in oklab, var(--bs-success) 18%, transparent)" :
                                state === "active" ? "var(--bs-primary-soft)" :
                                "var(--bs-card-2)",
                    color: state === "done" ? "var(--bs-success)" :
                           state === "active" ? "var(--bs-primary)" :
                           "var(--bs-muted-fg)",
                  }}
                >
                  {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </span>
                <span style={{ color: state === "idle" ? "var(--bs-muted-fg)" : "var(--bs-fg)" }}>
                  {s.label}
                </span>
                {state === "active" && <Loader2 className="ml-auto h-3 w-3 animate-spin" style={{ color: "var(--bs-primary)" }} />}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

type ActionRow = {
  id: string;
  kind: string;
  name: string;
  parent_path: string | null;
  status: string;
  error: string | null;
};

function ActionQueuePanel({ actions }: { actions: ActionRow[] }) {
  const [open, setOpen] = useState(true);
  return (
    <aside
      className="hidden w-80 shrink-0 flex-col border-l xl:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
        style={{ borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)" }}
      >
        <span className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5" /> Studio action queue
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
          {actions.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs" style={{ color: "var(--bs-muted-fg)" }}>
              Actions generated by the AI will appear here, waiting for the Studio plugin to pick them up.
            </p>
          ) : (
            <ul className="space-y-2">
              {actions.map((a) => (
                <li key={a.id} className="bs-soft p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
                    <span className="font-mono opacity-80">{a.kind}</span>
                    <span className="opacity-50">·</span>
                    <span className="truncate font-medium">{a.name}</span>
                  </div>
                  {a.parent_path && (
                    <div className="mt-1 truncate" style={{ color: "var(--bs-muted-fg)" }}>{a.parent_path}</div>
                  )}
                  <StatusPill status={a.status} />
                  {a.error && <p className="mt-1" style={{ color: "var(--bs-danger)" }}>{a.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; icon?: React.ReactNode }> = {
    done:    { bg: "color-mix(in oklab, var(--bs-success) 18%, transparent)", fg: "var(--bs-success)", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:  { bg: "color-mix(in oklab, var(--bs-danger) 18%, transparent)",  fg: "var(--bs-danger)",  icon: <AlertCircle className="h-3 w-3" /> },
    sent:    { bg: "color-mix(in oklab, var(--bs-accent) 18%, transparent)",  fg: "var(--bs-accent)" },
    pending: { bg: "var(--bs-card-2)",                                         fg: "var(--bs-muted-fg)" },
  };
  const s = map[status] ?? map.pending;
  return (
    <div
      className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.icon}{status}
    </div>
  );
}
