import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { RobloxBackdrop } from "../components/RobloxBackdrop";
import { GlobalErrorGuard } from "@/components/GlobalErrorGuard";
import { LanguageProvider } from "../lib/i18n";
import { HelpModeProvider } from "@/components/SmartTooltip";
import { Toaster } from "@/components/ui/sonner";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { CommandPalette } from "@/components/CommandPalette";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_60%),radial-gradient(circle_at_70%_80%,rgba(217,70,239,0.12),transparent_60%)]" />
      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] text-5xl shadow-2xl shadow-indigo-500/10">
          🧱
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">Error 404</p>
        <h1 className="mt-3 bg-gradient-to-br from-white via-white to-indigo-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
          This block is missing
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-slate-300 sm:text-base">
          That page doesn't exist in this workspace — maybe it moved, maybe it never spawned. Let's head back to safety.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
          <Link
            to="/"
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 sm:w-auto"
          >
            Go home
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08] sm:w-auto"
          >
            Open dashboard
          </Link>
          <a
            href="https://discord.gg/YJ8xPFNSSX"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-5 py-2.5 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20 sm:w-auto"
          >
            💬 Get help on Discord
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(244,63,94,0.15),transparent_60%)]" />
      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-5xl">
          ⚠️
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-300">Something crashed</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          This page hit a wall
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-300">
          A build went sideways. Try again — most of the time a retry fixes it. If it keeps failing, head home and open a fresh workspace.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 sm:w-auto"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08] sm:w-auto"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "BloxSmith" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "BloxSmith" },
      { property: "og:image", content: "https://bloxsmith.pro/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://bloxsmith.pro/og-image.png" },
      { name: "twitter:site", content: "@bloxsmith" },
      { name: "theme-color", content: "#0b1220" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&family=Rubik:wght@300;400;500;600;700&display=swap" },
    ],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "BloxSmith",
          url: "https://bloxsmith.pro",
          logo: "https://bloxsmith.pro/favicon.ico",
          sameAs: ["https://discord.gg/YJ8xPFNSSX", "https://www.tiktok.com/@bloxsmith"],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "BloxSmith",
          url: "https://bloxsmith.pro",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    const maybeRedirect = (pathname: string) => {
      if (pathname === "/" || pathname === "/auth") {
        router.navigate({ to: "/dashboard" });
      }
    };

    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        if (data.session) maybeRedirect(window.location.pathname);
      });

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session) {
          queryClient.invalidateQueries();
          maybeRedirect(window.location.pathname);
        } else if (event === "SIGNED_OUT") {
          router.invalidate();
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (!mounted) unsubscribe();
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <HelpModeProvider>
          <RobloxBackdrop />
          <BetaBanner />
          <Toaster richColors closeButton position="top-right" />
          <GlobalErrorGuard />
          <CommandPalette />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <MaintenanceGate>
            <Outlet />
          </MaintenanceGate>

        </HelpModeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}


function BetaBanner() {
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("bs:beta-banner-dismissed") === "1") {
        setDismissed(true);
      }
    } catch {}
  }, []);

  if (dismissed) return null;
  return (
    <div
      className="sticky top-0 z-[70] flex items-center justify-between gap-3 px-4 py-2 sm:px-6"
      style={{
        background: "linear-gradient(90deg, #0d0d1f 0%, #1a0a3b 25%, #0d1a3b 50%, #1a0a3b 75%, #0d0d1f 100%)",
        borderBottom: "1px solid rgba(139,92,246,0.35)",
        boxShadow: "0 1px 24px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Shimmer overlay */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
        style={{ borderRadius: "inherit" }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.07) 50%, transparent 100%)",
            animation: "shimmer 3s ease-in-out infinite",
          }}
        />
      </div>

      {/* Left: badge + text */}
      <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
        {/* Glowing BETA pill */}
        <span
          className="hidden shrink-0 sm:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: "#c4b5fd",
            boxShadow: "0 0 10px rgba(139,92,246,0.3)",
          }}
        >
          ✦ Beta
        </span>

        <span className="min-w-0 truncate text-[11px] font-medium leading-snug text-indigo-100/80 sm:text-xs">
          <span className="sm:hidden">
            In beta — updates daily. Join{" "}
            <a href="https://discord.gg/YJ8xPFNSSX" target="_blank" rel="noreferrer" className="font-bold text-violet-300 hover:text-white">
              Discord →
            </a>
          </span>
          <span className="hidden sm:inline">
            BloxSmith is in active beta — we ship updates almost every day. Found a bug or need help?
          </span>
        </span>
      </div>

      {/* Centre: Discord CTA button (desktop) */}
      <a
        href="https://discord.gg/YJ8xPFNSSX"
        target="_blank"
        rel="noreferrer"
        className="relative hidden shrink-0 sm:inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-[11px] font-bold transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          color: "#fff",
          boxShadow: "0 0 16px rgba(124,58,237,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          border: "1px solid rgba(167,139,250,0.4)",
        }}
      >
        💬 Join our Discord community
        <span style={{ opacity: 0.75 }}>→</span>
      </a>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem("bs:beta-banner-dismissed", "1"); } catch {}
          setDismissed(true);
        }}
        aria-label="Dismiss beta banner"
        className="relative ml-1 shrink-0 rounded-full p-1 text-indigo-300 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><path d="M6.28 6.28a.75.75 0 011.06 0L10 8.94l2.66-2.66a.75.75 0 111.06 1.06L11.06 10l2.66 2.66a.75.75 0 11-1.06 1.06L10 11.06l-2.66 2.66a.75.75 0 01-1.06-1.06L8.94 10 6.28 7.34a.75.75 0 010-1.06z"/></svg>
      </button>

      <style>{`
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); opacity: 0; }
          40%, 60% { transform: translateX(100%); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

