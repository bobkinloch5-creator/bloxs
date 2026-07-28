import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getUserProjectsForShowcase, publishShowcase } from "@/lib/showcase.functions";
import { toast } from "sonner";
import { X, Gamepad2, Sparkles, Image as ImageIcon, Link as LinkIcon, Plus, Check, Loader2 } from "lucide-react";

interface PublishGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_TAGS = [
  "Obby", "Simulator", "RPG", "Sci-Fi", "Adventure",
  "Tycoon", "Action", "City", "Horror", "Showcase", "PVP", "Casual"
];

export function PublishGameModal({ isOpen, onClose, onSuccess }: PublishGameModalProps) {
  const [tab, setTab] = useState<"project" | "custom">("project");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [myProjects, setMyProjects] = useState<Array<{
    id: string;
    name: string;
    description: string;
    game_type: string;
    roblox_place_id: number | null;
    thumbnail_url: string | null;
  }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [robloxUrlOrId, setRobloxUrlOrId] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(["Showcase"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getProjectsFn = useServerFn(getUserProjectsForShowcase);
  const publishFn = useServerFn(publishShowcase);

  useEffect(() => {
    if (isOpen) {
      setLoadingProjects(true);
      getProjectsFn()
        .then((res) => {
          if (res.projects) {
            setMyProjects(res.projects);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProjects(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectProject = (proj: typeof myProjects[0]) => {
    setSelectedProjectId(proj.id);
    setTitle(proj.name);
    setDescription(proj.description || "");
    if (proj.roblox_place_id) {
      setRobloxUrlOrId(String(proj.roblox_place_id));
    }
    if (proj.thumbnail_url) {
      setCoverUrl(proj.thumbnail_url);
    }
    if (proj.game_type) {
      const tagMatch = CATEGORY_TAGS.find(t => t.toLowerCase() === proj.game_type.toLowerCase());
      if (tagMatch && !selectedTags.includes(tagMatch)) {
        setSelectedTags([tagMatch, ...selectedTags.slice(0, 3)]);
      }
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else if (selectedTags.length < 5) {
      setSelectedTags([...selectedTags, tag]);
    } else {
      toast.error("You can select up to 5 tags");
    }
  };

  // Derive place ID for live preview
  let parsedPlaceId: number | null = null;
  if (robloxUrlOrId.trim()) {
    const match = robloxUrlOrId.match(/games\/(\d+)/i) || robloxUrlOrId.match(/placeId=(\d+)/i) || robloxUrlOrId.match(/^(\d{7,12})$/);
    if (match) parsedPlaceId = parseInt(match[1], 10);
  }

  const computedPreviewCover = coverUrl.trim()
    ? coverUrl.trim()
    : parsedPlaceId
    ? `https://assetgame.roblox.com/Game/Tools/ThumbnailAsset.ashx?aid=${parsedPlaceId}&fmt=png&wd=768&ht=432`
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a game title");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await publishFn({
        data: {
          projectId: selectedProjectId,
          title: title.trim(),
          description: description.trim(),
          coverUrl: coverUrl.trim() || undefined,
          robloxPlaceId: parsedPlaceId || undefined,
          robloxUrl: robloxUrlOrId.trim() || undefined,
          tags: selectedTags,
        },
      });

      toast.success(`🎉 Game published! You earned +${res.bonusCredits || 10} extra AI credits!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish game. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-slate-950 p-6 text-white shadow-2xl shadow-indigo-500/10 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/30">
              <Gamepad2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">Publish Game to Community</h2>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                  +10 Free Credits 🎁
                </span>
              </div>
              <p className="text-xs text-slate-400">Share your Roblox creation for everyone to play & receive +10 bonus credits.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="mt-5 flex gap-2 rounded-2xl bg-white/[0.04] p-1.5 border border-white/10">
          <button
            type="button"
            onClick={() => setTab("project")}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              tab === "project"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="inline h-3.5 w-3.5 mr-1.5" /> From BloxSmith Project
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("custom");
              setSelectedProjectId(null);
            }}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              tab === "custom"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LinkIcon className="inline h-3.5 w-3.5 mr-1.5" /> Custom Roblox Game
          </button>
        </div>

        {/* Content Layout */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 max-h-[65vh] overflow-y-auto pr-1">
          {/* Form Side */}
          <div className="lg:col-span-7 space-y-4">
            {tab === "project" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">Select BloxSmith Project</label>
                {loadingProjects ? (
                  <div className="flex items-center justify-center p-6 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading projects...
                  </div>
                ) : myProjects.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-slate-400">
                    No projects found yet. Switch to "Custom Roblox Game" to enter any Roblox Place link directly!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto pr-1">
                    {myProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProject(p)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                          selectedProjectId === p.id
                            ? "border-indigo-500 bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-xs text-white">{p.name}</div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">{p.description || "No description"}</div>
                        </div>
                        {selectedProjectId === p.id && (
                          <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Game Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Cyberpunk Obby 2026"
                maxLength={120}
                required
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell players what makes your Roblox game awesome..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Roblox Link or Place ID */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Roblox Place ID or Game URL <span className="text-slate-500">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={robloxUrlOrId}
                  onChange={(e) => setRobloxUrlOrId(e.target.value)}
                  placeholder="e.g. https://www.roblox.com/games/123456789 or 123456789"
                  className="w-full rounded-xl border border-white/15 bg-black/40 pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Gamepad2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
              {parsedPlaceId ? (
                <p className="mt-1 text-[10px] text-emerald-400 font-medium">✓ Recognized Roblox Place ID: {parsedPlaceId}</p>
              ) : null}
            </div>

            {/* Cover URL */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Custom Cover Image URL <span className="text-slate-500">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://example.com/banner.png"
                  className="w-full rounded-xl border border-white/15 bg-black/40 pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Category Tags (Up to 5)</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_TAGS.map((t) => {
                  const active = selectedTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                          : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Card Preview Side */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Card Preview</span>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-xl transition hover:border-indigo-500/50">
                <div className="relative aspect-video overflow-hidden bg-slate-950">
                  {computedPreviewCover ? (
                    <img src={computedPreviewCover} alt={title || "Preview"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                      <Gamepad2 className="h-10 w-10 text-indigo-400/60 mb-1" />
                      <span className="text-[10px] text-slate-500">Thumbnail preview will appear here</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    {selectedTags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-[9px] font-bold text-white border border-white/10">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-3.5">
                  <h3 className="line-clamp-1 text-sm font-bold text-white">{title || "Untitled Roblox Game"}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{description || "Enter a description above to show your community game details..."}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
                    <span className="font-semibold text-indigo-300">Playable on Roblox</span>
                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">New</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Publishing...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Publish Game
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
