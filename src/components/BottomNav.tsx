import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home as HomeIcon, Folder, Plug, Users } from "lucide-react";
import { MobileNavTrigger } from "./MobileNav";

const ITEMS = [
  { label: "Home",      to: "/dashboard",     icon: HomeIcon, match: (p: string) => p === "/dashboard" },
  { label: "Projects",  to: "/projects",      icon: Folder,   match: (p: string) => p.startsWith("/projects") },
  { label: "Plugin",    to: "/plugin",        icon: Plug,     match: (p: string) => p.startsWith("/plugin") },
  { label: "Community", to: "/collaborators", icon: Users,    match: (p: string) => p.startsWith("/collaborators") },
] as const;

/**
 * Sticky bottom navigation bar shown on phones / small tablets only.
 * Provides thumb-reachable access to the 4 primary destinations plus
 * a "More" button that opens the existing MobileNav drawer.
 *
 * Also remembers the last opened top-level page in localStorage so the
 * app can re-open where the user left off after a refresh.
 */
export function BottomNav({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    try {
      if (pathname && pathname !== "/auth") localStorage.setItem("bs:lastRoute", pathname);
    } catch {}
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a1a]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-[520px] grid-cols-5">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = it.match(pathname);
          return (
            <li key={it.label}>
              <Link
                to={it.to as any}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition ${
                  active ? "text-indigo-300" : "text-slate-400 active:text-white"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "drop-shadow-[0_0_8px_rgba(129,140,248,0.7)]" : ""}`} />
                {it.label}
              </Link>
            </li>
          );
        })}
        <li className="grid place-items-center">
          <MobileNavTrigger
            isAdmin={isAdmin}
            className="!h-11 !w-11 !border-0 !bg-transparent !text-slate-400 active:!text-white"
          />
        </li>
      </ul>
    </nav>
  );
}
