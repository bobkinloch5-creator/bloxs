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
import { LanguageProvider } from "../lib/i18n";

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
      <LanguageProvider>
        <RobloxBackdrop />
        <BetaBanner />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </LanguageProvider>
    </QueryClientProvider>
  );
}


function BetaBanner() {
  return (
    <div className="sticky top-0 z-[70] border-b border-blue-400/25 bg-blue-950 px-4 py-2 text-center text-xs font-semibold text-blue-100 shadow-lg shadow-blue-950/20">
      BloxSmith is still in beta and we update almost every day — if something is not working, please be patient while we improve it.
    </div>
  );
}
