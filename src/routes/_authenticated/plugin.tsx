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
        <h2 className="font-display text-lg font-semibold">2. Install the plugin</h2>
        <p className="mt-1 text-sm text-muted-foreground">Download the Luau file, save it to your Roblox Studio plugins folder.</p>
        <a
          href="/BloxSmithPlugin.lua"
          download
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Download BloxSmithPlugin.lua
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          In Studio: <span className="font-mono">Plugins → Open Plugins Folder</span>, drop the .lua file there, restart Studio.
        </p>
      </div>

      <div className="glass mt-4 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold">3. Connect</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open the plugin in Studio, paste your token, then click <span className="font-mono">Connect</span>.
          It will poll <span className="font-mono">{apiBase}/api/public/plugin/poll</span> for queued actions.
        </p>
      </div>
    </div>
  );
}
