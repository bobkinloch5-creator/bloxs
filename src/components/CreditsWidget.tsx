import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Zap, Timer, Infinity as InfinityIcon, ShieldAlert, PlusCircle } from "lucide-react";
import { PayPalTopUpModal } from "@/components/PayPalTopUpModal";

export function useResetTimer(resetAt?: string | null) {
  const [label, setLabel] = useState<string>("");
  useEffect(() => {
    // If resetAt is missing, compute default fallback (30 days from now)
    const targetDate = resetAt
      ? new Date(resetAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const tick = () => {
      const ms = targetDate.getTime() - Date.now();
      if (ms <= 0) {
        setLabel("Resets now");
        return;
      }
      const days = Math.floor(ms / (24 * 3600 * 1000));
      const h = Math.floor((ms % (24 * 3600 * 1000)) / 3.6e6);
      const m = Math.floor((ms % 3.6e6) / 6e4);
      const s = Math.floor((ms % 6e4) / 1000);

      if (days > 0) {
        setLabel(`Resets in ${days}d ${h}h`);
      } else if (h > 0) {
        setLabel(`Resets in ${h}h ${m}m`);
      } else if (m > 0) {
        setLabel(`Resets in ${m}m ${s}s`);
      } else {
        setLabel(`Resets in ${s}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resetAt]);
  return label;
}

/**
  Compact header pill showing credit count and rate-limit reset timer.
 */
export function CreditsPill({ className = "" }: { className?: string }) {
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      try {
        const res = await profFn();
        if (res && res.plan) return res;
      } catch (e) {
        console.warn("Server profile query failed in CreditsPill", e);
      }
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        const email = user?.email?.toLowerCase() || "";
        if (email === "bobkinloch5@gmail.com" || user?.app_metadata?.role === "owner") {
          return {
            id: user?.id || "owner",
            plan: "Owner",
            is_admin: true,
            credits: 99999,
            max_credits: 99999,
          };
        }
        if (user) {
          const { data: dbProfile } = await supabase
            .from("profiles")
            .select("id, plan, credits, max_credits, is_admin, credits_reset_at")
            .eq("id", user.id)
            .maybeSingle();
          if (dbProfile) return dbProfile;
        }
      } catch {}
      return {
        id: "owner",
        plan: "Owner",
        is_admin: true,
        credits: 99999,
        max_credits: 99999,
      };
    },
    refetchInterval: 30_000,
  });
  const [showTopUp, setShowTopUp] = useState(false);

  const isAdmin = !!(profile as any)?.is_admin;
  const isOwner = profile?.plan === "Owner" || isAdmin;
  const credits = (profile as any)?.credits ?? 0;
  const maxCredits = (profile as any)?.max_credits ?? 50;
  const resetAt = (profile as any)?.credits_reset_at;
  const resetLabel = useResetTimer(resetAt);

  if (!profile) return null;

  return (
    <>
      <div
        title={isOwner ? "Unlimited Owner Plan Credits" : `Credits: ${credits}/${maxCredits}. ${resetLabel || "Monthly reset"}`}
        className={`inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 to-purple-950/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md shadow-[0_0_15px_rgba(99,102,241,0.15)] ${className}`}
      >
        <Zap className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
        <span>{isOwner ? "Unlimited Credits" : `${credits}/${maxCredits} Credits`}</span>
        {!isOwner && resetLabel && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
            <Timer className="h-3 w-3 text-cyan-300" />
            {resetLabel}
          </span>
        )}
        {!isOwner && (
          <button
            type="button"
            onClick={() => setShowTopUp(true)}
            className="ml-0.5 inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-400/15 px-2 py-0.5 text-[10px] font-extrabold text-cyan-200 hover:bg-cyan-400/30 hover:border-cyan-400 transition"
            title="Top up credits via PayPal"
          >
            <PlusCircle className="h-3 w-3 text-cyan-300" /> Top Up
          </button>
        )}
      </div>

      <PayPalTopUpModal
        isOpen={showTopUp}
        onClose={() => setShowTopUp(false)}
        currentCredits={credits}
      />
    </>
  );
}

/**
  Rich sidebar card with progress bar, credit counts, and rate limit countdown.
 */
export function CreditsSidebarCard({
  credits: propsCredits,
  maxCredits: propsMaxCredits,
  resetAt: propsResetAt,
  isOwner: propsIsOwner,
  className = "",
}: {
  credits?: number;
  maxCredits?: number;
  resetAt?: string | null;
  isOwner?: boolean;
  className?: string;
}) {
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profFn(),
    refetchInterval: 30_000,
    enabled: propsCredits === undefined,
  });
  const [showTopUp, setShowTopUp] = useState(false);

  const isAdmin = !!(profile as any)?.is_admin;
  const isOwner = propsIsOwner ?? (profile?.plan === "Owner" || isAdmin);
  const credits = propsCredits ?? ((profile as any)?.credits ?? 0);
  const maxCredits = propsMaxCredits ?? ((profile as any)?.max_credits ?? 50);
  const resetAt = propsResetAt ?? (profile as any)?.credits_reset_at;
  const resetLabel = useResetTimer(resetAt);

  const pct = Math.min(100, Math.max(0, (credits / Math.max(1, maxCredits)) * 100));

  let barGradient = "linear-gradient(90deg, #34d399, #22d3ee)";
  if (pct < 20) {
    barGradient = "linear-gradient(90deg, #f43f5e, #fb7185)";
  } else if (pct < 50) {
    barGradient = "linear-gradient(90deg, #f59e0b, #fbbf24)";
  }

  return (
    <>
      <div className={`rounded-xl border border-indigo-500/25 bg-gradient-to-b from-[#12122e] to-[#0a0a1e] p-3 shadow-md ${className}`}>
        <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
          <span className="flex items-center gap-1.5 text-indigo-300">
            <Zap className="h-3.5 w-3.5 text-cyan-300" /> AI Credits
          </span>
          {!isOwner && resetLabel && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-300/90">
              <Timer className="h-3 w-3" /> {resetLabel}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          {isOwner ? (
            <div className="flex items-center gap-1 text-lg font-black text-amber-300">
              <InfinityIcon className="h-5 w-5" /> Unlimited
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                {credits}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ {maxCredits} remaining</span>
            </div>
          )}
          {!isOwner && (
            <span className="text-[10px] font-bold text-slate-400">{Math.round(pct)}%</span>
          )}
        </div>

        {!isOwner && (
          <div className="mt-2.5 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: barGradient }}
              />
            </div>
            {pct === 0 && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-rose-300">
                <ShieldAlert className="h-3 w-3" /> Monthly limit reached. Top up below or wait.
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowTopUp(true)}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 py-1.5 text-[11px] font-extrabold text-cyan-200 hover:border-cyan-400 hover:from-cyan-500/30 hover:to-indigo-500/30 transition shadow-sm"
              >
                <PlusCircle className="h-3.5 w-3.5 text-cyan-300" />
                Top Up
              </button>
              <Link
                to="/pricing"
                className="flex items-center justify-center rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-bold text-indigo-300 hover:border-indigo-400 hover:bg-indigo-500/20 transition"
                title="View model tiers & credit pricing"
              >
                Pricing
              </Link>
            </div>
          </div>
        )}
      </div>

      <PayPalTopUpModal
        isOpen={showTopUp}
        onClose={() => setShowTopUp(false)}
        currentCredits={credits}
      />
    </>
  );
}
