import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listTemplates, installTemplate } from "@/lib/templates-market.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Download, Sparkles } from "lucide-react";

export const Route = createFileRoute("/templates-market")({
  head: () => ({
    meta: [
      { title: "Template Marketplace — free BloxSmith starters" },
      { name: "description", content: "Free Roblox game templates you can install into any BloxSmith project with one click." },
      { property: "og:title", content: "BloxSmith Template Marketplace" },
      { property: "og:description", content: "Free build presets shared by the community." },
      { property: "og:url", content: "https://bloxsmith.pro/templates-market" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/templates-market" }],
  }),
  component: TemplatesMarketPage,
});

const CATEGORIES = ["all", "obby", "tycoon", "simulator", "rpg", "racing", "fighting", "other"] as const;

function TemplatesMarketPage() {
  const listFn = useServerFn(listTemplates);
  const installFn = useServerFn(installTemplate);
  const qc = useQueryClient();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["templates", cat],
    queryFn: () => listFn({ data: { category: cat === "all" ? null : cat, limit: 48 } }),
  });
  const templates = data?.templates ?? [];

  const installMut = useMutation({
    mutationFn: (templateId: string) => {
      const pid = typeof window !== "undefined" ? window.localStorage.getItem("bs:activeProjectId") : null;
      if (!pid) throw new Error("Open a project first, then install a template into it.");
      return installFn({ data: { templateId, projectId: pid } });
    },
    onSuccess: (r) => {
      toast.success(`Installed! ${r.queued} actions queued to Studio.`);
      qc.invalidateQueries({ queryKey: ["plugin-actions"] });
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Install failed." })),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-white">
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Template Marketplace</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Free build presets. One click installs them into your active project. Publish your own from any project's menu.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition ${
              cat === c
                ? "border-indigo-400/60 bg-indigo-500/20 text-white"
                : "border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.04] p-10 text-center">
          <p className="text-slate-300">No templates in this category yet.</p>
          <Link to="/dashboard" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
            Build something and share
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <article key={t.id} className="overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]">
              <div className="aspect-video overflow-hidden bg-slate-900">
                {t.cover_url ? (
                  <img src={t.cover_url} alt={t.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">📦</div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="line-clamp-1 text-base font-bold">{t.title}</h2>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-100">Free</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-300">{t.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 capitalize">{t.category}</span>
                  <button
                    onClick={() => installMut.mutate(t.id)}
                    disabled={installMut.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:opacity-60"
                  >
                    {installMut.isPending ? <Sparkles className="h-3 w-3 animate-pulse" /> : <Download className="h-3 w-3" />}
                    Install
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
