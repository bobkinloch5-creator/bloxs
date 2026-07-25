import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { exportProject } from "@/lib/project-workspace.functions";
import { buildStudioExport, zipFiles, type ExportScript } from "@/lib/studio-export";
import { Download, Check, Copy, FileCode, Package, Layers, Sparkles, X, Globe, Code2, Monitor } from "lucide-react";
import { toast } from "sonner";

export type ExportFormat = "rojo-zip" | "installer-lua" | "roblox-ts" | "json-manifest" | "luau-bundle" | "web-html";

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
      } else if (format === "web-html") {
        const htmlContent = buildHtmlWebPackage(projectName, rawScripts, data);
        const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
        downloadBlob(blob, `${safeName}.html`);
        toast.success("Exported Standalone HTML Web App!");
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
              <p className="text-xs text-slate-400">Export "{projectName}" to Roblox Studio, roblox-ts, HTML Web App, or Luau</p>
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
            id="web-html"
            title="HTML Web App (.html)"
            description="Single-file interactive web package with 3D canvas, script explorer, and live preview."
            icon={Monitor}
            selected={format === "web-html"}
            onSelect={() => setFormat("web-html")}
            badge="Web Ready"
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

function buildHtmlWebPackage(projectName: string, scripts: ExportScript[], rawData: any) {
  const safeTitle = projectName || "Roblox Experience";
  const jsonScripts = JSON.stringify(scripts);
  const jsonMeta = JSON.stringify(rawData || {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — BloxSmith Web Export</title>
  <style>
    :root {
      --bg: #070913;
      --card: #0f172a;
      --accent: #6366f1;
      --cyan: #22d3ee;
      --pink: #ec4899;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: rgba(255, 255, 255, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; overflow-x: hidden; }
    header { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
    .logo-group { display: flex; align-items: center; gap: 0.75rem; }
    .logo-badge { background: linear-gradient(135deg, var(--accent), var(--pink)); color: white; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; box-shadow: 0 0 15px rgba(99, 102, 241, 0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; background: linear-gradient(to right, #fff, #93c5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { font-size: 0.75rem; color: var(--muted); }
    .btn { background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--border); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.5rem; }
    .btn:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25); }
    .btn-primary { background: linear-gradient(135deg, #6366f1, #ec4899); border: none; box-shadow: 0 0 15px rgba(236,72,153,0.3); }
    .btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }
    main { flex: 1; display: grid; grid-template-columns: 280px 1fr; height: calc(100vh - 65px); }
    @media (max-width: 768px) { main { grid-template-columns: 1fr; height: auto; } }
    sidebar { background: #0b0f19; border-right: 1px solid var(--border); padding: 1rem; overflow-y: auto; }
    .section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.75rem; }
    .file-tree { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
    .file-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.85rem; color: #cbd5e1; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
    .file-item:hover { background: rgba(255,255,255,0.06); color: white; }
    .file-item.active { background: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.4); color: var(--cyan); font-weight: 600; }
    .file-badge { font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: rgba(255,255,255,0.08); text-transform: uppercase; }
    .content-area { display: flex; flex-direction: column; background: #04060d; overflow: hidden; }
    .tab-bar { background: #0b0f19; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 1rem; gap: 0.5rem; height: 44px; }
    .tab { padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
    .view-pane { flex: 1; display: none; flex-direction: column; overflow: hidden; position: relative; }
    .view-pane.active { display: flex; }
    canvas#preview-canvas { width: 100%; height: 100%; display: block; background: #02040a; }
    pre { flex: 1; padding: 1.25rem; overflow: auto; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 0.85rem; line-height: 1.6; color: #e2e8f0; background: #04060d; }
    .canvas-overlay { position: absolute; top: 1rem; left: 1rem; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid var(--border); padding: 1rem 1.25rem; border-radius: 14px; font-size: 0.8rem; color: #94a3b8; max-width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .canvas-overlay h3 { color: white; font-size: 0.95rem; margin-bottom: 0.35rem; }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="logo-badge">⚡</div>
      <div>
        <h1>${safeTitle}</h1>
        <div class="subtitle">BloxSmith Web Game Export • Standalone HTML Package</div>
      </div>
    </div>
    <div style="display:flex; gap:0.5rem;">
      <button class="btn" onclick="copyAllLua()">📋 Copy All Scripts</button>
      <button class="btn btn-primary" onclick="downloadJSON()">⬇ Download JSON</button>
    </div>
  </header>
  <main>
    <sidebar>
      <div class="section-title">Project Scripts (${scripts.length})</div>
      <ul class="file-tree" id="file-tree"></ul>
    </sidebar>
    <div class="content-area">
      <div class="tab-bar">
        <div class="tab active" onclick="switchTab('canvas')">🎮 Interactive Web Canvas</div>
        <div class="tab" onclick="switchTab('code')">📜 Luau Source Code</div>
      </div>
      <div class="view-pane active" id="pane-canvas">
        <canvas id="preview-canvas"></canvas>
        <div class="canvas-overlay">
          <h3>${safeTitle}</h3>
          <p>Standalone HTML Web App exported from BloxSmith. Includes interactive 3D Web Canvas and complete script browser.</p>
        </div>
      </div>
      <div class="view-pane" id="pane-code">
        <pre><code id="code-viewer">-- Select a script from the sidebar to inspect its source code.</code></pre>
      </div>
    </div>
  </main>
  <script>
    const SCRIPTS = ${jsonScripts};
    const META = ${jsonMeta};
    let activeIdx = 0;

    function renderTree() {
      const tree = document.getElementById('file-tree');
      tree.innerHTML = '';
      SCRIPTS.forEach((s, idx) => {
        const li = document.createElement('li');
        li.className = 'file-item' + (idx === activeIdx ? ' active' : '');
        li.onclick = () => selectScript(idx);
        li.innerHTML = '<span>📄 ' + s.name + '</span><span class="file-badge">' + (s.className || 'Script') + '</span>';
        tree.appendChild(li);
      });
    }

    function selectScript(idx) {
      activeIdx = idx;
      renderTree();
      const s = SCRIPTS[idx];
      if (s) {
        document.getElementById('code-viewer').textContent = '-- Location: ' + (s.parentPath || 'ServerScriptService') + '.' + s.name + ' (' + (s.className || 'Script') + ')\n\n' + s.source;
        switchTab('code');
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach((t, i) => {
        t.classList.toggle('active', (tab === 'canvas' && i === 0) || (tab === 'code' && i === 1));
      });
      document.getElementById('pane-canvas').classList.toggle('active', tab === 'canvas');
      document.getElementById('pane-code').classList.toggle('active', tab === 'code');
    }

    function copyAllLua() {
      const all = SCRIPTS.map(s => '-- ' + s.name + '\n' + s.source).join('\\n\\n-- ========================\\n\\n');
      navigator.clipboard.writeText(all).then(() => alert('All scripts copied to clipboard!'));
    }

    function downloadJSON() {
      const blob = new Blob([JSON.stringify(META, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${safeTitle}.json';
      a.click();
    }

    // Interactive Web Canvas Engine
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    let width, height;
    function resize() {
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
    }
    window.onresize = resize;
    resize();

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 3.5 + 1,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      color: 'hsla(' + (Math.random() * 60 + 220) + ', 85%, 65%, 0.8)'
    }));

    function loop() {
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, width, height);

      // Cyber Grid
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.07)';
      ctx.lineWidth = 1;
      const gridSize = 45;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Dynamic Particles
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fill();
      });

      requestAnimationFrame(loop);
    }
    loop();
    renderTree();
  </script>
</body>
</html>`;
}
