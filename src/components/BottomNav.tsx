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
      className="vapor-frost fixed inset-x-0 bottom-0 z-40 border-t border-indigo-500/20 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_40px_-28px_rgba(79,70,229,0.9)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-[520px] grid-cols-5">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = it.match(pathname);
          return (
            <li key={it.label}>
              <Link
                to={it.to as any}
                aria-current={active ? "page" : undefined}
                className={`vapor-tab flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2.5 text-[10px] font-semibold transition active:scale-95 ${
                  active ? "vapor-tab-active" : "text-slate-400 active:text-white"
                }`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                    active
                      ? "bg-gradient-to-br from-indigo-500/40 to-cyan-400/25 text-cyan-200 shadow-[0_0_16px_-2px_rgba(103,232,249,0.55)]"
                      : ""
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
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
