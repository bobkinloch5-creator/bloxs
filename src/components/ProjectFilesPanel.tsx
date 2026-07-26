import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listProjectFiles,
  saveScriptFile,
  moveProjectFile,
  deleteProjectFile,
  clearStaleScan,
} from "@/lib/project-workspace.functions";
import {
  FolderTree,
  FileCode,
  Download,
  Copy,
  Check,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Folder,
  Terminal,
  Zap,
  PackageCheck,
  Eye,
  X,
  Code2,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  Loader2,
  Edit3,
  GripVertical,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ExportGameModal } from "./ExportGameModal";
import { buildStudioExport } from "@/lib/studio-export";

interface ProjectFile {
  id: string;
  name: string;
  className: string;
  parentPath: string;
  source: string;
  updatedAt: string;
  actionKind: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

export function ProjectFilesPanel({ projectId, projectName }: Props) {
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [collapsedServices, setCollapsedServices] = useState<Record<string, boolean>>({});

  // Fullscreen / Expanded panel view toggle
  const [isExpanded, setIsExpanded] = useState(false);

  // Live Code Editor states
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Drag and drop states
  const [draggedFile, setDraggedFile] = useState<ProjectFile | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const clearScanFn = useServerFn(clearStaleScan);

  const handleManualRefresh = async () => {
    try {
      await clearScanFn();
    } catch {}
    refetch();
    toast.success("Refreshed project files!");
  };

  const {
    data: files = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await listFn({ data: { projectId } });
      return res as ProjectFile[];
    },
    enabled: Boolean(projectId),
    refetchInterval: 10000, // auto-refresh files every 10s while active
  });

  // Whenever a file is selected for viewing, sync edited code buffer
  useEffect(() => {
    if (selectedFile) {
      setEditedCode(selectedFile.source || "");
      setIsEditing(false);
    }
  }, [selectedFile]);

  const totalLines = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.source ? f.source.split("\n").length : 0), 0);
  }, [files]);

  // Group files by Roblox Service / parentPath
  const groupedFiles = useMemo(() => {
    const map: Record<string, ProjectFile[]> = {};
    const filtered = search.trim()
      ? files.filter(
          (f) =>
            f.name.toLowerCase().includes(search.toLowerCase()) ||
            f.parentPath.toLowerCase().includes(search.toLowerCase()) ||
            f.source.toLowerCase().includes(search.toLowerCase())
        )
      : files;

    for (const f of filtered) {
      const parent = f.parentPath || "ServerScriptService";
      if (!map[parent]) map[parent] = [];
      map[parent].push(f);
    }
    return map;
  }, [files, search]);

  const toggleService = (service: string) => {
    setCollapsedServices((prev) => ({ ...prev, [service]: !prev[service] }));
  };

  const handleCopySingle = async (f: ProjectFile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(f.source);
      setCopiedId(f.id);
      toast.success(`Copied ${f.name} code!`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy code.");
    }
  };

  const handleDownloadSingle = (f: ProjectFile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ext = f.className === "ModuleScript" ? ".lua" : f.className === "LocalScript" ? ".client.lua" : ".server.lua";
    const blob = new Blob([f.source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.name}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${f.name}`);
  };

  const handleCopyInstaller = async () => {
    try {
      const rawScripts = files.map((s) => ({
        name: s.name,
        className: s.className as any,
        parentPath: s.parentPath,
        source: s.source,
      }));
      const studioExp = buildStudioExport(projectName, rawScripts);
      const installerFile = studioExp.files.find((f) => f.path === "BloxSmith_Install.lua");
      const content = installerFile?.content || "-- No scripts available";
      await navigator.clipboard.writeText(content);
      setCopiedAll(true);
      toast.success("Copied 1-Shot Studio Installer Script!");
      setTimeout(() => setCopiedAll(false), 3000);
    } catch {
      toast.error("Failed to generate installer code.");
    }
  };

  // Live save code & sync to Roblox Studio
  const handleSaveAndSync = async () => {
    if (!selectedFile || !projectId) return;
    setIsSaving(true);
    try {
      await saveFn({
        data: {
          projectId,
          name: selectedFile.name,
          parentPath: selectedFile.parentPath,
          className: selectedFile.className,
          source: editedCode,
        },
      });

      // Update local object so preview updates instantly
      selectedFile.source = editedCode;
      setIsEditing(false);
      refetch();

      toast.success(`⚡ Synced changes in "${selectedFile.name}" to Roblox Studio live!`, {
        description: "The BloxSmith Studio plugin will apply your updated script on its next poll.",
      });
    } catch (err) {
      toast.error("Failed to sync code to Roblox Studio", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and drop handler functions
  const handleDragStart = (e: React.DragEvent, file: ProjectFile) => {
    setDraggedFile(file);
    e.dataTransfer.setData("application/json", JSON.stringify(file));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTarget !== targetPath) {
      setDragOverTarget(targetPath);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, newParentPath: string) => {
    e.preventDefault();
    setDragOverTarget(null);

    const fileToMove = draggedFile;
    setDraggedFile(null);

    if (!fileToMove || !projectId) return;
    if (fileToMove.parentPath === newParentPath) return; // already there

    try {
      await moveFn({
        data: {
          projectId,
          name: fileToMove.name,
          parentPath: fileToMove.parentPath,
          newParentPath,
        },
      });

      // Optimistically update local file object parentPath
      fileToMove.parentPath = newParentPath;
      refetch();

      toast.success(`⚡ Moved "${fileToMove.name}" to ${newParentPath}!`, {
        description: "Roblox Studio plugin will update the instance location automatically.",
      });
    } catch (err) {
      toast.error("Failed to move file", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteFile = async (f: ProjectFile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!projectId) return;
    if (!confirm(`Are you sure you want to delete "${f.name}" from Roblox Studio?`)) return;

    try {
      await deleteFn({
        data: {
          projectId,
          name: f.name,
          parentPath: f.parentPath,
        },
      });

      if (selectedFile?.id === f.id) setSelectedFile(null);
      refetch();

      toast.success(`⚡ Delete action queued for "${f.name}" in Roblox Studio`);
    } catch (err) {
      toast.error("Failed to delete file", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const getClassBadge = (className: string) => {
    switch (className) {
      case "LocalScript":
        return <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">Client</span>;
      case "ModuleScript":
        return <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-400">Module</span>;
      case "ScreenGui":
        return <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-pink-400">GUI</span>;
      case "RemoteEvent":
      case "RemoteFunction":
        return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">Remote</span>;
      case "Folder":
        return <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400">Folder</span>;
      case "Model":
      case "Part":
      case "MeshPart":
        return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">3D Object</span>;
      default:
        return <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">{className}</span>;
    }
  };

  const getItemIcon = (className: string) => {
    switch (className) {
      case "Folder":
        return <Folder className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />;
      case "Model":
      case "Part":
      case "MeshPart":
        return <PackageCheck className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />;
      case "ScreenGui":
        return <Code2 className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />;
      case "RemoteEvent":
      case "RemoteFunction":
        return <Zap className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />;
      default:
        return <FileCode className="h-3.5 w-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors flex-shrink-0" />;
    }
  };

  // Render the Tree List component (used in both normal card & expanded modal view)
  const renderTreeContent = (maxHeightClass = "max-h-[640px]") => (
    <div className={`mt-3 ${maxHeightClass} overflow-y-auto pr-1 space-y-2 bs-smooth-scroll`}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400 mb-2" />
          <span className="text-xs">Loading project hierarchy…</span>
        </div>
      ) : Object.keys(groupedFiles).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 py-10 text-center px-4">
          <FileCode className="h-8 w-8 text-slate-600 mb-2" />
          <p className="text-xs font-medium text-slate-300">
            {search ? "No matching files found" : "No scripts generated yet"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
            Ask BloxSmith in the chat box to build system scripts or features for your Roblox place.
          </p>
        </div>
      ) : (
        Object.entries(groupedFiles).map(([service, serviceFiles]) => {
          const isCollapsed = collapsedServices[service];
          const isTarget = dragOverTarget === service;
          return (
            <div
              key={service}
              onDragOver={(e) => handleDragOver(e, service)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, service)}
              className={`rounded-xl border transition-all overflow-hidden ${
                isTarget
                  ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.35)] ring-2 ring-cyan-400/50"
                  : "border-white/5 bg-slate-950/50"
              }`}
            >
              {/* Service Group Header / Drop Target */}
              <button
                type="button"
                onClick={() => toggleService(service)}
                className="flex w-full items-center justify-between bg-white/[0.03] px-3.5 py-2.5 text-left hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  )}
                  <Folder className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-200 truncate">
                    {service.replace(/^game\./, "")}
                  </span>
                  {isTarget && (
                    <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded animate-pulse">
                      Drop to move here
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-slate-800/80 border border-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
                  {serviceFiles.length}
                </span>
              </button>

              {/* Service Files */}
              {!isCollapsed && (
                <div className="divide-y divide-white/5 border-t border-white/5">
                  {serviceFiles.map((file) => {
                    const lineCount = file.source ? file.source.split("\n").length : 0;
                    const isFolder = file.className === "Folder";
                    const itemPath = `${file.parentPath}.${file.name}`;
                    const isItemTarget = dragOverTarget === itemPath;

                    return (
                      <div
                        key={file.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, file)}
                        onDragOver={(e) => isFolder && handleDragOver(e, itemPath)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => isFolder && handleDrop(e, itemPath)}
                        onClick={() => setSelectedFile(file)}
                        className={`group flex items-center justify-between px-3.5 py-2.5 text-left cursor-grab active:cursor-grabbing transition-all ${
                          isItemTarget
                            ? "bg-cyan-500/20 border-cyan-400 ring-1 ring-cyan-400"
                            : selectedFile?.id === file.id
                            ? "bg-cyan-500/10 border-l-2 border-cyan-400"
                            : "hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <GripVertical className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 cursor-grab" />
                          {getItemIcon(file.className)}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                                {file.name}
                              </span>
                              {getClassBadge(file.className)}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5">
                              {lineCount} lines • {file.className}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleCopySingle(file, e)}
                            title="Copy Script Code"
                            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                          >
                            {copiedId === file.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDownloadSingle(file, e)}
                            title="Download Luau Script"
                            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedFile(file)}
                            title="Edit & View Code"
                            className="rounded p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                          >
                            <Pencil className="h-3.5 w-3.5 text-cyan-400" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteFile(file, e)}
                            title="Delete File from Studio"
                            className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 p-4 sm:p-5 shadow-2xl backdrop-blur-xl transition-all hover:border-white/15">
      {/* Main Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30">
            <FolderTree className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 tracking-tight">
              Project Explorer
              {isRefetching && <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />}
            </h3>
            <p className="text-[11px] font-medium text-slate-400">
              {files.length} Roblox object{files.length !== 1 ? "s" : ""} • Drag & Drop to Move
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleManualRefresh}
            title="Refresh Files"
            className="rounded-xl border border-white/10 bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            title="Expand Fullscreen Studio Explorer & Editor"
            className="rounded-xl border border-white/10 bg-slate-800/80 p-2 text-cyan-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-blue-500 hover:to-cyan-500 transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search code files & instances…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>

        <button
          type="button"
          onClick={handleCopyInstaller}
          title="Copy 1-Shot Installer code for Roblox Studio"
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/50 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/60 hover:text-white transition-colors"
        >
          {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Terminal className="h-3.5 w-3.5 text-cyan-400" />}
          <span>1-Shot Lua</span>
        </button>
      </div>

      {/* File Tree List (Roomier height & Drag-and-Drop) */}
      {renderTreeContent("max-h-[640px]")}

      {/* Fullscreen / Expanded View Portal */}
      {isExpanded && typeof window !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 sm:p-6">
            <div className="flex h-[92vh] w-full max-w-7xl flex-col rounded-3xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/90 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <FolderTree className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      {projectName} — Live Roblox Studio Hierarchy
                    </h2>
                    <p className="text-xs text-slate-400">
                      {files.length} objects • Drag and drop items to re-parent them live
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyInstaller}
                    className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900 hover:text-white"
                  >
                    {copiedAll ? <Check className="h-4 w-4 text-emerald-400" /> : <Terminal className="h-4 w-4 text-cyan-400" />}
                    <span>Copy 1-Shot Installer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/20"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export Game</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="rounded-xl border border-white/10 bg-slate-800 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body: Split View (Left: Tree, Right: Code Preview / Editor) */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left Tree Explorer */}
                <div className="w-80 flex-shrink-0 border-r border-white/10 bg-slate-950/60 p-4 flex flex-col min-h-0">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter files…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="flex-1 overflow-auto">
                    {renderTreeContent("h-full")}
                  </div>
                </div>

                {/* Right Code Editor / Viewer */}
                <div className="flex-1 flex flex-col bg-slate-950 min-h-0 overflow-hidden">
                  {selectedFile ? (
                    <>
                      {/* Code Header Bar */}
                      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-6 py-3">
                        <div className="flex items-center gap-3">
                          <FileCode className="h-5 w-5 text-cyan-400" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white">{selectedFile.name}</h3>
                              {getClassBadge(selectedFile.className)}
                            </div>
                            <p className="text-xs font-mono text-slate-400">
                              {selectedFile.parentPath}.{selectedFile.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditing(!isEditing)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                              isEditing
                                ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                                : "border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                            }`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>{isEditing ? "Viewing Mode" : "Edit Code"}</span>
                          </button>

                          {isEditing && (
                            <button
                              type="button"
                              onClick={handleSaveAndSync}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                              <span>Save & Sync to Studio</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleCopySingle(selectedFile, e)}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
                          >
                            {copiedId === selectedFile.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-cyan-400" />}
                            <span>Copy</span>
                          </button>
                        </div>
                      </div>

                      {/* Code Content Area */}
                      <div className="flex-1 overflow-auto bg-[#0d0d1f] p-4 font-mono text-xs text-slate-200 leading-relaxed bs-smooth-scroll">
                        {isEditing ? (
                          <textarea
                            value={editedCode}
                            onChange={(e) => setEditedCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                const start = e.currentTarget.selectionStart;
                                const end = e.currentTarget.selectionEnd;
                                const val = e.currentTarget.value;
                                setEditedCode(val.substring(0, start) + "  " + val.substring(end));
                                setTimeout(() => {
                                  if (e.currentTarget) {
                                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                                  }
                                }, 0);
                              }
                            }}
                            className="w-full h-full min-h-[500px] bg-transparent text-slate-100 font-mono text-xs outline-none resize-none leading-relaxed"
                            placeholder="Write Luau code here…"
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words">
                            {(selectedFile.source || "").split("\n").map((line, idx) => (
                              <div key={idx} className="flex hover:bg-white/[0.04] py-0.5">
                                <span className="w-12 select-none text-right pr-4 text-slate-600 flex-shrink-0 font-mono">
                                  {idx + 1}
                                </span>
                                <span className="flex-1 font-mono">{line || " "}</span>
                              </div>
                            ))}
                          </pre>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <FileCode className="h-12 w-12 text-slate-700 mb-3" />
                      <p className="text-sm font-semibold text-slate-400">Select a script from the tree to view or edit code</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Code Viewer / Editor Modal (When clicked in normal view) */}
      {selectedFile && !isExpanded && typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setSelectedFile(null)}
          >
            <div
              className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/90 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <FileCode className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {selectedFile.name}
                      {getClassBadge(selectedFile.className)}
                    </h3>
                    <p className="text-xs font-mono text-slate-400">
                      {selectedFile.parentPath}.{selectedFile.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                      isEditing
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>{isEditing ? "Viewing Mode" : "Edit Code"}</span>
                  </button>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleSaveAndSync}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      <span>Save & Sync to Studio</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleCopySingle(selectedFile, e)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    {copiedId === selectedFile.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-cyan-400" />
                    )}
                    <span>{copiedId === selectedFile.id ? "Copied!" : "Copy Code"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDownloadSingle(selectedFile, e)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Code Editor / Viewer Box */}
              <div className="flex-1 overflow-auto bg-[#0c0c1e] p-4 font-mono text-xs text-slate-200 leading-relaxed bs-smooth-scroll min-h-[350px]">
                {isEditing ? (
                  <textarea
                    value={editedCode}
                    onChange={(e) => setEditedCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const val = e.currentTarget.value;
                        setEditedCode(val.substring(0, start) + "  " + val.substring(end));
                        setTimeout(() => {
                          if (e.currentTarget) {
                            e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                          }
                        }, 0);
                      }
                    }}
                    className="w-full h-full min-h-[400px] bg-transparent text-slate-100 font-mono text-xs outline-none resize-none leading-relaxed"
                    placeholder="Write Luau code here…"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words">
                    {(selectedFile.source || "").split("\n").map((line, idx) => (
                      <div key={idx} className="flex hover:bg-white/[0.04] py-0.5">
                        <span className="w-10 select-none text-right pr-4 text-slate-600 flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="flex-1">{line || " "}</span>
                      </div>
                    ))}
                  </pre>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/90 px-5 py-3 text-xs text-slate-400">
                <span>
                  {(isEditing ? editedCode : selectedFile.source).split("\n").length} lines • {(isEditing ? editedCode : selectedFile.source).length} characters
                </span>
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleSaveAndSync}
                      disabled={isSaving}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 font-bold text-white hover:bg-emerald-500 transition-colors flex items-center gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Save & Sync</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="rounded-lg bg-slate-800 px-4 py-1.5 font-medium text-white hover:bg-slate-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Export Game Modal */}
      {showExportModal && (
        <ExportGameModal
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
