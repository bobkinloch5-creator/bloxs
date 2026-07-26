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
  Code2, Package, Crown, ExternalLink, MoreHorizontal, ArrowRight, MessageSquare,
  Radio, HelpCircle, LayoutDashboard, Server, Gift, Download, FolderTree, Globe, Zap,
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
import { ExportGameModal } from "@/components/ExportGameModal";
import { ProjectFilesPanel } from "@/components/ProjectFilesPanel";

import { Reveal, GlowCard, CountUp } from "@/components/Reveal";
import { ProjectMemoryCard } from "@/components/ProjectMemoryCard";
import { OnboardingChallenges } from "@/components/OnboardingChallenges";
import { AiPlaytestCard } from "@/components/AiPlaytestCard";
import { LivePlaytestCard } from "@/components/LivePlaytestCard";
import { CreditsPill, CreditsSidebarCard } from "@/components/CreditsWidget";
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
  { key: "pricing",  label: "Pricing & Top-Ups", icon: Zap,          to: "/pricing" },
  { key: "frontpage",label: "Front Page",    icon: Globe,           to: "/" },
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
  const [exportModalOpen, setExportModalOpen] = useState(false);
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
          {/* Top bar with Vapor Frost & Hairline Border */}
          <header className="sticky top-0 z-30 flex items-center gap-3 vapor-frost vapor-hairline-b px-4 py-3.5 sm:px-8 sm:py-4">
            <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-[28px]">
                Welcome back, <span className="vapor-title">{shortName}</span> <span aria-hidden className="inline-block animate-bounce">👋</span>
              </h1>
              <p className="mt-0.5 hidden text-xs font-medium text-indigo-200/70 sm:block">What do you want to build today?</p>
            </div>

              <div className="hidden items-center gap-2.5 md:flex">
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold backdrop-blur-md transition-all ${pluginOnline ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.15)]" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${pluginOnline ? "bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse" : "bg-slate-500"}`} />
                  Studio: {pluginOnline ? "Connected" : "Offline"}
                </div>
                <CreditsPill />
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 px-3 py-2 text-xs font-bold text-cyan-200 hover:border-cyan-400 hover:from-cyan-500/30 hover:to-indigo-500/30 transition shadow-sm"
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-300" /> Top Up Credits
                </Link>
                <a
                  href="https://discord.gg/YJ8xPFNSSX"
                  target="_blank"
                  rel="noreferrer"
                  className="vapor-ghost-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-200 hover:text-white"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-300" /> Discord
                </a>
                <Link
                  to="/"
                  className="vapor-ghost-btn inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:text-white"
                >
                  <Globe className="h-3.5 w-3.5 text-indigo-300" /> Front Page
                </Link>
                <button
                  type="button"
                  onClick={() => setExportModalOpen(true)}
                  className="vapor-ghost-btn inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" /> Export Game
                </button>
                <Link to="/plugin" className="vapor-ghost-btn inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold">
                  <ExternalLink className="h-3.5 w-3.5 text-indigo-300" /> Send to Studio
                </Link>
                <ChangelogNotifications buttonClassName="vapor-ghost-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold" iconClassName="h-3.5 w-3.5 text-indigo-300" />
                <button
                  type="button"
                  disabled={createMut.isPending}
                  onClick={() => setNewProjectOpen(true)}
                  className="vapor-glow-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4 text-cyan-300" /> New Project
                </button>
              </div>
              <ProfileMenu />
            </header>

            <main className="mx-auto w-full max-w-[1440px] px-3 pb-28 pt-5 sm:px-8 sm:pb-8 sm:pt-8">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Main Workspace Column */}
                <div className="space-y-6 lg:col-span-7 xl:col-span-8">
                  {/* Active project banner — futuristic vapor-card with glowing borders */}
                  {activeProject && (
                    <section className="vapor-card hover-lift overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-900/40 via-purple-900/20 to-cyan-900/30 p-4 sm:p-5 shadow-[0_0_35px_rgba(79,70,229,0.15)]">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="vapor-ring-avatar h-14 w-14 shrink-0 overflow-hidden shadow-[0_0_20px_rgba(167,139,250,0.3)]">
                          <img
                            src={activeProject.thumbnail_url ?? THUMBS[activeProject.game_type ?? "custom"] ?? THUMBS.custom}
                            alt=""
                            className="h-full w-full object-cover rounded-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="vapor-label flex items-center gap-1.5 text-indigo-300">
                            <Sparkles className="h-3 w-3 text-cyan-400" /> ACTIVE PROJECT
                          </div>
                          <div className="mt-1 flex items-center gap-2 truncate text-xl font-extrabold text-white tracking-tight">
                            {activeProject.pinned_at && <span title="Pinned">📌</span>}
                            {activeProject.is_favorite && <span title="Favorite" className="text-amber-300">★</span>}
                            <span className="truncate">{activeProject.name}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-300">
                            <span className="rounded-md bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-200">{activeProject.game_type ?? "custom"}</span>
                            <span>•</span>
                            <span className="text-slate-300">{activeProject.build_count ?? 0} builds</span>
                            <span>•</span>
                            <span className="text-slate-400">Updated {timeAgo(activeProject.updated_at)}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 className="h-3 w-3" /> Chat & assets active</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExportModalOpen(true)}
                            className="vapor-glow-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white transition-transform active:scale-95"
                          >
                            <Download className="h-3.5 w-3.5 text-cyan-300" /> Export Game
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try { localStorage.removeItem("bs:activeProjectId"); } catch {}
                              setActiveProjectId(null);
                              try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
                            }}
                            className="vapor-ghost-btn px-3.5 py-2 text-xs font-semibold"
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
                    <Reveal stagger className="mt-3 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
                      {QUICK_ACTIONS.map((a) => (
                        <Link
                          key={a.key}
                          to={a.to as any}
                          className="vapor-card hover-lift group relative flex flex-col overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-[#131330]/90 to-[#0b0b1a]/90 p-4 transition-all hover:border-cyan-400/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.2)]"
                        >
                          <span className="grid h-10 w-10 place-items-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-cyan-300 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-colors group-hover:bg-cyan-500/20 group-hover:text-cyan-200">
                            <a.icon className="h-4 w-4" />
                          </span>
                          <div className="mt-3 text-sm font-extrabold text-slate-100 group-hover:text-cyan-200">{a.label}</div>
                          <div className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">{a.desc}</div>
                        </Link>
                      ))}
                    </Reveal>
                  </section>

                  {/* Recent Projects + Activity */}
                  <section className="grid gap-6 lg:grid-cols-2">
                    {/* Recent Projects */}
                    <div>
                      <SectionHead title="Recent Projects" to="/projects" />
                      <div className="vapor-card mt-3 rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-[#12122e]/90 to-[#090918]/90 p-3 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                        {isLoading ? (
                          <div className="space-y-2 p-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="skeleton h-11 w-11 shrink-0 rounded-xl" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="skeleton h-3.5 w-1/2" />
                                  <div className="skeleton h-3 w-1/3" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : recentProjects.length === 0 ? (
                          <div className="p-6 text-center text-sm font-medium text-slate-400">
                            No projects yet. Describe a game above to create your first one.
                          </div>
                        ) : (
                          <ul className="divide-y divide-white/5">
                            {recentProjects.map((p) => (
                              <li key={p.id} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.04]">
                                <div className="vapor-ring-avatar h-11 w-11 shrink-0 overflow-hidden shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                                  <img
                                    src={p.thumbnail_url ?? THUMBS[p.game_type ?? "custom"] ?? THUMBS.custom}
                                    alt=""
                                    className="h-full w-full object-cover rounded-full"
                                    loading="lazy"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-100 group-hover:text-indigo-200">
                                    {p.pinned_at && <span title="Pinned">📌</span>}
                                    {p.is_favorite && <span title="Favorite" className="text-amber-300">★</span>}
                                    <span className="truncate">{p.name}</span>
                                  </div>
                                  <div className="truncate text-[11px] font-medium text-slate-400">Updated {timeAgo(p.updated_at)}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openProject(p.id)}
                                  className="vapor-ghost-btn px-3 py-1.5 text-xs font-bold"
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
                      <div className="vapor-card mt-3 rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-[#12122e]/90 to-[#090918]/90 p-3 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                        {activity.length === 0 ? (
                          <div className="p-6 text-center text-sm font-medium text-slate-400">Activity will appear as you build.</div>
                        ) : (
                          <ul className="divide-y divide-white/5">
                            {activity.map((a, i) => {
                              const Icon = a.icon;
                              return (
                                <li key={i} className="flex items-center gap-3 p-3">
                                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 ${a.tint} shadow-[0_0_15px_rgba(0,0,0,0.3)]`}>
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold text-slate-100">{a.title}</div>
                                    <div className="truncate text-[11px] font-medium text-slate-400">{a.sub}</div>
                                  </div>
                                  <div className="shrink-0 text-[11px] font-medium text-slate-400">{timeAgo(a.ts)}</div>
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
                </div>

                {/* Right Sidebar Column: Roblox Project Files Explorer & Exporter */}
                <div className="space-y-6 lg:col-span-5 xl:col-span-4">
                  <div className="sticky top-6">
                    {activeProjectId ? (
                      <ProjectFilesPanel
                        projectId={activeProjectId}
                        projectName={activeProject?.name ?? "Roblox Project"}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/60 p-6 text-center shadow-xl backdrop-blur-xl">
                        <FolderTree className="h-10 w-10 text-slate-600 mb-3" />
                        <h4 className="text-sm font-bold text-white">No Active Project</h4>
                        <p className="mt-1 text-xs text-slate-400">
                          Select or create a project to view and export its live Roblox script files hierarchy.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
      {exportModalOpen && (
        <ExportGameModal
          projectId={activeProjectId ?? ""}
          projectName={activeProject?.name ?? "Roblox Experience"}
          onClose={() => setExportModalOpen(false)}
        />
      )}
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
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col vapor-frost border-r border-indigo-500/20 p-4 lg:flex shadow-[5px_0_30px_rgba(0,0,0,0.5)]">
      <Link to="/dashboard" className="mb-8 flex items-center gap-3 px-2 group">
        <div className="relative">
          <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 opacity-75 blur transition group-hover:opacity-100" />
          <img src={bloxsmithLogo.url} alt="BloxSmith" className="relative h-9 w-9 rounded-xl border border-white/20 object-cover" />
        </div>
        <span className="vapor-title text-base font-black tracking-wider">BLOXSMITH</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.key}
              to={n.to}
              className={`vapor-nav-item ${active ? "vapor-nav-active" : ""}`}
            >
              <div className="vapor-nav-icon">
                <Icon className="h-4 w-4" />
              </div>
              <span>{n.label}</span>
            </Link>
          );
        })}
        {isAdmin && (
          <Link to="/admin" className="mt-2 flex items-center gap-3 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-200 shadow-[0_0_15px_rgba(79,70,229,0.2)] hover:bg-indigo-500/25 transition">
            <Crown className="h-4 w-4 text-amber-400 animate-pulse" /> Owner Admin
          </Link>
        )}
      </nav>

      <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
        <CreditsSidebarCard
          credits={credits}
          maxCredits={maxCredits}
          resetAt={profile?.credits_reset_at}
          isOwner={isOwner}
        />
        <Link to="/settings" className="vapor-nav-item">
          <div className="vapor-nav-icon">
            <SettingsIcon className="h-4 w-4" />
          </div>
          <span>Settings</span>
        </Link>
        <a
          href="https://discord.gg/YJ8xPFNSSX"
          target="_blank"
          rel="noreferrer"
          className="vapor-nav-item text-indigo-300 hover:text-white"
        >
          <div className="vapor-nav-icon">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
          </div>
          <span>Join Discord</span>
        </a>

        <Link
          to="/settings"
          className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-left transition hover:border-indigo-400/40 hover:bg-white/[0.07]"
        >
          {avatar ? (
            <div className="vapor-ring-avatar h-8 w-8 shrink-0">
              <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
            </div>
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-400 text-xs font-black text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-100">{displayName}</span>
            <span className="block truncate text-[9px] font-black uppercase tracking-widest text-indigo-300">{isOwner ? "Owner" : (profile?.plan ?? "Free")}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Link>
      </div>
    </aside>
  );
}
