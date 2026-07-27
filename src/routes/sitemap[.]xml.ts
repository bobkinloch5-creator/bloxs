import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://bloxsmith.pro";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/ai-roblox-game-maker", changefreq: "weekly", priority: "0.9" },
          { path: "/roblox-script-generator", changefreq: "weekly", priority: "0.9" },
          { path: "/roblox-gui-maker", changefreq: "weekly", priority: "0.9" },
          { path: "/free-roblox-studio-ai", changefreq: "weekly", priority: "0.9" },
          { path: "/best-roblox-ai-scripter", changefreq: "weekly", priority: "0.9" },
          { path: "/free-roblox-script-ai", changefreq: "weekly", priority: "0.9" },
          { path: "/roblox-studio-ai-helper", changefreq: "weekly", priority: "0.9" },
          { path: "/ai-roblox-map-generator", changefreq: "weekly", priority: "0.9" },
          { path: "/templates/ui", changefreq: "weekly", priority: "0.9" },
          { path: "/guides", changefreq: "weekly", priority: "0.8" },
          { path: "/guides/how-to-make-a-roblox-tycoon", changefreq: "monthly", priority: "0.8" },
          { path: "/guides/how-to-make-a-roblox-obby", changefreq: "monthly", priority: "0.8" },
          { path: "/guides/how-to-script-in-roblox-with-ai", changefreq: "monthly", priority: "0.8" },
          { path: "/guides/how-to-make-a-roblox-game-with-ai", changefreq: "monthly", priority: "0.8" },
          { path: "/guides/best-ai-for-roblox-scripting", changefreq: "monthly", priority: "0.8" },
          { path: "/docs", changefreq: "weekly", priority: "0.7" },
          { path: "/support", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "monthly", priority: "0.6" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/auth", changefreq: "monthly", priority: "0.5" },
          { path: "/donate", changefreq: "monthly", priority: "0.5" },
          { path: "/leaderboard", changefreq: "daily", priority: "0.6" },
          { path: "/showcase", changefreq: "daily", priority: "0.7" },
          { path: "/status", changefreq: "hourly", priority: "0.4" },
          { path: "/templates-market", changefreq: "weekly", priority: "0.8" },
        ];

        const urls = entries
          .map((e) =>
            [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
