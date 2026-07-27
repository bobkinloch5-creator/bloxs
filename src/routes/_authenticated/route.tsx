import { createFileRoute, Outlet, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSync } from "@/components/LanguageSync";
import { BottomNav } from "@/components/BottomNav";
import { Loader2 } from "lucide-react";
import bloxsmithMascot from "@/assets/bloxsmith-mascot.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  useEffect(() => {
    let mounted = true;
    const hasAuthParams = typeof window !== "undefined" && (
      window.location.search.includes("code=") ||
      window.location.hash.includes("access_token=") ||
      window.location.search.includes("error=")
    );

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data?.session) {
        setIsAuthenticated(true);
        setCheckingAuth(false);
      } else if (!hasAuthParams) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        navigate({ to: "/auth" });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) {
        setIsAuthenticated(true);
        setCheckingAuth(false);
      } else if (event === "SIGNED_OUT" || (!hasAuthParams && !session)) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        navigate({ to: "/auth" });
      }
    });

    // Fallback timeout in case auth params fail to exchange or error occurs
    const timeout = setTimeout(() => {
      if (mounted && checkingAuth) {
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
      }
    }, 4000);

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
      clearTimeout(timeout);
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


