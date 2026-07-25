import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, createProject } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getPluginSession } from "@/lib/chat.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Loader2, Sparkles, Home as HomeIcon, Folder,
  Box, Plug, Users, Settings as SettingsIcon,
  Infinity as InfinityIcon, ChevronDown, Paperclip, Image as ImageIcon,
  Send, Hammer, TrendingUp, Wrench, Gamepad2, Upload, CheckCircle2,
  Code2, Package, Crown, ExternalLink, MoreHorizontal, ArrowRight,
  Radio, HelpCircle, LayoutDashboard, Server, Gift,
} from "lucide-react";
import thumbTycoon from "@/assets/thumbs/tycoon.jpg";
import thumbObby from "@/assets/thumbs/obby.jpg";
import thumbSimulator from "@/assets/thumbs/simulator.jpg";
import thumbRpg from "@/assets/thumbs/rpg.jpg";
import thumbHorror from "@/assets/thumbs/horror.jpg";
import thumbCustom from "@/assets/thumbs/custom.jpg";
import { WelcomeFlow } from "@/components/WelcomeFlow";
import { MobileNavTrigger } from "@/components/MobileNav";
import { BottomNav } from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ChangelogNotifications } from "@/components/ChangelogNotifications";
import { ProjectMenu } from "@/components/ProjectMenu";
import { WorkspaceChat } from "@/components/WorkspaceChat";
import { NewProjectModal } from "@/components/NewProjectModal";
import { Reveal, GlowCard, CountUp } from "@/components/Reveal";
import { ProjectMemoryCard } from "@/components/ProjectMemoryCard";
import { OnboardingChallenges } from "@/components/OnboardingChallenges";
import { AiPlaytestCard } from "@/components/AiPlaytestCard";
import { LivePlaytestCard } from "@/components/LivePlaytestCard";
import robloxBg from "@/assets/backgrounds/roblox-dashboard.jpg";
import bloxsmithLogo from "@/assets/bloxsmith-logo.png.asset.json";


const THUMBS: Record<string, string> = {
  tycoon: thumbTycoon, obby: thumbObby, simulator: thumbSimulator,
  rpg: thumbRpg, horror: thumbHorror, custom: thumbCustom,
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Roblox Projects — BloxSmith" },
      { name: "description", content: "Describe a Roblox game and BloxSmith's AI agents plan, build, test, and ship it into Studio for you." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Dashboard,
});

type NavItem = { key: string; label: string; icon: typeof Box; to: string; exact?: boolean };
const NAV: NavItem[] = [
  { key: "home",     label: "Home",          icon: HomeIcon,        to: "/dashboard", exact: true },
  { key: "projects", label: "Projects",      icon: Folder,          to: "/projects" },
  { key: "models",   label: "3D Models",     icon: Box,             to: "/models" },
  { key: "ui",       label: "UI Generator",  icon: LayoutDashboard, to: "/ui-generator" },
  { key: "plugin",   label: "Studio Plugin", icon: Plug,            to: "/plugin" },
  { key: "mcp",      label: "MCP Servers",   icon: Server,          to: "/mcp-servers" },
  { key: "community",label: "Community",     icon: Users,           to: "/collaborators" },
  { key: "referrals",label: "Invite Friends",icon: Gift,            to: "/referrals" },
];

const QUICK_ACTIONS: { key: string; label: string; desc: string; icon: typeof Box; to: string }[] = [
  { key: "build",   label: "Build",        desc: "Create or expand your game",     icon: Hammer,          to: "/dashboard" },
  { key: "improve", label: "Improve",      desc: "Enhance your game with AI",      icon: TrendingUp,      to: "/dashboard" },
  { key: "fix",     label: "Fix Errors",   desc: "Scan and fix issues",            icon: Wrench,          to: "/dashboard" },
  { key: "ui",      label: "UI Generator", desc: "Design menus, HUD, and shop UI", icon: LayoutDashboard, to: "/ui-generator" },
  { key: "models",  label: "3D Models",    desc: "Browse and insert 3D assets",    icon: Box,             to: "/models" },
  { key: "test",    label: "Test Game",    desc: "Playtest and get feedback",      icon: Gamepad2,        to: "/plugin" },
  { key: "publish", label: "Publish",      desc: "Prepare and publish your game",  icon: Upload,          to: "/plugin" },
];

function timeAgo(d: string | Date): string {
  const t = new Date(d).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

function Dashboard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const profFn = useServerFn(getMyProfile);
  const sessFn = useServerFn(getPluginSession);

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn(), refetchInterval: 30_000 });
  const { data: pluginSession } = useQuery({ queryKey: ["pluginSession"], queryFn: () => sessFn(), refetchInterval: 6000 });

  const isAdmin = !!profile?.is_admin;
  const isOwner = profile?.plan === "Owner" || isAdmin;
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 90_000));

  const displayName = profile?.display_name || profile?.username || "Builder";
  const shortName = displayName.split(/[\s_@]/)[0];

  // Active project: read once on mount, keep in state so composer & UI react to changes.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem("bs:activeProjectId"); } catch { return null; }
  });
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // If localStorage's active id no longer exists, clear it once projects load.
  // Also auto-select the most recent project when none is active so clicking
  // Build doesn't force the user through the "Create a project" modal every
  // time — an existing project is almost always what they want to continue.
  useEffect(() => {
    if (isLoading) return;
    if (activeProjectId && !projects.find((p: any) => p.id === activeProjectId)) {
      try { localStorage.removeItem("bs:activeProjectId"); } catch {}
      setActiveProjectId(null);
      return;
    }
    if (!activeProjectId && projects.length > 0) {
      const sorted = [...projects].sort((a: any, b: any) => {
        const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return bt - at;
      });
      const pick = sorted[0]?.id;
      if (pick) {
        try { localStorage.setItem("bs:activeProjectId", pick); } catch {}
        setActiveProjectId(pick);
      }
    }
  }, [activeProjectId, projects, isLoading]);

  // React to activeProjectId changes made elsewhere (Projects page, ProjectMenu, other tabs).
  useEffect(() => {
    function sync() {
      try {
        const id = localStorage.getItem("bs:activeProjectId");
        setActiveProjectId((prev) => (prev === id ? prev : id));
      } catch {}
    }
    window.addEventListener("storage", sync);
    window.addEventListener("bs:active-project-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("bs:active-project-changed", sync);
    };
  }, []);

  function openProject(id: string) {
    try { localStorage.setItem("bs:activeProjectId", id); } catch {}
    setActiveProjectId(id);
    try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
    // Scroll the workspace composer into view so it's obvious the project is open.
    setTimeout(() => {
      document.getElementById("build")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  }

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((p: any) => p.id === activeProjectId) : null),
    [activeProjectId, projects]
  );


  const createMut = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      createFn({ data: { name: payload.name, description: payload.description, game_type: "custom" } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      try { localStorage.setItem("bs:activeProjectId", p.id); } catch {}
      setActiveProjectId(p.id);
      import("sonner").then(({ toast }) => toast.success(`Created "${p.name}"`));
    },
    onError: (err) => {
      import("sonner").then(({ toast }) => toast.error(err instanceof Error ? err.message : "Failed to create project"));
    },
  });

  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 3),
    [projects]
  );

  // Recent activity synthesized from projects (real signal, not placeholder)
  const activity = useMemo(() => {
    const items: { icon: typeof Box; title: string; sub: string; ts: string; tint: string }[] = [];
    for (const p of recentProjects) {
      if ((p.build_count ?? 0) > 0) {
        items.push({ icon: CheckCircle2, title: "Build completed", sub: p.name, ts: p.updated_at as any, tint: "text-emerald-400 bg-emerald-500/10" });
      } else {
        items.push({ icon: Code2, title: "Project created", sub: p.name, ts: p.created_at as any, tint: "text-indigo-300 bg-indigo-500/10" });
      }
    }
    if (pluginOnline) items.unshift({ icon: Plug, title: "Studio plugin connected", sub: "Live session", ts: pluginSession?.last_seen ?? new Date().toISOString(), tint: "text-cyan-300 bg-cyan-500/10" });
    return items.slice(0, 4);
  }, [recentProjects, pluginOnline, pluginSession]);

  return (
    <div className="relative min-h-screen w-full bg-[#0a0a1a] text-slate-100" style={{ fontFamily: "Rubik, ui-sans-serif, system-ui" }}>
      {/* Roblox-style ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <img
          src={robloxBg}
          alt=""
          className="h-full w-full object-cover opacity-[0.28] blur-[2px]"
          width={1920}
          height={1280}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(217,70,239,0.14),transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a1a]/85 via-[#0a0a1a]/80 to-[#0a0a1a]/95" />
      </div>
      <div className="relative z-10">
      <WelcomeFlow />
      <div className="flex">
        <Sidebar isOwner={isOwner} isAdmin={isAdmin} profile={profile} credits={credits} maxCredits={maxCredits} />

        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-[#0a0a1a]/85 px-3 py-3 backdrop-blur sm:px-8 sm:py-4">
            <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-[28px]">
                Welcome back, <span className="text-white">{shortName}</span> <span aria-hidden>👋</span>
              </h1>
              <p className="mt-0.5 hidden text-sm text-slate-400 sm:block">What do you want to build today?</p>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${pluginOnline ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-white/10 bg-white/[0.02] text-slate-400"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${pluginOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-slate-500"}`} />
                Studio: {pluginOnline ? "Connected" : "Offline"}
              </div>
              <Link to="/plugin" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05]">
                <ExternalLink className="h-3.5 w-3.5" /> Send to Studio
              </Link>
              <ChangelogNotifications buttonClassName="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]" iconClassName="h-3.5 w-3.5" />
              <button
                type="button"
                disabled={createMut.isPending}
                onClick={() => setNewProjectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.7)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" /> New Project
              </button>
            </div>
            <ProfileMenu />
          </header>

          <main className="mx-auto w-full max-w-[1240px] space-y-6 px-3 pb-28 pt-5 sm:space-y-8 sm:px-8 sm:pb-8 sm:pt-8">
            {/* Active project banner — always visible when a project is open */}
            {activeProject && (
              <section className="rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/15 via-white/[0.03] to-fuchsia-500/10 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    <img
                      src={activeProject.thumbnail_url ?? THUMBS[activeProject.game_type ?? "custom"] ?? THUMBS.custom}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">📁 Active Project</div>
                    <div className="mt-0.5 flex items-center gap-2 truncate text-lg font-bold text-white">
                      {activeProject.pinned_at && <span title="Pinned">📌</span>}
                      {activeProject.is_favorite && <span title="Favorite" className="text-amber-300">★</span>}
                      <span className="truncate">{activeProject.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span className="uppercase tracking-widest">{activeProject.game_type ?? "custom"}</span>
                      <span>•</span>
                      <span>{activeProject.build_count ?? 0} builds</span>
                      <span>•</span>
                      <span>Updated {timeAgo(activeProject.updated_at)}</span>
                      <span>•</span>
                      <span className="text-emerald-300">Chat, builds & assets restored</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try { localStorage.removeItem("bs:activeProjectId"); } catch {}
                        setActiveProjectId(null);
                        try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
                      }}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]"
                    >
                      Switch project
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Composer — real AI Build flow */}
            <section id="build">
              <WorkspaceChat
                activeProjectId={activeProjectId}
                onProjectCreated={(id) => setActiveProjectId(id)}
                onRequestNewProject={() => setNewProjectOpen(true)}
                onSelectProject={(id) => openProject(id)}
              />

            </section>

            {/* Persistent project memory — everything the AI remembers about this project */}
            {activeProjectId && (
              <section id="memory">
                <ProjectMemoryCard projectId={activeProjectId} />
              </section>
            )}

            {/* AI Playtest — the AI reads your scripts and reports back what it sees */}
            <section id="ai-playtest" className="space-y-4">
              <AiPlaytestCard projectId={activeProjectId} projectName={activeProject?.name} />
              <LivePlaytestCard />
            </section>

            {/* Invite friends prompt — visible on every dashboard load */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/5 to-indigo-500/10 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/20 text-indigo-200">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-white">Invite friends to BloxSmith</div>
                  <div className="text-xs text-slate-400">Share your code — get shouted out on the community leaderboard.</div>
                </div>
              </div>
              <Link
                to="/referrals"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-400"
              >
                <Gift className="h-3.5 w-3.5" /> Get your invite link
              </Link>
            </section>




            {/* Quick Actions */}
            <section>
              <SectionHead title="Quick Actions" to="/models" />
              <Reveal stagger className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {QUICK_ACTIONS.map((a) => (
                  <Link
                    key={a.key}
                    to={a.to as any}
                    className="group spotlight hover-lift flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-4 hover:border-indigo-400/30 hover:bg-white/[0.04]"
                  >
                    <span className="icon-pop grid h-9 w-9 place-items-center rounded-xl bg-indigo-500/10 text-indigo-300 transition-colors group-hover:bg-indigo-500/20">
                      <a.icon className="h-4 w-4" />
                    </span>
                    <div className="mt-3 text-sm font-bold text-slate-100">{a.label}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{a.desc}</div>
                  </Link>
                ))}
              </Reveal>
            </section>



            {/* Recent Projects + Activity */}
            <section className="grid gap-6 lg:grid-cols-2">
              {/* Recent Projects */}
              <div>
                <SectionHead title="Recent Projects" to="/projects" />
                <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2">
                  {isLoading ? (
                    <div className="space-y-2 p-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="skeleton h-11 w-11 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="skeleton h-3.5 w-1/2" />
                            <div className="skeleton h-3 w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentProjects.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400">
                      No projects yet. Describe a game above to create your first one.
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {recentProjects.map((p) => (
                        <li key={p.id} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.03]">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">
                            <img
                              src={p.thumbnail_url ?? THUMBS[p.game_type ?? "custom"] ?? THUMBS.custom}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-100">
                              {p.pinned_at && <span title="Pinned">📌</span>}
                              {p.is_favorite && <span title="Favorite" className="text-amber-300">★</span>}
                              <span className="truncate">{p.name}</span>
                            </div>
                            <div className="truncate text-[11px] text-slate-500">Updated {timeAgo(p.updated_at)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openProject(p.id)}
                            className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                          >
                            {activeProjectId === p.id ? "Active" : "Open"}
                          </button>
                          <ProjectMenu project={p} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Activity */}
              <div>
                <SectionHead title="Recent Activity" to="/history" />
                <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2">
                  {activity.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400">Activity will appear as you build.</div>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {activity.map((a, i) => {
                        const Icon = a.icon;
                        return (
                          <li key={i} className="flex items-center gap-3 p-3">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.tint}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-100">{a.title}</div>
                              <div className="truncate text-[11px] text-slate-500">{a.sub}</div>
                            </div>
                            <div className="shrink-0 text-[11px] text-slate-500">{timeAgo(a.ts)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Onboarding challenges */}
            <OnboardingChallenges
              projectCount={projects.length}
              hasPluginSession={pluginOnline}
              hasBuild={projects.some((p: any) => (p.build_count ?? 0) > 0)}
            />

            {/* Inspiration banner */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-gradient-to-r from-indigo-500/10 via-white/[0.02] to-fuchsia-500/10 p-5">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500/25 text-indigo-200">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-slate-100">Need inspiration?</div>
                  <div className="text-xs text-slate-400">Browse 3D models or explore the community.</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/models" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]">
                  <Box className="h-3.5 w-3.5" /> Explore 3D Models
                </Link>
                <Link to="/collaborators" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]">
                  <Users className="h-3.5 w-3.5" /> Browse Community
                </Link>
              </div>
            </section>
          </main>
        </div>
      </div>
      <BottomNav isAdmin={isAdmin} />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["projects"] });
          setActiveProjectId(id);
          const inp = document.getElementById("home-composer") as HTMLTextAreaElement | null;
          if (inp) setTimeout(() => inp.focus(), 100);
        }}
      />
      </div>
    </div>
  );
}

function SectionHead({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200">
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function ChipButton({ icon: Icon, label }: { icon: typeof Box; label: string }) {
  return (
    <button className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-slate-300 transition active:bg-white/10 hover:bg-white/[0.05]">
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Sidebar({ isOwner, isAdmin, profile, credits, maxCredits }: {
  isOwner: boolean; isAdmin: boolean; profile: any; credits: number; maxCredits: number;
}) {
  const displayName = profile?.display_name || profile?.username || "Builder";
  const avatar = profile?.avatar_url as string | undefined;

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-white/5 bg-[#080818] p-4 lg:flex">
      <Link to="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
        <img src={bloxsmithLogo.url} alt="BloxSmith" className="h-8 w-8 rounded-lg shadow-[0_8px_24px_-8px_rgba(99,102,241,0.8)]" />
        <span className="text-[15px] font-bold tracking-wide text-white">BLOXSMITH</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.key}
              to={n.to}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active
                ? "bg-white/[0.05] text-white"
                : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link to="/admin" className="mt-2 flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20">
            <Crown className="h-4 w-4" /> Owner Admin
          </Link>
        )}
      </nav>

      <div className="mt-4 space-y-1 border-t border-white/5 pt-3">
        <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-400">
          <span className="flex items-center gap-3"><HelpCircle className="h-4 w-4" /> Credits</span>
          <span className="text-slate-200">
            {isOwner ? <InfinityIcon className="h-4 w-4" /> : `${credits}/${maxCredits}`}
          </span>
        </div>
        <Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.03] hover:text-slate-100">
          <SettingsIcon className="h-4 w-4" /> Settings
        </Link>

        <Link
          to="/settings"
          className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-100">{displayName}</span>
            <span className="block truncate text-[10px] uppercase tracking-widest text-indigo-300">{isOwner ? "Owner" : (profile?.plan ?? "Free")}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        </Link>
      </div>
    </aside>
  );
}
