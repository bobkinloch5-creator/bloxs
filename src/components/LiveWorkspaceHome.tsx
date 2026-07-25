import { useMemo } from "react";
import {
  Sparkles, Radio, Cpu, Wrench, Box, BookOpen, Bot, Hammer, FileCode,
  LayoutDashboard, Gauge, Bug, ScanLine, PlayCircle, Zap, Crown, Lightbulb,
  Upload, ImageIcon, Timer, ArrowRight, Activity, CheckCircle2, Rocket,
  Wand2, ShieldCheck, Loader2,
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
      {/* HERO */}
      <div className="bs-card relative overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl" style={{ background: "var(--bs-grad)" }} />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full opacity-20 blur-3xl" style={{ background: "var(--bs-primary)" }} />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
              <BrandMark className="bs-logo-float h-14 w-14 rounded-2xl" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
                <Sparkles className="h-3 w-3" style={{ color: "var(--bs-primary)" }} /> BloxSmith Workspace
              </div>
              <h2 className="font-display truncate text-2xl font-bold sm:text-3xl">
                Hey {display}, ready to build?
              </h2>
              <p className="mt-1 truncate text-sm" style={{ color: "var(--bs-muted-fg)" }}>
                {project?.title ? `Project: ${project.title}` : "Describe your game — I'll plan, script, and ship it."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpModeToggle />
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
