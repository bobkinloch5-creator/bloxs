import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { getPluginSession } from "@/lib/chat.functions";
import { PageShell } from "@/components/PageShell";
import { Plug, Wand2, Github, Bot, Terminal, Globe, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mcp")({
  head: () => ({ meta: [
    { title: "MCP / Tools — BloxSmith" },
    { name: "description", content: "Connected tools and MCP servers powering your BloxSmith builds." },
  ]}),
  component: MCPPage,
});

function MCPPage() {
  const profFn = useServerFn(getMyProfile);
  const sessFn = useServerFn(getPluginSession);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: pluginSession } = useQuery({ queryKey: ["pluginSession"], queryFn: () => sessFn(), refetchInterval: 8000 });

  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000);

  const tools = [
    { key: "studio",  name: "Roblox Studio Plugin", desc: "Push builds, sync errors, run actions inside Studio.", icon: Plug,    status: pluginOnline ? "connected" : "disconnected", to: "/plugin" as const, color: "from-cyan-500/20 to-blue-500/10" },
    { key: "cursor",  name: "Cursor",               desc: "Bring BloxSmith's AI into your editor.",               icon: Terminal, status: "available", color: "from-violet-500/20 to-blue-500/10" },
    { key: "codex",   name: "Codex / OpenAI Tools", desc: "Forward BloxSmith actions to Codex toolchains.",       icon: Bot,      status: "available", color: "from-emerald-500/20 to-teal-500/10" },
    { key: "github",  name: "GitHub",               desc: "Sync Luau scripts to a repository.",                   icon: Github,   status: "available", color: "from-slate-500/20 to-zinc-500/10" },
    { key: "agent",   name: "Local AI Agent",       desc: "Run a local agent that talks to BloxSmith via MCP.",   icon: Wand2,    status: "available", color: "from-amber-500/20 to-orange-500/10" },
    { key: "custom",  name: "Custom MCP Server",    desc: "Bring your own tools — point an MCP server at BloxSmith.", icon: Globe, status: "available", color: "from-pink-500/20 to-rose-500/10" },
  ];

  return (
    <PageShell
      title="MCP / Tools"
      description="Every tool BloxSmith can talk to — Studio plugin, editors, and your own MCP servers."
      accent="mcp"
      activeKey="mcp"
      isAdmin={!!profile?.is_admin}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => {
          const Icon = t.icon;
          const connected = t.status === "connected";
          const disconnected = t.status === "disconnected";
          return (
            <div key={t.key} className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${t.color} p-5 backdrop-blur-sm`}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10">
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  connected ? "bg-emerald-500/20 text-emerald-300" :
                  disconnected ? "bg-rose-500/15 text-rose-300" :
                  "bg-white/10 text-muted-foreground"
                }`}>
                  {connected ? <><CheckCircle2 className="h-3 w-3" /> Connected</> :
                   disconnected ? <><XCircle className="h-3 w-3" /> Offline</> :
                   "Available"}
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold">{t.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              {t.to ? (
                <Link to={t.to} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/15">
                  {connected ? "Manage" : "Set up"}
                </Link>
              ) : (
                <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground" disabled>
                  Coming via MCP
                </button>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
