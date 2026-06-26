import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyProfile } from "@/lib/profile.functions";
import { getPluginSession } from "@/lib/chat.functions";
import { PageShell } from "@/components/PageShell";
import { Plug, Wand2, Github, Bot, Terminal, Globe, CheckCircle2, XCircle, Copy, X, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mcp")({
  head: () => ({ meta: [
    { title: "MCP / Tools — BloxSmith" },
    { name: "description", content: "Connected tools and MCP servers powering your BloxSmith builds." },
  ]}),
  component: MCPPage,
});

type ToolKey = "studio" | "cursor" | "codex" | "github" | "agent" | "custom";

function MCPPage() {
  const profFn = useServerFn(getMyProfile);
  const sessFn = useServerFn(getPluginSession);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: pluginSession } = useQuery({ queryKey: ["pluginSession"], queryFn: () => sessFn(), refetchInterval: 8000 });
  const [open, setOpen] = useState<ToolKey | null>(null);

  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://bloxsmith.pro";
  const mcpUrl = `${origin}/api/public/mcp`;
  const token = (profile as any)?.plugin_token ?? "<connect Studio Plugin first to get your token>";

  const tools: { key: ToolKey; name: string; desc: string; icon: typeof Plug; status: "connected" | "disconnected" | "available"; color: string; to?: "/plugin" }[] = [
    { key: "studio",  name: "Roblox Studio Plugin", desc: "Push builds, sync errors, run actions inside Studio.", icon: Plug,    status: pluginOnline ? "connected" : "disconnected", to: "/plugin", color: "from-cyan-500/20 to-blue-500/10" },
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
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs">
        <div className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">Your MCP endpoint</div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-black/40 px-2 py-1 font-mono">{mcpUrl}</code>
          <CopyBtn value={mcpUrl} />
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Auth:</span>
          <code className="rounded-lg bg-black/40 px-2 py-1 font-mono">Bearer {maskToken(token)}</code>
          <CopyBtn value={token} label="Copy token" />
        </div>
      </div>

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
                  "bg-emerald-500/15 text-emerald-300"
                }`}>
                  {connected ? <><CheckCircle2 className="h-3 w-3" /> Connected</> :
                   disconnected ? <><XCircle className="h-3 w-3" /> Offline</> :
                   <><CheckCircle2 className="h-3 w-3" /> Available</>}
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold">{t.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              {t.to ? (
                <Link to={t.to} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/15">
                  {connected ? "Manage" : "Set up"}
                </Link>
              ) : (
                <button
                  onClick={() => setOpen(t.key)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/25"
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      {open && open !== "studio" && (
        <SetupDialog
          toolKey={open}
          mcpUrl={mcpUrl}
          token={token}
          onClose={() => setOpen(null)}
        />
      )}
    </PageShell>
  );
}

function maskToken(t: string) {
  if (!t || t.length < 8) return t;
  return `${t.slice(0, 4)}…${t.slice(-3)}`;
}

function CopyBtn({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
      className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold hover:bg-white/20"
    >
      <Copy className="h-3 w-3" /> {done ? "Copied" : label}
    </button>
  );
}

function SetupDialog({ toolKey, mcpUrl, token, onClose }: { toolKey: ToolKey; mcpUrl: string; token: string; onClose: () => void }) {
  const snippets = getSnippets(toolKey, mcpUrl, token);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1020] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold">{snippets.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{snippets.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>

        <ol className="mt-4 space-y-3 text-sm">
          {snippets.steps.map((s, i) => (
            <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
              <div className="mt-1">{s.text}</div>
              {s.code && (
                <div className="mt-2">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed">
                    <code>{s.code}</code>
                  </pre>
                  <div className="mt-1.5"><CopyBtn value={s.code} /></div>
                </div>
              )}
            </li>
          ))}
        </ol>

        {snippets.docsUrl && (
          <a href={snippets.docsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Open official docs <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function getSnippets(tool: ToolKey, url: string, token: string): {
  title: string; subtitle: string; docsUrl?: string;
  steps: { text: string; code?: string }[];
} {
  switch (tool) {
    case "cursor":
      return {
        title: "Connect Cursor to BloxSmith",
        subtitle: "Cursor can call BloxSmith tools (list_projects, push_script, push_part) via MCP.",
        docsUrl: "https://docs.cursor.com/context/model-context-protocol",
        steps: [
          { text: "Open Cursor → Settings → MCP → Add new MCP server, then paste this JSON:" },
          { text: "~/.cursor/mcp.json", code:
`{
  "mcpServers": {
    "bloxsmith": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer ${token}" }
    }
  }
}` },
          { text: "Restart Cursor. You'll see BloxSmith tools in the agent's tool list." },
        ],
      };
    case "codex":
      return {
        title: "Connect Codex / OpenAI Agents",
        subtitle: "Use BloxSmith as an MCP server from any OpenAI-Agents-SDK client.",
        docsUrl: "https://openai.github.io/openai-agents-python/mcp/",
        steps: [
          { text: "Install the OpenAI Agents SDK:", code: "pip install openai-agents" },
          { text: "Register BloxSmith as a streamable-HTTP MCP server:", code:
`from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

server = MCPServerStreamableHttp(
    name="bloxsmith",
    params={
        "url": "${url}",
        "headers": {"Authorization": "Bearer ${token}"},
    },
)

agent = Agent(name="Roblox builder", instructions="Use BloxSmith tools to build games.", mcp_servers=[server])
print(Runner.run_sync(agent, "list my projects").final_output)` },
        ],
      };
    case "github":
      return {
        title: "Sync Luau scripts to GitHub",
        subtitle: "Push generated scripts as commits via the GitHub MCP server.",
        docsUrl: "https://github.com/github/github-mcp-server",
        steps: [
          { text: "Create a GitHub fine-grained PAT with repo:contents write." },
          { text: "Add the GitHub MCP server alongside BloxSmith in your client config:", code:
`{
  "mcpServers": {
    "bloxsmith": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer ${token}" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
    }
  }
}` },
          { text: "Ask the agent: 'List my BloxSmith projects, then commit the latest scripts to my repo.'" },
        ],
      };
    case "agent":
      return {
        title: "Run a local AI agent that talks to BloxSmith",
        subtitle: "Any MCP-aware client works. Example using Anthropic's Python MCP client:",
        docsUrl: "https://modelcontextprotocol.io/quickstart/client",
        steps: [
          { text: "Install the MCP SDK:", code: "pip install mcp" },
          { text: "Open a streamable-HTTP session to BloxSmith and list tools:", code:
`import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    async with streamablehttp_client(
        "${url}",
        headers={"Authorization": "Bearer ${token}"},
    ) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print([t.name for t in tools.tools])
            result = await session.call_tool("list_projects", {})
            print(result.content[0].text)

asyncio.run(main())` },
        ],
      };
    case "custom":
      return {
        title: "Custom MCP Server",
        subtitle: "BloxSmith speaks the MCP Streamable-HTTP spec. Any compliant client works.",
        docsUrl: "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports",
        steps: [
          { text: "Endpoint", code: url },
          { text: "Auth header", code: `Authorization: Bearer ${token}` },
          { text: "Required POST headers (per MCP spec)", code: "Content-Type: application/json\nAccept: application/json, text/event-stream" },
          { text: "Available tools", code: "list_projects\nstudio_status\npush_script  { project_id, kind, parent_path, name, source }\npush_part    { project_id, name, size?, position?, color?, anchored?, material? }" },
          { text: "Smoke test (curl):", code:
`curl -s -X POST "${url}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` },
        ],
      };
    case "studio":
      return { title: "", subtitle: "", steps: [] };
  }
}
