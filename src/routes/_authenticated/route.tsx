import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profile.functions";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Hammer, LayoutDashboard, Plug, Settings as SettingsIcon, LogOut, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="surface-grad flex min-h-screen text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Hammer className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">BloxSmith</span>
        </Link>
        <nav className="mt-4 flex-1 space-y-1 text-sm">
          <SideLink to="/dashboard" icon={LayoutDashboard}>Projects</SideLink>
          <SideLink to="/plugin" icon={Plug}>Studio Plugin</SideLink>
          {profile?.is_admin && <SideLink to="/admin" icon={Crown}>Owner Admin</SideLink>}
          <SideLink to="/settings" icon={SettingsIcon}>Settings</SideLink>
        </nav>
        <div className="rounded-xl border border-border bg-card/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{profile?.plan ?? "Free"} plan</span>
          </div>
          <div className="mt-2 text-muted-foreground">
            Credits: <span className="font-mono text-foreground">{profile?.credits ?? 0}</span> / {profile?.max_credits ?? 100}
          </div>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

function SideLink({ to, icon: Icon, children }: { to: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      activeProps={{ className: "bg-secondary text-foreground" }}
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
