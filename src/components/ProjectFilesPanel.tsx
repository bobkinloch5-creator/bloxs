import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectFiles } from "@/lib/project-workspace.functions";
import {
  FolderTree,
  FileCode,
  Download,
  Copy,
  Check,
  Search,
  ExternalLink,
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
  Share2,
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

  const listFn = useServerFn(listProjectFiles);

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

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-xl backdrop-blur-xl transition-all hover:border-white/15">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30">
            <FolderTree className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Project Explorer
              {isRefetching && <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />}
            </h3>
            <p className="text-[11px] text-slate-400">
              {files.length} Roblox object{files.length !== 1 ? "s" : ""} • {totalLines.toLocaleString()} lines
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => refetch()}
            title="Refresh Files"
            className="rounded-lg border border-white/10 bg-slate-800/80 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-500/20 hover:from-blue-500 hover:to-cyan-500 transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search code files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>

        <button
          type="button"
          onClick={handleCopyInstaller}
          title="Copy 1-Shot Installer code for Roblox Studio"
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition-colors"
        >
          {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Terminal className="h-3.5 w-3.5 text-cyan-400" />}
          <span>1-Shot Lua</span>
        </button>
      </div>

      {/* File Tree List */}
      <div className="mt-3 max-h-[420px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-cyan-400 mb-2" />
            <span className="text-xs">Loading project hierarchy…</span>
          </div>
        ) : Object.keys(groupedFiles).length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 py-8 text-center px-4">
            <FileCode className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">
              {search ? "No matching files found" : "No scripts generated yet"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Ask BloxSmith in the chat box to build system scripts or features for your Roblox place.
            </p>
          </div>
        ) : (
          Object.entries(groupedFiles).map(([service, serviceFiles]) => {
            const isCollapsed = collapsedServices[service];
            return (
              <div key={service} className="rounded-xl border border-white/5 bg-slate-950/40 overflow-hidden">
                {/* Service Group Header */}
                <button
                  type="button"
                  onClick={() => toggleService(service)}
                  className="flex w-full items-center justify-between bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    )}
                    <Folder className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {service.replace(/^game\./, "")}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
                    {serviceFiles.length}
                  </span>
                </button>

                {/* Service Files */}
                {!isCollapsed && (
                  <div className="divide-y divide-white/5 border-t border-white/5">
                    {serviceFiles.map((file) => {
                      const lineCount = file.source ? file.source.split("\n").length : 0;
                      return (
                        <div
                          key={file.id}
                          onClick={() => setSelectedFile(file)}
                          className="group flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {getItemIcon(file.className)}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                                  {file.name}
                                </span>
                                {getClassBadge(file.className)}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate font-mono">
                                {lineCount} lines • {file.className}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                              title="View Full Code"
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            >
                              <Eye className="h-3.5 w-3.5 text-cyan-400" />
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

      {/* Code Viewer Modal */}
      {selectedFile && typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
            onClick={() => setSelectedFile(null)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <FileCode className="h-4 w-4" />
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

              {/* Code Content Box */}
              <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs text-slate-200 custom-scrollbar leading-relaxed">
                <pre className="whitespace-pre-wrap break-words">
                  {selectedFile.source.split("\n").map((line, idx) => (
                    <div key={idx} className="flex hover:bg-white/[0.03]">
                      <span className="w-10 select-none text-right pr-4 text-slate-600 flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="flex-1">{line || " "}</span>
                    </div>
                  ))}
                </pre>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/90 px-5 py-3 text-xs text-slate-400">
                <span>
                  {selectedFile.source.split("\n").length} lines • {selectedFile.source.length} characters
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="rounded-lg bg-slate-800 px-4 py-1.5 font-medium text-white hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
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
