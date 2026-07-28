import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { likeShowcase, unlikeShowcase, type ShowcasePostItem } from "@/lib/showcase.functions";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { X, Heart, ExternalLink, Play, Eye, Calendar, User, Gamepad2, Copy, Check } from "lucide-react";

interface GameDetailModalProps {
  post: ShowcasePostItem | null;
  onClose: () => void;
  onLikeToggle?: (postId: string, newLikes: number, isLiked: boolean) => void;
}

export function GameDetailModal({ post, onClose, onLikeToggle }: GameDetailModalProps) {
  if (!post) return null;

  const [isLiked, setIsLiked] = useState(Boolean(post.is_liked));
  const [likesCount, setLikesCount] = useState(post.likes ?? 0);
  const [isLiking, setIsLiking] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const likeFn = useServerFn(likeShowcase);
  const unlikeFn = useServerFn(unlikeShowcase);

  const handleHeartClick = async () => {
    if (isLiking) return;
    setIsLiking(true);

    const nextState = !isLiked;
    const nextCount = nextState ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(nextState);
    setLikesCount(nextCount);

    try {
      if (nextState) {
        await likeFn({ data: { postId: post.id } });
        toast.success("❤️ Hearted this game!");
      } else {
        await unlikeFn({ data: { postId: post.id } });
      }
      if (onLikeToggle) {
        onLikeToggle(post.id, nextCount, nextState);
      }
    } catch (err: any) {
      // Rollback on error
      setIsLiked(!nextState);
      setLikesCount(likesCount);
      toast.error(err?.message || "Please sign in to heart games!");
    } finally {
      setIsLiking(false);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    toast.success("Share link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const coverImage = post.cover_url || (post.roblox_place_id
    ? `https://assetgame.roblox.com/Game/Tools/ThumbnailAsset.ashx?aid=${post.roblox_place_id}&fmt=png&wd=768&ht=432`
    : null);

  const robloxWebUrl = post.roblox_place_id ? `https://www.roblox.com/games/${post.roblox_place_id}` : null;
  const robloxProtocolUrl = post.roblox_place_id ? `roblox://placeId=${post.roblox_place_id}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl shadow-indigo-500/10 sm:p-0">
        
        {/* Top Media Cover */}
        <div className="relative aspect-video w-full overflow-hidden bg-slate-900 border-b border-white/10">
          {coverImage ? (
            <img src={coverImage} alt={post.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <Gamepad2 className="h-16 w-16 text-indigo-400/40 mb-2" />
              <span className="text-sm font-bold text-slate-400">Roblox Game Showcase</span>
            </div>
          )}

          {/* Close button overlay */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2.5 text-white backdrop-blur border border-white/20 transition hover:bg-black/80 hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Category Badges */}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-1.5">
            {post.tags && post.tags.length > 0 ? (
              post.tags.map((t) => (
                <span key={t} className="rounded-lg bg-black/70 backdrop-blur border border-white/15 px-3 py-1 text-xs font-bold text-white shadow">
                  {t}
                </span>
              ))
            ) : (
              <span className="rounded-lg bg-black/70 backdrop-blur border border-white/15 px-3 py-1 text-xs font-bold text-white shadow">
                Roblox Game
              </span>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Title & Heart Button */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{post.title}</h2>
              {post.author ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                  <User className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Created by</span>
                  <Link
                    to="/u/$username"
                    params={{ username: post.author.username.replace(/@.*$/, '') }}
                    className="font-bold text-indigo-300 hover:text-indigo-200 underline"
                  >
                    @{post.author.username.replace(/@.*$/, '')}
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Heart Button */}
            <button
              type="button"
              onClick={handleHeartClick}
              disabled={isLiking}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-extrabold transition hover:scale-105 active:scale-95 ${
                isLiked
                  ? "border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                  : "border-white/15 bg-white/5 text-slate-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
              }`}
            >
              <Heart className={`h-5 w-5 transition ${isLiked ? "fill-rose-500 text-rose-500" : ""}`} />
              <span>{likesCount}</span>
            </button>
          </div>

          {/* Description */}
          {post.description ? (
            <p className="text-sm text-slate-300 leading-relaxed bg-white/[0.03] p-4 rounded-2xl border border-white/10">
              {post.description}
            </p>
          ) : (
            <p className="text-xs italic text-slate-500">No description provided for this Roblox game showcase.</p>
          )}

          {/* Game Stats & Launch Controls */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
            {/* Direct Roblox Launcher */}
            {post.roblox_place_id ? (
              <a
                href={robloxProtocolUrl!}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 hover:scale-[1.02]"
              >
                <Play className="h-5 w-5 fill-white" />
                <span>Play Now on Roblox</span>
              </a>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-6 py-4 text-xs font-bold text-slate-400 border border-white/10">
                <Gamepad2 className="h-5 w-5" />
                <span>Showcase Preview Mode</span>
              </div>
            )}

            {/* Web Page Link */}
            {robloxWebUrl ? (
              <a
                href={robloxWebUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-6 py-4 text-sm font-bold text-indigo-200 transition hover:bg-indigo-500/20 hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Roblox Web Page</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={copyShareLink}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                <span>{copiedLink ? "Link Copied!" : "Share Game Link"}</span>
              </button>
            )}
          </div>

          {/* Footer Metadata */}
          <div className="flex flex-wrap items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4 text-indigo-400" /> {post.views ?? 1} Views</span>
              <span className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4 text-rose-400" /> {likesCount} Hearts</span>
            </div>
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-slate-500" /> Published {new Date(post.created_at).toLocaleDateString()}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
