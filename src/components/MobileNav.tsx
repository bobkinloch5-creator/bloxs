import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Folder, MessageSquare, Lightbulb, LayoutDashboard, Users, Plug, Wand2,
  History as HistoryIcon, BookOpen, Settings as SettingsIcon, Crown, Box,
  Menu, X, Mic,
} from "lucide-react";

type Item = { label: string; to: string; icon: any };

const CORE: Item[] = [
  { label: "Projects",      to: "/dashboard",     icon: Folder },
  { label: "AI Chat",       to: "/chat",          icon: MessageSquare },
  { label: "Voice Agent",   to: "/voice",         icon: Mic },
  { label: "Game Ideas",    to: "/ideas",         icon: Lightbulb },
  { label: "UI Generator",  to: "/ui-generator",  icon: LayoutDashboard },
  { label: "3D Models",     to: "/models",        icon: Box },
  { label: "Collaborators", to: "/collaborators", icon: Users },
];
const INT: Item[] = [
  { label: "Studio Plugin", to: "/plugin",   icon: Plug },
  { label: "MCP / Tools",   to: "/mcp",      icon: Wand2 },
  { label: "History",       to: "/history",  icon: HistoryIcon },
  { label: "Docs",          to: "/docs",     icon: BookOpen },
  { label: "Settings",      to: "/settings", icon: SettingsIcon },
];

export function MobileNavTrigger({ isAdmin, className = "" }: { isAdmin?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-indigo-500/20 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.08] ${className}`}
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 flex h-full w-[86vw] max-w-[320px] flex-col overflow-y-auto border-r border-indigo-500/20 bg-[#0a0a1a]/95 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3">
                <div className="vapor-diamond"><i /></div>
                <span className="text-lg font-bold uppercase italic tracking-tighter text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                  BloxSmith
                </span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-6 space-y-6">
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm font-medium text-amber-200"
                >
                  <Crown className="h-4 w-4" /> Owner Admin
                </Link>
              )}
              <NavGroup label="Core Suite" items={CORE} onPick={() => setOpen(false)} />
              <NavGroup label="Integration" items={INT} onPick={() => setOpen(false)} />
            </nav>

            <a
              href="https://discord.gg/6QDYT3RUkv"
              target="_blank"
              rel="noreferrer"
              className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200 transition hover:bg-indigo-500/20 hover:text-white"
              style={{ fontFamily: "Space Mono, monospace" }}
            >
              Join Discord
            </a>
          </aside>
        </div>
      )}
    </>
  );
}

function NavGroup({ label, items, onPick }: { label: string; items: Item[]; onPick: () => void }) {
  return (
    <div>
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/60" style={{ fontFamily: "Space Mono, monospace" }}>
        {label}
      </div>
      <div className="space-y-1">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to as any}
              onClick={onPick}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4 text-white/50" /> {n.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
