import { createFileRoute, Outlet, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSync } from "@/components/LanguageSync";
import { BottomNav } from "@/components/BottomNav";
import { Loader2 } from "lucide-react";
import bloxsmithMascot from "@/assets/bloxsmith-mascot.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData?.session?.user) {
        return { user: sessData.session.user };
      }
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: userData.user };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err;
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data?.session) {
        setIsAuthenticated(false);
        navigate({ to: "/auth" });
      } else {
        setIsAuthenticated(true);
      }
      setCheckingAuth(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setIsAuthenticated(false);
        navigate({ to: "/auth" });
      } else {
        setIsAuthenticated(true);
        setCheckingAuth(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [navigate]);

  const hideBottomNav = pathname === "/dashboard" || pathname === "/projects";

  if (checkingAuth) {
    return (
      <div className="surface-grad flex min-h-screen items-center justify-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <img src={bloxsmithMascot.url} alt="BloxSmith" className="h-16 w-16 animate-bounce object-contain drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            Loading BloxSmith...
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

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


