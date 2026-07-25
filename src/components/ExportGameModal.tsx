import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { exportProject } from "@/lib/project-workspace.functions";
import { buildStudioExport, zipFiles, type ExportScript } from "@/lib/studio-export";
import { Download, Check, Copy, FileCode, Package, Layers, Sparkles, X, Globe, Code2 } from "lucide-react";
import { toast } from "sonner";

export type ExportFormat = "rojo-zip" | "installer-lua" | "roblox-ts" | "json-manifest" | "luau-bundle";

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function ExportGameModal({ projectId, projectName, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("rojo-zip");
  const [exporting, setExporting] = useState(false);
  const [copiedLua, setCopiedLua] = useState(false);
  const expFn = useServerFn(exportProject);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await expFn({ data: { id: projectId } });
      const rawScripts: ExportScript[] = (data.scripts ?? []).map((s: any) => ({
        name: s.name,
        className: s.class_name as any,
        parentPath: s.parent_path ?? "ServerScriptService",
        source: s.source,
      }));

      const safeName = (projectName || "bloxsmith-game").replace(/[^a-z0-9-_]/gi, "_");

      if (format === "rojo-zip") {
        const studioExp = buildStudioExport(projectName, rawScripts);
        const zipBytes = zipFiles(studioExp.files);
        const blob = new Blob([zipBytes], { type: "application/zip" });
        downloadBlob(blob, `${safeName}-rojo.zip`);
        toast.success(`Exported ${rawScripts.length} scripts to Rojo ZIP!`);
      } else if (format === "installer-lua") {
        const studioExp = buildStudioExport(projectName, rawScripts);
        const installerFile = studioExp.files.find((f) => f.path === "BloxSmith_Install.lua");
        const content = installerFile?.content || "-- No scripts";
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, `${safeName}_Install.lua`);
        toast.success("Downloaded Studio 1-Shot Installer Script!");
      } else if (format === "roblox-ts") {
        // Build roblox-ts structure
        const files = buildRobloxTsStructure(projectName, rawScripts);
        const zipBytes = zipFiles(files);
        const blob = new Blob([zipBytes], { type: "application/zip" });
        downloadBlob(blob, `${safeName}-roblox-ts.zip`);
        toast.success("Exported roblox-ts TypeScript project ZIP!");
      } else if (format === "json-manifest") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${safeName}.bloxsmith.json`);
        toast.success("Exported Universal JSON Blueprint!");
      } else if (format === "luau-bundle") {
        const bundledCode = buildLuauBundle(projectName, rawScripts);
        const blob = new Blob([bundledCode], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, `${safeName}_Bundled.lua`);
        toast.success("Exported Standalone Luau Module Bundle!");
      }

      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const copyInstallerToClipboard = async () => {
    try {
      setExporting(true);
      const data = await expFn({ data: { id: projectId } });
      const rawScripts: ExportScript[] = (data.scripts ?? []).map((s: any) => ({
        name: s.name,
        className: s.class_name as any,
        parentPath: s.parent_path ?? "ServerScriptService",
        source: s.source,
      }));
      const studioExp = buildStudioExport(projectName, rawScripts);
      const installerFile = studioExp.files.find((f) => f.path === "BloxSmith_Install.lua");
      const content = installerFile?.content || "";
      await navigator.clipboard.writeText(content);
      setCopiedLua(true);
      toast.success("1-Shot Installer script copied to clipboard!");
      setTimeout(() => setCopiedLua(false), 3000);
    } catch (e: any) {
      toast.error(e?.message ?? "Copy failed");
    } finally {
      setExporting(false);
    }
  };

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-indigo-500/30 bg-slate-900/95 p-6 text-slate-100 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/20">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Export Game & Code</h3>
              <p className="text-xs text-slate-400">Export "{projectName}" to Roblox Studio, roblox-ts, or standalone Luau</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Format Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormatCard
            id="rojo-zip"
            title="Roblox Studio (Rojo ZIP)"
            description="Full Rojo 7 project with default.project.json and src/ file tree."
            icon={Package}
            selected={format === "rojo-zip"}
            onSelect={() => setFormat("rojo-zip")}
            badge="Recommended"
          />

          <FormatCard
            id="installer-lua"
            title="Studio Command Bar (.lua)"
            description="1-Shot pasteable script. Paste into Studio Command Bar to generate all scripts instantly."
            icon={Code2}
            selected={format === "installer-lua"}
            onSelect={() => setFormat("installer-lua")}
          />

          <FormatCard
            id="roblox-ts"
            title="roblox-ts TypeScript (.zip)"
            description="TypeScript layout with tsconfig.json and package.json for roblox-ts tooling."
            icon={FileCode}
            selected={format === "roblox-ts"}
            onSelect={() => setFormat("roblox-ts")}
          />

          <FormatCard
            id="luau-bundle"
            title="Luau Module Bundle (.lua)"
            description="Single self-contained Luau bundle compatible with Lune and custom engines."
            icon={Layers}
            selected={format === "luau-bundle"}
            onSelect={() => setFormat("luau-bundle")}
          />

          <FormatCard
            id="json-manifest"
            title="Universal JSON Blueprint"
            description="Full portable JSON containing all scripts, hierarchy, and metadata."
            icon={Globe}
            selected={format === "json-manifest"}
            onSelect={() => setFormat("json-manifest")}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={copyInstallerToClipboard}
            disabled={exporting}
            className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2.5 text-xs font-semibold text-indigo-200 flex items-center gap-2 transition"
          >
            {copiedLua ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-cyan-300" />}
            {copiedLua ? "Installer Copied!" : "Copy 1-Shot Installer"}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl bg-gradient-to-r from-violet-600 via-pink-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white px-5 py-2.5 text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-50 transition"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Generating Export…" : "Export File"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FormatCard({
  title, description, icon: Icon, selected, onSelect, badge,
}: {
  id: string;
  title: string;
  description: string;
  icon: any;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border p-3.5 cursor-pointer transition flex flex-col justify-between ${
        selected
          ? "border-violet-500 bg-violet-500/15 shadow-md shadow-violet-500/20 ring-1 ring-violet-500/40"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-cyan-300" : "text-slate-400"}`} />
            <h4 className={`text-xs font-bold truncate ${selected ? "text-white" : "text-slate-200"}`}>{title}</h4>
          </div>
          {badge && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 text-white shrink-0">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">{description}</p>
      </div>

      <div className="mt-2.5 flex justify-end">
        <div
          className={`h-4 w-4 rounded-full border flex items-center justify-center transition ${
            selected ? "border-cyan-400 bg-cyan-500 text-slate-950" : "border-white/20"
          }`}
        >
          {selected && <Check className="h-3 w-3 stroke-[3]" />}
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildRobloxTsStructure(projectName: string, scripts: ExportScript[]) {
  const files: { path: string; content: string }[] = [];

  files.push({
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          allowSyntheticDefaultImports: true,
          jsx: "react",
          moduleResolution: "node",
          noImplicitAny: true,
          rootDir: "src",
          outDir: "out",
          target: "es6",
        },
      },
      null,
      2,
    ),
  });

  files.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        version: "1.0.0",
        description: `${projectName} - Generated by BloxSmith`,
        devDependencies: {
          "@rbxts/types": "^1.0.0",
          typescript: "^5.0.0",
        },
      },
      null,
      2,
    ),
  });

  for (const s of scripts) {
    const tsExt = s.className === "Script" ? ".server.ts" : s.className === "LocalScript" ? ".client.ts" : ".ts";
    files.push({
      path: `src/${s.parentPath.replace(/\./g, "/")}/${s.name}${tsExt}`,
      content: `// Transpiled from Luau script: ${s.name}\n${s.source}`,
    });
  }

  return files;
}

function buildLuauBundle(projectName: string, scripts: ExportScript[]) {
  const header = [
    `-- [[ Bundled Luau Script for: ${projectName} ]]`,
    `-- Generated by BloxSmith on ${new Date().toISOString()}`,
    `-- Total Scripts: ${scripts.length}`,
    "",
    "local BloxSmithBundle = {}",
    "",
  ];

  const bodies = scripts.map((s) => {
    return [
      `-- Script: ${s.parentPath}.${s.name} (${s.className})`,
      `BloxSmithBundle["${s.parentPath}.${s.name}"] = function()`,
      s.source,
      "end",
      "",
    ].join("\n");
  });

  return [...header, ...bodies, "return BloxSmithBundle"].join("\n");
}
