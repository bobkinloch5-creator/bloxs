import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listShowcase } from "@/lib/showcase.functions";
import { Heart, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Showcase — BloxSmith community games" },
      { name: "description", content: "Browse Roblox games built with BloxSmith. Like, share, and get inspired — all free." },
      { property: "og:title", content: "BloxSmith Showcase" },
      { property: "og:description", content: "A gallery of Roblox games built with BloxSmith." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShowcasePage,
});

function ShowcasePage() {
  const listFn = useServerFn(listShowcase);
  const { data, isLoading } = useQuery({
    queryKey: ["showcase", "public"],
    queryFn: () => listFn({ data: { limit: 48 } }),
  });
  const posts = data?.posts ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Community Showcase</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Games built with BloxSmith by the community. Free to browse — sign in to like or publish your own.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.04] p-10 text-center">
          <p className="text-slate-300">No published games yet — be the first!</p>
          <Link to="/dashboard" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
            Start building
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] transition hover:border-indigo-400/50">
              <div className="aspect-video overflow-hidden bg-slate-900">
                {p.cover_url ? (
                  <img src={p.cover_url} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">🎮</div>
                )}
              </div>
              <div className="p-3">
                <h2 className="line-clamp-1 text-base font-bold">{p.title}</h2>
                {p.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-300">{p.description}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {p.likes ?? 0}</span>
                  {p.roblox_place_id ? (
                    <a
                      href={`https://www.roblox.com/games/${p.roblox_place_id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200"
                    >
                      Play <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
