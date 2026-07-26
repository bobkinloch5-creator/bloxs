import { Link, useRouterState } from "@tanstack/react-router";
import bloxsmithMascot from "@/assets/bloxsmith-mascot.png.asset.json";
import { useEffect, useState } from "react";
import {
  Users, Plug, Folder, Wand2, Gift, Hammer,
  History as HistoryIcon, BookOpen, Settings as SettingsIcon, Crown, Box, LayoutDashboard,
  Menu, X, Home as HomeIcon, CreditCard, Heart, Globe,
} from "lucide-react";

type Item = { label: string; to: string; icon: any };

const CORE: Item[] = [
  { label: "Home",           to: "/dashboard",     icon: HomeIcon },
  { label: "Front Page",     to: "/",              icon: Globe },
  { label: "Projects",       to: "/projects",      icon: Folder },
  { label: "3D Models",      to: "/models",        icon: Box },
  { label: "UI Generator",   to: "/ui-generator",  icon: LayoutDashboard },
  { label: "Game Builder",   to: "/builder",       icon: Hammer },
  { label: "Studio Plugin",  to: "/plugin",        icon: Plug },
  { label: "MCP / Tools",    to: "/mcp",           icon: Wand2 },
  { label: "Community",      to: "/collaborators", icon: Users },
  { label: "Invite Friends", to: "/referrals",     icon: Gift },
];

const INT: Item[] = [
  { label: "History",  to: "/history",  icon: HistoryIcon },
  { label: "Docs",     to: "/docs",     icon: BookOpen },
  { label: "Credits",  to: "/settings", icon: CreditCard },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];

export function MobileNavTrigger({ isAdmin, className = "" }: { isAdmin?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape closes the drawer - expected behaviour for any modal surface.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-indigo-500/20 bg-white/[0.04] text-white/80 transition active:scale-95 hover:border-indigo-400/40 hover:bg-white/[0.08] hover:text-white ${className}`}
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="vapor-scrim absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <aside className="vapor-drawer vapor-frost absolute left-0 top-0 flex h-full w-[86vw] max-w-[330px] flex-col overflow-y-auto border-r border-indigo-500/25 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[24px_0_60px_-30px_rgba(79,70,229,0.9)]">
            <div className="flex items-center justify-between">
              <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <span className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-indigo-500/50 to-cyan-400/40 opacity-70 blur-md" />
                  <img src={bloxsmithMascot.url} alt="BloxSmith" className="relative h-9 w-9 rounded-lg object-contain" />
                </span>
                <span className="vapor-title text-lg font-bold">BloxSmith</span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/70 transition active:scale-95 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-6 space-y-6">
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-400/15 to-transparent px-3 py-2.5 text-sm font-medium text-amber-200"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-amber-300/30 bg-amber-400/15">
                    <Crown className="h-4 w-4" />
                  </span>
                  Owner Admin
                </Link>
              )}
              <NavGroup label="Core Suite" items={CORE} pathname={pathname} onPick={() => setOpen(false)} />
              <NavGroup label="Integration" items={INT} pathname={pathname} onPick={() => setOpen(false)} />
            </nav>

            <div className="mt-6 space-y-2">
              <Link
                to="/donate"
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-pink-400/30 bg-pink-500/10 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-pink-200 transition active:scale-[0.98] hover:bg-pink-500/20 hover:text-white"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                <Heart className="h-3.5 w-3.5" /> Donate
              </Link>
              <a
                href="https://discord.gg/6QDYT3RUkv"
                target="_blank"
                rel="noreferrer"
                className="vapor-ghost-btn flex min-h-[48px] items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.18em]"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                Join Discord
              </a>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function NavGroup({
  label, items, onPick, pathname,
}: { label: string; items: Item[]; onPick: () => void; pathname?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-2">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/60"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          {label}
        </span>
        <span className="vapor-rule flex-1" />
      </div>
      <div className="space-y-1">
        {items.map((n) => {
          const Icon = n.icon;
          // The drawer previously had no active state at all, so you could not
          // tell which page you were on.
          const active = pathname === n.to || (n.to !== "/dashboard" && !!pathname?.startsWith(n.to));
          return (
            <Link
              key={n.label}
              to={n.to as any}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className={`vapor-nav-item min-h-[48px] text-[15px] ${active ? "vapor-nav-active" : ""}`}
            >
              <span className="vapor-nav-icon h-8 w-8">
                <Icon className="h-4 w-4" />
              </span>
              {n.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
