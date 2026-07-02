import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateProjectSettings, getProjectStats } from "@/lib/project-workspace.functions";

type Project = {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean | null;
  default_build_mode: string | null;
  default_execution_mode: string | null;
  default_model: string | null;
  default_language: string | null;
  roblox_place_id: number | null;
  roblox_universe_id: number | null;
};

export function ProjectSettingsPanel({ project }: { project: Project }) {
  const qc = useQueryClient();
  const setFn = useServerFn(updateProjectSettings);
  const statsFn = useServerFn(getProjectStats);
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    is_public: !!project.is_public,
    default_build_mode: (project.default_build_mode ?? "smart") as "fast" | "smart" | "deep",
    default_execution_mode: (project.default_execution_mode ?? "safe") as "safe" | "fast" | "owner",
    default_language: project.default_language ?? "en",
    roblox_place_id: project.roblox_place_id ? String(project.roblox_place_id) : "",
    roblox_universe_id: project.roblox_universe_id ? String(project.roblox_universe_id) : "",
  });

  const stats = useQuery({
    queryKey: ["project-stats", project.id],
    queryFn: () => statsFn({ data: { id: project.id } }),
  });

  const save = useMutation({
    mutationFn: () => setFn({ data: {
      id: project.id,
      name: form.name.trim() || project.name,
      description: form.description,
      is_public: form.is_public,
      default_build_mode: form.default_build_mode,
      default_execution_mode: form.default_execution_mode,
      default_language: form.default_language || null,
      roblox_place_id: form.roblox_place_id ? Number(form.roblox_place_id) : null,
      roblox_universe_id: form.roblox_universe_id ? Number(form.roblox_universe_id) : null,
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project settings saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";
  const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1";

  return (
    <div className="space-y-3">
      {/* Statistics */}
      <div className="bs-card rounded-2xl p-4">
        <div className="mb-2 text-sm font-semibold">Statistics</div>
        {stats.isLoading ? (
          <div className="text-xs text-slate-400">Loading…</div>
        ) : stats.data ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Builds", stats.data.builds],
              ["Messages", stats.data.messages],
              ["Actions", stats.data.actions],
              ["Scripts", stats.data.scripts],
              ["Assets", stats.data.assets],
              ["Models", stats.data.models],
              ["UI Gens", stats.data.uiGens],
              ["Errors", stats.data.errors],
              ["Milestones", stats.data.milestones],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-white/5 px-2 py-2">
                <div className="text-sm font-bold tabular-nums text-white">{v as any}</div>
                <div className="text-[10px] text-slate-400">{k as any}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Basics */}
      <div className="bs-card rounded-2xl p-4 space-y-3">
        <div>
          <label className={label}>Name</label>
          <input className={field} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea rows={3} className={field} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={form.is_public} onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))} />
          Public visibility
        </label>
      </div>

      {/* AI defaults */}
      <div className="bs-card rounded-2xl p-4 space-y-3">
        <div className="text-sm font-semibold">AI Preferences</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Build Mode</label>
            <select className={field} value={form.default_build_mode} onChange={(e) => setForm((f) => ({ ...f, default_build_mode: e.target.value as any }))}>
              <option value="fast">Fast</option>
              <option value="smart">Smart</option>
              <option value="deep">Deep</option>
            </select>
          </div>
          <div>
            <label className={label}>Execution Mode</label>
            <select className={field} value={form.default_execution_mode} onChange={(e) => setForm((f) => ({ ...f, default_execution_mode: e.target.value as any }))}>
              <option value="safe">Safe</option>
              <option value="fast">Fast</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Language</label>
          <input className={field} value={form.default_language} onChange={(e) => setForm((f) => ({ ...f, default_language: e.target.value }))} placeholder="en" />
        </div>
      </div>

      {/* Roblox link */}
      <div className="bs-card rounded-2xl p-4 space-y-3">
        <div className="text-sm font-semibold">Roblox Experience Link</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Place ID</label>
            <input inputMode="numeric" className={field} value={form.roblox_place_id} onChange={(e) => setForm((f) => ({ ...f, roblox_place_id: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <div>
            <label className={label}>Universe ID</label>
            <input inputMode="numeric" className={field} value={form.roblox_universe_id} onChange={(e) => setForm((f) => ({ ...f, roblox_universe_id: e.target.value.replace(/\D/g, "") }))} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
