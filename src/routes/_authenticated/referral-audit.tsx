import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, RefreshCw, ArrowLeft, Loader2 } from "lucide-react";
import { auditReferralCodes, backfillReferralCodes } from "@/lib/referral-audit.functions";

export const Route = createFileRoute("/_authenticated/referral-audit")({
  head: () => ({ meta: [{ title: "Referral Code Audit — BloxSmith" }] }),
  component: ReferralAuditPage,
});

function ReferralAuditPage() {
  const audit = useServerFn(auditReferralCodes);
  const backfill = useServerFn(backfillReferralCodes);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["referral-audit"],
    queryFn: () => audit({}),
  });

  const backfillMut = useMutation({
    mutationFn: () => backfill({}),
    onSuccess: (res: any) => {
      toast.success(`Backfilled ${res.updated}/${res.attempted} profiles`);
      qc.invalidateQueries({ queryKey: ["referral-audit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Backfill failed"),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  const d = data!;
  const complete = d.backfillComplete && d.duplicates.length === 0;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3 w-3" /> Back to Admin
          </Link>
          <h1 className="text-2xl font-bold">Referral Code Audit</h1>
          <p className="text-sm text-muted-foreground">
            Generated {new Date(d.generatedAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent"
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div
        className={`rounded-lg border p-4 flex items-start gap-3 ${
          complete
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        {complete ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
        )}
        <div className="text-sm">
          <div className="font-semibold">
            {complete
              ? "Backfill complete — every profile has a unique referral code."
              : "Attention required"}
          </div>
          <div className="text-muted-foreground mt-1">
            {d.missing > 0 && <>• {d.missing} profile(s) still missing a referral code.<br /></>}
            {d.duplicates.length > 0 && <>• {d.duplicates.length} duplicate code(s) detected.<br /></>}
            {d.missingRecent24h > 0 && <>• {d.missingRecent24h} of the missing rows were created in the last 24h — the auto-assign trigger may be broken.<br /></>}
            {complete && "The assign_referral_code trigger is functioning correctly."}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total profiles" value={d.total} />
        <Stat label="With referral code" value={d.withCode} />
        <Stat label="Missing (NULL)" value={d.missing} tone={d.missing > 0 ? "bad" : "good"} />
        <Stat label="Coverage" value={`${d.coveragePct}%`} tone={d.coveragePct === 100 ? "good" : "bad"} />
      </div>

      {d.missing > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Backfill missing codes</div>
              <div className="text-xs text-muted-foreground">
                Generates a fresh BS-prefixed code for every profile with a NULL referral_code.
              </div>
            </div>
            <button
              onClick={() => backfillMut.mutate()}
              disabled={backfillMut.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {backfillMut.isPending ? "Backfilling..." : `Backfill ${d.missing}`}
            </button>
          </div>
        </div>
      )}

      {d.duplicates.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="font-semibold mb-2">Duplicate codes</div>
          <ul className="text-sm space-y-1">
            {d.duplicates.map((x: any) => (
              <li key={x.code} className="flex justify-between">
                <span className="font-mono">{x.code}</span>
                <span className="text-muted-foreground">{x.count} profiles</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.missingProfiles.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="font-semibold mb-2">Profiles missing a code (up to 50)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-2">Username</th><th>Display name</th><th>Created</th><th>ID</th></tr>
              </thead>
              <tbody>
                {d.missingProfiles.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2">{p.username ?? "—"}</td>
                    <td>{p.display_name ?? "—"}</td>
                    <td className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border p-4">
        <div className="font-semibold mb-2">Recent codes (sample)</div>
        <ul className="text-sm space-y-1 font-mono">
          {d.sampleRecent.map((p: any) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.username ?? p.id.slice(0, 8)}</span>
              <span className="text-primary">{p.referral_code}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-bold mt-1 ${
          tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-amber-500" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
