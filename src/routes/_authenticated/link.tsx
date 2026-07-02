import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { claimPairCode } from "@/lib/pair.functions";
import { CheckCircle2, Plug, AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/link")({
  head: () => ({ meta: [{ title: "Link Plugin — BloxSmith" }] }),
  validateSearch: (s) =>
    z.object({
      code: z.string().optional(),
      project: z.string().uuid().optional(),
    }).parse(s),
  component: LinkPage,
});

function LinkPage() {
  const { code, project } = Route.useSearch();
  const claimFn = useServerFn(claimPairCode);
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { code: code!, projectId: project } }),
  });

  if (!code) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-amber-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">No pairing code</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the BloxSmith plugin inside Roblox Studio and click <b>Connect</b>.
          It will give you a one-click link to come back here.
        </p>
        <Link to="/plugin" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Download the plugin
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <Plug className="mx-auto h-10 w-10 text-primary" />
      <h1 className="mt-4 font-display text-2xl font-bold">Connect Roblox Studio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A BloxSmith plugin in Studio is asking to link to your account.
      </p>
      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3 font-mono text-lg tracking-[0.4em]">
        {code.toUpperCase()}
      </div>

      {claim.isSuccess ? (
        <div className="mt-6 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2 text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Plugin connected
          </div>
          <p className="text-sm text-muted-foreground">
            Switch back to Roblox Studio — the plugin will say <b>Connected</b> within a few seconds.
          </p>
          <Link to="/dashboard" className="inline-block rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">
            Back to dashboard
          </Link>
        </div>
      ) : claim.isError ? (
        <div className="mt-6 space-y-3">
          <div className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">
            {(claim.error as Error)?.message ?? "Could not approve this code."}
          </div>
          <button onClick={() => claim.mutate()} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">
            Try again
          </button>
        </div>
      ) : (
        <button
          onClick={() => claim.mutate()}
          disabled={claim.isPending}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {claim.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</> : <>Approve & connect</>}
        </button>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Only approve codes you just generated in your own Roblox Studio.
      </p>
    </div>
  );
}
