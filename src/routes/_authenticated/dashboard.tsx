import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, createProject, deleteProject } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getPluginSession } from "@/lib/chat.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Loader2, Sparkles, Search, Folder, Lightbulb,
  LayoutDashboard, Plug, Users, History, Settings as SettingsIcon,
  MessageSquare, Box, Radio, BookOpen, HelpCircle, Bell, ChevronDown,
  Upload, ArrowRight, Crown, Infinity as InfinityIcon, Zap, Timer,
  Play, MoreHorizontal, LayoutGrid, List, Wand2, Download,
  ExternalLink, LogOut,
} from "lucide-react";
import bloxLogo from "@/assets/bloxsmith-logo.png.asset.json";
import thumbTycoon from "@/assets/thumbs/tycoon.jpg";
import thumbObby from "@/assets/thumbs/obby.jpg";
import thumbSimulator from "@/assets/thumbs/simulator.jpg";
import thumbRpg from "@/assets/thumbs/rpg.jpg";
import thumbHorror from "@/assets/thumbs/horror.jpg";
import thumbRacing from "@/assets/thumbs/racing.jpg";
import thumbTowerDefense from "@/assets/thumbs/tower-defense.jpg";
import thumbFighting from "@/assets/thumbs/fighting.jpg";
import thumbRoleplay from "@/assets/thumbs/roleplay.jpg";
import thumbSurvival from "@/assets/thumbs/survival.jpg";
import thumbRoundBased from "@/assets/thumbs/round-based.jpg";
import thumbCustom from "@/assets/thumbs/custom.jpg";

const THUMBS: Record<string, string> = {
  tycoon: thumbTycoon,
  obby: thumbObby,
  simulator: thumbSimulator,
  rpg: thumbRpg,
  horror: thumbHorror,
  racing: thumbRacing,
  "tower-defense": thumbTowerDefense,
  fighting: thumbFighting,
  roleplay: thumbRoleplay,
  survival: thumbSurvival,
  "round-based": thumbRoundBased,
  custom: thumbCustom,
};
import { OnboardingTour } from "@/components/OnboardingTour";
import { MobileNavTrigger } from "@/components/MobileNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Projects — BloxSmith" }] }),
  component: Dashboard,
});

type Theme = "default" | "grey" | "light";

const GAME_TYPES = [
  "custom", "tycoon", "obby", "simulator", "rpg", "horror",
  "tower-defense", "racing", "fighting", "round-based", "roleplay", "survival",
  "pet-simulator", "zombie-survival", "bedwars", "city-builder", "dungeon-rpg",
  "police-chase", "cooking",
];

const TEMPLATES: { type: string; name: string; desc: string }[] = [
  { type: "tycoon",       name: "Tycoon",         desc: "Droppers, upgrades, rebirths" },
  { type: "obby",         name: "Obby",           desc: "Stages, checkpoints, leaderboard" },
  { type: "simulator",    name: "Simulator",      desc: "Pets, eggs, coin shop" },
  { type: "pet-simulator",name: "Pet Simulator",  desc: "Eggs, pets, trading-ready saves" },
  { type: "zombie-survival", name: "Zombie Survival", desc: "Waves, guns, shop, safe zone" },
  { type: "rpg",          name: "RPG",            desc: "Quests, NPCs, inventory" },
  { type: "dungeon-rpg",  name: "Dungeon RPG",    desc: "Bosses, loot, classes" },
  { type: "horror",       name: "Horror",         desc: "Lights, monster AI, sound" },
  { type: "racing",       name: "Racing",         desc: "Tracks, vehicles, laps" },
  { type: "tower-defense",name: "Tower Defense",  desc: "Waves, towers, currency" },
  { type: "bedwars",      name: "BedWars Style",  desc: "Beds, teams, generators" },
  { type: "fighting",     name: "Fighting Arena", desc: "Combat, rounds, ranks" },
  { type: "city-builder", name: "City Builder",   desc: "Plots, roads, placement" },
  { type: "roleplay",     name: "Roleplay City",  desc: "Jobs, vehicles, houses" },
  { type: "police-chase", name: "Police Chase",   desc: "Teams, cars, wanted level" },
  { type: "cooking",      name: "Cooking Game",   desc: "Orders, recipes, upgrades" },
  { type: "survival",     name: "Survival",       desc: "Resources, crafting, night" },
  { type: "round-based",  name: "Round Game",     desc: "Lobbies, rounds, minigames" },
  { type: "custom",       name: "Custom",         desc: "Start from scratch" },
];

const IDEAS = [
  { title: "Pet Adventure Simulator", desc: "Collect pets, explore worlds, become the best.",     diff: "Easy",   sys: ["Pets","Shop","Saves"] },
  { title: "Sky Island Obby",          desc: "Hop floating islands across the clouds.",            diff: "Easy",   sys: ["Stages","Checkpoints"] },
  { title: "Zombie Survival City",     desc: "Survive waves, build a base, unlock weapons.",       diff: "Medium", sys: ["Waves","Crafting","Combat"] },
  { title: "Medieval Quest RPG",       desc: "Quests, dungeons, classes, epic battles.",          diff: "Hard",   sys: ["Quests","Inventory","NPCs"] },
  { title: "Theme Park Tycoon",        desc: "Build rides, hire staff, attract guests.",          diff: "Medium", sys: ["Economy","Builders"] },
  { title: "Neon Racing World",        desc: "Speed across tracks in upgraded vehicles.",         diff: "Medium", sys: ["Tracks","Cars","Laps"] },
];

const SIDEBAR_NAV: { key: string; label: string; icon: typeof Box; to?: string; soon?: boolean; active?: boolean }[] = [
  { key: "proj",   label: "Projects",        icon: Folder,          to: "/dashboard", active: true },
  { key: "chat",   label: "AI Chat",         icon: MessageSquare,   to: "/chat" },
  { key: "ideas",  label: "Game Ideas",      icon: Lightbulb,       to: "/ideas" },
  { key: "ui",     label: "UI Generator",    icon: LayoutDashboard, to: "/ui-generator" },
  { key: "co",     label: "Collaborators",   icon: Users,           to: "/collaborators" },
  { key: "plug",   label: "Studio Plugin",   icon: Plug,            to: "/plugin" },
  { key: "mcp",    label: "MCP / Tools",     icon: Wand2,           to: "/mcp" },
  { key: "hist",   label: "History",         icon: History,         to: "/history" },
  { key: "docs",   label: "Docs",            icon: BookOpen,        to: "/docs" },
  { key: "set",    label: "Settings",        icon: SettingsIcon,    to: "/settings" },
];

const FILTERS = ["All Projects", "Recent", "Active", "Collaborator", "Archived", "Needs Fixing"] as const;
type Filter = typeof FILTERS[number];

/* ────────────────── PAGE ────────────────── */
function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn   = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const delFn    = useServerFn(deleteProject);
  const profFn   = useServerFn(getMyProfile);
  const sessFn   = useServerFn(getPluginSession);

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: profile }                  = useQuery({ queryKey: ["profile"],  queryFn: () => profFn(),  refetchInterval: 30000 });
  const { data: pluginSession }            = useQuery({ queryKey: ["pluginSession"], queryFn: () => sessFn(), refetchInterval: 6000 });

  // theme
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "default";
    return (localStorage.getItem("bs-chat-theme") as Theme) || "default";
  });
  useEffect(() => { localStorage.setItem("bs-chat-theme", theme); }, [theme]);
  const themeClass = theme === "light" ? "bloxchat-light" : theme === "grey" ? "bloxchat-grey" : "bloxchat-dark";

  // credits + timer
  const isAdmin = !!profile?.is_admin;
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  const resetAt = profile?.credits_reset_at ? new Date(profile.credits_reset_at).getTime() : 0;
  const [resetLabel, setResetLabel] = useState("");
  useEffect(() => {
    if (isAdmin || !resetAt) return;
    const tick = () => {
      const ms = Math.max(0, resetAt - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setResetLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAdmin, resetAt]);

  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000));

  // create modal
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState("custom");
  const [description, setDescription] = useState("");
  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name, description, game_type: gameType } }),
    onSuccess: (p) => {
      setOpen(false); setName(""); setDescription(""); setGameType("custom");
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/project/$projectId", params: { projectId: p.id } });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  function startTemplate(t: { type: string; name: string }) {
    setName(`My ${t.name}`); setGameType(t.type); setDescription(""); setOpen(true);
  }
  function startIdea(i: typeof IDEAS[number]) {
    setName(i.title); setGameType("custom"); setDescription(i.desc); setOpen(true);
  }

  // search + filters
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState<Filter>("All Projects");
  const [view, setView]     = useState<"grid" | "list">("grid");
  const [sort, setSort]     = useState<"updated" | "name" | "builds">("updated");

  const filtered = useMemo(() => {
    const sevenDays = Date.now() - 7 * 24 * 3600 * 1000;
    let arr = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    if (filter === "Recent")          arr = arr.filter((p) => new Date(p.updated_at).getTime() > sevenDays);
    if (filter === "Active")          arr = arr.filter((p) => (p.build_count ?? 0) > 0);
    if (filter === "Plugin Connected" as any) arr = arr.filter((p) => p.plugin_connected);
    if (filter === "Needs Fixing")    arr = arr.filter((p) => !p.plugin_connected && (p.build_count ?? 0) > 0);
    arr = [...arr].sort((a, b) => {
      if (sort === "name")   return a.name.localeCompare(b.name);
      if (sort === "builds") return (b.build_count ?? 0) - (a.build_count ?? 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return arr;
  }, [projects, query, filter, sort]);

  // stats
  const totalProjects   = projects.length;
  const activeBuilds    = projects.filter((p) => (p.build_count ?? 0) > 0).length;
  const buildsSent      = projects.reduce((s, p) => s + (p.build_count ?? 0), 0);
  const connectedCount  = projects.filter((p) => p.plugin_connected).length;

  // tour
  const [forceTour, setForceTour] = useState(false);

  return (
    <div className={`${themeClass} min-h-screen w-full`} style={{ color: "var(--bs-fg)" }}>
      <OnboardingTour
        storageKey="bs-onboarding-dashboard"
        force={forceTour}
        onFinish={() => { setForceTour(false); }}
        steps={[
          { title: "Welcome to BloxSmith 👋", body: "Your AI co-builder for Roblox. Describe a game and we generate scripts, models, and Studio actions.", cta: "Show me how" },
          { title: "1. Create a project", body: "Each project is one Roblox game — pick a name and game type to get started." },
          { title: "2. Install the Studio plugin", body: "Open Studio, install the BloxSmith plugin from the Studio Plugin page, paste your token, and every build is pushed right into your place." },
          { title: "3. Chat → Build → Test", body: "Inside a project, just chat. BloxSmith plans the work, writes the Luau, and queues it for Studio.", cta: "Let's build" },
        ]}
      />

      <div className="flex">
        <LeftSidebar theme={theme} setTheme={setTheme} credits={credits} maxCredits={maxCredits} isAdmin={isAdmin} resetLabel={resetLabel} />

        <div className="min-w-0 flex-1">
          <TopBar
            profile={profile}
            credits={credits} maxCredits={maxCredits} isAdmin={isAdmin}
            resetLabel={resetLabel} theme={theme} pluginOnline={pluginOnline}
            onNewProject={() => setOpen(true)}
            onTour={() => setForceTour(true)}
          />

          <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <HeroCard
                onNewProject={() => setOpen(true)}
                onTemplate={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })}
                onPrompt={(text) => { setName(text.slice(0, 60) || "New Game"); setDescription(text); setOpen(true); }}
              />

              <StatsRow
                total={totalProjects} active={activeBuilds} builds={buildsSent}
                connected={connectedCount} credits={credits} maxCredits={maxCredits}
                isAdmin={isAdmin} pluginOnline={pluginOnline}
              />

              <ProjectsToolbar
                query={query} setQuery={setQuery}
                filter={filter} setFilter={setFilter}
                view={view} setView={setView}
                sort={sort} setSort={setSort}
              />

              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--bs-muted-fg)" }} /></div>
              ) : projects.length === 0 ? (
                <EmptyState onNew={() => setOpen(true)} onTemplates={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })} onIdea={() => document.getElementById("ideas")?.scrollIntoView({ behavior: "smooth" })} />
              ) : filtered.length === 0 ? (
                <div className="bs-card p-10 text-center text-sm" style={{ color: "var(--bs-muted-fg)" }}>
                  No projects match your filters.
                </div>
              ) : view === "grid" ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((p) => (
                    <ProjectCard key={p.id} p={p} onDelete={(id) => { if (confirm(`Delete "${p.name}"? This cannot be undone.`)) delMut.mutate(id); }} />
                  ))}
                </div>
              ) : (
                <div className="bs-card divide-y" style={{ borderColor: "var(--bs-border)" }}>
                  {filtered.map((p) => (
                    <ProjectRow key={p.id} p={p} onDelete={(id) => { if (confirm(`Delete "${p.name}"?`)) delMut.mutate(id); }} />
                  ))}
                </div>
              )}

              <section id="templates" className="space-y-3">
                <SectionHeader title="Start a New Roblox Game" subtitle="Pick a template — we'll wire up the systems for you." />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {TEMPLATES.map((t) => (
                    <button key={t.type} onClick={() => startTemplate(t)} className="bs-soft group p-3 text-left">
                      <GameThumb type={t.type} className="h-24 w-full rounded-lg" />
                      <div className="mt-2 truncate text-sm font-semibold">{t.name}</div>
                      <div className="truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{t.desc}</div>
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium opacity-0 transition group-hover:opacity-100" style={{ color: "var(--bs-primary)" }}>
                        Start <ArrowRight className="h-3 w-3" />
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section id="ideas" className="space-y-3">
                <SectionHeader title="AI Generated Game Ideas" subtitle="Fresh starting points — click one and we'll set it up." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {IDEAS.map((i) => (
                    <div key={i.title} className="bs-card flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{i.title}</div>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bs-muted-fg)" }}>{i.desc}</p>
                        </div>
                        <span className="bs-chip shrink-0">{i.diff}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {i.sys.map((s) => <span key={s} className="bs-chip">{s}</span>)}
                      </div>
                      <button onClick={() => startIdea(i)} className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "var(--bs-grad)", color: "#fff" }}>
                        <Sparkles className="h-3.5 w-3.5" /> Start this idea
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <RightPanel pluginOnline={pluginOnline} pluginSession={pluginSession} resetLabel={resetLabel} isAdmin={isAdmin} onHelp={() => setForceTour(true)} />
          </div>
        </div>
      </div>

      {open && (
        <CreateModal
          name={name} setName={setName}
          gameType={gameType} setGameType={setGameType}
          description={description} setDescription={setDescription}
          onClose={() => setOpen(false)}
          onCreate={() => createMut.mutate()}
          pending={createMut.isPending}
        />
      )}
    </div>
  );
}

/* ────────────────── LEFT SIDEBAR ────────────────── */
function LeftSidebar({
  theme, setTheme, credits, maxCredits, isAdmin, resetLabel,
}: { theme: Theme; setTheme: (t: Theme) => void; credits: number; maxCredits: number; isAdmin: boolean; resetLabel: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col gap-5 border-r p-5 lg:flex" style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}>
      <Link to="/dashboard" className="flex items-center gap-3">
        <div className="vapor-diamond"><i /></div>
        <div className="min-w-0">
          <div className="truncate text-xl font-bold uppercase italic tracking-tighter text-white" style={{ fontFamily: "Space Mono, monospace" }}>BloxSmith</div>
          <div className="truncate text-[10px] font-semibold tracking-[0.22em] text-cyan-300/70" style={{ fontFamily: "Space Mono, monospace" }}>AI GAME BUILDER</div>
        </div>
      </Link>


      <nav className="flex flex-1 flex-col gap-1">
        {isAdmin && (
          <Link to="/admin" className="hover:[&>div]:bg-[var(--bs-card-2)]">
            <div className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition" style={{ color: "var(--bs-primary)", background: "var(--bs-primary-soft)" }}>
              <span className="flex items-center gap-2.5"><Crown className="h-4 w-4" />Owner Admin</span>
            </div>
          </Link>
        )}
        {SIDEBAR_NAV.map((n) => {
          const Icon = n.icon;
          const content = (
            <div className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition`} style={n.active ? { background: "var(--bs-primary-soft)", color: "var(--bs-primary)" } : { color: "var(--bs-muted-fg)" }}>
              <span className="flex items-center gap-2.5"><Icon className="h-4 w-4" />{n.label}</span>
              {n.soon && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>Soon</span>}
            </div>
          );
          return n.to && !n.soon
            ? <Link key={n.key} to={n.to as any} className="hover:[&>div]:bg-[var(--bs-card-2)] hover:[&>div]:!text-[var(--bs-fg)]">{content}</Link>
            : <div key={n.key} className="cursor-not-allowed opacity-80">{content}</div>;
        })}
      </nav>

      <div className="bs-soft p-3">
        <div className="flex items-center gap-2 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} /> 100% FREE FOREVER</div>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--bs-muted-fg)" }}>No hidden limits. Build anything. Always free.</p>
      </div>

      <div className="bs-soft p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
          <span>Your Credits</span>
          {isAdmin && <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--bs-primary)" }}><Crown className="h-3 w-3" />Owner</span>}
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          {isAdmin ? (
            <span className="text-2xl font-extrabold" style={{ color: "var(--bs-primary)" }}><InfinityIcon className="inline h-6 w-6" /></span>
          ) : (
            <>
              <span className="text-2xl font-extrabold" style={{ color: "var(--bs-primary)" }}>{credits}</span>
              <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>/ {maxCredits}</span>
            </>
          )}
        </div>
        {!isAdmin && (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (credits / Math.max(1, maxCredits)) * 100)}%`, background: "var(--bs-grad)" }} />
            </div>
            <div className="mt-2 text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>Resets in {resetLabel || "—"}</div>
          </>
        )}
      </div>

      <div className="bs-soft p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
          <SettingsIcon className="h-3.5 w-3.5" /> Theme
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(["default", "grey", "light"] as Theme[]).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className="rounded-lg border px-2 py-1.5 text-[10px] font-semibold capitalize transition"
              style={t === theme
                ? { borderColor: "var(--bs-primary)", color: "var(--bs-primary)", background: "var(--bs-primary-soft)" }
                : { borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)", background: "transparent" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition hover:bg-[var(--bs-card-2)]" style={{ color: "var(--bs-muted-fg)" }}>
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </aside>
  );
}

/* ────────────────── TOP BAR ────────────────── */
function TopBar({
  profile, credits, maxCredits, isAdmin, resetLabel, theme, pluginOnline, onNewProject, onTour,
}: {
  profile: any; credits: number; maxCredits: number; isAdmin: boolean; resetLabel: string;
  theme: Theme; pluginOnline: boolean; onNewProject: () => void; onTour: () => void;
}) {
  const name = profile?.display_name || profile?.username || "Builder";
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b px-3 py-3 sm:px-6" style={{ background: "color-mix(in oklab, var(--bs-card) 90%, transparent)", borderColor: "var(--bs-border)", backdropFilter: "blur(12px)" }}>
      <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold uppercase italic tracking-tighter text-white sm:text-3xl md:text-4xl" style={{ fontFamily: "Space Mono, monospace" }}>Projects</h1>
        <p className="hidden truncate text-xs sm:block" style={{ color: "var(--bs-muted-fg)" }}>Create, manage, and continue your Roblox AI builds.</p>
      </div>



      <div className="hidden items-center gap-2 md:flex">
        <div className="bs-soft flex items-center gap-2 px-3 py-2">
          <Plug className="h-4 w-4" style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }} />
          <div className="text-[11px] leading-tight">
            <div className="font-semibold" style={{ color: "var(--bs-muted-fg)" }}>Studio Plugin</div>
            <div className="font-bold" style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }}>{pluginOnline ? "Connected" : "Offline"}</div>
          </div>
        </div>

        <div className="bs-soft flex items-center gap-2 px-3 py-2">
          <Zap className="h-4 w-4" style={{ color: "var(--bs-primary)" }} />
          <div className="text-[11px] leading-tight">
            <div className="font-semibold" style={{ color: "var(--bs-muted-fg)" }}>Credits</div>
            <div className="font-bold" style={{ color: "var(--bs-primary)" }}>
              {isAdmin ? <span className="inline-flex items-center gap-1"><InfinityIcon className="h-3 w-3" />Unlimited</span> : `${credits} / ${maxCredits}`}
            </div>
          </div>
        </div>

        {!isAdmin && (
          <div className="bs-soft flex items-center gap-2 px-3 py-2">
            <Timer className="h-4 w-4" style={{ color: "var(--bs-muted-fg)" }} />
            <div className="text-[11px] leading-tight">
              <div className="font-semibold" style={{ color: "var(--bs-muted-fg)" }}>Resets in</div>
              <div className="font-bold">{resetLabel || "—"}</div>
            </div>
          </div>
        )}
      </div>

      <button onClick={onTour} title="Replay tour" className="bs-quick !px-2.5">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <button title="Notifications" className="bs-quick !px-2.5"><Bell className="h-3.5 w-3.5" /></button>

      <button onClick={onNewProject} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:inline-flex" style={{ background: "var(--bs-grad)", color: "#fff" }}>
        <Plus className="h-3.5 w-3.5" /> New Project
      </button>

      <ProfileMenu />

    </header>
  );
}

/* ────────────────── HERO ────────────────── */
function HeroCard({ onNewProject, onTemplate, onPrompt }: { onNewProject: () => void; onTemplate: () => void; onPrompt: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="bs-card relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-0 -z-10 opacity-60" style={{ background: "radial-gradient(900px 300px at 0% 0%, color-mix(in oklab, var(--bs-primary) 22%, transparent), transparent 60%), radial-gradient(700px 240px at 100% 100%, color-mix(in oklab, var(--bs-primary) 14%, transparent), transparent 60%)" }} />
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="bs-chip mb-3 !text-[10px]" style={{ color: "var(--bs-primary)", borderColor: "color-mix(in oklab, var(--bs-primary) 50%, transparent)", background: "var(--bs-primary-soft)" }}>
            <Sparkles className="h-3 w-3" /> BloxSmith AI
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to build your next Roblox game?</h2>
          <p className="mt-1.5 text-sm" style={{ color: "var(--bs-muted-fg)" }}>Describe your game idea and let AI handle the rest.</p>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border p-1.5" style={{ background: "var(--bs-card-2)", borderColor: "var(--bs-border)" }}>
            <Search className="ml-2 h-4 w-4" style={{ color: "var(--bs-muted-fg)" }} />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) onPrompt(text.trim()); }}
              placeholder="Describe the game you want to create…"
              className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm outline-none placeholder:opacity-60"
            />
            <button
              onClick={() => text.trim() ? onPrompt(text.trim()) : onNewProject()}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
              style={{ background: "var(--bs-grad)", color: "#fff" }}
            >
              Generate Idea <Sparkles className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/voice" className="bs-quick" style={{ borderColor: "color-mix(in oklab, var(--bs-primary) 60%, transparent)", color: "var(--bs-primary)", background: "var(--bs-primary-soft)" }}>
              <Radio className="h-3 w-3" /> Talk to AI (Voice)
            </Link>
            <button onClick={onTemplate} className="bs-quick"><LayoutDashboard className="h-3 w-3" /> Start From Template</button>
            <button onClick={onNewProject} className="bs-quick"><Plus className="h-3 w-3" /> New Project</button>
            <Link to="/plugin" className="bs-quick"><Play className="h-3 w-3" /> Open Studio Plugin</Link>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="grid h-44 w-44 place-items-center rounded-3xl border" style={{ background: "var(--bs-card-2)", borderColor: "var(--bs-border)" }}>
            <RobotMascot />
          </div>
        </div>
      </div>
    </div>
  );
}

function RobotMascot() {
  return (
    <svg viewBox="0 0 160 160" className="h-32 w-32">
      <defs>
        <linearGradient id="rg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#60a5fa" stopOpacity="0.7" /><stop offset="1" stopColor="#60a5fa" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="80" cy="80" r="70" fill="url(#glow)" />
      <rect x="40" y="40" width="80" height="70" rx="18" fill="url(#rg)" />
      <rect x="55" y="60" width="14" height="14" rx="3" fill="#fff" />
      <rect x="91" y="60" width="14" height="14" rx="3" fill="#fff" />
      <rect x="62" y="86" width="36" height="6" rx="3" fill="#fff" opacity="0.9" />
      <rect x="74" y="22" width="12" height="14" rx="3" fill="url(#rg)" />
      <circle cx="80" cy="20" r="4" fill="#60a5fa" />
    </svg>
  );
}

/* ────────────────── STATS ────────────────── */
function StatsRow({ total, active, builds, connected, credits, maxCredits, isAdmin, pluginOnline }: {
  total: number; active: number; builds: number; connected: number; credits: number; maxCredits: number; isAdmin: boolean; pluginOnline: boolean;
}) {
  const items = [
    { label: "Total Projects",   value: total,    sub: total ? `${total} saved` : "Start your first",       icon: Folder },
    { label: "Active Builds",    value: active,   sub: active ? "Currently building" : "Idle",              icon: Sparkles },
    { label: "Builds Sent",      value: builds,   sub: "To Roblox Studio",                                  icon: Upload },
    { label: "Plugin Connected", value: connected,sub: pluginOnline ? "Live now" : "Offline",               icon: Plug },
    { label: "Credits Available",value: isAdmin ? "∞" : credits, sub: isAdmin ? "Unlimited (Owner)" : `of ${maxCredits}`, icon: Zap, accent: true },
    { label: "Collaborators",    value: 0,        sub: "Invite teammates",                                  icon: Users },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="vapor-card p-4">
            <div className="flex items-center justify-between vapor-label">
              {it.label}
              <Icon className="h-3.5 w-3.5" style={{ color: it.accent ? "#67e8f9" : "rgba(167,139,250,0.6)" }} />
            </div>
            <div className="mt-2 vapor-stat-num" style={it.accent ? { color: "#67e8f9" } : undefined}>{it.value}</div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{it.sub}</div>
          </div>
        );
      })}
    </div>
  );
}


/* ────────────────── TOOLBAR ────────────────── */
function ProjectsToolbar({
  query, setQuery, filter, setFilter, view, setView, sort, setSort,
}: {
  query: string; setQuery: (s: string) => void;
  filter: Filter; setFilter: (f: Filter) => void;
  view: "grid" | "list"; setView: (v: "grid" | "list") => void;
  sort: "updated" | "name" | "builds"; setSort: (s: "updated" | "name" | "builds") => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
      <div className="bs-soft flex items-center gap-2 px-3 py-2 lg:w-72">
        <Search className="h-4 w-4" style={{ color: "var(--bs-muted-fg)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your projects…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-60" />
      </div>
      <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition" style={f === filter ? { background: "var(--bs-primary)", color: "var(--bs-primary-fg)" } : { background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>
            {f}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select className="bs-select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="updated">Sort: Last Updated</option>
          <option value="name">Sort: Name</option>
          <option value="builds">Sort: Build Count</option>
        </select>
        <div className="bs-soft flex items-center p-0.5">
          <button onClick={() => setView("grid")} className="rounded-md p-1.5" style={view === "grid" ? { background: "var(--bs-primary)", color: "var(--bs-primary-fg)" } : { color: "var(--bs-muted-fg)" }} aria-label="Grid view"><LayoutGrid className="h-3.5 w-3.5" /></button>
          <button onClick={() => setView("list")} className="rounded-md p-1.5" style={view === "list" ? { background: "var(--bs-primary)", color: "var(--bs-primary-fg)" } : { color: "var(--bs-muted-fg)" }} aria-label="List view"><List className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── PROJECT CARD ────────────────── */
function ProjectCard({ p, onDelete }: { p: any; onDelete: (id: string) => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    if (menu) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const isActive = (p.build_count ?? 0) > 0;
  const needsFix = !p.plugin_connected && isActive;
  const statusLabel = needsFix ? "Needs Fix" : isActive ? "Active" : "Draft";
  const statusColor = needsFix ? "var(--bs-warning)" : isActive ? "var(--bs-success)" : "var(--bs-muted-fg)";

  return (
    <div className="vapor-card group relative overflow-hidden">
      <div className="relative">
        <GameThumb type={p.game_type} className="h-44 w-full" />
        <span className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur" style={{ background: "color-mix(in oklab, var(--bs-card) 70%, transparent)", color: statusColor, border: `1px solid ${statusColor}` }}>
          {statusLabel}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{p.name}</h3>
            <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              <span className="bs-chip !py-0.5 !text-[10px] capitalize">{p.game_type}</span>
              <span>Updated {timeAgo(p.updated_at)}</span>
            </div>
          </div>
          <div ref={ref} className="relative">
            <button onClick={() => setMenu((v) => !v)} className="rounded-md p-1.5 transition hover:bg-[var(--bs-card-2)]" aria-label="More"><MoreHorizontal className="h-4 w-4" style={{ color: "var(--bs-muted-fg)" }} /></button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border text-sm shadow-xl" style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}>
                <Link to="/project/$projectId" params={{ projectId: p.id }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[var(--bs-card-2)]"><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
                <button onClick={() => { setMenu(false); onDelete(p.id); }} className="flex w-full items-center gap-2 border-t px-3 py-2 text-left" style={{ color: "var(--bs-danger)", borderColor: "var(--bs-border)" }}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            )}
          </div>
        </div>

        {p.description && <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{p.description}</p>}

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <Stat label="Builds" value={p.build_count ?? 0} />
          <Stat label="Plugin" value={p.plugin_connected ? "Connected" : "Offline"} accent={p.plugin_connected ? "var(--bs-success)" : "var(--bs-muted-fg)"} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link to="/project/$projectId" params={{ projectId: p.id }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "var(--bs-grad)", color: "#fff" }}>
            <Play className="h-3 w-3" /> Open Project
          </Link>
          <Link to="/project/$projectId" params={{ projectId: p.id }} className="bs-quick !py-2">Continue</Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--bs-muted-fg)" }}>{label}</span>
      <span className="font-semibold" style={{ color: accent || "var(--bs-fg)" }}>{value}</span>
    </div>
  );
}

function ProjectRow({ p, onDelete }: { p: any; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-4 p-3">
      <GameThumb type={p.game_type} className="h-14 w-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{p.name}</div>
        <div className="truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          <span className="capitalize">{p.game_type}</span> · {p.build_count ?? 0} builds · Updated {timeAgo(p.updated_at)}
        </div>
      </div>
      <span className="hidden text-[11px] font-semibold sm:inline" style={{ color: p.plugin_connected ? "var(--bs-success)" : "var(--bs-muted-fg)" }}>
        {p.plugin_connected ? "● Plugin live" : "○ Offline"}
      </span>
      <Link to="/project/$projectId" params={{ projectId: p.id }} className="bs-quick"><Play className="h-3 w-3" /> Open</Link>
      <button onClick={() => onDelete(p.id)} className="rounded-md p-1.5 transition hover:bg-[var(--bs-card-2)]" aria-label="Delete">
        <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
      </button>
    </div>
  );
}

/* ────────────────── RIGHT PANEL ────────────────── */
function RightPanel({ pluginOnline, pluginSession, resetLabel, isAdmin, onHelp }: {
  pluginOnline: boolean; pluginSession: any; resetLabel: string; isAdmin: boolean; onHelp: () => void;
}) {
  return (
    <aside className="hidden flex-col gap-4 xl:flex">
      <div className="bs-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <Radio className="h-4 w-4" style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }} />
            Roblox Studio
          </div>
          <span className="text-[11px] font-bold" style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }}>
            {pluginOnline ? "● Connected" : "○ Offline"}
          </span>
        </div>
        <div className="mt-3 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          {pluginOnline
            ? <>Plugin v{pluginSession?.plugin_version || "1.0"} · Last seen {timeAgo(pluginSession?.last_seen)}</>
            : <>Install and connect the BloxSmith plugin to push builds straight into Studio.</>}
        </div>
        <Link to="/plugin" className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "var(--bs-grad)", color: "#fff" }}>
          {pluginOnline ? "Manage Plugin" : "Install Plugin"} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {!isAdmin && (
        <div className="bs-card p-4">
          <div className="flex items-center gap-2 font-bold"><Timer className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> Credit Refresh</div>
          <div className="mt-2 text-2xl font-extrabold" style={{ color: "var(--bs-primary)" }}>{resetLabel || "—"}</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>Free credits reset every 24h.</div>
        </div>
      )}

      <div className="bs-card p-4">
        <div className="mb-3 font-bold">Quick Links</div>
        <div className="flex flex-col gap-1.5 text-sm">
          <Link to="/docs" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bs-card-2)]"><BookOpen className="h-3.5 w-3.5" /> Docs & Guides</Link>
          <Link to="/plugin" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bs-card-2)]"><Plug className="h-3.5 w-3.5" /> Studio Plugin Setup</Link>
          <button onClick={onHelp} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bs-card-2)]"><Sparkles className="h-3.5 w-3.5" /> Replay Onboarding</button>
        </div>
      </div>

      <div className="bs-card p-4">
        <div className="font-bold">Need help?</div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>Join our Discord community for support, ideas, and updates.</p>
          <a href="https://discord.gg/6QDYT3RUkv" target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "#5865F2", color: "#fff" }}>
          Join Discord <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </aside>
  );
}

/* ────────────────── EMPTY STATE ────────────────── */
function EmptyState({ onNew, onTemplates, onIdea }: { onNew: () => void; onTemplates: () => void; onIdea: () => void }) {
  return (
    <div className="bs-card relative overflow-hidden p-10 text-center">
      <div className="absolute inset-0 -z-10 opacity-50" style={{ background: "radial-gradient(600px 240px at 50% 0%, color-mix(in oklab, var(--bs-primary) 20%, transparent), transparent 60%)" }} />
      <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl" style={{ background: "var(--bs-card-2)" }}>
        <RobotMascot />
      </div>
      <h3 className="mt-4 text-xl font-extrabold">Create your first Roblox game with AI</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--bs-muted-fg)" }}>Choose a template, browse ideas, or describe your dream game.</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button onClick={onNew} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: "var(--bs-grad)", color: "#fff" }}>
          <Plus className="h-4 w-4" /> Create Project
        </button>
        <button onClick={onTemplates} className="bs-quick"><LayoutDashboard className="h-3.5 w-3.5" /> Browse Templates</button>
        <button onClick={onIdea} className="bs-quick"><Lightbulb className="h-3.5 w-3.5" /> Generate Idea</button>
      </div>
    </div>
  );
}

/* ────────────────── CREATE MODAL ────────────────── */
function CreateModal({
  name, setName, gameType, setGameType, description, setDescription, onClose, onCreate, pending,
}: {
  name: string; setName: (s: string) => void;
  gameType: string; setGameType: (s: string) => void;
  description: string; setDescription: (s: string) => void;
  onClose: () => void; onCreate: () => void; pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="bs-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">New project</h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--bs-card-2)]"><span className="sr-only">Close</span>✕</button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Project name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sushi Tycoon" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: "var(--bs-card-2)", borderColor: "var(--bs-border)", color: "var(--bs-fg)" }} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Game type</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {GAME_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setGameType(t)} className="rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition" style={t === gameType ? { borderColor: "var(--bs-primary)", color: "var(--bs-primary)", background: "var(--bs-primary-soft)" } : { borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)", background: "var(--bs-card-2)" }}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Idea (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One-line idea" rows={2} className="mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: "var(--bs-card-2)", borderColor: "var(--bs-border)", color: "var(--bs-fg)" }} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="bs-quick">Cancel</button>
          <button disabled={!name || pending} onClick={onCreate} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: "var(--bs-grad)", color: "#fff" }}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── HELPERS ────────────────── */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ────────────────── GAME THUMBNAILS (real Roblox-style art) ────────────────── */
function GameThumb({ type, className }: { type: string; className?: string }) {
  const src = THUMBS[type] ?? THUMBS.custom;
  const label = (type || "custom").replace("-", " ");
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ background: "var(--bs-card-2)" }}>
      <img
        src={src}
        alt={`${label} game thumbnail`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-2 left-2.5 text-[10px] font-extrabold uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        {label}
      </div>
    </div>
  );
}
