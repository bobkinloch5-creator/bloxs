import { Link, useRouterState } from "@tanstack/react-router";
import bloxsmithMascot from "@/assets/bloxsmith-mascot.png.asset.json";
import { ReactNode, useEffect, useState } from "react";
import { MobileNavTrigger } from "./MobileNav";
import { ProfileMenu, DiscordIcon } from "./ProfileMenu";
import { CreditsPill, CreditsSidebarCard } from "./CreditsWidget";
import {
  Folder, Users, Plug, Wand2, Heart,
  Hammer,
  History as HistoryIcon, BookOpen, Settings as SettingsIcon, Crown, Box, LayoutDashboard, Globe,
} from "lucide-react";

type Accent = "default" | "chat" | "admin" | "mcp" | "history" | "plugin" | "settings" | "collaborators";

type NavItem = { key: string; label: string; to: string; icon: typeof Folder; accent: Accent };

const NAV_CORE: NavItem[] = [
  { key: "frontpage", label: "Front Page",   to: "/",               icon: Globe,           accent: "default" },
  { key: "proj",      label: "Projects",     to: "/projects",      icon: Folder,          accent: "default" },
  { key: "models",    label: "3D Models",    to: "/models",        icon: Box,             accent: "chat" },
  { key: "uigen",     label: "UI Generator", to: "/ui-generator",  icon: LayoutDashboard, accent: "chat" },
  { key: "builder",   label: "Game Builder", to: "/builder",       icon: Hammer,          accent: "chat" },
  { key: "co",        label: "Collaborators",to: "/collaborators", icon: Users,           accent: "collaborators" },
];

const NAV_INTEGRATION: NavItem[] = [
  { key: "plug",    label: "Studio Plugin", to: "/plugin",      icon: Plug,         accent: "plugin" },
  { key: "mcp",     label: "MCP / Tools",   to: "/mcp",         icon: Wand2,        accent: "mcp" },
  { key: "mcp-srv", label: "MCP Servers",   to: "/mcp-servers", icon: Wand2,        accent: "mcp" },
  { key: "hist",    label: "History",       to: "/history",     icon: HistoryIcon,  accent: "history" },
  { key: "docs",    label: "Docs",          to: "/docs",        icon: BookOpen,     accent: "default" },
  { key: "set",     label: "Settings",      to: "/settings",    icon: SettingsIcon, accent: "settings" },
];

import { LanguageHeaderSelector } from "./LanguageHeaderSelector";

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
  // The header condenses once the page scrolls, so long pages get room back
  // and the title stops competing with the content.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen w-full text-foreground" style={{ fontFamily: "Rubik, sans-serif" }}>
      <div className="flex">
        {sidebar ?? <VaporSidebar isAdmin={!!isAdmin} activeKey={activeKey} />}
        <div className="min-w-0 flex-1">
          <header
            className={`vapor-frost vapor-hairline-b sticky top-0 z-30 flex items-center gap-3 px-4 transition-all duration-300 sm:px-8 ${
              scrolled ? "py-2.5 sm:py-3" : "py-4 sm:py-5"
            }`}
          >
            <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1
                className={`vapor-title truncate font-bold transition-all duration-300 ${
                  scrolled ? "text-lg sm:text-2xl" : "text-xl sm:text-3xl md:text-4xl"
                }`}
              >
                {title}
              </h1>
              {description && (
                <p
                  className={`truncate text-xs text-muted-foreground transition-all duration-300 sm:text-sm ${
                    scrolled ? "mt-0 max-h-0 opacity-0" : "mt-1 max-h-6 opacity-100"
                  }`}
                >
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div>}
            <CreditsPill className="hidden sm:inline-flex" />
            <Link
              to="/"
              title="Go to Front Page"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 transition hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-white sm:inline-flex"
            >
              <Globe className="h-3 w-3 text-indigo-300" /> Front Page
            </Link>
            <Link
              to="/donate"
              title="Support BloxSmith"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1.5 text-[11px] font-semibold text-pink-200 transition hover:border-pink-400/60 hover:bg-pink-500/20 hover:text-white hover:shadow-[0_0_18px_-4px_rgba(244,114,182,0.7)] sm:inline-flex"
            >
              <Heart className="h-3 w-3" /> Donate
            </Link>
            <LanguageHeaderSelector />
            <ProfileMenu />
          </header>

          <main
            className={`mx-auto grid max-w-[1600px] gap-6 px-4 py-6 pb-24 sm:px-8 sm:py-8 lg:pb-8 ${
              rightPanel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""
            }`}
          >
            <div className="vapor-rise vapor-rise-1 min-w-0 space-y-6">
              {actions && <div className="flex flex-wrap items-center gap-2 md:hidden">{actions}</div>}
              {children}
            </div>
            {rightPanel && <aside className="vapor-rise vapor-rise-2 space-y-4">{rightPanel}</aside>}
          </main>
        </div>
      </div>
    </div>
  );
}

import { useT } from "@/lib/i18n";

function VaporSidebar({ isAdmin, activeKey }: { isAdmin: boolean; activeKey?: string }) {
  const t = useT();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // We don't have pluginOnline here, but we can show a static pill that users can see
  return (
    <aside className="vapor-frost sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-indigo-500/20 lg:flex" style={{ background: "#06061a" }}>
      <Link to="/dashboard" className="group flex items-center gap-3 px-6 py-6 border-b border-indigo-500/10">
        <span className="relative shrink-0">
          <span className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-indigo-500/60 to-cyan-400/50 opacity-50 blur-lg transition-opacity duration-300 group-hover:opacity-90" />
          <img
            src={bloxsmithMascot.url}
            alt="BloxSmith"
            className="relative h-10 w-10 rounded-xl object-contain transition-transform duration-300 group-hover:scale-110"
          />
        </span>
        <div className="min-w-0">
          <span className="vapor-title text-xl font-bold text-white">BloxSmith</span>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/70">Pro Workspace</div>
        </div>
      </Link>

      <nav className="scrollbar-thin flex-1 space-y-7 overflow-y-auto px-5 py-5">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-400/15 to-transparent px-3 py-2.5 text-sm font-medium text-amber-200 transition hover:border-amber-300/60 hover:from-amber-400/25 hover:text-amber-100"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-amber-300/30 bg-amber-400/15">
              <Crown className="h-3.5 w-3.5" />
            </span>
            Owner Admin
          </Link>
        )}

        <NavGroup label={t("Core Suite")} items={NAV_CORE} activeKey={activeKey} pathname={pathname} />
        <NavGroup label={t("Integration")} items={NAV_INTEGRATION} activeKey={activeKey} pathname={pathname} />
      </nav>

      <div className="space-y-2 border-t border-indigo-500/10 p-4" style={{ background: "rgba(255,255,255,0.015)" }}>
        <CreditsSidebarCard className="mb-2" />
        {/* Plugin status indicator */}
        <div className="mb-2 flex items-center justify-between rounded-xl border border-indigo-500/20 px-3 py-2" style={{ background: "#0a0a20" }}>
          <span className="text-[11px] font-bold text-slate-300">{t("Studio Plugin")}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-500 animate-pulse" />
            {t("Check status")}
          </span>
        </div>
        <ProfileMenu />
        <a
          href="https://discord.gg/YJ8xPFNSSX"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/20 hover:text-white"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          <DiscordIcon className="h-3.5 w-3.5" /> {t("Community")}
        </a>
      </div>
    </aside>
  );
}

function NavGroup({
  label, items, activeKey, pathname,
}: { label: string; items: NavItem[]; activeKey?: string; pathname?: string }) {
  const t = useT();
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
          const active = activeKey ? activeKey === n.key : !!pathname?.startsWith(n.to);
          return (
            <Link
              key={n.key}
              to={n.to as any}
              aria-current={active ? "page" : undefined}
              className={`vapor-nav-item ${active ? "vapor-nav-active" : ""}`}
              style={active ? {
                boxShadow: "0 0 20px -6px rgba(99,102,241,0.8)",
                background: "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))",
                borderLeft: "2px solid rgba(99,102,241,0.8)",
              } : undefined}
            >
              <span className={`vapor-nav-icon ${active ? "text-cyan-300" : ""}`}>
                <Icon className="h-4 w-4" />
              </span>
              {t(n.label)}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />}
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
    <div className="vapor-card reveal is-revealed p-10 text-center">
      <div className="float-y mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-indigo-500/25 to-cyan-400/20 text-cyan-200 shadow-[0_0_30px_-8px_rgba(103,232,249,0.6)]">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
