import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { RobloxBackdrop } from "../components/RobloxBackdrop";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
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
      { title: "BloxSmith — AI Roblox Game Builder" },
      { name: "description", content: "BloxSmith is an AI-powered Roblox game builder. Describe your game, watch BloxSmith generate Luau scripts, GUIs, maps, and systems straight into Roblox Studio." },
      { name: "author", content: "BloxSmith" },
      { property: "og:title", content: "BloxSmith — AI Roblox Game Builder" },
      { property: "og:description", content: "BloxSmith is an AI-powered Roblox game builder. Describe your game, watch BloxSmith generate Luau scripts, GUIs, maps, and systems straight into Roblox Studio." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "BloxSmith" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@bloxsmith" },
      { name: "twitter:title", content: "BloxSmith — AI Roblox Game Builder" },
      { name: "twitter:description", content: "BloxSmith is an AI-powered Roblox game builder. Describe your game, watch BloxSmith generate Luau scripts, GUIs, maps, and systems straight into Roblox Studio." },
      { name: "theme-color", content: "#0b1220" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
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
          sameAs: ["https://discord.gg/6QDYT3RUkv", "https://www.tiktok.com/@bloxsmith"],
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
    // Redirect to dashboard if a session already exists on a public auth-entry route
    const maybeRedirect = (pathname: string) => {
      if (pathname === "/" || pathname === "/auth") {
        router.navigate({ to: "/dashboard" });
      }
    };

    import("@/integrations/supabase/client").then(({ supabase }) => {
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

      return () => sub.subscription.unsubscribe();
    });

    return () => {
      mounted = false;
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <RobloxBackdrop />
      <BetaBanner />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <FloatingDiscord />
    </QueryClientProvider>
  );
}

function FloatingDiscord() {
  return (
    <a
      href="https://discord.gg/6QDYT3RUkv"
      target="_blank"
      rel="noreferrer"
      aria-label="Join our Discord community"
      title="Join our Discord community"
      className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#5865F2]/90 px-4 py-3 text-xs font-bold text-white shadow-2xl backdrop-blur-xl transition hover:scale-105 hover:bg-[#5865F2]"
    >
      <DiscordLogo className="h-4 w-4" />
      <span className="hidden sm:inline">Join Discord</span>
    </a>
  );
}

function DiscordLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function BetaBanner() {
  return (
    <div className="sticky top-0 z-[70] border-b border-blue-400/25 bg-blue-950 px-4 py-2 text-center text-xs font-semibold text-blue-100 shadow-lg shadow-blue-950/20">
      BloxSmith is still in beta and we update almost every day — if something is not working, please be patient while we improve it.
    </div>
  );
}
