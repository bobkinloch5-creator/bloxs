import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { getAdminOverview, listAllUsers, giftCredits, setUserBanned, setUserRole } from "@/lib/admin.functions";
import { listPendingDonationClaims, decideDonationClaim } from "@/lib/donations.functions";
import { ModelTestPanel } from "@/components/ModelTestPanel";
import {
  Crown, ShieldCheck, Folder, MessageSquare, Plug, Settings, Sparkles, Loader2, AlertTriangle, Heart,
  Check, X, Users, UserPlus, Ban, ShieldOff, Gift, Search, Coins, ShieldAlert, Star,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — BloxSmith" }] }),
  component: AdminPage,
});

function AdminPage() {
  const overviewFn = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["adminOverview"], queryFn: () => overviewFn(), retry: false });

  if (isLoading) {
    return (
      <div className="bloxchat-dark grid min-h-screen place-items-center" style={{ color: "var(--bs-fg)" }}>
        <div className="bs-card flex items-center gap-2 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--bs-primary)" }} /> Checking admin access…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bloxchat-dark grid min-h-screen place-items-center px-4" style={{ color: "var(--bs-fg)" }}>
        <div className="bs-card max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8" style={{ color: "var(--bs-warning)" }} />
          <h1 className="mt-3 text-xl font-extrabold">Admin panel unavailable</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--bs-muted-fg)" }}>This area is restricted to admins and the owner.</p>
          <Link to="/dashboard" className="bs-quick mt-5 justify-center">Back to Projects</Link>
        </div>
      </div>
    );
  }

  const name = data.profile?.display_name || data.profile?.username || "Admin";
  const isOwner = data.roles.includes("owner");

  return (
    <div className="bloxchat-dark min-h-screen" style={{ color: "var(--bs-fg)" }}>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Hero */}
        <section className="bs-card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 -z-10 opacity-70" style={{ background: "radial-gradient(900px 320px at 0% 0%, color-mix(in oklab, var(--bs-primary) 28%, transparent), transparent 60%), radial-gradient(700px 260px at 100% 100%, color-mix(in oklab, var(--bs-warning) 18%, transparent), transparent 60%)" }} />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="bs-chip mb-3" style={{ color: "var(--bs-primary)", background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)" }}>
                {isOwner ? <><Crown className="h-3.5 w-3.5" /> Owner Admin</> : <><ShieldCheck className="h-3.5 w-3.5" /> Admin</>}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome back, {name}</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--bs-muted-fg)" }}>Manage users, credits, roles, and donations from one place.</p>
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

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStat icon={Users} label="Total signups" value={data.stats.totalUsers} accent="primary" />
          <AdminStat icon={UserPlus} label="New (24h)" value={data.stats.newUsers24h} accent="success" />
          <AdminStat icon={Sparkles} label="New (7d)" value={data.stats.newUsers7d} accent="primary" />
          <AdminStat icon={Heart} label="Donators" value={data.stats.donators} accent="warning" />
          <AdminStat icon={Folder} label="Projects" value={data.stats.projects} />
          <AdminStat icon={MessageSquare} label="AI messages" value={data.stats.messages} />
          <AdminStat icon={Plug} label="Pending plugin" value={data.stats.pendingActions} />
          <AdminStat icon={Ban} label="Banned" value={data.stats.bannedUsers} accent="danger" />
        </section>

        {/* Shortcuts */}
        <section className="bs-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Shortcuts</span>
            <Link to="/dashboard" className="bs-quick"><Folder className="h-3.5 w-3.5" /> Projects</Link>
            <Link to="/plugin" className="bs-quick"><Plug className="h-3.5 w-3.5" /> Plugin</Link>
            <Link to="/settings" className="bs-quick"><Settings className="h-3.5 w-3.5" /> Settings</Link>
          </div>
        </section>

        <UsersPanel isOwner={isOwner} />
        <DonationClaimsPanel />
        <ModelTestPanel />
      </main>
    </div>
  );
}

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

  const gift = useMutation({ mutationFn: (v: { userId: string; amount: number }) => giftFn({ data: v }), onSuccess: invalidate });
  const setBan = useMutation({ mutationFn: (v: { userId: string; banned: boolean; reason?: string }) => banFn({ data: v }), onSuccess: invalidate });
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: any; grant: boolean }) => roleFn({ data: v }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["adminOverview"] }); },
  });

  return (
    <section className="bs-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> All users
          {data?.users && <span className="bs-chip" style={{ color: "var(--bs-muted-fg)" }}>{data.users.length}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--bs-muted-fg)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or name…"
              className="w-56 rounded-lg border py-1.5 pl-7 pr-2 text-xs"
              style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
            />
          </div>
          <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}>
            {(["all", "admin", "moderator", "donator", "banned"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition"
                style={filter === f
                  ? { background: "var(--bs-primary-soft)", color: "var(--bs-primary)" }
                  : { color: "var(--bs-muted-fg)" }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--bs-border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Credits</th>
                <th className="px-3 py-2 font-semibold">Roles</th>
                <th className="px-3 py-2 font-semibold">Joined</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs" style={{ color: "var(--bs-muted-fg)" }}>No users found.</td></tr>
              ) : users.map((u: any) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isOwner={isOwner}
                  busy={gift.isPending || setBan.isPending || setRole.isPending}
                  onGift={(amt) => gift.mutate({ userId: u.id, amount: amt })}
                  onBan={(banned, reason) => setBan.mutate({ userId: u.id, banned, reason })}
                  onRole={(role, grant) => setRole.mutate({ userId: u.id, role, grant })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UserRow({ user, isOwner, busy, onGift, onBan, onRole }: {
  user: any; isOwner: boolean; busy: boolean;
  onGift: (amt: number) => void;
  onBan: (banned: boolean, reason?: string) => void;
  onRole: (role: "admin" | "moderator" | "donator", grant: boolean) => void;
}) {
  const [giftAmt, setGiftAmt] = useState("100");
  const hasRole = (r: string) => user.roles.includes(r);

  const roleBadge = (label: string, color: string) => (
    <span key={label} className="bs-chip" style={{ color, borderColor: color, background: "transparent" }}>{label}</span>
  );

  return (
    <tr className="border-t" style={{ borderColor: "var(--bs-border)" }}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
            : <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--bs-primary-soft)", color: "var(--bs-primary)" }}>{(user.display_name || user.username || "?").slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0">
            <div className="truncate font-semibold">{user.display_name || user.username}</div>
            <div className="truncate text-xs" style={{ color: "var(--bs-muted-fg)" }}>@{user.username}</div>
          </div>
          {user.banned && <Ban className="h-3.5 w-3.5" style={{ color: "var(--bs-danger)" }} />}
        </div>
      </td>
      <td className="px-3 py-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{user.email || "—"}</td>
      <td className="px-3 py-2 text-xs">{user.plan}</td>
      <td className="px-3 py-2 text-xs"><span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" style={{ color: "var(--bs-warning)" }} />{user.credits}<span style={{ color: "var(--bs-muted-fg)" }}>/{user.max_credits}</span></span></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {hasRole("owner") && roleBadge("owner", "var(--bs-warning)")}
          {hasRole("admin") && roleBadge("admin", "var(--bs-primary)")}
          {hasRole("moderator") && roleBadge("mod", "var(--bs-success)")}
          {hasRole("donator") && roleBadge("donator", "var(--bs-warning)")}
          {user.roles.length === 0 && <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>—</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{new Date(user.created_at).toLocaleDateString()}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1">
          <div className="flex items-center overflow-hidden rounded-md border" style={{ borderColor: "var(--bs-border)" }}>
            <input
              value={giftAmt}
              onChange={(e) => setGiftAmt(e.target.value.replace(/[^\d-]/g, ""))}
              className="w-14 bg-transparent px-2 py-1 text-xs"
              aria-label="Credits to gift"
            />
            <button
              disabled={busy}
              onClick={() => { const n = parseInt(giftAmt, 10); if (Number.isFinite(n) && n !== 0) onGift(n); }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold"
              style={{ background: "var(--bs-primary-soft)", color: "var(--bs-primary)" }}
              title="Gift credits (use negative to remove)"
            >
              <Gift className="h-3 w-3" /> Gift
            </button>
          </div>

          <RoleToggle label="Mod" icon={Star} active={hasRole("moderator")} onClick={() => onRole("moderator", !hasRole("moderator"))} busy={busy} color="var(--bs-success)" />
          <RoleToggle label="Donator" icon={Heart} active={hasRole("donator")} onClick={() => onRole("donator", !hasRole("donator"))} busy={busy} color="var(--bs-warning)" />
          {isOwner && (
            <RoleToggle label="Admin" icon={ShieldAlert} active={hasRole("admin")} onClick={() => onRole("admin", !hasRole("admin"))} busy={busy} color="var(--bs-primary)" />
          )}

          {user.banned ? (
            <button disabled={busy} onClick={() => onBan(false)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold" style={{ background: "color-mix(in oklab, var(--bs-success) 15%, transparent)", color: "var(--bs-success)" }}>
              <ShieldOff className="h-3 w-3" /> Unban
            </button>
          ) : (
            <button disabled={busy} onClick={() => { const r = prompt("Reason for ban?") ?? undefined; onBan(true, r); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold" style={{ background: "color-mix(in oklab, var(--bs-danger) 15%, transparent)", color: "var(--bs-danger)" }}>
              <Ban className="h-3 w-3" /> Ban
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RoleToggle({ label, icon: Icon, active, onClick, busy, color }: { label: string; icon: any; active: boolean; onClick: () => void; busy: boolean; color: string }) {
  return (
    <button disabled={busy} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition"
      style={active
        ? { background: color, color: "white" }
        : { background: "color-mix(in oklab, " + color + " 12%, transparent)", color }}>
      <Icon className="h-3 w-3" /> {active ? `−${label}` : `+${label}`}
    </button>
  );
}

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
  const pending = claims.filter((c: any) => c.status === "pending");

  return (
    <section className="bs-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Heart className="h-4 w-4" style={{ color: "var(--bs-warning)" }} /> Donation claims {pending.length > 0 && <span className="bs-chip" style={{ color: "var(--bs-warning)" }}>{pending.length} pending</span>}</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--bs-muted-fg)" }}>Approve to grant the user the <strong>Donator</strong> role.</p>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
      ) : error ? (
        <div className="mt-4 text-xs text-red-300">{(error as Error).message}</div>
      ) : claims.length === 0 ? (
        <div className="mt-4 text-xs" style={{ color: "var(--bs-muted-fg)" }}>No donation claims yet.</div>
      ) : (
        <ul className="mt-4 space-y-3">
          {claims.map((c: any) => (
            <li key={c.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{c.profile?.display_name || c.profile?.username || c.user_id}</div>
                  <div className="font-mono text-xs" style={{ color: "var(--bs-muted-fg)" }}>{c.paypal_reference}</div>
                  {c.amount_note && <div className="mt-1 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{c.amount_note}</div>}
                </div>
                <span className="bs-chip" style={{ color: c.status === "approved" ? "var(--bs-success)" : c.status === "rejected" ? "var(--bs-danger)" : "var(--bs-warning)" }}>{c.status}</span>
              </div>
              {c.status === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    placeholder="Optional admin note"
                    value={noteById[c.id] ?? ""}
                    onChange={(e) => setNoteById((m) => ({ ...m, [c.id]: e.target.value }))}
                    className="min-w-[180px] flex-1 rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
                  />
                  <button onClick={() => decide.mutate({ id: c.id, approve: true })} disabled={decide.isPending} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-60">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => decide.mutate({ id: c.id, approve: false })} disabled={decide.isPending} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-60">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminStat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: "primary" | "success" | "warning" | "danger" }) {
  const color = accent ? `var(--bs-${accent})` : "var(--bs-fg)";
  return (
    <div className="bs-card p-4">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
        {label}<Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-2 text-3xl font-extrabold" style={{ color }}>{value.toLocaleString()}</div>
    </div>
  );
}
