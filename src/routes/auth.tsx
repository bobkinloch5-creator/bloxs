import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Loader2 } from "lucide-react";
import bloxsmithMascot from "@/assets/bloxsmith-mascot.png.asset.json";

import { toast } from "sonner";
import { isEmailBanned } from "@/lib/banned-emails";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BloxSmith" },
      { name: "description", content: "Sign in or create your free BloxSmith account to start building Roblox games with AI." },
      { property: "og:title", content: "Sign in — BloxSmith" },
      { property: "og:description", content: "Sign in or create your free BloxSmith account to start building Roblox games with AI." },
      { property: "og:url", content: "https://bloxsmith.pro/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data?.session) {
        router.invalidate();
        navigate({ to: "/projects" });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        router.invalidate();
        navigate({ to: "/projects" });
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [navigate, router]);

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    const targetRedirect = `${window.location.origin}/projects`;
    const isInIframe = typeof window !== "undefined" && window.self !== window.top;

    try {
      if (isInIframe) {
        const result = await lovable.auth.signInWithOAuth(provider, {
          redirect_uri: targetRedirect,
        });
        if (result?.error) throw result.error;
        if (result?.redirected) return;
        router.invalidate();
        window.location.href = "/projects";
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
    } catch (e: unknown) {
      console.warn(`OAuth attempt failed for ${provider}:`, e);
      try {
        const { data, error: supaErr } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: targetRedirect },
        });
        if (supaErr) setError(supaErr.message);
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (fallbackErr: unknown) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : `${provider} sign-in failed.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    try {
      const cleanEmail = email.trim();
      if (isEmailBanned(cleanEmail)) {
        throw new Error("This email address has been permanently banned from BloxSmith.");
      }
      if (mode === "signup") {
        const { error: err, data } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username.trim() || cleanEmail.split("@")[0] },
          },
        });
        if (err) throw err;

        if (data?.session) {
          toast.success("Account created successfully! Welcome to BloxSmith.");
          router.invalidate();
          navigate({ to: "/dashboard" });
          return;
        }

        const { error: signInErr, data: signInData } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (!signInErr && signInData?.session) {
          toast.success("Account created! Welcome to BloxSmith.");
          router.invalidate();
          navigate({ to: "/dashboard" });
          return;
        }

        setSuccessMessage("Account created! Check your email inbox to confirm your sign up, or sign in below.");
        toast.info("Account created! Check your email to confirm.");
        setMode("signin");
      } else {
        const { error: err, data } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (err) throw err;
        if (!data?.session) {
          throw new Error("Could not start session. Please check your credentials or confirm your email.");
        }
        toast.success("Signed in successfully!");
        router.invalidate();
        navigate({ to: "/dashboard" });
      }
    } catch (e: unknown) {
      console.error("Auth error:", e);
      setError(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-grad flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          <img src={bloxsmithMascot.url} alt="BloxSmith" className="h-20 w-20 object-contain drop-shadow-[0_0_22px_rgba(99,102,241,0.55)]" />
          <span className="font-display text-2xl font-semibold">BloxSmith</span>
        </div>
        <h1 className="font-display text-center text-xl font-semibold">
          {mode === "signin" ? "Welcome back, Builder" : "Create your BloxSmith account"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to continue building." : "Free credits to start."}
        </p>

        <div className="mt-6 grid gap-2">
          <button
            onClick={() => handleOAuth("google")}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth("apple")}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <svg width="14" height="16" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268c-.2-37 16.6-65 50.5-85.6-19-27.2-47.5-42.2-85.5-45.2-36-2.8-75.5 21-90 21-15.3 0-50.4-20-77.9-20C61.4 138.7 0 184.6 0 277.6c0 27.5 5 55.9 15.1 85.2 13.4 38.5 61.7 132.8 112.1 131.3 26.4-.6 45-18.7 79.4-18.7 33.4 0 50.7 18.7 80.1 18.7 50.8-.7 94.6-86.5 107.4-125.1-68.6-32.4-75.4-95-75.4-100.9zM256.1 100.2c30.7-36.4 27.9-69.6 27-81.5-27.1 1.6-58.5 18.5-76.4 39.3-19.7 22.3-31.3 49.9-28.8 80.9 29.3 2.3 56-12.8 78.2-38.6z"/></svg>
            Continue with Apple
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (6+ chars)"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {error && <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">{error}</p>}
          {successMessage && <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">{successMessage}</p>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "New to BloxSmith?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-primary hover:underline"
          >
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>
        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          By continuing you agree to our <a href="/terms" className="underline hover:text-foreground">Terms</a> and <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
