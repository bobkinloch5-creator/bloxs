import { Fragment, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  MoreVertical, FolderOpen, Pencil, Image as ImageIcon, Star, Pin, Copy, Download, Upload,
  RefreshCw, BarChart3, History as HistoryIcon, MessageSquare, Link2, Users, Settings as SettingsIcon,
  Archive, Trash2,
} from "lucide-react";
import {
  toggleProjectFavorite, toggleProjectPin, toggleProjectArchive,
  duplicateProject, exportProject, updateProjectSettings, importProject,
} from "@/lib/project-workspace.functions";
import { deleteProject } from "@/lib/projects.functions";
import { ExportGameModal } from "@/components/ExportGameModal";

export type ProjectMenuProject = {
  id: string;
  name: string;
  thumbnail_url?: string | null;
  is_favorite?: boolean | null;
  pinned_at?: string | null;
  archived_at?: string | null;
};

export function ProjectMenu({ project, onChanged }: { project: ProjectMenuProject; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [thumbOpen, setThumbOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const favFn = useServerFn(toggleProjectFavorite);
  const pinFn = useServerFn(toggleProjectPin);
  const archFn = useServerFn(toggleProjectArchive);
  const dupFn = useServerFn(duplicateProject);
  const expFn = useServerFn(exportProject);
  const delFn = useServerFn(deleteProject);
  const setFn = useServerFn(updateProjectSettings);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project", project.id] });
    onChanged?.();
  };

  const openInWorkspace = () => {
    try { localStorage.setItem("bs:activeProjectId", project.id); } catch {}
    try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
    navigate({ to: "/dashboard", hash: "build" });
  };

  const fav = useMutation({
    mutationFn: () => favFn({ data: { id: project.id, value: !project.is_favorite } }),
    onSuccess: () => { invalidate(); toast.success(project.is_favorite ? "Removed favorite" : "Marked favorite"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const pin = useMutation({
    mutationFn: () => pinFn({ data: { id: project.id, value: !project.pinned_at } }),
    onSuccess: () => { invalidate(); toast.success(project.pinned_at ? "Unpinned" : "Pinned"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const arch = useMutation({
    mutationFn: () => archFn({ data: { id: project.id, value: !project.archived_at } }),
    onSuccess: () => { invalidate(); toast.success(project.archived_at ? "Unarchived" : "Archived"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dup = useMutation({
    mutationFn: () => dupFn({ data: { id: project.id } }),
    onSuccess: (p: any) => {
      invalidate();
      toast.success("Duplicated");
      try { localStorage.setItem("bs:activeProjectId", p.id); } catch {}
      try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
      navigate({ to: "/dashboard", hash: "build" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Duplicate failed"),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: project.id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
      try {
        if (localStorage.getItem("bs:activeProjectId") === project.id) {
          localStorage.removeItem("bs:activeProjectId");
          try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
        }
      } catch {}
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const onExport = async () => {
    try {
      const payload = await expFn({ data: { id: project.id } });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.name.replace(/[^a-z0-9-_]/gi, "_")}.bloxsmith.json`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Exported");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/project/${project.id}`);
      toast.success("Link copied");
    } catch { toast.error("Copy failed"); }
  };

  const Item = ({ icon: Icon, label, danger, onClick, to, params }: any) => {
    const body = (
      <div className={`flex items-center gap-2 px-3 py-2 text-sm ${danger ? "text-rose-300 hover:bg-rose-500/10" : "text-slate-100 hover:bg-white/5"} cursor-pointer`}>
        <Icon className="h-4 w-4 opacity-80" />
        <span>{label}</span>
      </div>
    );
    if (to) return <Link to={to} params={params} onClick={() => setOpen(false)}>{body}</Link>;
    return <button className="w-full text-left" onClick={() => { setOpen(false); onClick?.(); }}>{body}</button>;
  };

  return (
    <Fragment>
      <div className="relative">
        <button
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-100"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
          aria-label="Project menu"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-9 z-50 w-60 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
              <Item icon={FolderOpen} label="Open" onClick={openInWorkspace} />
              <Item icon={Pencil} label="Rename" onClick={() => setRenameOpen(true)} />
              <Item icon={ImageIcon} label="Change Thumbnail" onClick={() => setThumbOpen(true)} />
              <Item icon={Star} label={project.is_favorite ? "Unfavorite" : "Favorite"} onClick={() => fav.mutate()} />
              <Item icon={Pin} label={project.pinned_at ? "Unpin" : "Pin"} onClick={() => pin.mutate()} />
              <Item icon={Copy} label="Duplicate" onClick={() => dup.mutate()} />
              <Item icon={Download} label="Export Game (Multi-Platform)" onClick={() => setExportModalOpen(true)} />
              <Item icon={Upload} label="Import Project" onClick={() => setImportOpen(true)} />
              <Item icon={RefreshCw} label="Refresh" onClick={() => { invalidate(); toast.success("Refreshed"); }} />
              <div className="h-px bg-white/5" />
              <Item icon={BarChart3} label="View Statistics" to="/history" />
              <Item icon={HistoryIcon} label="View Build History" to="/history" />
              <Item icon={MessageSquare} label="View Chat History" onClick={openInWorkspace} />
              <Item icon={Link2} label="Copy Project Link" onClick={copyLink} />
              <Item icon={Users} label="Manage Collaborators" to="/collaborators" />
              <Item icon={SettingsIcon} label="Project Settings" onClick={() => setSettingsOpen(true)} />
              <div className="h-px bg-white/5" />
              <Item icon={Archive} label={project.archived_at ? "Unarchive" : "Archive"} onClick={() => arch.mutate()} />
              <Item icon={Trash2} label="Delete" danger onClick={() => { if (confirm(`Delete "${project.name}"? This cannot be undone.`)) del.mutate(); }} />
            </div>
          </>
        )}
      </div>

      {exportModalOpen && (
        <ExportGameModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setExportModalOpen(false)}
        />
      )}
      {renameOpen && (
        <RenameDialog
          project={project}
          onClose={() => setRenameOpen(false)}
          onSave={async (name) => { await setFn({ data: { id: project.id, name } }); invalidate(); toast.success("Renamed"); }}
        />
      )}
      {thumbOpen && (
        <ThumbnailDialog
          onClose={() => setThumbOpen(false)}
          onSave={async (dataUrl) => { await setFn({ data: { id: project.id, thumbnail_url: dataUrl } }); invalidate(); toast.success("Thumbnail updated"); }}
        />
      )}
      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} onImported={invalidate} />
      )}
      {settingsOpen && (
        <SettingsDialog
          project={project}
          onClose={() => setSettingsOpen(false)}
          onSave={async (patch) => { await setFn({ data: { id: project.id, ...patch } }); invalidate(); toast.success("Settings saved"); }}
        />
      )}
    </Fragment>
  );
}

function SettingsDialog({
  project, onClose, onSave,
}: {
  project: ProjectMenuProject;
  onClose: () => void;
  onSave: (patch: { name?: string; description?: string; default_build_mode?: "fast" | "smart" | "deep" }) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState<string>((project as any).description ?? "");
  const [mode, setMode] = useState<"fast" | "smart" | "deep">(((project as any).default_build_mode as any) ?? "smart");
  const [saving, setSaving] = useState(false);
  return (
    <Modal onClose={onClose} title="Project Settings">
      <label className="block text-xs font-semibold text-slate-300">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
      />
      <label className="mt-3 block text-xs font-semibold text-slate-300">Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        placeholder="What is this project about?"
      />
      <label className="mt-3 block text-xs font-semibold text-slate-300">Default build mode</label>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as any)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#12122a] px-3 py-2 text-sm text-slate-100 [&>option]:bg-[#12122a] [&>option]:text-slate-100"
      >
        <option value="smart">Smart Build — balanced (recommended)</option>
        <option value="fast">Fast Build — fastest, for prototypes</option>
        <option value="deep">Deep Build — highest quality</option>
      </select>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
        <button
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({ name: name.trim(), description: description.trim(), default_build_mode: mode });
              onClose();
            } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
            finally { setSaving(false); }
          }}
          className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >Save</button>
      </div>
    </Modal>
  );
}


function RenameDialog({ project, onClose, onSave }: { project: ProjectMenuProject; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  return (
    <Modal onClose={onClose} title="Rename Project">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
        <button
          disabled={saving || !name.trim()}
          onClick={async () => { setSaving(true); try { await onSave(name.trim()); onClose(); } finally { setSaving(false); } }}
          className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >Save</button>
      </div>
    </Modal>
  );
}

function ThumbnailDialog({ onClose, onSave }: { onClose: () => void; onSave: (dataUrl: string) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onPick = (f: File) => {
    if (f.size > 400_000) { toast.error("Image must be under 400 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(f);
  };

  return (
    <Modal onClose={onClose} title="Change Thumbnail">
      <div
        className="grid h-40 place-items-center rounded-xl border-2 border-dashed border-white/15 bg-white/5 cursor-pointer overflow-hidden"
        onClick={() => fileRef.current?.click()}
      >
        {preview ? <img src={preview} className="h-full w-full object-cover" alt="preview" /> :
          <div className="text-xs text-slate-400">Click to choose an image (≤ 400 KB)</div>}
      </div>
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
        <button
          disabled={!preview || saving}
          onClick={async () => { if (!preview) return; setSaving(true); try { await onSave(preview); onClose(); } finally { setSaving(false); } }}
          className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >Save</button>
      </div>
    </Modal>
  );
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const importFn = useServerFn(importProject);
  return (
    <Modal onClose={onClose} title="Import Project">
      <p className="text-xs text-slate-400 mb-3">Pick a .bloxsmith.json file that was exported earlier.</p>
      <input
        ref={fileRef} type="file" accept="application/json,.json,.bloxsmith.json"
        className="w-full text-xs text-slate-300"
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          try {
            const text = await f.text();
            const payload = JSON.parse(text);
            await importFn({ data: { payload } });
            toast.success("Project imported");
            onImported(); onClose();
          } catch (err: any) { toast.error(err?.message ?? "Import failed"); }
          finally { setBusy(false); }
        }}
      />
      {busy && <div className="mt-3 text-xs text-slate-400">Importing…</div>}
      <div className="mt-3 flex justify-end">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">Close</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-bold text-white">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
