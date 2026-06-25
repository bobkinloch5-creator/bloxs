import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/admin.functions";
import { Crown, ShieldCheck, Folder, MessageSquare, Plug, Settings, Sparkles, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Owner Admin — BloxSmith" }] }),
  component: AdminPage,
});

function AdminPage() {
  const overviewFn = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["adminOverview"],
    queryFn: () => overviewFn(),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="bloxchat-dark grid min-h-screen place-items-center" style={{ background: "var(--bs-bg)", color: "var(--bs-fg)" }}>
        <div className="bs-card flex items-center gap-2 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--bs-primary)" }} /> Checking owner access…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bloxchat-dark grid min-h-screen place-items-center px-4" style={{ background: "var(--bs-bg)", color: "var(--bs-fg)" }}>
        <div className="bs-card max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8" style={{ color: "var(--bs-warning)" }} />
          <h1 className="mt-3 text-xl font-extrabold">Admin panel unavailable</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--bs-muted-fg)" }}>This area is locked to the BloxSmith owner account.</p>
          <Link to="/dashboard" className="bs-quick mt-5 justify-center">Back to Projects</Link>
        </div>
      </div>
    );
  }

  const name = data.profile?.display_name || data.profile?.username || "Owner";

  return (
    <div className="bloxchat-dark min-h-screen" style={{ background: "var(--bs-bg)", color: "var(--bs-fg)" }}>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section className="bs-card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 -z-10 opacity-60" style={{ background: "radial-gradient(800px 300px at 0% 0%, color-mix(in oklab, var(--bs-primary) 25%, transparent), transparent 60%)" }} />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="bs-chip mb-3" style={{ color: "var(--bs-primary)", background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)" }}>
                <Crown className="h-3.5 w-3.5" /> Owner Admin
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Welcome back, {name}</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--bs-muted-fg)" }}>Your owner access is active and restricted to your email account.</p>
            </div>
            <div className="bs-soft flex items-center gap-3 p-3">
              <ShieldCheck className="h-8 w-8" style={{ color: "var(--bs-success)" }} />
              <div className="text-sm">
                <div className="font-bold">Access verified</div>
                <div className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>{data.email}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <AdminStat icon={Folder} label="Your projects" value={data.stats.projects} />
          <AdminStat icon={MessageSquare} label="AI messages" value={data.stats.messages} />
          <AdminStat icon={Plug} label="Pending plugin actions" value={data.stats.pendingActions} />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="bs-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> Owner status</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <InfoRow label="Plan" value={data.profile?.plan ?? "Owner"} />
              <InfoRow label="Credits" value="Unlimited owner credits" />
              <InfoRow label="Roles" value={data.roles.join(", ") || "owner"} />
            </div>
          </div>
          <div className="bs-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> Admin shortcuts</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/dashboard" className="bs-quick"><Folder className="h-3.5 w-3.5" /> Projects</Link>
              <Link to="/plugin" className="bs-quick"><Plug className="h-3.5 w-3.5" /> Plugin</Link>
              <Link to="/settings" className="bs-quick"><Settings className="h-3.5 w-3.5" /> Settings</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function AdminStat({ icon: Icon, label, value }: { icon: typeof Folder; label: string; value: number }) {
  return (
    <div className="bs-card p-4">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
        {label}<Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-3xl font-extrabold" style={{ color: "var(--bs-primary)" }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
      <span style={{ color: "var(--bs-muted-fg)" }}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}