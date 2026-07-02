import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Trash2, RefreshCw, Plus, Wrench, Server, Copy, Terminal, Code2, MessageSquare, Sparkles, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getMyProfile, getMyPluginToken } from "@/lib/profile.functions";
import {
  listMcpServers, addMcpServer, testMcpServer, toggleMcpServer, removeMcpServer,
} from "@/lib/mcp-servers.functions";


export const Route = createFileRoute("/_authenticated/mcp-servers")({
  head: () => ({ meta: [
    { title: "MCP Server Connections — BloxSmith" },
    { name: "description", content: "Connect your own Model Context Protocol servers to BloxSmith — add, test, list tools, enable, and disconnect." },
  ]}),
  component: McpServersPage,
});

function McpServersPage() {
  const qc = useQueryClient();
  const profFn = useServerFn(getMyProfile);
  const tokenFn = useServerFn(getMyPluginToken);
  const listFn = useServerFn(listMcpServers);
  const addFn = useServerFn(addMcpServer);
  const testFn = useServerFn(testMcpServer);
  const toggleFn = useServerFn(toggleMcpServer);
  const removeFn = useServerFn(removeMcpServer);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: tokenRes } = useQuery({ queryKey: ["plugin_token"], queryFn: () => tokenFn() });
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["mcp_servers"],
    queryFn: () => listFn(),
  });


  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mcp_servers"] });

  const add = useMutation({
    mutationFn: () => addFn({ data: { name: name.trim(), url: url.trim(), token: token.trim() || null } }),
    onSuccess: (row: any) => {
      setName(""); setUrl(""); setToken("");
      invalidate();
      if (row?.status === "ready") toast.success(`Connected — ${row.tools?.length ?? 0} tools found.`);
      else toast.error(row?.status_message ?? "Server added, but connection failed.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add MCP server."),
  });

  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (row: any) => {
      invalidate();
      if (row?.status === "ready") toast.success(`Connection OK — ${row.tools?.length ?? 0} tools.`);
      else toast.error(row?.status_message ?? "Connection failed.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Test failed."),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("MCP server disconnected."); },
    onError: (e: any) => toast.error(e?.message ?? "Remove failed."),
  });

  return (
    <PageShell
      title="MCP Server Connections"
      description="Connect your own Model Context Protocol servers — BloxSmith stores the URL, tests the connection, and lists every tool the server exposes."
      accent="mcp"
      activeKey="mcp-srv"
      isAdmin={!!profile?.is_admin}
    >
      <BloxSmithMcpGuide pluginToken={tokenRes?.plugin_token ?? null} />

      {/* Add form */}

      <form
        onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !url.trim()) { toast.error("Name and URL are required."); return; } add.mutate(); }}
        className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Plus className="h-4 w-4" /> Add MCP server</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1.2fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. My Notion MCP)" className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm" maxLength={80} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono" />
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token (optional)" type="password" className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono" maxLength={500} />
          <button type="submit" disabled={add.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-60">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add & test
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Only <code>https://</code> URLs (or <code>http://localhost</code>) are allowed. Tokens are stored per-user and never shown to other people.</p>
      </form>

      {isLoading && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading MCP servers…</div>}

      {!isLoading && servers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <div className="text-sm font-semibold">No MCP servers yet</div>
          <p className="mt-1 text-xs text-slate-400">Paste a Streamable-HTTP MCP endpoint above to connect it. BloxSmith will POST <code>tools/list</code> and display every tool the server exposes.</p>
        </div>
      )}

      <div className="space-y-3">
        {(servers as any[]).map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.status === "ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                {s.status === "ready" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-bold">{s.name}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.status === "ready" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                    {s.status === "ready" ? "Connected" : s.status === "failed" ? "Failed" : "Unknown"}
                  </span>
                  {!s.enabled && <span className="rounded-full bg-slate-500/25 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-200">Disabled</span>}
                </div>
                <div className="truncate font-mono text-[11px] text-slate-400">{s.url}</div>
                {s.status_message && <div className="mt-0.5 text-[11px] text-slate-300">{s.status_message}</div>}
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={s.enabled} onChange={(e) => toggle.mutate({ id: s.id, enabled: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
                Enabled
              </label>
              <button onClick={() => test.mutate(s.id)} disabled={test.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.12]">
                {test.isPending && test.variables === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Test
              </button>
              <button onClick={() => { if (confirm(`Disconnect "${s.name}"?`)) remove.mutate(s.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20">
                <Trash2 className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>

            {Array.isArray(s.tools) && s.tools.length > 0 && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Wrench className="h-3 w-3" /> Tools ({s.tools.length})
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {s.tools.map((t: any, i: number) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
                      <div className="font-mono text-[11px] font-semibold text-slate-100">{t.name}</div>
                      {t.description && <div className="mt-0.5 line-clamp-2 text-[10.5px] text-slate-400">{t.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.last_tested_at && (
              <div className="mt-2 text-[10px] text-slate-500">Last tested {new Date(s.last_tested_at).toLocaleString()}</div>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); toast.success("Copied to clipboard"); } catch { toast.error("Copy failed"); }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-slate-100 hover:bg-white/[0.14]"
    >
      <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 pr-16 text-[11px] leading-relaxed text-slate-100"><code>{children}</code></pre>
      <div className="absolute right-2 top-2"><CopyBtn text={children} /></div>
    </div>
  );
}

function BloxSmithMcpGuide({ pluginToken }: { pluginToken: string | null }) {
  type ClientKey = "claude" | "cursor" | "vscode" | "codex";
  const [tab, setTab] = useState<ClientKey>("claude");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://bloxsmith.pro";
  const url = `${origin}/api/public/mcp`;
  const token = pluginToken ?? "<YOUR_BLOXSMITH_PLUGIN_TOKEN>";

  const snippets = useMemo(() => ({
    claude: `{
  "mcpServers": {
    "bloxsmith": {
      "transport": "http",
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
    cursor: `{
  "mcpServers": {
    "bloxsmith": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`,
    vscode: `{
  "mcp": {
    "servers": {
      "bloxsmith": {
        "type": "http",
        "url": "${url}",
        "headers": {
          "Authorization": "Bearer ${token}"
        }
      }
    }
  }
}`,
    codex: `# ~/.codex/config.toml
[mcp_servers.bloxsmith]
transport = "http"
url = "${url}"
headers = { Authorization = "Bearer ${token}" }`,
  }), [url, token]);

  const meta: Record<ClientKey, { label: string; icon: any; path: string; note: string }> = {
    claude:  { label: "Claude Desktop", icon: MessageSquare, path: "~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)  •  %APPDATA%\\Claude\\claude_desktop_config.json  (Windows)", note: "Restart Claude Desktop after saving. The bloxsmith tools appear under the tools menu." },
    cursor:  { label: "Cursor",         icon: Sparkles,       path: "~/.cursor/mcp.json  (global)  •  .cursor/mcp.json  (per project)",                                                                                                             note: "Open Cursor Settings → MCP to verify the server shows Connected." },
    vscode:  { label: "VS Code",        icon: Code2,          path: "settings.json  (User or Workspace)  •  Requires GitHub Copilot Chat with MCP support enabled",                                                                                note: "Reload VS Code, then open Copilot Chat and confirm the bloxsmith server is listed." },
    codex:   { label: "Codex CLI",      icon: Terminal,       path: "~/.codex/config.toml",                                                                                                                                                        note: "Run `codex` — it lists MCP servers on startup. If missing, run `codex mcp list` to debug." },
  };

  return (
    <div className="mb-6 rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.06] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-indigo-100">
        <Server className="h-4 w-4" /> Connect BloxSmith MCP to your editor
      </div>
      <p className="text-[12px] text-slate-300">
        BloxSmith exposes a Model Context Protocol (MCP) server at{" "}
        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-indigo-100">{url}</code>. Any MCP-capable client — Claude, Cursor, VS Code Copilot, Codex CLI — can call{" "}
        <code>list_projects</code>, <code>studio_status</code>, <code>push_script</code>, and <code>push_part</code> to build inside your Roblox Studio.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/40 p-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Server URL</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-[11px] text-slate-100">{url}</code>
            <CopyBtn text={url} />
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/40 p-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bearer token (your plugin token)</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-[11px] text-slate-100">{pluginToken ? token : "Open the Plugin page to reveal or regenerate."}</code>
            {pluginToken && <CopyBtn text={token} />}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(Object.keys(meta) as ClientKey[]).map((k) => {
          const Icon = meta[k].icon;
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-indigo-400/60 bg-indigo-500/25 text-white" : "border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/[0.10]"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {meta[k].label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-[11px] text-slate-300">
          <span className="font-bold text-slate-100">Config file:</span>{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10.5px]">{meta[tab].path}</code>
        </div>
        <CodeBlock>{snippets[tab]}</CodeBlock>
        <div className="text-[11px] text-slate-400">{meta[tab].note}</div>
      </div>

      <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
        <strong>Heads up:</strong> the bearer token is your BloxSmith plugin token. Keep it private. Regenerate it any time from the{" "}
        <a href="/plugin" className="inline-flex items-center gap-0.5 underline decoration-amber-300/60 underline-offset-2 hover:text-white">Plugin page <ExternalLink className="h-3 w-3" /></a>{" "}
        — the old token stops working immediately.
      </div>
    </div>
  );
}

