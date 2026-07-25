import { useMemo } from "react";
import {
  Sparkles, Radio, Cpu, Wrench, Box, BookOpen, Bot, Hammer, FileCode,
  LayoutDashboard, Gauge, Bug, ScanLine, PlayCircle, Zap, Crown, Lightbulb,
  Upload, ImageIcon, Timer, ArrowRight, Activity, CheckCircle2, Rocket,
  Wand2, ShieldCheck, Loader2, Sword, Shield, Users, ShoppingCart,
  Package, Star, Fish, Pickaxe, Leaf, Building2, Map, Music,
  Database, Trophy, Globe, Store, Gift, Palette, Crosshair, Car,
  Swords, Ghost, Flame, Mountain, Trees,
} from "lucide-react";
import { SmartTooltip, HelpModeToggle, HelpCaption, type SmartHelp } from "@/components/SmartTooltip";

type IconT = typeof Box;

export type QuickAction = { label: string; icon: IconT; onClick: () => void };

type Props = {
  name: string;
  project?: { title?: string | null; game_type?: string | null } | null;
  pluginOnline: boolean;
  credits: number;
  maxCredits: number;
  isAdmin: boolean;
  modelLabel?: string;
  actions: Array<{ status?: string | null; kind?: string | null; created_at?: string | null; error?: string | null }>;
  busy?: boolean;
  onPrompt: (prompt: string) => void;
  onAction: (label: string) => void;
  templates: Array<{ label: string; prompt: string }>;
};

/** Rich help metadata keyed by action label. Powers hover cards + Help Mode captions. */
const ACTION_HELP: Record<string, SmartHelp & { recommended?: boolean }> = {
  "Build Full Game": {
    title: "Build Full Game",
    description: "Full prompt-to-game pass. Plans systems, inserts safe assets, writes scripts, wires UI, saves, tests.",
    useWhen: "You're starting a new game and want a complete playable base in one pass.",
    generates: "Map, scripts, UI, DataStore, mobile controls, scan report.",
    estTime: "60–180s", affectsProject: true, credits: "50–150", recommended: true,
  },
  "Make It Playable": {
    title: "Make It Playable",
    description: "Adds only the missing core systems needed to make the current project actually playable.",
    useWhen: "You have half a project and need spawn, controls, HUD, and a save system wired up.",
    generates: "SpawnLocation, HUD, mobile controls, DataStore, tutorial.",
    estTime: "10–30s", affectsProject: true, credits: "50", shortcut: "Ctrl + P", recommended: true,
  },
  "Build Map": {
    title: "Build Map",
    description: "Builds a complete map using safe free Toolbox assets — no placeholder blocks.",
    useWhen: "You want a themed environment ready to play in.",
    generates: "Terrain, buildings, props, lighting, organized folders.",
    estTime: "30–90s", affectsProject: true, credits: "25–60",
  },
  "Generate UI": {
    title: "Generate UI",
    description: "Designs a premium UI concept image, then converts it into real Roblox ScreenGui with wired buttons.",
    useWhen: "You need a menu, HUD, shop, or inventory that looks polished.",
    generates: "ScreenGui, Frames, TextButtons, LocalScripts, tweens, mobile scaling.",
    estTime: "20–45s", affectsProject: true, credits: "10",
  },
  "Add NPCs": {
    title: "Add NPCs",
    description: "Inserts safe Toolbox NPCs/enemies matching your game and wires Humanoids, AI, and spawn folders.",
    estTime: "15–30s", affectsProject: true, credits: "10",
  },
  "Add Currency": {
    title: "Add Currency",
    description: "Adds coins/gems/XP with leaderstats, DataStore saving, HUD, and anti-exploit checks.",
    estTime: "15–30s", affectsProject: true, credits: "10",
  },

  "Fix Errors": {
    title: "Fix Errors",
    description: "Reads recent Studio errors, missing remotes, and broken UI, then queues fixes with autofix + scan.",
    useWhen: "Studio is throwing errors or buttons aren't working.",
    estTime: "10–25s", affectsProject: true, credits: "15",
  },
  "Optimize Performance": {
    title: "Optimize Performance",
    description: "Finds heavy models, bad loops, unanchored parts, and applies safe cleanups + low-graphics settings.",
    estTime: "10–20s", affectsProject: true, credits: "15",
  },
  "Fix UI": { title: "Fix UI", description: "Repairs unwired buttons, mobile scaling, overlapping text, and blank screens.", estTime: "10–20s", affectsProject: true, credits: "10" },
  "Fix Mobile": { title: "Fix Mobile", description: "Makes the game touch-friendly: bigger buttons, mobile controls, safe UI scaling.", estTime: "10–25s", affectsProject: true, credits: "10" },
  "Organize": { title: "Organize", description: "Cleans folders, removes empties, groups assets into sensible services.", estTime: "5–10s", affectsProject: true, credits: "5" },
  "Make Premium": { title: "Make Premium", description: "Adds polish: loading screen, animated menu, lighting, sounds, particles, and mobile-safe UI.", estTime: "45–120s", affectsProject: true, credits: "25" },

  "AI Playtest": { title: "AI Playtest", description: "Simulates a player run and reports what breaks — movement, UI, spawns, saves.", estTime: "10–25s", affectsProject: false, credits: "20" },
  "Scan Game": { title: "Scan Game", description: "Deep scan of scripts, UI, assets, empty folders, mobile readiness, and performance.", estTime: "5–15s", affectsProject: false, credits: "10", recommended: true },
  "Safety Scan": { title: "Safety Scan", description: "Checks assets, scripts, remotes, and permissions for unsafe patterns.", estTime: "5–15s", affectsProject: false, credits: "10" },
  "Test Game": { title: "Test Game", description: "Verifies spawn, movement, buttons, NPCs, shop/save systems and reports failures.", estTime: "10–20s", affectsProject: false, credits: "10" },

  "Publish Checklist": { title: "Publish Checklist", description: "Generates title, description, tags, thumbnail idea, mobile check, and things to test before release.", estTime: "5–10s", affectsProject: false, credits: "5" },
  "Final Report": { title: "Final Report", description: "Summarizes what was built, what was fixed, and what to test next.", estTime: "5–10s", affectsProject: false, credits: "5" },
  "Update Generator": { title: "Update Generator", description: "Writes an update log for what changed since your last build.", estTime: "5–10s", affectsProject: false, credits: "5" },
  "Community Share": { title: "Community Share", description: "Formats a shareable post about your game for Discord, Twitter, or the Roblox forum.", estTime: "5–10s", affectsProject: false, credits: "5" },

  // ── Game Systems ──────────────────────────────────────────────────────────
  "Add Combat System": { title: "Add Combat System", description: "Generates swords, guns, or ability-based combat with hitboxes, damage remotes, and anti-exploit guards.", estTime: "20–40s", affectsProject: true, credits: "20" },
  "Add Pet System": { title: "Add Pet System", description: "Creates equippable pets that orbit the player, boost stats, and can be upgraded, hatched, or traded.", estTime: "25–50s", affectsProject: true, credits: "25" },
  "Add Quest System": { title: "Add Quest System", description: "Builds a full quest engine with objectives, progress tracking, rewards, and a quest log UI.", estTime: "20–40s", affectsProject: true, credits: "20" },
  "Add Inventory": { title: "Add Inventory", description: "Creates a grid inventory with item stacking, equip/unequip, rarity borders, and DataStore persistence.", estTime: "20–35s", affectsProject: true, credits: "20" },
  "Add Shop": { title: "Add Shop", description: "Builds an in-game shop UI with item listings, currency costs, purchase confirmation, and server-side validation.", estTime: "15–30s", affectsProject: true, credits: "15" },
  "Add Trading": { title: "Add Trading", description: "Player-to-player item trading with trade window UI, offer validation, confirmation screen, and DataStore updates.", estTime: "25–45s", affectsProject: true, credits: "25" },
  "Add Crafting": { title: "Add Crafting", description: "Recipe-based crafting system with ingredient requirements, crafting UI, success animations, and output items.", estTime: "20–40s", affectsProject: true, credits: "20" },
  "Add Skills": { title: "Add Skills", description: "Skill tree or ability system with XP-based unlocking, ability hotbar, cooldown management, and visual effects.", estTime: "25–45s", affectsProject: true, credits: "25" },
  "Add Leaderboards": { title: "Add Leaderboards", description: "OrderedDataStore leaderboard with top-10 display, player rank badges, and auto-refresh polling.", estTime: "10–20s", affectsProject: true, credits: "10" },
  "Add Daily Rewards": { title: "Add Daily Rewards", description: "Login streak system with escalating daily rewards, calendar UI, and DataStore tracking per player.", estTime: "15–25s", affectsProject: true, credits: "15" },
  "Add Data Saving": { title: "Add Data Saving", description: "ProfileService DataStore setup with auto-save, load retry, session-lock, and default player data schema.", estTime: "15–25s", affectsProject: true, credits: "15", recommended: true },
  "Add Gamepasses": { title: "Add Gamepasses", description: "Gamepass integration with MarketplaceService purchase handling, server-side validation, and perk application.", estTime: "15–25s", affectsProject: true, credits: "15" },

  // ── Game Genres ───────────────────────────────────────────────────────────
  "Build Tycoon": { title: "Build Tycoon", description: "Full tycoon with droppers, conveyors, collectors, upgrades, team plots, and a progression economy.", estTime: "90–180s", affectsProject: true, credits: "80" },
  "Build Simulator": { title: "Build Simulator", description: "Click-to-earn simulator with auto-click upgrades, rebirth system, pets, coin multipliers, and leaderboards.", estTime: "60–120s", affectsProject: true, credits: "60" },
  "Build RPG": { title: "Build RPG", description: "RPG with open-world map, enemy spawns, loot drops, XP/level system, skill tree, inventory, and quest log.", estTime: "120–240s", affectsProject: true, credits: "120" },
  "Build Obby": { title: "Build Obby", description: "Multi-stage obstacle course with checkpoints, lives, kill bricks, moving parts, and completion rewards.", estTime: "60–120s", affectsProject: true, credits: "60" },
  "Build Horror": { title: "Build Horror", description: "Horror experience with atmospheric lighting, jumpscares, monster AI, scripted events, and escape objectives.", estTime: "90–180s", affectsProject: true, credits: "80" },
  "Build FPS": { title: "Build FPS", description: "First-person shooter with gun models, raycast hit detection, recoil, ammo, kill feed, and respawn logic.", estTime: "90–180s", affectsProject: true, credits: "90" },
  "Build Racing": { title: "Build Racing", description: "Vehicle racing game with driveable cars, lap counter, checkpoints, positions, and a finish-line podium.", estTime: "60–120s", affectsProject: true, credits: "60" },
  "Build Tower Defense": { title: "Build Tower Defense", description: "Tower defense with wave spawning, tower placement grid, upgrade system, enemy path AI, and round progression.", estTime: "90–180s", affectsProject: true, credits: "90" },
  "Build Survival": { title: "Build Survival", description: "Survival game with hunger/health, resource gathering, crafting, enemy spawns, day/night cycle, and base building.", estTime: "120–240s", affectsProject: true, credits: "100" },
  "Build Farming": { title: "Build Farming", description: "Farming sim with plant plots, growth timers, harvest mechanics, selling system, and farm expansion upgrades.", estTime: "60–120s", affectsProject: true, credits: "60" },
  "Build Mining": { title: "Build Mining", description: "Mining game with ore veins, pickaxe tools, inventory, selling NPCs, cave generation, and depth progression.", estTime: "60–120s", affectsProject: true, credits: "60" },
  "Build Fishing": { title: "Build Fishing", description: "Fishing game with rod mechanic, fish rarity tiers, fish book, selling dock, weather effects, and bait system.", estTime: "45–90s", affectsProject: true, credits: "50" },

  // ── Assets ────────────────────────────────────────────────────────────────
  "Generate Icon": { title: "Generate Icon", description: "Creates a high-quality 512x512 Roblox game icon matching your game theme and style.", estTime: "10–20s", affectsProject: false, credits: "10" },
  "Generate Thumbnail": { title: "Generate Thumbnail", description: "Creates a 1920x1080 Roblox game thumbnail with characters, environment, and a branded title treatment.", estTime: "10–20s", affectsProject: false, credits: "15" },
  "Generate Loading Screen": { title: "Generate Loading Screen", description: "Designs an animated loading screen with your game logo, progress bar, and tip rotator.", estTime: "15–30s", affectsProject: true, credits: "10" },
  "Add Terrain": { title: "Add Terrain", description: "Generates sculpted terrain matching your game type — hills, rivers, caves, or flat starter islands.", estTime: "30–60s", affectsProject: true, credits: "30" },
  "Add Sounds": { title: "Add Sounds", description: "Adds ambient SoundService audio, music tracks, UI click sounds, and in-world proximity sounds.", estTime: "10–20s", affectsProject: true, credits: "10" },
  "Add Particles": { title: "Add Particles", description: "Attaches particle emitters to key objects — fires, sparkles, magic auras, footstep dust, and rain.", estTime: "10–20s", affectsProject: true, credits: "10" },
  "Add Lighting": { title: "Add Lighting", description: "Sets premium Lighting properties, atmospheric Atmosphere fog, and ColorCorrectionEffect for your game's mood.", estTime: "5–15s", affectsProject: true, credits: "5" },
};

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_0_22px_rgba(59,130,246,0.35)] ${className}`}
    >
      <Sparkles className="h-1/2 w-1/2" />
    </span>
  );
}

/** Dynamic status text per action (small chip shown under button label). */
function statusFor(label: string, ctx: { pluginOnline: boolean; failed: number; total: number; pending: number; busy: boolean }): string | null {
  if (ctx.busy && (label === "Build Full Game" || label === "Make It Playable")) return "Building…";
  switch (label) {
    case "Fix Errors": return ctx.failed > 0 ? `${ctx.failed} issue${ctx.failed === 1 ? "" : "s"} found` : "Nothing broken";
    case "Scan Game": return ctx.total > 0 ? `${ctx.total} action${ctx.total === 1 ? "" : "s"} tracked` : "Ready";
    case "Make It Playable": return ctx.pluginOnline ? "Plugin ready" : "Plugin offline";
    case "Build Full Game": return ctx.pluginOnline ? "Ready" : "Plugin offline";
    case "AI Playtest": return ctx.pluginOnline ? "Plugin ready" : "Plugin offline";
    case "Organize": return ctx.pending > 0 ? `${ctx.pending} pending` : "Idle";
    default: return null;
  }
}


const CATEGORIES: Array<{ title: string; icon: IconT; tone: string; items: Array<{ label: string; icon: IconT }> }> = [
  {
    title: "Build",
    icon: Hammer,
    tone: "var(--bs-primary)",
    items: [
      { label: "Build Full Game", icon: Rocket },
      { label: "Make It Playable", icon: PlayCircle },
      { label: "Build Map", icon: Hammer },
      { label: "Generate UI", icon: LayoutDashboard },
      { label: "Add NPCs", icon: Bot },
      { label: "Add Currency", icon: Crown },
    ],
  },
  {
    title: "Game Systems",
    icon: Database,
    tone: "#06b6d4",
    items: [
      { label: "Add Combat System", icon: Sword },
      { label: "Add Pet System", icon: Star },
      { label: "Add Quest System", icon: Trophy },
      { label: "Add Inventory", icon: Package },
      { label: "Add Shop", icon: ShoppingCart },
      { label: "Add Trading", icon: Store },
      { label: "Add Crafting", icon: Wrench },
      { label: "Add Skills", icon: Zap },
      { label: "Add Leaderboards", icon: Trophy },
      { label: "Add Daily Rewards", icon: Gift },
      { label: "Add Data Saving", icon: Database },
      { label: "Add Gamepasses", icon: Crown },
    ],
  },
  {
    title: "Game Genres",
    icon: Globe,
    tone: "#f59e0b",
    items: [
      { label: "Build Tycoon", icon: Building2 },
      { label: "Build Simulator", icon: Gauge },
      { label: "Build RPG", icon: Swords },
      { label: "Build Obby", icon: Mountain },
      { label: "Build Horror", icon: Ghost },
      { label: "Build FPS", icon: Crosshair },
      { label: "Build Racing", icon: Car },
      { label: "Build Tower Defense", icon: Shield },
      { label: "Build Survival", icon: Flame },
      { label: "Build Farming", icon: Leaf },
      { label: "Build Mining", icon: Pickaxe },
      { label: "Build Fishing", icon: Fish },
    ],
  },
  {
    title: "Assets",
    icon: Palette,
    tone: "#ec4899",
    items: [
      { label: "Generate Icon", icon: ImageIcon },
      { label: "Generate Thumbnail", icon: ImageIcon },
      { label: "Generate Loading Screen", icon: ImageIcon },
      { label: "Add Terrain", icon: Trees },
      { label: "Add Sounds", icon: Music },
      { label: "Add Particles", icon: Sparkles },
      { label: "Add Lighting", icon: Flame },
    ],
  },
  {
    title: "Improve",
    icon: Wand2,
    tone: "#8b5cf6",
    items: [
      { label: "Fix Errors", icon: Bug },
      { label: "Optimize Performance", icon: Gauge },
      { label: "Fix UI", icon: LayoutDashboard },
      { label: "Fix Mobile", icon: Gauge },
      { label: "Organize", icon: Box },
      { label: "Make Premium", icon: Crown },
    ],
  },
  {
    title: "Test",
    icon: Bug,
    tone: "#eab308",
    items: [
      { label: "AI Playtest", icon: PlayCircle },
      { label: "Scan Game", icon: ScanLine },
      { label: "Safety Scan", icon: ShieldCheck },
      { label: "Test Game", icon: Zap },
    ],
  },
  {
    title: "Publish",
    icon: Upload,
    tone: "#22c55e",
    items: [
      { label: "Publish Checklist", icon: BookOpen },
      { label: "Final Report", icon: FileCode },
      { label: "Update Generator", icon: Sparkles },
      { label: "Community Share", icon: Upload },
    ],
  },
];

const WORKERS: Array<{ label: string; icon: IconT; job: string }> = [
  { label: "Planner", icon: Lightbulb, job: "Breaks down your goal" },
  { label: "World Builder", icon: Hammer, job: "Terrain & map layout" },
  { label: "Lua Engineer", icon: FileCode, job: "Scripts, remotes, systems" },
  { label: "UI Designer", icon: LayoutDashboard, job: "Menus, HUD, mobile" },
  { label: "Toolbox Search", icon: Box, job: "Safe free assets" },
  { label: "QA Tester", icon: Bug, job: "Scans & playtest reports" },
  { label: "Optimizer", icon: Gauge, job: "Perf & cleanup" },
  { label: "NPC AI", icon: Bot, job: "Characters & pathfinding" },
  { label: "Systems Architect", icon: Database, job: "DataStore & remotes" },
  { label: "Asset Hunter", icon: Package, job: "Models & sound assets" },
  { label: "Script Auditor", icon: ShieldCheck, job: "Error & exploit checks" },
  { label: "Perf Engineer", icon: Zap, job: "Memory & render budget" },
];

export function LiveWorkspaceHome({
  name, project, pluginOnline, credits, maxCredits, isAdmin, modelLabel,
  actions, busy, onPrompt, onAction, templates,
}: Props) {
  const display = (name || "builder").charAt(0).toUpperCase() + (name || "builder").slice(1);
  const stats = useMemo(() => {
    try {
      const list = Array.isArray(actions) ? actions : [];
      const total = list.length;
      const done = list.filter((a) => a?.status === "done").length;
      const failed = list.filter((a) => a?.status === "failed").length;
      const pending = list.filter((a) => a?.status === "pending" || a?.status === "sent").length;
      const health = total === 0 ? 100 : Math.max(0, Math.round((done / Math.max(total, 1)) * 100));
      const quality = failed === 0 ? Math.min(100, 70 + done * 2) : Math.max(20, 90 - failed * 8);
      return { total, done, failed, pending, health, quality };
    } catch (err) {
      console.error("[LiveWorkspaceHome] stats compute failed", err);
      return { total: 0, done: 0, failed: 0, pending: 0, health: 100, quality: 100 };
    }
  }, [actions]);

  const recent = Array.isArray(actions) ? actions.slice(0, 6) : [];
  const activeWorker = busy
    ? (stats.pending > 0 ? "Lua Engineer" : "Planner")
    : null;

  const safeTemplates = Array.isArray(templates) ? templates.filter((t) => t && typeof t.prompt === "string" && typeof t.label === "string") : [];
  const handlePrompt = (p: string) => {
    try {
      if (typeof p !== "string" || !p.trim()) return;
      onPrompt(p);
    } catch (err) {
      console.error("[LiveWorkspaceHome] onPrompt failed", err);
    }
  };
  const handleAction = (label: string) => {
    try {
      if (!label) return;
      onAction(label);
    } catch (err) {
      console.error("[LiveWorkspaceHome] onAction failed", err);
    }
  };


  return (
    <div className="bs-msg-in flex flex-col gap-5">
      {/* HERO — Roblox-themed background */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{
          background: "linear-gradient(135deg, #0f1923 0%, #111827 40%, #0d1f3c 100%)",
          border: "1px solid rgba(99,179,237,0.18)",
          boxShadow: "0 0 60px rgba(59,130,246,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Roblox isometric grid overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)
            `,
            backgroundSize: "32px 32px",
          }}
        />
        {/* Floating Roblox-style blocks */}
        <div className="pointer-events-none absolute right-6 top-4 opacity-20" style={{ transform: "perspective(200px) rotateX(20deg) rotateZ(-15deg)" }}>
          {[["#e74c3c","#c0392b"],["#3498db","#2980b9"],["#2ecc71","#27ae60"],["#f39c12","#e67e22"]].map(([bg, shadow], i) => (
            <div key={i} className="absolute rounded-sm" style={{ width: 22, height: 22, background: bg, boxShadow: `3px 3px 0 ${shadow}`, top: i * 16, left: i * 16, animation: `float ${2.4+i*0.4}s ease-in-out ${i*0.3}s infinite alternate` }} />
          ))}
        </div>
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(99,179,237,0.3)" }}>
              <BrandMark className="bs-logo-float h-14 w-14 rounded-2xl" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(147,197,253,0.8)" }}>
                <Sparkles className="h-3 w-3 text-blue-400" /> BloxSmith Workspace
              </div>
              <h2 className="font-display truncate text-2xl font-bold sm:text-3xl" style={{ color: "#f0f8ff" }}>
                Hey {display}, ready to build?
              </h2>
              <p className="mt-1 truncate text-sm" style={{ color: "rgba(147,197,253,0.7)" }}>
                {project?.title ? `Project: ${project.title}` : "Describe your game — I'll plan, script, and ship it."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpModeToggle />
            {/* Discord invite */}
            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all hover:scale-105 hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, #5865F2, #7289DA)",
                color: "#fff",
                boxShadow: "0 2px 12px rgba(88,101,242,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
                textDecoration: "none",
              }}
              title="Join our Discord community"
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.11 18.102.12 18.12c2.061 1.514 4.057 2.433 6.021 3.04a.077.077 0 0 0 .084-.028 13.999 13.999 0 0 0 1.226-1.994.075.075 0 0 0-.041-.104 13.073 13.073 0 0 1-1.872-.892.077.077 0 0 1-.008-.127c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.105c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028c1.976-.607 3.972-1.526 6.033-3.04a.077.077 0 0 0 .031-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Join Discord
            </a>
            <StatusPill
              icon={Radio}
              label={pluginOnline ? "Studio online" : "Studio offline"}
              tone={pluginOnline ? "#22c55e" : "#ef4444"}
            />
            {activeWorker && (
              <StatusPill icon={Loader2} label={activeWorker} tone="var(--bs-primary)" spin />
            )}
          </div>
        </div>
      </div>

      {/* STAT STRIP */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Project Health" value={`${stats.health}%`} icon={Activity} tone="#22c55e" bar={stats.health} />
        <StatCard label="Build Quality" value={`${stats.quality}%`} icon={ShieldCheck} tone="var(--bs-primary)" bar={stats.quality} />
        <StatCard label="Studio Actions" value={String(stats.total)} icon={CheckCircle2} tone="#8b5cf6" hint={`${stats.done} done · ${stats.pending} live`} />
        <StatCard
          label={isAdmin ? "Credits" : "Credits Today"}
          value={isAdmin ? "∞" : String(credits)}
          icon={Zap}
          tone="#eab308"
          hint={isAdmin ? "Owner" : `${maxCredits} max`}
          bar={isAdmin ? undefined : Math.round((credits / Math.max(maxCredits, 1)) * 100)}
        />
      </div>

      {/* WORKERS + ACTIVITY */}
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="bs-card rounded-2xl p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> AI Workers
            </div>
            <span className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              {modelLabel ?? "Auto-routed"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {WORKERS.map((w) => {
              const active = activeWorker === w.label;
              return (
                <div
                  key={w.label}
                  className="bs-soft rounded-xl p-2.5"
                  style={active ? { borderColor: "color-mix(in oklab, var(--bs-primary) 45%, transparent)", background: "color-mix(in oklab, var(--bs-primary) 8%, transparent)" } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: active ? "var(--bs-primary)" : "var(--bs-card)", color: active ? "var(--bs-primary-fg)" : "var(--bs-primary)" }}>
                      {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <w.icon className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold">{w.label}</div>
                      <div className="truncate text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>{active ? "Working…" : w.job}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bs-card rounded-2xl p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Timer className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> Recent Activity
            </div>
            <span className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              {stats.total} total
            </span>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-[12px]" style={{ borderColor: "var(--bs-border)", color: "var(--bs-muted-fg)" }}>
              No Studio actions yet. Your build timeline will appear here.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((a, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]" style={{ background: "var(--bs-card-2)" }}>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background:
                        a.status === "done" ? "#22c55e"
                        : a.status === "failed" ? "#ef4444"
                        : a.status === "sent" ? "var(--bs-primary)"
                        : "#eab308",
                    }}
                  />
                  <span className="truncate font-medium">{a.kind || "action"}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{a.status || "…"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* QUICK ACTIONS BY CATEGORY */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <div key={cat.title} className="bs-card rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${cat.tone} 15%, transparent)`, color: cat.tone }}>
                <cat.icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-semibold">{cat.title}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {cat.items.map((it) => {
                const help = ACTION_HELP[it.label];
                const status = statusFor(it.label, { pluginOnline, failed: stats.failed, total: stats.total, pending: stats.pending, busy: !!busy });
                const recommended = help?.recommended;
                return (
                  <SmartTooltip
                    key={it.label}
                    help={help ?? { title: it.label, description: `Run ${it.label} on the current project.`, affectsProject: true }}
                  >
                    <button
                      onClick={() => handleAction(it.label)}
                      className="group flex flex-col rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-all hover:translate-x-0.5"
                      style={{
                        background: "var(--bs-card-2)",
                        border: "1px solid",
                        borderColor: recommended ? "color-mix(in oklab, var(--bs-primary) 45%, transparent)" : "var(--bs-border)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <it.icon className="h-3.5 w-3.5 shrink-0" style={{ color: cat.tone }} />
                        <span className="truncate">{it.label}</span>
                        {status && (
                          <span
                            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                            style={{ background: "color-mix(in oklab, var(--bs-primary) 12%, transparent)", color: "var(--bs-primary)" }}
                          >
                            {status}
                          </span>
                        )}
                        {!status && <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />}
                      </div>
                      {help?.description && (
                        <HelpCaption text={help.description} badge={recommended ? "Recommended" : undefined} />
                      )}
                    </button>
                  </SmartTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* TEMPLATES */}
      <div className="bs-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" style={{ color: "var(--bs-primary)" }} /> Popular Templates
          </div>
          <span className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>One-tap full game</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {safeTemplates.slice(0, 12).map((t) => (
            <SmartTooltip
              key={t.label}
              help={{
                title: t.label,
                description: `One-tap prompt that plans and builds a complete ${t.label} using safe Toolbox assets and full systems.`,
                useWhen: "You want a themed, playable starting point in minutes.",
                generates: "Map, scripts, UI, remotes, save, mobile, scan report.",
                estTime: "60–180s",
                affectsProject: true,
                credits: "50–150",
              }}
            >
              <button
                onClick={() => handlePrompt(t.prompt)}
                className="group relative overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5"
                style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-60" style={{ background: "var(--bs-grad)" }} />
                <div className="relative flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
                  <span className="truncate text-[12px] font-semibold">{t.label}</span>
                </div>
                <div className="relative mt-1 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>
                  Full game pack
                </div>
              </button>
            </SmartTooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, hint, bar }: {
  label: string; value: string; icon: IconT; tone: string; hint?: string; bar?: number;
}) {
  return (
    <div className="bs-card rounded-2xl p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color: tone }} />
      </div>
      <div className="mt-1 font-display text-2xl font-bold" style={{ color: tone }}>{value}</div>
      {hint && <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{hint}</div>}
      {typeof bar === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: tone }} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ icon: Icon, label, tone, spin }: { icon: IconT; label: string; tone: string; spin?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{
        borderColor: `color-mix(in oklab, ${tone} 40%, transparent)`,
        background: `color-mix(in oklab, ${tone} 12%, transparent)`,
        color: tone,
      }}
    >
      <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

export function ChatStatusBar({
  pluginOnline, modelLabel, credits, maxCredits, isAdmin, queued, busy, buildLabel,
}: {
  pluginOnline: boolean;
  modelLabel: string;
  credits: number;
  maxCredits: number;
  isAdmin: boolean;
  queued: number;
  busy: boolean;
  buildLabel: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-1.5 text-[11px] font-medium"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)", color: "var(--bs-muted-fg)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: pluginOnline ? "#22c55e" : "#ef4444" }} />
        {pluginOnline ? "Plugin connected" : "Plugin offline"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Cpu className="h-3 w-3" /> {modelLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Zap className="h-3 w-3" /> {isAdmin ? "∞ credits" : `${credits}/${maxCredits} credits`}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Box className="h-3 w-3" /> Live: {queued}
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 truncate" style={{ color: busy ? "var(--bs-primary)" : "var(--bs-muted-fg)" }}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        <span className="truncate">{buildLabel}</span>
      </span>
    </div>
  );
}
