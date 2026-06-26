import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { RobloxBackdrop } from "./RobloxBackdrop";
import {
  Folder, MessageSquare, Lightbulb, LayoutDashboard, Users, Plug, Wand2,
  History as HistoryIcon, BookOpen, Settings as SettingsIcon, Crown, Hammer, Box,
} from "lucide-react";

type Accent = "default" | "chat" | "ideas" | "ui" | "admin" | "mcp" | "history" | "plugin" | "settings" | "collaborators";

const NAV: { key: string; label: string; to: string; icon: typeof Folder; accent: Accent }[] = [
  { key: "proj",  label: "Projects",      to: "/dashboard",      icon: Folder,          accent: "default" },
  { key: "chat",  label: "AI Chat",       to: "/chat",           icon: MessageSquare,   accent: "chat" },
  { key: "ideas", label: "Game Ideas",    to: "/ideas",          icon: Lightbulb,       accent: "ideas" },
  { key: "ui",    label: "UI Generator",  to: "/ui-generator",   icon: LayoutDashboard, accent: "ui" },
  { key: "models", label: "3D Models",    to: "/models",         icon: Box,             accent: "chat" },
  { key: "co",    label: "Collaborators", to: "/collaborators",  icon: Users,           accent: "collaborators" },
  { key: "plug",  label: "Studio Plugin", to: "/plugin",         icon: Plug,            accent: "plugin" },
  { key: "mcp",   label: "MCP / Tools",   to: "/mcp",            icon: Wand2,           accent: "mcp" },
  { key: "hist",  label: "History",       to: "/history",        icon: HistoryIcon,     accent: "history" },
  { key: "docs",  label: "Docs",          to: "/docs",           icon: BookOpen,        accent: "default" },
  { key: "set",   label: "Settings",      to: "/settings",       icon: SettingsIcon,    accent: "settings" },
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
    <div className="relative min-h-screen w-full text-foreground">
      {/* Backdrop is now mounted globally in __root.tsx */}
      <div className="flex">
        {sidebar ?? <DefaultSidebar isAdmin={!!isAdmin} activeKey={activeKey} />}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-black/30 px-4 py-4 backdrop-blur-xl sm:px-8">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
              {description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </header>
          <main className={`mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-8 ${rightPanel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
            <div className="min-w-0 space-y-6">{children}</div>
            {rightPanel && <aside className="space-y-4">{rightPanel}</aside>}
          </main>
        </div>
      </div>
    </div>
  );
}

function DefaultSidebar({ isAdmin, activeKey }: { isAdmin: boolean; activeKey?: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col gap-2 border-r border-white/5 bg-black/40 p-3 backdrop-blur-xl lg:flex">
      <Link to="/dashboard" className="mb-2 flex items-center gap-2.5 px-2 py-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white">
          <Hammer className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">BloxSmith</div>
          <div className="truncate text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">AI GAME BUILDER</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {isAdmin && (
          <Link
            to="/admin"
            className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10"
            activeProps={{ className: "bg-amber-400/15" }}
          >
            <Crown className="h-4 w-4" /> Owner Admin
          </Link>
        )}
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = activeKey === n.key;
          return (
            <Link
              key={n.key}
              to={n.to as any}
              className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon: typeof Folder; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
