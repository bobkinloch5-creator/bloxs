import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProject } from "@/lib/projects.functions";
import { listMessages, listProjectActions, getPluginSession } from "@/lib/chat.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODELS, DEFAULT_MODEL_ID } from "@/lib/models";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Cpu, Hammer, Radio, Sparkles, FileCode } from "lucide-react";

export const Route = createFileRoute("/_authenticated/project/$projectId")({
  head: () => ({ meta: [{ title: "Build — BloxSmith" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const messagesFn = useServerFn(listMessages);
  const actionsFn = useServerFn(listProjectActions);
  const sessionFn = useServerFn(getPluginSession);

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

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
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

  const { messages, sendMessage, status, error } = useChat({
    id: projectId,
    transport,
    messages: initialMessages,
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["messages", projectId] });
      qc.invalidateQueries({ queryKey: ["actions", projectId] });
    },
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    if (!input.trim() || busy || !token) return;
    sendMessage(
      { text: input.trim() },
      { body: { projectId, modelId } },
    );
    setInput("");
  }

  const pluginOnline = pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display text-base font-semibold leading-tight">{project?.name ?? "Loading…"}</h1>
            <div className="text-xs text-muted-foreground">{project?.game_type}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link to="/plugin" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${pluginOnline ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
            <Radio className="h-3 w-3" /> {pluginOnline ? "Studio plugin online" : "Plugin offline"}
          </Link>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded-md border border-border bg-input px-2 py-1 text-xs"
          >
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-primary" />
                <h2 className="font-display mt-3 text-lg font-semibold">Describe what to build.</h2>
                <p className="mt-1 text-sm text-muted-foreground">Try: "Make a tycoon with droppers, an upgrade shop, and saving."</p>
              </div>
            )}
            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
                  {!isUser && <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Hammer className="h-4 w-4" /></div>}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                    {isUser ? (
                      <p className="text-sm">{text}</p>
                    ) : (
                      <div className="prose-chat"><ReactMarkdown>{text || "_…_"}</ReactMarkdown></div>
                    )}
                  </div>
                </div>
              );
            })}
            {status === "submitted" && <ThinkingBubble label="Thinking" />}
            {status === "streaming" && messages.at(-1)?.role !== "assistant" && <ThinkingBubble label="Building" />}
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error.message || "Something went wrong. Please retry."}</span>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-sidebar/50 lg:flex">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" /> Studio action queue
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
            {actions.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Actions generated by the AI will appear here, waiting for the Studio plugin to pick them up.
              </p>
            )}
            <ul className="space-y-2">
              {actions.map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-card p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{a.kind}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate font-medium">{a.name}</span>
                  </div>
                  <div className="mt-1 truncate text-muted-foreground">{a.parent_path}</div>
                  <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    a.status === "done" ? "bg-success/15 text-success" :
                    a.status === "failed" ? "bg-destructive/15 text-destructive" :
                    a.status === "sent" ? "bg-accent/15 text-accent" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {a.status === "done" && <CheckCircle2 className="h-3 w-3" />}
                    {a.status === "failed" && <AlertCircle className="h-3 w-3" />}
                    {a.status}
                  </div>
                  {a.error && <p className="mt-1 text-destructive">{a.error}</p>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="border-t border-border p-3 md:p-5">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder="Describe what to build, fix, or add…"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={busy || !input.trim() || !token}
            onClick={submit}
            className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble({ label }: { label: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Hammer className="h-4 w-4" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{label}…</span>
        </div>
        <div className="shimmer mt-2 h-1 w-40 rounded" />
      </div>
    </div>
  );
}
