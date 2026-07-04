import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Wrench, ShieldCheck } from "lucide-react";

// Paths that MUST remain accessible even when maintenance mode is on.
// Admins/owners need to sign in and reach the admin panel to toggle it off.
const ALLOWED_PATHS = ["/auth", "/admin"];
// Assets/API always pass through (this component only wraps page routes).

function isAllowedPath(pathname: string) {
  if (ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/_authenticated/admin")) return true;
  return false;
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ enabled: boolean; message: string } | null>(null);
  const [isPrivileged, setIsPrivileged] = useState<boolean>(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/public/maintenance", { cache: "no-store" });
        const data = res.ok ? await res.json() : { enabled: false, message: "" };
        if (cancelled) return;
        setStatus({ enabled: !!data.enabled, message: data.message ?? "" });

        if (data.enabled) {
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: sess } = await supabase.auth.getSession();
            const uid = sess.session?.user?.id;
            if (uid) {
              const { data: roles } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", uid)
                .in("role", ["admin", "owner"]);
              if (!cancelled) setIsPrivileged((roles ?? []).length > 0);
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setStatus({ enabled: false, message: "" });
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    check();
    // Re-check every 60s so admin toggle propagates without a hard refresh.
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!checked || !status) return <>{children}</>;

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : router.state.location.pathname;

  const shouldBlock = status.enabled && !isPrivileged && !isAllowedPath(pathname);
  if (!shouldBlock) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050816] px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/25 bg-[#0b1024] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
          <Wrench className="h-8 w-8 text-amber-300" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">
          We&apos;re under maintenance
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {status.message ||
            "BloxSmith is being updated right now. We'll be back online shortly — thank you for your patience!"}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 text-xs text-slate-500">
          <a
            href="/auth"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600/40 bg-slate-800/50 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-800"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Staff sign in
          </a>
          <span>Follow us on Discord for updates.</span>
        </div>
      </div>
    </div>
  );
}
