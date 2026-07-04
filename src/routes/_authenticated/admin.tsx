import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getAdminOverview, listAllUsers, giftCredits, setUserBanned, setUserRole,
} from "@/lib/admin.functions";
import {
  getDashboardMetrics, listAllProjects, deleteProjectAsAdmin, renameProjectAsAdmin,
  listPluginSessions, disconnectPluginSession, listStudioErrors, deleteStudioError,
  getPromptAnalytics, listBroadcasts, createBroadcast, setBroadcastActive,
  listAuditLogs, getGlobalSettings, updateGlobalSetting,
  grantUnlimitedCredits, resetActionQueue,
} from "@/lib/admin-control.functions";
import { listPendingDonationClaims, decideDonationClaim } from "@/lib/donations.functions";
import { MODELS } from "@/lib/models";
import { ModelTestPanel } from "@/components/ModelTestPanel";
import {
  Crown, ShieldCheck, Folder, MessageSquare, Plug, Settings, Sparkles, Loader2, AlertTriangle,
  Heart, Check, X, Users, UserPlus, Ban, ShieldOff, Gift, Search, Coins, ShieldAlert, Star,
  Activity, Bot, Zap, Server, Bell, ScrollText, Trash2, Radio, RefreshCw, Infinity as InfIcon,
  TrendingUp, AlertOctagon, Package, LayoutDashboard, Pencil, Play, Pause,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Owner Control Center — BloxSmith" }] }),
  component: AdminPage,
});

type Tab =
  | "dashboard" | "users" | "projects" | "ai" | "plugins" | "errors"
  | "prompts" | "broadcasts" | "audit" | "settings" | "donations" | "owner";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "dashboard", label: "Live Dashboard", icon: LayoutDashboard },
  { key: "users", label: "Users", icon: Users },
  { key: "projects", label: "Projects", icon: Folder },
  { key: "ai", label: "AI Control", icon: Bot },
  { key: "plugins", label: "Plugins", icon: Plug },
  { key: "errors", label: "Errors", icon: AlertOctagon },
  { key: "prompts", label: "Prompt Analytics", icon: TrendingUp },
  { key: "broadcasts", label: "Broadcasts", icon: Radio },
  { key: "audit", label: "Audit Logs", icon: ScrollText },
  { key: "settings", label: "Global Settings", icon: Settings },
  { key: "donations", label: "Donations", icon: Heart },
  { key: "owner", label: "Owner Tools", icon: Crown },
];

function AdminPage() {
  const overviewFn = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["adminOverview"], queryFn: () => overviewFn(), retry: false });
  const [tab, setTab] = useState<Tab>("dashboard");

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0a0a1a] text-slate-200">
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-white/[0.02] px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> Verifying access…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0a0a1a] px-4 text-slate-200">
        <div className="max-w-md rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
          <h1 className="mt-3 text-xl font-extrabold">Control Center locked</h1>
          <p className="mt-2 text-sm text-slate-400">This area is restricted to admins and the owner.</p>
          <Link to="/dashboard" className="mt-5 inline-block rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const name = data.profile?.display_name || data.profile?.username || "Owner";
  const isOwner = data.roles.includes("owner");

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-slate-100" style={{ fontFamily: "Rubik, sans-serif" }}>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 via-slate-950 to-fuchsia-950/40 p-6 sm:p-8">
          <div className="absolute inset-0 -z-10 opacity-40" style={{ background: "radial-gradient(800px 300px at 0% 0%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(600px 240px at 100% 100%, rgba(217,70,239,0.25), transparent 60%)" }} />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                {isOwner ? <><Crown className="h-3 w-3" /> Owner Control Center</> : <><ShieldCheck className="h-3 w-3" /> Admin Control Center</>}
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Mission Control · <span className="text-indigo-300">{name}</span>
              </h1>
              <p className="mt-2 text-sm text-slate-400">Every user, project, model, plugin, error, and setting in one place.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3">
              <Server className="h-6 w-6 text-emerald-400" />
              <div className="text-sm">
                <div className="font-bold">All systems operational</div>
                <div className="text-xs text-slate-400">{data.email}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-indigo-500/15 bg-white/[0.02] p-1.5">
          {TABS.map((t) => {
            if (t.key === "owner" && !isOwner) return null;
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-indigo-500/25 text-indigo-100 shadow-inner ring-1 ring-indigo-400/40"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>

        <main className="mt-6 space-y-6">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "users" && <UsersPanel isOwner={isOwner} />}
          {tab === "projects" && <ProjectsTab />}
          {tab === "ai" && <AITab />}
          {tab === "plugins" && <PluginsTab />}
          {tab === "errors" && <ErrorsTab />}
          {tab === "prompts" && <PromptsTab />}
          {tab === "broadcasts" && <BroadcastsTab />}
          {tab === "audit" && <AuditTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "donations" && <DonationClaimsPanel />}
          {tab === "owner" && isOwner && <OwnerToolsTab />}
        </main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shared UI primitives
// -----------------------------------------------------------------------------

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-indigo-500/15 bg-white/[0.02] p-5 backdrop-blur ${className}`}>
      {children}
    </section>
  );
}

function SectionTitle({ icon: Icon, title, right, tint = "indigo" }: any) {
  const map: any = { indigo: "text-indigo-300", emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300", fuchsia: "text-fuchsia-300" };
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
        <Icon className={`h-4 w-4 ${map[tint]}`} /> {title}
      </h2>
      {right}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint = "indigo", sub }: any) {
  const bg: any = {
    indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-300 border-indigo-400/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-400/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-400/30",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-400/30",
    fuchsia: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300 border-fuchsia-400/30",
    slate: "from-slate-500/20 to-slate-500/5 text-slate-300 border-slate-400/20",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${bg[tint]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-100">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function EmptyRow({ label = "Nothing here yet." }) {
  return <div className="rounded-xl border border-dashed border-indigo-500/20 p-6 text-center text-xs text-slate-400">{label}</div>;
}

// -----------------------------------------------------------------------------
// Dashboard tab
// -----------------------------------------------------------------------------

function DashboardTab() {
  const fn = useServerFn(getDashboardMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["adminDashboardMetrics"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });

  if (isLoading || !data) return <Card><Loader2 className="h-4 w-4 animate-spin" /></Card>;
  const m = data.metrics;
  const daily = data.series.daily;
  const err = data.series.errorsPerMinute;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard icon={Users} label="Total Users" value={m.totalUsers} tint="indigo" />
        <StatCard icon={Activity} label="Online (5m)" value={m.onlineUsers} tint="emerald" />
        <StatCard icon={Folder} label="Projects" value={m.totalProjects} sub={`+${m.projectsToday} today`} />
        <StatCard icon={Sparkles} label="AI Reqs 24h" value={m.aiRequestsToday} tint="fuchsia" />
        <StatCard icon={Zap} label="Active Builds" value={m.activeBuilds} tint="amber" />
        <StatCard icon={Plug} label="Plugins Online" value={m.pluginConnections} tint="emerald" />
        <StatCard icon={Package} label="Scripts 24h" value={m.scriptsToday} />
        <StatCard icon={Sparkles} label="Images 24h" value={m.imagesToday} tint="fuchsia" />
        <StatCard icon={TrendingUp} label="Build Success" value={`${m.buildSuccessRate}%`} tint="emerald" />
        <StatCard icon={AlertOctagon} label="Errors 24h" value={m.errorsToday} tint="rose" />
        <StatCard icon={Bell} label="AI Queue" value={m.queueLength} tint="amber" />
        <StatCard icon={Server} label="API Health" value={m.apiHealth === "healthy" ? "OK" : "!"} tint={m.apiHealth === "healthy" ? "emerald" : "rose"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle icon={Activity} title="Activity — last 7 days" />
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gBuilds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3f" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0a0a1a", border: "1px solid #4f46e5", borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="ai" name="AI Requests" stroke="#6366f1" fill="url(#gAi)" strokeWidth={2} />
              <Area type="monotone" dataKey="builds" name="Studio Actions" stroke="#10b981" fill="url(#gBuilds)" strokeWidth={2} />
              <Area type="monotone" dataKey="errors" name="Errors" stroke="#f43f5e" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle icon={AlertOctagon} title="Errors per minute" tint="rose" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={err}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3f" />
              <XAxis dataKey="t" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip contentStyle={{ background: "#0a0a1a", border: "1px solid #f43f5e", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Users tab (kept from original with minor polish)
// -----------------------------------------------------------------------------

function UsersPanel({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllUsers);
  const giftFn = useServerFn(giftCredits);
  const banFn = useServerFn(setUserBanned);
  const roleFn = useServerFn(setUserRole);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "moderator" | "donator" | "banned">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["adminUsers", search],
    queryFn: () => listFn({ data: { search } }),
  });

  const users = useMemo(() => {
    const list = data?.users ?? [];
    if (filter === "all") return list;
    if (filter === "banned") return list.filter((u: any) => u.banned);
    return list.filter((u: any) => u.roles.includes(filter));
  }, [data, filter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminUsers"] });
  const gift = useMutation({
    mutationFn: (v: { userId: string; amount: number }) => giftFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Credits updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const setBan = useMutation({
    mutationFn: (v: { userId: string; banned: boolean; reason?: string }) => banFn({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Ban status updated"); },
  });
  const setRole = useMutation({
    mutationFn: (v: any) => roleFn({ data: v }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["adminOverview"] }); toast.success("Role updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={Users} title={`All users${data?.users ? ` · ${data.users.length}` : ""}`} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username…"
              className="w-56 rounded-lg border border-indigo-500/20 bg-white/[0.03] py-1.5 pl-7 pr-2 text-xs focus:border-indigo-400/60 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-indigo-500/20 bg-white/[0.02] p-1">
            {(["all", "admin", "moderator", "donator", "banned"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition ${
                  filter === f ? "bg-indigo-500/25 text-indigo-100" : "text-slate-400 hover:text-slate-200"
                }`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-indigo-500/15">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Credits</th>
                <th className="px-3 py-2 font-semibold">Roles</th>
                <th className="px-3 py-2 font-semibold">Joined</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">No users found.</td></tr>
              ) : users.map((u: any) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isOwner={isOwner}
                  busy={gift.isPending || setBan.isPending || setRole.isPending}
                  onGift={(amt: number) => gift.mutate({ userId: u.id, amount: amt })}
                  onBan={(banned: boolean, reason?: string) => setBan.mutate({ userId: u.id, banned, reason })}
                  onRole={(role: any, grant: boolean) => setRole.mutate({ userId: u.id, role, grant })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function UserRow({ user, isOwner, busy, onGift, onBan, onRole }: any) {
  const [giftAmt, setGiftAmt] = useState("100");
  const hasRole = (r: string) => user.roles.includes(r);
  const badge = (label: string, color: string) => (
    <span key={label} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color, borderColor: color }}>{label}</span>
  );
  return (
    <tr className="border-t border-indigo-500/10 hover:bg-white/[0.02]">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
            : <div className="grid h-7 w-7 place-items-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">{(user.display_name || user.username || "?").slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0">
            <div className="truncate font-semibold">{user.display_name || user.username}</div>
            <div className="truncate text-xs text-slate-400">@{user.username}</div>
          </div>
          {user.banned && <Ban className="h-3.5 w-3.5 text-rose-400" />}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">{user.email || "—"}</td>
      <td className="px-3 py-2 text-xs">{user.plan}</td>
      <td className="px-3 py-2 text-xs"><span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-400" />{user.credits}<span className="text-slate-500">/{user.max_credits}</span></span></td>
      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
        {hasRole("owner") && badge("owner", "#fbbf24")}
        {hasRole("admin") && badge("admin", "#818cf8")}
        {hasRole("moderator") && badge("mod", "#34d399")}
        {hasRole("donator") && badge("donator", "#f472b6")}
      </div></td>
      <td className="px-3 py-2 text-xs text-slate-400">{new Date(user.created_at).toLocaleDateString()}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1">
          <div className="flex items-center overflow-hidden rounded-md border border-indigo-500/20">
            <input value={giftAmt} onChange={(e) => setGiftAmt(e.target.value.replace(/[^\d-]/g, ""))} className="w-14 bg-transparent px-2 py-1 text-xs" />
            <button disabled={busy} onClick={() => { const n = parseInt(giftAmt, 10); if (Number.isFinite(n) && n !== 0) onGift(n); }}
              className="flex items-center gap-1 bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-200">
              <Gift className="h-3 w-3" /> Gift
            </button>
          </div>
          <RoleToggle label="Mod" icon={Star} active={hasRole("moderator")} onClick={() => onRole("moderator", !hasRole("moderator"))} busy={busy} color="#34d399" />
          <RoleToggle label="Donator" icon={Heart} active={hasRole("donator")} onClick={() => onRole("donator", !hasRole("donator"))} busy={busy} color="#f472b6" />
          {isOwner && <RoleToggle label="Admin" icon={ShieldAlert} active={hasRole("admin")} onClick={() => onRole("admin", !hasRole("admin"))} busy={busy} color="#818cf8" />}
          {user.banned ? (
            <button disabled={busy} onClick={() => onBan(false)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">
              <ShieldOff className="h-3 w-3" /> Unban
            </button>
          ) : (
            <button disabled={busy} onClick={() => { const r = prompt("Reason for ban?") ?? undefined; onBan(true, r); }} className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-300">
              <Ban className="h-3 w-3" /> Ban
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RoleToggle({ label, icon: Icon, active, onClick, busy, color }: any) {
  return (
    <button disabled={busy} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition"
      style={active ? { background: color, color: "#0a0a1a" } : { background: color + "22", color }}>
      <Icon className="h-3 w-3" /> {active ? `−${label}` : `+${label}`}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Projects tab
// -----------------------------------------------------------------------------

function ProjectsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllProjects);
  const delFn = useServerFn(deleteProjectAsAdmin);
  const renFn = useServerFn(renameProjectAsAdmin);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["adminProjects", search],
    queryFn: () => listFn({ data: { search } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminProjects"] });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { projectId: id } }),
    onSuccess: () => { invalidate(); toast.success("Project deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const ren = useMutation({
    mutationFn: (v: { id: string; name: string }) => renFn({ data: { projectId: v.id, name: v.name } }),
    onSuccess: () => { invalidate(); toast.success("Project renamed"); },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={Folder} title={`Projects${data?.projects ? ` · ${data.projects.length}` : ""}`} />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project name…"
            className="w-64 rounded-lg border border-indigo-500/20 bg-white/[0.03] py-1.5 pl-7 pr-2 text-xs focus:border-indigo-400/60 focus:outline-none" />
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-indigo-500/15">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Plugin</th>
                <th className="px-3 py-2">Builds</th>
                <th className="px-3 py-2">Last Modified</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-xs"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /></td></tr>
              ) : (data?.projects ?? []).length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-xs text-slate-400">No projects.</td></tr>
              ) : (data?.projects ?? []).map((p: any) => (
                <tr key={p.id} className="border-t border-indigo-500/10 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <Link to="/project/$projectId" params={{ projectId: p.id }} className="font-semibold text-indigo-200 hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-slate-500">{p.game_type ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{p.owner?.display_name ?? p.owner?.username ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{p.last_model_used ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.plugin_connected
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"><Check className="h-2.5 w-2.5" /> connected</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold text-slate-400"><X className="h-2.5 w-2.5" /> offline</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{p.build_count ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => {
                        const n = prompt("New project name", p.name);
                        if (n && n !== p.name) ren.mutate({ id: p.id, name: n });
                      }} className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-200">
                        <Pencil className="h-3 w-3" /> Rename
                      </button>
                      <button onClick={() => confirm(`Delete "${p.name}"? This cannot be undone.`) && del.mutate(p.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-300">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// AI tab
// -----------------------------------------------------------------------------

function AITab() {
  return (
    <>
      <Card>
        <SectionTitle icon={Bot} title="AI Model Catalog" tint="fuchsia" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODELS.map((m) => (
            <div key={m.id} className="rounded-xl border border-indigo-500/15 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-100">{m.label}</div>
                  <div className="text-[11px] text-slate-400">{m.provider} · via {m.via}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  m.status === "Working" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"
                }`}>{m.status}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-300">{m.tier}</span>
                <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-slate-300">{m.speed}</span>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">{m.credits}</span>
                <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-fuchsia-300">{m.quality}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-slate-400">{m.bestFor}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle icon={Zap} title="Live Model Testing" tint="amber" />
        <ModelTestPanel />
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Plugins tab
// -----------------------------------------------------------------------------

function PluginsTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listPluginSessions);
  const disFn = useServerFn(disconnectPluginSession);
  const { data, isLoading } = useQuery({
    queryKey: ["adminPluginSessions"], queryFn: () => fn(), refetchInterval: 10_000,
  });
  const dis = useMutation({
    mutationFn: (id: string) => disFn({ data: { sessionId: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminPluginSessions"] }); toast.success("Session disconnected"); },
  });

  return (
    <Card>
      <SectionTitle icon={Plug} title={`Plugin Sessions${data?.sessions ? ` · ${data.sessions.length}` : ""}`} tint="emerald" />
      <div className="overflow-hidden rounded-xl border border-indigo-500/15">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Studio</th>
                <th className="px-3 py-2">Plugin</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last Seen</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-6 text-center text-xs"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /></td></tr>
                : (data?.sessions ?? []).length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-xs text-slate-400">No sessions.</td></tr>
                : (data?.sessions ?? []).map((s: any) => {
                  const online = s.online && Date.now() - Date.parse(s.last_seen) < 5 * 60_000;
                  return (
                    <tr key={s.id} className="border-t border-indigo-500/10">
                      <td className="px-3 py-2 text-xs">{s.owner?.display_name ?? s.owner?.username ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{s.studio_version ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{s.plugin_version ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          online ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"
                        }`}>{online ? "online" : "offline"}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{s.last_seen ? new Date(s.last_seen).toLocaleTimeString() : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => dis.mutate(s.id)} className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-300">
                          <X className="h-3 w-3" /> Disconnect
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Errors tab
// -----------------------------------------------------------------------------

function ErrorsTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listStudioErrors);
  const del = useServerFn(deleteStudioError);
  const { data, isLoading } = useQuery({ queryKey: ["adminErrors"], queryFn: () => fn({ data: { limit: 200 } }) });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminErrors"] }); toast.success("Deleted"); },
  });

  return (
    <>
      <Card>
        <SectionTitle icon={AlertOctagon} title={`Studio errors${data?.studio ? ` · ${data.studio.length}` : ""}`} tint="rose" />
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
          (data?.studio ?? []).length === 0 ? <EmptyRow label="No studio errors 🎉" /> :
            <ul className="space-y-2">
              {(data?.studio ?? []).map((e: any) => (
                <li key={e.id} className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-semibold text-rose-300">{e.level ?? "error"}</span>
                      <span className="text-slate-400">{e.source ?? "studio"}</span>
                      <span className="text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-100">{e.message}</div>
                    {e.stack && <pre className="mt-1 max-h-24 overflow-auto rounded bg-black/40 p-2 text-[10px] text-slate-400">{e.stack}</pre>}
                  </div>
                  <button onClick={() => delM.mutate(e.id)} className="rounded-md bg-slate-500/20 p-1.5 text-slate-300 hover:bg-slate-500/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>}
      </Card>
      <Card>
        <SectionTitle icon={X} title={`Failed plugin actions${data?.failedActions ? ` · ${data.failedActions.length}` : ""}`} tint="rose" />
        {(data?.failedActions ?? []).length === 0 ? <EmptyRow label="No failed actions." /> :
          <ul className="space-y-2">
            {(data?.failedActions ?? []).map((a: any) => (
              <li key={a.id} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-100">{a.kind} · {a.name ?? "—"}</span>
                  <span className="text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-rose-300">{a.error}</div>
              </li>
            ))}
          </ul>}
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Prompt analytics tab
// -----------------------------------------------------------------------------

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#a855f7", "#06b6d4", "#f472b6", "#eab308"];

function PromptsTab() {
  const fn = useServerFn(getPromptAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["adminPrompts"], queryFn: () => fn() });
  if (isLoading || !data) return <Card><Loader2 className="h-4 w-4 animate-spin" /></Card>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={MessageSquare} label="Prompts 7d" value={data.total} />
        <StatCard icon={X} label="Failed" value={data.failed} tint="rose" />
        <StatCard icon={TrendingUp} label="Success Rate" value={`${data.successRate}%`} tint="emerald" />
        <StatCard icon={Sparkles} label="Avg Tokens" value={data.avgTokens} tint="fuchsia" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={TrendingUp} title="Top prompts (7d)" />
          {data.topPrompts.length === 0 ? <EmptyRow /> :
            <ul className="space-y-1.5 text-sm">
              {data.topPrompts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="min-w-0 truncate text-slate-200">{p.prompt}</span>
                  <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-200">{p.count}</span>
                </li>
              ))}
            </ul>}
        </Card>
        <Card>
          <SectionTitle icon={Bot} title="Model usage" tint="fuchsia" />
          {data.modelUsage.length === 0 ? <EmptyRow /> :
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.modelUsage} dataKey="count" nameKey="model" outerRadius={90} label={(e: any) => e.model?.split("/").pop()}>
                  {data.modelUsage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0a1a", border: "1px solid #4f46e5", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>}
        </Card>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Broadcasts tab
// -----------------------------------------------------------------------------

function BroadcastsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const createFn = useServerFn(createBroadcast);
  const toggleFn = useServerFn(setBroadcastActive);
  const { data, isLoading } = useQuery({ queryKey: ["adminBroadcasts"], queryFn: () => listFn() });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("info");
  const [hours, setHours] = useState("24");

  const create = useMutation({
    mutationFn: () => createFn({ data: { title, body, level, expiresInHours: parseInt(hours, 10) || 0 } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminBroadcasts"] }); setTitle(""); setBody(""); toast.success("Broadcast posted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminBroadcasts"] }),
  });

  return (
    <>
      <Card>
        <SectionTitle icon={Radio} title="New broadcast" tint="fuchsia" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-lg border border-indigo-500/20 bg-white/[0.03] px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="flex-1 rounded-lg border border-indigo-500/20 bg-[#12122a] px-3 py-2 text-sm text-slate-100 focus:border-indigo-400/60 focus:outline-none [&>option]:bg-[#12122a] [&>option]:text-slate-100">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} placeholder="Expires (h)" className="w-28 rounded-lg border border-indigo-500/20 bg-white/[0.03] px-3 py-2 text-sm" />
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body (optional)" rows={3} className="sm:col-span-2 rounded-lg border border-indigo-500/20 bg-white/[0.03] px-3 py-2 text-sm" />
        </div>
        <div className="mt-3 flex justify-end">
          <button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-500/25 px-4 py-2 text-sm font-bold text-fuchsia-100 hover:bg-fuchsia-500/35 disabled:opacity-50">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} Post
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Bell} title="Recent broadcasts" />
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
          (data?.broadcasts ?? []).length === 0 ? <EmptyRow /> :
            <ul className="space-y-2">
              {(data?.broadcasts ?? []).map((b: any) => (
                <li key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-indigo-500/15 bg-white/[0.03] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-semibold text-indigo-300">{b.level}</span>
                      <span className="text-slate-500">{new Date(b.created_at).toLocaleString()}</span>
                      {b.expires_at && <span className="text-slate-500">· expires {new Date(b.expires_at).toLocaleString()}</span>}
                    </div>
                    <div className="mt-1 font-semibold">{b.title}</div>
                    {b.body && <div className="text-sm text-slate-400">{b.body}</div>}
                  </div>
                  <button onClick={() => toggle.mutate({ id: b.id, active: !b.active })}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
                      b.active ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"
                    }`}>
                    {b.active ? <><Play className="h-3 w-3" /> Active</> : <><Pause className="h-3 w-3" /> Paused</>}
                  </button>
                </li>
              ))}
            </ul>}
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Audit logs tab
// -----------------------------------------------------------------------------

function AuditTab() {
  const fn = useServerFn(listAuditLogs);
  const { data, isLoading } = useQuery({ queryKey: ["adminAudit"], queryFn: () => fn({ data: { limit: 200 } }) });
  return (
    <Card>
      <SectionTitle icon={ScrollText} title={`Audit log${data?.logs ? ` · ${data.logs.length}` : ""}`} />
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
        (data?.logs ?? []).length === 0 ? <EmptyRow label="No actions logged yet." /> :
          <div className="overflow-hidden rounded-xl border border-indigo-500/15">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.logs ?? []).map((l: any) => (
                    <tr key={l.id} className="border-t border-indigo-500/10">
                      <td className="px-3 py-2 text-xs text-slate-400">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">{l.actor_email ?? l.actor_id?.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-semibold text-indigo-200">{l.action}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{l.target_type ?? "—"}:{(l.target_id ?? "—").slice(0, 8)}</td>
                      <td className="px-3 py-2 max-w-[280px]">
                        <pre className="max-h-16 overflow-auto text-[10px] text-slate-500">{JSON.stringify(l.new_value ?? l.previous_value ?? l.metadata ?? {}, null, 0)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Global settings tab
// -----------------------------------------------------------------------------

function SettingsTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getGlobalSettings);
  const setFn = useServerFn(updateGlobalSetting);
  const { data, isLoading } = useQuery({ queryKey: ["adminSettings"], queryFn: () => getFn() });
  const upd = useMutation({
    mutationFn: (v: { key: string; value: any }) => setFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminSettings"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading || !data) return <Card><Loader2 className="h-4 w-4 animate-spin" /></Card>;
  const s = data.settings;

  return (
    <>
      <Card>
        <SectionTitle icon={Settings} title="Maintenance Mode" tint="amber" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm">When enabled, visitors see a maintenance page. Admins &amp; owners still have full access.</div>
              <div className="text-xs text-slate-500">Current: {s.maintenance?.enabled ? "ENABLED" : "off"}</div>
            </div>
            <button
              onClick={() => upd.mutate({ key: "maintenance", value: { ...s.maintenance, enabled: !s.maintenance?.enabled } })}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold ${
                s.maintenance?.enabled ? "bg-rose-500/25 text-rose-200" : "bg-emerald-500/25 text-emerald-200"
              }`}
            >
              {s.maintenance?.enabled ? "Turn OFF" : "Turn ON"}
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Custom message (optional)
            </label>
            <textarea
              key={s.maintenance?.message ?? ""}
              defaultValue={s.maintenance?.message ?? ""}
              placeholder="We'll be back online shortly — thanks for your patience!"
              rows={2}
              className="w-full rounded-lg border border-indigo-500/20 bg-[#12122a] px-3 py-2 text-sm text-slate-100 focus:border-indigo-400/60 focus:outline-none"
              onBlur={(e) => {
                const next = e.target.value;
                if ((s.maintenance?.message ?? "") !== next) {
                  upd.mutate({ key: "maintenance", value: { ...s.maintenance, message: next } });
                }
              }}
            />
            <div className="mt-1 text-[11px] text-slate-500">Auto-saves when you click out of the box.</div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={UserPlus} title="Registration" tint="emerald" />
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">New account signups are currently <b>{s.registration?.open ? "OPEN" : "CLOSED"}</b>.</div>
          <button onClick={() => upd.mutate({ key: "registration", value: { open: !s.registration?.open } })}
            className="rounded-lg bg-indigo-500/25 px-3 py-2 text-sm font-bold text-indigo-100">
            {s.registration?.open ? "Close" : "Open"}
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Sparkles} title="Feature Flags" tint="fuchsia" />
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(s.features ?? {}).map(([k, v]) => (
            <button key={k} onClick={() => upd.mutate({ key: "features", value: { ...s.features, [k]: !v } })}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                v ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-slate-500/30 bg-slate-500/10 text-slate-400"
              }`}>
              {v ? "✓" : "○"} {k}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Bot} title="Default AI Model" />
        <select value={s.default_model?.id ?? ""} onChange={(e) => upd.mutate({ key: "default_model", value: { id: e.target.value } })}
          className="w-full rounded-lg border border-indigo-500/20 bg-[#12122a] px-3 py-2 text-sm text-slate-100 focus:border-indigo-400/60 focus:outline-none [&>option]:bg-[#12122a] [&>option]:text-slate-100">
          {MODELS.filter((m) => m.status === "Working").map((m) => (
            <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>
          ))}
        </select>
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Donations (kept from original)
// -----------------------------------------------------------------------------

function DonationClaimsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingDonationClaims);
  const decideFn = useServerFn(decideDonationClaim);
  const { data, isLoading, error } = useQuery({ queryKey: ["pendingDonationClaims"], queryFn: () => listFn(), retry: false });
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (args: { id: string; approve: boolean }) => decideFn({ data: { id: args.id, approve: args.approve, note: noteById[args.id] || "" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pendingDonationClaims"] }),
  });
  const claims = data?.claims ?? [];

  return (
    <Card>
      <SectionTitle icon={Heart} title={`Donation claims${claims.length ? ` · ${claims.length}` : ""}`} tint="fuchsia" />
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
        error ? <div className="text-xs text-rose-300">{(error as Error).message}</div> :
          claims.length === 0 ? <EmptyRow label="No donation claims yet." /> :
            <ul className="space-y-3">
              {claims.map((c: any) => (
                <li key={c.id} className="rounded-xl border border-indigo-500/15 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{c.profile?.display_name || c.profile?.username || c.user_id}</div>
                      <div className="font-mono text-xs text-slate-400">{c.paypal_reference}</div>
                    </div>
                    <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">{c.status}</span>
                  </div>
                  {c.status === "pending" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input placeholder="Optional note…" value={noteById[c.id] ?? ""} onChange={(e) => setNoteById((s) => ({ ...s, [c.id]: e.target.value }))}
                        className="flex-1 rounded-md border border-indigo-500/20 bg-white/[0.03] px-2 py-1 text-xs" />
                      <button onClick={() => decide.mutate({ id: c.id, approve: true })} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button onClick={() => decide.mutate({ id: c.id, approve: false })} className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-300">
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Owner-only tools
// -----------------------------------------------------------------------------

function OwnerToolsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllUsers);
  const infFn = useServerFn(grantUnlimitedCredits);
  const resetFn = useServerFn(resetActionQueue);
  const { data } = useQuery({ queryKey: ["adminUsers", ""], queryFn: () => listFn({ data: { search: "" } }) });
  const [selUser, setSelUser] = useState("");

  const grant = useMutation({
    mutationFn: () => infFn({ data: { userId: selUser } }),
    onSuccess: () => { toast.success("Unlimited credits granted"); qc.invalidateQueries({ queryKey: ["adminUsers"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const reset = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (r: any) => toast.success(`Cleared ${r?.cleared ?? 0} pending actions`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <>
      <Card>
        <SectionTitle icon={InfIcon} title="Grant Unlimited Credits" tint="amber" />
        <div className="flex flex-wrap items-center gap-2">
          <select value={selUser} onChange={(e) => setSelUser(e.target.value)} className="flex-1 rounded-lg border border-indigo-500/20 bg-[#12122a] px-3 py-2 text-sm text-slate-100 focus:border-indigo-400/60 focus:outline-none [&>option]:bg-[#12122a] [&>option]:text-slate-100">
            <option value="">Choose user…</option>
            {(data?.users ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
            ))}
          </select>
          <button disabled={!selUser || grant.isPending} onClick={() => grant.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500/25 px-4 py-2 text-sm font-bold text-amber-100 disabled:opacity-50">
            <Crown className="h-4 w-4" /> Grant 1M
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={RefreshCw} title="Reset AI Action Queue" tint="rose" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-400">Cancels all pending plugin actions. Use if the queue is stuck.</p>
          <button onClick={() => confirm("Cancel every pending plugin action?") && reset.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500/25 px-4 py-2 text-sm font-bold text-rose-100">
            <RefreshCw className="h-4 w-4" /> Reset Queue
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={ShieldAlert} title="Danger Zone" tint="rose" />
        <p className="text-xs text-slate-400">Additional owner-only tools (impersonate, backup/restore, force plugin update) will be enabled per-request. Every action here is written to the audit log.</p>
      </Card>
    </>
  );
}
