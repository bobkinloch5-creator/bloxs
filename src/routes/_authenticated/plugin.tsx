import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, regeneratePluginToken } from "@/lib/profile.functions";
import { Copy, RefreshCw, Download, Plug, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/plugin")({
  head: () => ({ meta: [{ title: "Studio Plugin — BloxSmith" }] }),
  component: PluginPage,
});

function PluginPage() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const regenFn = useServerFn(regeneratePluginToken);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const [copied, setCopied] = useState(false);
  const regen = useMutation({
    mutationFn: () => regenFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  function copy() {
    if (!profile?.plugin_token) return;
    navigator.clipboard.writeText(profile.plugin_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-3xl font-bold">Roblox Studio Plugin</h1>
          <p className="text-sm text-muted-foreground">Install the BloxSmith plugin and connect it with your token.</p>
        </div>
      </div>

      <div className="glass mt-8 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">1. Your plugin token</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste this into the BloxSmith plugin in Studio. Treat it like a password.</p>
        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-border bg-input px-3 py-2 font-mono text-sm">
            {profile?.plugin_token ?? "…"}
          </code>
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
            {copied ? <><CheckCircle2 className="h-4 w-4 text-success" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </button>
          <button
            onClick={() => { if (confirm("Rotate token? The old token stops working immediately.")) regen.mutate(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${regen.isPending ? "animate-spin" : ""}`} /> Rotate
          </button>
        </div>
      </div>

      <div className="glass mt-4 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">2. Download the plugin</h2>
        <p className="mt-1 text-sm text-muted-foreground">Grab the Luau file — it's a single script that runs inside Roblox Studio.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/BloxSmithPlugin.lua"
            download="BloxSmithPlugin.lua"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Download BloxSmithPlugin.lua
          </a>
          <a
            href="/BloxSmithPlugin.lua"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            View source
          </a>
        </div>
      </div>

      <div className="glass mt-4 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">3. Install in Roblox Studio</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>Open Roblox Studio.</li>
          <li>Top bar → <span className="font-mono text-foreground">Plugins</span> tab → <span className="font-mono text-foreground">Plugins Folder</span>. This opens the folder where Studio loads plugins from.</li>
          <li>
            Drop <span className="font-mono text-foreground">BloxSmithPlugin.lua</span> into that folder. Default paths:
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><span className="font-mono">Windows:</span> <span className="font-mono text-foreground">%LOCALAPPDATA%\Roblox\Plugins</span></li>
              <li><span className="font-mono">macOS:</span> <span className="font-mono text-foreground">~/Documents/Roblox/Plugins</span></li>
            </ul>
          </li>
          <li>Back in Studio click <span className="font-mono text-foreground">Plugins → Reload Plugins</span> (or restart Studio).</li>
          <li>A new <span className="font-mono text-foreground">BloxSmith</span> button appears in the Plugins tab.</li>
        </ol>
      </div>

      <div className="glass mt-4 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">4. Connect to your account</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>In Studio click the <span className="font-mono text-foreground">BloxSmith</span> plugin button — a small panel opens.</li>
          <li>Paste the token from step 1 into the <span className="font-mono text-foreground">Token</span> field.</li>
          <li>Click <span className="font-mono text-foreground">Connect</span>. Status flips to <span className="text-success">Connected</span> once it reaches the server.</li>
          <li>First time only: Studio asks for HTTP permission — tick <span className="font-mono text-foreground">Allow HTTP Requests</span>. The plugin only talks to <span className="font-mono">{apiBase}</span>.</li>
          <li>You're done. Open a project in BloxSmith and click <span className="font-mono text-foreground">Send to Studio</span> — the build appears in your open place.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Under the hood the plugin polls <span className="font-mono">{apiBase}/api/public/plugin/poll</span> every few seconds for queued actions.
        </p>
      </div>

      <div className="glass mt-4 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">Troubleshooting</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5">
          <li><strong className="text-foreground">Button doesn't appear?</strong> Make sure the file ends in <span className="font-mono">.lua</span> and is directly inside the Plugins folder (not a sub-folder), then reload plugins.</li>
          <li><strong className="text-foreground">"HTTP 401" in the plugin log?</strong> Your token was rotated — copy the new one above and reconnect.</li>
          <li><strong className="text-foreground">Nothing happens when you send?</strong> Check <span className="font-mono">Game Settings → Security → Allow HTTP Requests</span> is on.</li>
          <li><strong className="text-foreground">Still stuck?</strong> Ask in our <a className="text-primary underline" href="https://discord.gg/bloxsmith" target="_blank" rel="noreferrer">Discord</a>.</li>
        </ul>
      </div>
    </div>
  );
}
