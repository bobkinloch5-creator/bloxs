import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Loader2, Search, Folder } from "lucide-react";
import { listProjects } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { MobileNavTrigger } from "@/components/MobileNav";
import { BottomNav } from "@/components/BottomNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ProjectMenu } from "@/components/ProjectMenu";
import { NewProjectModal } from "@/components/NewProjectModal";
import thumbTycoon from "@/assets/thumbs/tycoon.jpg";
import thumbObby from "@/assets/thumbs/obby.jpg";
import thumbSimulator from "@/assets/thumbs/simulator.jpg";
import thumbRpg from "@/assets/thumbs/rpg.jpg";
import thumbHorror from "@/assets/thumbs/horror.jpg";
import thumbCustom from "@/assets/thumbs/custom.jpg";

const THUMBS: Record<string, string> = {
  tycoon: thumbTycoon, obby: thumbObby, simulator: thumbSimulator,
  rpg: thumbRpg, horror: thumbHorror, custom: thumbCustom,
};

type SortKey = "updated" | "created" | "name";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — BloxSmith" },
      { name: "description", content: "Manage all of your BloxSmith Roblox projects in one place." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProjectsPage,
});

function timeAgo(d: string | Date): string {
  const t = new Date(d).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const profFn = useServerFn(getMyProfile);

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const isAdmin = !!profile?.is_admin;

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = [...projects].filter((p) =>
      !term || p.name?.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term)
    );
    arr.sort((a, b) => {
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sort === "created") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return arr;
  }, [projects, q, sort]);

  function openProject(id: string) {
    try { localStorage.setItem("bs:activeProjectId", id); } catch {}
    try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a1a] text-slate-100" style={{ fontFamily: "Rubik, ui-sans-serif, system-ui" }}>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-[#0a0a1a]/85 px-3 py-3 backdrop-blur sm:px-8 sm:py-4">
        <MobileNavTrigger isAdmin={isAdmin} className="lg:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-[24px]">Projects</h1>
          <p className="mt-0.5 hidden text-sm text-slate-400 sm:block">Manage every project in your workspace.</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.7)] transition hover:bg-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" /> New Project
        </button>
        <ProfileMenu />
      </header>

      <main className="mx-auto w-full max-w-[1240px] space-y-5 px-3 pb-28 pt-5 sm:px-8 sm:pb-10 sm:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search projects…"
              className="min-h-[40px] w-full rounded-xl border border-white/10 bg-white/[0.02] pl-9 pr-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400/40"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-[40px] rounded-xl border border-white/10 bg-[#12122a] px-3 py-2 text-sm font-semibold text-slate-100"
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name (A→Z)</option>
          </select>
        </div>

        {isLoading ? (
          <div className="grid h-60 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-10 text-center">
            <Folder className="mx-auto h-8 w-8 text-slate-500" />
            <div className="mt-3 text-sm font-semibold text-slate-200">
              {q ? "No projects match your search." : "You don't have any projects yet."}
            </div>
            <div className="mt-1 text-xs text-slate-500">Create a new project to get started.</div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <li key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] transition hover:-translate-y-0.5 hover:border-indigo-400/30">
                <button
                  type="button"
                  onClick={() => openProject(p.id)}
                  className="relative block h-32 w-full overflow-hidden bg-white/5 text-left"
                >
                  <img
                    src={p.thumbnail_url ?? THUMBS[p.game_type ?? "custom"] ?? THUMBS.custom}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </button>
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-100">
                      {p.pinned_at && <span title="Pinned">📌</span>}
                      {p.is_favorite && <span title="Favorite" className="text-amber-300">★</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">Updated {timeAgo(p.updated_at)}</div>
                  </div>
                  <ProjectMenu project={p} />
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-white/5 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">{p.game_type ?? "custom"}</span>
                  <button
                    type="button"
                    onClick={() => openProject(p.id)}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav isAdmin={isAdmin} />
      <NewProjectModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["projects"] });
          try { localStorage.setItem("bs:activeProjectId", id); } catch {}
          navigate({ to: "/dashboard" });
        }}
      />
    </div>
  );
}
