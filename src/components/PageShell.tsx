import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { RobloxBackdrop } from "./RobloxBackdrop";
import { MobileNavTrigger } from "./MobileNav";
import { ProfileMenu, DiscordIcon } from "./ProfileMenu";
import {
  Folder, MessageSquare, Lightbulb, LayoutDashboard, Users, Plug, Wand2,
  History as HistoryIcon, BookOpen, Settings as SettingsIcon, Crown, Box, Mic,
} from "lucide-react";


type Accent = "default" | "chat" | "ideas" | "ui" | "admin" | "mcp" | "history" | "plugin" | "settings" | "collaborators";

type NavItem = { key: string; label: string; to: string; icon: typeof Folder; accent: Accent };

const NAV_CORE: NavItem[] = [
  { key: "proj",   label: "Projects",      to: "/dashboard",     icon: Folder,          accent: "default" },
  { key: "chat",   label: "AI Chat",       to: "/chat",          icon: MessageSquare,   accent: "chat" },
  { key: "voice",  label: "Voice Agent",   to: "/voice",         icon: Mic,             accent: "chat" },
  { key: "ideas",  label: "Game Ideas",    to: "/ideas",         icon: Lightbulb,       accent: "ideas" },
  { key: "ui",     label: "UI Generator",  to: "/ui-generator",  icon: LayoutDashboard, accent: "ui" },
  { key: "models", label: "3D Models",     to: "/models",        icon: Box,             accent: "chat" },
  { key: "co",     label: "Collaborators", to: "/collaborators", icon: Users,           accent: "collaborators" },
];

const NAV_INTEGRATION: NavItem[] = [
  { key: "plug",  label: "Studio Plugin", to: "/plugin",   icon: Plug,         accent: "plugin" },
  { key: "mcp",   label: "MCP / Tools",   to: "/mcp",      icon: Wand2,        accent: "mcp" },
  { key: "hist",  label: "History",       to: "/history",  icon: HistoryIcon,  accent: "history" },
  { key: "docs",  label: "Docs",          to: "/docs",     icon: BookOpen,     accent: "default" },
  { key: "set",   label: "Settings",      to: "/settings", icon: SettingsIcon, accent: "settings" },
];

export function PageShell({
  title, description, accent = "default", actions, sidebar, rightPanel, isAdmin, activeKey, children,
}: {
  title: string;
  description?: string;
  accent?: Accent;
  actions?: ReactNode;
  sidebar?: ReactNode;
  rightPanel?: ReactNode;
  isAdmin?: boolean;
  activeKey?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full text-foreground" style={{ fontFamily: "Rubik, sans-serif" }}>
      <div className="flex">
        {sidebar ?? <VaporSidebar isAdmin={!!isAdmin} activeKey={activeKey} />}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-indigo-500/10 bg-[#0a0a1a]/80 px-4 py-4 backdrop-blur-xl sm:px-8 sm:py-5">
            <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-xl font-bold tracking-tighter sm:text-3xl md:text-4xl"
                style={{ fontFamily: "Space Mono, monospace", fontStyle: "italic", textTransform: "uppercase", color: "#fff" }}
              >
                {title}
              </h1>
              {description && <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{description}</p>}
            </div>
            {actions && <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div>}
            <ProfileMenu />
          </header>

          <main className={`mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-8 sm:py-8 ${rightPanel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
            <div className="min-w-0 space-y-6">
              {actions && <div className="flex flex-wrap items-center gap-2 md:hidden">{actions}</div>}
              {children}
            </div>
            {rightPanel && <aside className="space-y-4">{rightPanel}</aside>}
          </main>

        </div>
      </div>
    </div>
  );
}

function VaporSidebar({ isAdmin, activeKey }: { isAdmin: boolean; activeKey?: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-indigo-500/15 bg-[#0a0a1a]/85 backdrop-blur-xl lg:flex">
      <Link to="/dashboard" className="flex items-center gap-3 p-7">
        <div className="vapor-diamond"><i /></div>
        <span
          className="text-2xl font-bold uppercase italic tracking-tighter text-white"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          BloxSmith
        </span>
      </Link>

      <nav className="flex-1 space-y-7 overflow-y-auto px-5">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/15"
            activeProps={{ className: "" }}
          >
            <Crown className="h-4 w-4" /> Owner Admin
          </Link>
        )}

        <NavGroup label="Core Suite" items={NAV_CORE} activeKey={activeKey} />
        <NavGroup label="Integration" items={NAV_INTEGRATION} activeKey={activeKey} />
      </nav>

      <div className="space-y-2 border-t border-indigo-500/10 bg-white/[0.02] p-4">
        <ProfileMenu />
        <a
          href="https://discord.gg/6QDYT3RUkv"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-indigo-500/15 bg-white/[0.02] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          <DiscordIcon className="h-3.5 w-3.5" /> Community
        </a>
      </div>
    </aside>
  );
}

function NavGroup({ label, items, activeKey }: { label: string; items: NavItem[]; activeKey?: string }) {
  return (
    <div>
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/60" style={{ fontFamily: "Space Mono, monospace" }}>
        {label}
      </div>
      <div className="space-y-1">
        {items.map((n) => {
          const Icon = n.icon;
          const active = activeKey === n.key;
          return (
            <Link
              key={n.key}
              to={n.to as any}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "vapor-nav-active" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-white/40 group-hover:text-cyan-200"}`} />
              {n.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon: typeof Folder; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="vapor-card p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-cyan-200">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
