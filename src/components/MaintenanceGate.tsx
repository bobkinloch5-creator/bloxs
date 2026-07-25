import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Wrench, ShieldCheck, Sparkles, MessageCircle, ArrowRight, Activity } from "lucide-react";
import robloxBg from "@/assets/backgrounds/roblox-dashboard.jpg";

// Paths that MUST remain accessible even when maintenance mode is on.
// Admins/owners need to sign in and reach the admin panel to toggle it off.
const ALLOWED_PATHS = ["/auth", "/admin"];

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050614] px-4 py-8 font-sans text-white overflow-y-auto">
      {/* Ambient background with animated radial glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <img
          src={robloxBg}
          alt=""
          className="h-full w-full object-cover opacity-[0.2] blur-[4px] scale-105"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(245,158,11,0.18),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.15),transparent_60%)] animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050614]/90 via-[#07091e]/85 to-[#050614]/95" />
      </div>

      <div className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-500">
        <div className="vapor-card hover-lift overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-b from-[#0f142c]/95 via-[#0b0e24]/95 to-[#070918]/95 p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(245,158,11,0.25)] backdrop-blur-2xl">
          
          {/* Top animated badge */}
          <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-3xl bg-amber-500/20 blur-xl animate-pulse" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-400/50 bg-gradient-to-tr from-amber-500/20 via-indigo-500/20 to-cyan-500/20 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <Wrench className="h-10 w-10 text-amber-300 animate-spin" style={{ animationDuration: "12s" }} />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black shadow-[0_0_10px_#f59e0b]">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" /> System Maintenance
          </div>

          <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            We&apos;re Upgrading <span className="vapor-title">BloxSmith</span>
          </h1>

          <p className="mt-3.5 text-sm leading-relaxed text-slate-300 font-medium">
            {status.message ||
              "BloxSmith is currently undergoing scheduled maintenance to deploy performance enhancements and new AI build capabilities. We'll be back online shortly — thank you for your patience!"}
          </p>

          {/* Discord CTA Box */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-indigo-950/60 p-4 text-left shadow-[0_0_25px_rgba(99,102,241,0.15)]">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#5865F2] shadow-[0_0_15px_rgba(88,101,242,0.3)]">
                <MessageCircle className="h-5 w-5 text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-200">Join Community & Live Updates</div>
                <div className="text-[11px] text-slate-300">Get instant uptime status, patch notes & support in Discord.</div>
              </div>
            </div>
            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5865F2] to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_0_25px_rgba(88,101,242,0.6)] transition-all hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(88,101,242,0.8)] active:scale-95"
            >
              <MessageCircle className="h-4 w-4 fill-current" /> Join BloxSmith Discord <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs font-medium text-slate-400">
            <a
              href="/status"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400" /> View Status Page
            </a>
            <a
              href="/auth"
              className="vapor-ghost-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-amber-300" /> Staff Sign In
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
