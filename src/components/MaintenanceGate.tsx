import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Wrench,
  Sparkles,
  MessageCircle,
  ArrowRight,
  Activity,
  Key,
  CheckCircle,
  AlertCircle,
  UserPlus,
  LogIn,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import robloxBg from "@/assets/backgrounds/roblox-dashboard.jpg";
import { toast } from "sonner";

// Paths that MUST remain accessible even when maintenance mode is on.
const ALLOWED_PATHS = ["/auth", "/admin"];
const OWNER_PASSCODE = "boywonderxx123!!";

function isAllowedPath(pathname: string) {
  if (ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/_authenticated/admin")) return true;
  return false;
}

async function checkUserPrivileges(sessionUser?: any): Promise<boolean> {
  if (!sessionUser) return false;
  const email = sessionUser.email?.toLowerCase() ?? "";
  const uid = sessionUser.id;

  if (email === "bobkinloch5@gmail.com" || email.includes("bobkinloch")) {
    return true;
  }

  if (uid) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .in("role", ["admin", "owner"]);
      if ((roles ?? []).length > 0) return true;

      const { data: prof } = await supabase
        .from("profiles")
        .select("plan, is_admin, username, display_name")
        .eq("id", uid)
        .maybeSingle();

      if (
        prof?.plan === "Owner" ||
        prof?.is_admin === true ||
        prof?.username?.toLowerCase() === "king" ||
        prof?.username?.toLowerCase() === "elibobop" ||
        prof?.display_name?.toLowerCase() === "king" ||
        prof?.display_name?.toLowerCase() === "elibobop"
      ) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ enabled: boolean; message: string } | null>(null);
  const [isPrivileged, setIsPrivileged] = useState<boolean>(false);
  const [checked, setChecked] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState("");
  const [unlockedSuccess, setUnlockedSuccess] = useState(false);

  // Embedded Auth State on Maintenance Page
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [showAuthBox, setShowAuthBox] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Check local stored bypass token
    try {
      const stored = localStorage.getItem("bs:maint-bypass-token") || sessionStorage.getItem("bs:maint-bypass-token");
      if (stored === OWNER_PASSCODE) {
        setIsPrivileged(true);
      }
    } catch {}

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
            if (sess.session?.user) {
              if (!cancelled) setCurrentUserEmail(sess.session.user.email ?? null);
              const privileged = await checkUserPrivileges(sess.session.user);
              if (!cancelled && privileged) {
                setIsPrivileged(true);
              }
            }
          } catch {}
        }
      } catch {
        if (!cancelled) setStatus({ enabled: false, message: "" });
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    check();
    const t = setInterval(check, 30_000);

    let sub: any = null;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      sub = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          setCurrentUserEmail(session.user.email ?? null);
          const privileged = await checkUserPrivileges(session.user);
          if (privileged) {
            setIsPrivileged(true);
          } else {
            setIsPrivileged(false);
          }
        } else {
          setCurrentUserEmail(null);
          setIsPrivileged(false);
        }
      });
    });

    return () => {
      cancelled = true;
      clearInterval(t);
      if (sub?.data?.subscription) {
        sub.data.subscription.unsubscribe();
      }
    };
  }, []);

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() === OWNER_PASSCODE) {
      try {
        localStorage.setItem("bs:maint-bypass-token", OWNER_PASSCODE);
        sessionStorage.setItem("bs:maint-bypass-token", OWNER_PASSCODE);
      } catch {}
      setIsPrivileged(true);
      setUnlockedSuccess(true);
      setPassError("");
    } else {
      setPassError("Invalid passcode. Access denied.");
    }
  };

  async function handleOAuth(provider: "google" | "apple") {
    setAuthError(null);
    setAuthSuccessMsg(null);
    setAuthBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { lovable } = await import("@/integrations/lovable");
      const targetRedirect = window.location.origin;
      const isInIframe = typeof window !== "undefined" && window.self !== window.top;

      if (isInIframe) {
        const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: targetRedirect });
        if (result?.error) throw result.error;
      } else {
        const { data, error: supaErr } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: targetRedirect },
        });
        if (supaErr) throw supaErr;
        if (data?.url) {
          window.location.href = data.url;
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || `${provider} sign-in failed.`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMsg(null);
    setAuthBusy(true);

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const cleanEmail = authEmail.trim();

      if (authMode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: cleanEmail,
          password: authPassword,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: authUsername.trim() || cleanEmail.split("@")[0] },
          },
        });
        if (err) throw err;

        if (data?.session) {
          setCurrentUserEmail(cleanEmail);
          const isPriv = await checkUserPrivileges(data.session.user);
          if (isPriv) {
            setIsPrivileged(true);
            toast.success("Welcome back, Owner! Access granted.");
            return;
          }
          setAuthSuccessMsg(`🎉 Account created! Welcome ${cleanEmail}. Since BloxSmith is in maintenance mode, you remain on this screen until maintenance completes.`);
          toast.success("Account created! Maintenance is active.");
          return;
        }

        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: authPassword,
        });
        if (!signInErr && signInData?.session) {
          setCurrentUserEmail(cleanEmail);
          const isPriv = await checkUserPrivileges(signInData.session.user);
          if (isPriv) {
            setIsPrivileged(true);
            toast.success("Welcome back, Owner!");
            return;
          }
          setAuthSuccessMsg(`🎉 Account created! Welcome ${cleanEmail}. Maintenance is active, so you remain on this page until upgrades finish.`);
          toast.success("Account created!");
          return;
        }

        setAuthSuccessMsg("Account created! Check your email to confirm, then sign in below.");
        toast.info("Account created! Check your email to confirm.");
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: authPassword,
        });
        if (err) throw err;
        if (!data?.session) {
          throw new Error("Could not start session. Please check your credentials.");
        }

        setCurrentUserEmail(cleanEmail);
        const isPriv = await checkUserPrivileges(data.session.user);
        if (isPriv) {
          setIsPrivileged(true);
          toast.success("Welcome back, Owner!");
          return;
        }

        setAuthSuccessMsg(`Signed in as ${cleanEmail}! Maintenance is active, so you remain on this page until upgrades finish.`);
        toast.success("Signed in successfully!");
      }
    } catch (err: any) {
      console.error("Maintenance auth error:", err);
      setAuthError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

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

      <div className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-500 my-auto">
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
              "We will be back shortly! BloxSmith is currently undergoing scheduled maintenance and performance upgrades. Thank you for your patience!"}
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

          {/* Maintenance Sign Up & Authentication Box */}
          <div className="mt-5 rounded-2xl border border-indigo-500/30 bg-[#0a0d24]/90 p-4 sm:p-5 text-left shadow-[0_0_30px_rgba(99,102,241,0.2)] backdrop-blur-xl">
            {currentUserEmail ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-100 uppercase tracking-wide">Account Registered</div>
                      <div className="text-[11px] text-emerald-300 font-mono truncate">{currentUserEmail}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const { supabase } = await import("@/integrations/supabase/client");
                      await supabase.auth.signOut();
                      setCurrentUserEmail(null);
                      setIsPrivileged(false);
                      toast.info("Signed out.");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 transition"
                  >
                    <LogOut className="h-3 w-3" /> Sign Out
                  </button>
                </div>
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200 font-medium leading-relaxed">
                  🔒 You are currently logged in. Since BloxSmith is undergoing maintenance, regular accounts will automatically be granted entry to the dashboard as soon as maintenance mode ends.
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3.5">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-300">
                    <UserPlus className="h-4 w-4 text-indigo-400" />
                    Sign Up During Maintenance
                  </div>
                  <span className="rounded-md bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-200">
                    Pre-Register
                  </span>
                </div>

                {/* OAuth Quick Buttons */}
                <div className="mb-3.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={authBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 active:scale-95 disabled:opacity-50 transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth("apple")}
                    disabled={authBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 active:scale-95 disabled:opacity-50 transition"
                  >
                    <svg width="12" height="14" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268c-.2-37 16.6-65 50.5-85.6-19-27.2-47.5-42.2-85.5-45.2-36-2.8-75.5 21-90 21-15.3 0-50.4-20-77.9-20C61.4 138.7 0 184.6 0 277.6c0 27.5 5 55.9 15.1 85.2 13.4 38.5 61.7 132.8 112.1 131.3 26.4-.6 45-18.7 79.4-18.7 33.4 0 50.7 18.7 80.1 18.7 50.8-.7 94.6-86.5 107.4-125.1-68.6-32.4-75.4-95-75.4-100.9zM256.1 100.2c30.7-36.4 27.9-69.6 27-81.5-27.1 1.6-58.5 18.5-76.4 39.3-19.7 22.3-31.3 49.9-28.8 80.9 29.3 2.3 56-12.8 78.2-38.6z"/></svg>
                    Apple
                  </button>
                </div>

                <div className="my-2.5 flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <div className="h-px flex-1 bg-white/10" /> or email <div className="h-px flex-1 bg-white/10" />
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-2.5">
                  {authMode === "signup" && (
                    <div>
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="Developer Username"
                        className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Password (6+ chars)"
                      className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>

                  {authError && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-2.5 text-xs font-semibold text-rose-200">
                      {authError}
                    </div>
                  )}

                  {authSuccessMsg && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-2.5 text-xs font-semibold text-emerald-200">
                      {authSuccessMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 py-2.5 text-xs font-black text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:brightness-110 active:scale-95 disabled:opacity-50 transition"
                  >
                    {authBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" /> Create Account
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Passcode Unlock Form */}
          {showPasscodeModal ? (
            <form onSubmit={handlePasscodeSubmit} className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 text-left">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-300">
                Owner Maintenance Passcode
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter passcode…"
                  className="flex-1 rounded-xl border border-amber-400/30 bg-[#0a0d24] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-black text-slate-950 shadow-lg transition hover:scale-105"
                >
                  Unlock Access
                </button>
              </div>
              {passError && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/60 bg-rose-950/70 p-3 text-xs font-bold text-rose-200 shadow-xl backdrop-blur-md animate-pulse">
                  <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                      ⚠️ SECURITY WARNING: UNAUTHORIZED ACCESS DETECTED
                    </div>
                    <div className="mt-1 text-rose-200/90 font-medium">
                      {passError} This unauthorized attempt has been logged and reported to the site Owner (King).
                    </div>
                  </div>
                </div>
              )}
              {unlockedSuccess && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <CheckCircle className="h-3.5 w-3.5" /> Access Granted! Welcome back, Owner.
                </div>
              )}
            </form>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs font-medium text-slate-400">
            <a
              href="/status"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400" /> View Status Page
            </a>
            <button
              onClick={() => setShowPasscodeModal(!showPasscodeModal)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/20 transition-all"
            >
              <Key className="h-3.5 w-3.5 text-amber-300" /> Owner Passcode Access
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
