import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSync } from "@/components/LanguageSync";
import { BottomNav } from "@/components/BottomNav";

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
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Dashboard and Projects render their own BottomNav already.
  const hideBottomNav = pathname === "/dashboard" || pathname === "/projects";

  return (
    <div className="surface-grad min-h-screen text-foreground">
      <LanguageSync />
      <div className={hideBottomNav ? "" : "pb-16 lg:pb-0"}>
        <Outlet />
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}


