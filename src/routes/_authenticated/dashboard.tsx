import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, createProject, deleteProject } from "@/lib/projects.functions";
import { useState } from "react";
import { Plus, Trash2, ArrowRight, Loader2, Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Projects — BloxSmith" }] }),
  component: Dashboard,
});

const GAME_TYPES = ["custom", "tycoon", "obby", "simulator", "rpg", "horror", "tower-defense", "racing", "fighting", "round-based", "roleplay", "survival"];

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const delFn = useServerFn(deleteProject);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState("custom");
  const [description, setDescription] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name, description, game_type: gameType } }),
    onSuccess: (p) => {
      setOpen(false); setName(""); setDescription(""); setGameType("custom");
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/project/$projectId", params: { projectId: p.id } });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Your Projects</h1>
          <p className="text-sm text-muted-foreground">Each project is a Roblox game BloxSmith helps you build.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New project
        </button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <div className="col-span-full flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!isLoading && projects.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center">
            <Boxes className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No projects yet. Create your first one to start building.</p>
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id} className="glass group relative rounded-2xl p-5">
            <Link to="/project/$projectId" params={{ projectId: p.id }} className="block">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.game_type}</div>
              <h3 className="font-display mt-1 text-lg font-semibold">{p.name}</h3>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{p.build_count ?? 0} builds</span>
                <span className={p.plugin_connected ? "text-success" : ""}>
                  {p.plugin_connected ? "● Plugin live" : "○ Offline"}
                </span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-0 transition group-hover:opacity-100">
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
            <button
              onClick={() => { if (confirm(`Delete "${p.name}"?`)) delMut.mutate(p.id); }}
              className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-semibold">New project</h2>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sushi Tycoon"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <select
                value={gameType}
                onChange={(e) => setGameType(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {GAME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-line idea (optional)"
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
              <button
                disabled={!name || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
