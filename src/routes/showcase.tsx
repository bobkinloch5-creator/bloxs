import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listShowcase, likeShowcase, unlikeShowcase, type ShowcasePostItem } from "@/lib/showcase.functions";
import { GameDetailModal } from "@/components/GameDetailModal";
import { PublishGameModal } from "@/components/PublishGameModal";
import { toast } from "sonner";
import {
  Heart,
  ExternalLink,
  Search,
  Plus,
  Sparkles,
  Gamepad2,
  TrendingUp,
  Clock,
  Eye,
  Play,
  User,
  Filter
} from "lucide-react";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Community Games Showcase — Try Out & Publish Roblox Games" },
      { name: "description", content: "Discover and play Roblox games created by the community. Heart your favorite games and publish your own Roblox experiences for everyone to try!" },
      { property: "og:title", content: "BloxSmith Community Games Showcase" },
      { property: "og:description", content: "Discover, play, and publish Roblox games built with BloxSmith." },
      { property: "og:url", content: "https://bloxsmith.pro/showcase" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/showcase" }],
  }),
  component: CommunityShowcasePage,
});

const CATEGORIES = [
  "All", "Obby", "Simulator", "RPG", "Sci-Fi",
  "Adventure", "Tycoon", "Action", "City", "Horror", "Showcase", "PVP"
];

function CommunityShowcasePage() {
  const queryClient = useQueryClient();
  const [selectedTag, setSelectedTag] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"trending" | "newest" | "most_liked" | "most_viewed">("trending");

  // Modals
  const [activePost, setActivePost] = useState<ShowcasePostItem | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  const listFn = useServerFn(listShowcase);
  const likeFn = useServerFn(likeShowcase);
  const unlikeFn = useServerFn(unlikeShowcase);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["showcase", selectedTag, searchQuery, sortBy],
    queryFn: () =>
      listFn({
        data: {
          limit: 60,
          tag: selectedTag === "All" ? undefined : selectedTag,
          query: searchQuery.trim() || undefined,
          sortBy,
        },
      }),
  });

  const posts = data?.posts ?? [];

  const handleCardLike = async (e: React.MouseEvent, post: ShowcasePostItem) => {
    e.stopPropagation();
    const isLiked = Boolean(post.is_liked);

    // Optimistic cache update
    queryClient.setQueryData(
      ["showcase", selectedTag, searchQuery, sortBy],
      (old: any) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p: ShowcasePostItem) => {
            if (p.id === post.id) {
              const newCount = isLiked ? Math.max(0, p.likes - 1) : p.likes + 1;
              return { ...p, likes: newCount, is_liked: !isLiked };
            }
            return p;
          }),
        };
      }
    );

    try {
      if (isLiked) {
        await unlikeFn({ data: { postId: post.id } });
      } else {
        await likeFn({ data: { postId: post.id } });
        toast.success("❤️ Hearted!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Please sign in to heart games!");
      refetch();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500 selection:text-white">
      {/* Decorative ambient gradients */}
      <div className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[500px] w-full -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_70%)]" />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <header className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-8 text-center sm:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-bold text-indigo-300 backdrop-blur mb-4">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>BloxSmith Community Games Hub</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Try Out Community Games
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-slate-300">
            Explore player-created Roblox experiences, heart your favorites, and publish your own Roblox games for everyone to play!
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => setIsPublishOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-indigo-500/25 transition hover:scale-105 hover:from-indigo-400 hover:to-violet-500 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Publish Your Game
            </button>
            <a
              href="#explore-games"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              <Gamepad2 className="h-4 w-4 text-indigo-400" /> Browse All Games
            </a>
          </div>
        </header>

        {/* Filter & Search Toolbar */}
        <section id="explore-games" className="mb-8 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games by title or keyword..."
                className="w-full rounded-2xl border border-white/15 bg-white/[0.04] pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-2xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="trending">🔥 Trending</option>
                <option value="most_liked">💖 Most Hearted</option>
                <option value="newest">🆕 Newest Releases</option>
                <option value="most_viewed">👁️ Most Played</option>
              </select>
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const active = selectedTag === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedTag(cat)}
                  className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
                    active
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/50"
                      : "bg-white/[0.04] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </section>

        {/* Games Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-white/15 bg-white/[0.03] p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-4">
              <Gamepad2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-white">No games found</h3>
            <p className="mt-2 text-sm text-slate-400">
              {searchQuery ? `No games match "${searchQuery}".` : "Be the first creator to publish a game in this category!"}
            </p>
            <button
              onClick={() => setIsPublishOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition"
            >
              <Plus className="h-4 w-4" /> Publish A Game Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => {
              const coverImg = p.cover_url || (p.roblox_place_id
                ? `https://assetgame.roblox.com/Game/Tools/ThumbnailAsset.ashx?aid=${p.roblox_place_id}&fmt=png&wd=768&ht=432`
                : null);

              return (
                <article
                  key={p.id}
                  onClick={() => setActivePost(p)}
                  className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-indigo-500/10"
                >
                  {/* Cover Image Container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={p.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-slate-500">
                        <Gamepad2 className="h-10 w-10 text-indigo-400/40 mb-1" />
                        <span className="text-[11px] font-bold">Roblox Experience</span>
                      </div>
                    )}

                    {/* Top Overlay Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {p.tags && p.tags[0] ? (
                          <span className="rounded-lg bg-black/70 backdrop-blur border border-white/15 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                            {p.tags[0]}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Views Pill */}
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-bold text-slate-300 backdrop-blur">
                          <Eye className="h-3 w-3 text-indigo-400" />
                          <span>{p.views ?? 0}</span>
                        </span>

                        {/* Heart / Like Pill */}
                        <button
                          type="button"
                          onClick={(e) => handleCardLike(e, p)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black backdrop-blur transition hover:scale-110 active:scale-95 ${
                            p.is_liked
                              ? "border-rose-500/60 bg-rose-500/80 text-white shadow-md shadow-rose-500/40"
                              : "border-white/20 bg-black/60 text-slate-200 hover:bg-rose-500/30 hover:text-white"
                          }`}
                        >
                          <Heart className={`h-3.5 w-3.5 ${p.is_liked ? "fill-white" : ""}`} />
                          <span>{p.likes ?? 0}</span>
                        </button>
                      </div>
                    </div>

                    {/* Hover Play Button */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                      <span className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white shadow-xl shadow-indigo-500/40 transition group-hover:scale-105">
                        <Play className="h-4 w-4 fill-white" /> Try Out Game
                      </span>
                    </div>
                  </div>

                  {/* Info Card Footer */}
                  <div className="p-4 sm:p-5">
                    <h2 className="line-clamp-1 text-base font-bold text-white group-hover:text-indigo-300 transition">
                      {p.title}
                    </h2>
                    {p.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.description}</p>
                    ) : null}

                    <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-slate-400">
                      {/* Creator */}
                      {p.author ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                          <User className="h-3 w-3 text-indigo-400" /> @{p.author.username.replace(/@.*$/, '')}
                        </span>
                      ) : (
                        <span className="text-slate-500">Community Creator</span>
                      )}

                      {/* Views & Play Link */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Eye className="h-3 w-3 text-indigo-400" /> {p.views ?? 0}
                        </span>
                        {p.roblox_place_id ? (
                          <span className="inline-flex items-center gap-1 font-bold text-indigo-400 group-hover:text-indigo-300">
                            Play <ExternalLink className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="text-slate-500">View</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <GameDetailModal
        post={activePost}
        onClose={() => setActivePost(null)}
        onLikeToggle={(postId, newLikes, isLiked) => {
          queryClient.setQueryData(
            ["showcase", selectedTag, searchQuery, sortBy],
            (old: any) => {
              if (!old?.posts) return old;
              return {
                ...old,
                posts: old.posts.map((p: ShowcasePostItem) =>
                  p.id === postId ? { ...p, likes: newLikes, is_liked: isLiked } : p
                ),
              };
            }
          );
        }}
      />

      <PublishGameModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        onSuccess={() => {
          refetch();
        }}
      />
    </div>
  );
}
