import { useEffect, useRef, useState } from "react";
import { Bell, Box, CheckCircle2, ImageIcon, ShieldCheck, Sparkles, Wrench } from "lucide-react";

const CHANGELOG_VERSION = "2026-06-28-execution-pipeline";

const CHANGELOG_ITEMS = [
  {
    title: "Verified execution pipeline",
    date: "Jun 28",
    icon: CheckCircle2,
    body: "BloxSmith now documents and drives a stronger chat-to-plugin flow: plan, Toolbox search, preview, Studio execution, scan, fix, test, polish, and final report, with clearer plugin status messages for each stage.",
  },
  {
    title: "50 real builder functions",
    date: "Jun 28",
    icon: Sparkles,
    body: "Added a full BloxSmith function catalog with direct controls for full games, maps, quests, currency, shops, saves, gamepasses, enemies, weapons, vehicles, pets, teleports, rounds, admin tools, performance, safety scans, updates, project memory, and final reports.",
  },
  {
    title: "Smarter Roblox brain",
    date: "Jun 28",
    icon: Sparkles,
    body: "BloxSmith now follows a stronger Think, Inspect, Plan, Build, Test, Fix, Polish workflow with project context, asset scoring, specialized agents, and stronger no-unfinished-system rules.",
  },
  {
    title: "Complete builder controls",
    date: "Jun 28",
    icon: Sparkles,
    body: "Added build quality modes, starter game packs, one-click fix buttons, full game checklist, and asset preview actions for Insert, Replace, and Search Again.",
  },
  {
    title: "Toolbox insertion proof",
    date: "Jun 28",
    icon: ShieldCheck,
    body: "The Studio plugin now verifies inserted assets have visible 3D content, bounds, texture/mesh signals, safe scripts, clean grounding, duplicate protection, and clearer success/failure reports.",
  },
  {
    title: "Better map layout planning",
    date: "Jun 28",
    icon: Sparkles,
    body: "Map builds now plan roads/paths first, buildings second, gameplay anchors third, characters and vehicles fourth, and props/nature/lighting last for cleaner Roblox-ready placement.",
  },
  {
    title: "Full Roblox builder brain",
    date: "Jun 28",
    icon: Sparkles,
    body: "BloxSmith now has stronger instructions for complete maps, obbies, tycoons, zombie survival, racing, simulators, roleplay towns, dungeons, arenas, horror maps, pet worlds, scripts, UI, scanning, fixing, and polish.",
  },
  {
    title: "More varied real Toolbox assets",
    date: "Jun 28",
    icon: Box,
    body: "Safe Toolbox searches now rotate among top matching free/public assets and pass extra fallback IDs, so city, town, forest, vehicle, weapon, NPC, and prop requests should not keep reusing the same asset every time.",
  },
  {
    title: "Toolbox Only Mode is now the default",
    date: "Jun 28",
    icon: ShieldCheck,
    body: "BloxSmith now prioritizes real free/public Roblox Creator Store assets and blocks procedural placeholder models when Toolbox-only mode is active.",
  },
  {
    title: "Real Toolbox Asset Finder",
    date: "Jun 28",
    icon: Box,
    body: "Prompts like pistol, sports car, zombie, police station, tree, house, NPC, prop, weapon, or vehicle now search safe Toolbox results and insert real matching assets.",
  },
  {
    title: "Cleaner map building",
    date: "Jun 28",
    icon: Sparkles,
    body: "City, town, forest, road, roleplay, and map prompts now use real assets, organize them into folders, ground-snap placement, anchor parts, disable imported scripts, and scan after insertion.",
  },
  {
    title: "Safer retries and reporting",
    date: "Jun 28",
    icon: CheckCircle2,
    body: "Inserted assets carry name, ID, creator, category, quality, safety, relevance, and source-query metadata so the plugin can log exactly what worked.",
  },
  {
    title: "UI previews match generated Luau",
    date: "Jun 27",
    icon: ImageIcon,
    body: "The UI Generator preview image and copy/download Luau now come from the same blueprint so the Roblox UI should match the preview much more closely.",
  },
  {
    title: "Loading screens vary now",
    date: "Jun 28",
    icon: Wrench,
    body: "Loading screens no longer repeat the same plain BloxSmith layout. The generator and Studio build guard now produce different clean layouts based on the prompt.",
  },
];

export function ChangelogNotifications({
  buttonClassName = "bs-icon-btn",
  iconClassName = "h-4 w-4",
}: {
  buttonClassName?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSeen(localStorage.getItem("bloxsmith:changelog:seen") === CHANGELOG_VERSION);
  }, []);

  useEffect(() => {
    if (!open) return;
    localStorage.setItem("bloxsmith:changelog:seen", CHANGELOG_VERSION);
    setSeen(true);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`${buttonClassName} relative`}
        title="Notifications"
        aria-label="Notifications and changelog"
        aria-expanded={open}
      >
        <Bell className={iconClassName} />
        {!seen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--bs-danger)" }} />}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border shadow-2xl"
          style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--bs-border)" }}>
            <div className="text-sm font-bold">BloxSmith updates</div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--bs-muted-fg)" }}>
              Latest changelog for Studio execution, Toolbox assets, and UI generation.
            </div>
          </div>

          <div className="max-h-[470px] overflow-y-auto p-2">
            {CHANGELOG_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-xl px-3 py-3 transition hover:bg-[var(--bs-card-2)]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: "var(--bs-primary-soft)", color: "var(--bs-primary)" }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold leading-snug">{item.title}</div>
                        <div className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{item.date}</div>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bs-muted-fg)" }}>{item.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
