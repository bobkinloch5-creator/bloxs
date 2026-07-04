export const PLUGIN_ACTION_KINDS = [
  "script",
  "localscript",
  "modulescript",
  "gui",
  "screengui",
  "frame",
  "textlabel",
  "textbutton",
  "imagelabel",
  "part",
  "model",
  "terrain",
  "tool",
  "sound",
  "team",
  "remoteevent",
  "remotefunction",
  "bindableevent",
  "leaderstats",
  "insert_asset",
  "set_properties",
  "rename",
  "move",
  "delete",
  "setting",
  "run",
  "run_lua",
  "organize_project",
  "autofix_project",
  "scan_project",
  "playtest",
  "snapshot",
  "restore_snapshot",
] as const;

export type PluginActionKind = typeof PLUGIN_ACTION_KINDS[number];

// Virtual "toolbelt" kinds. The AI emits these; we compile them to a real
// run_lua action here so no plugin update is required to support them.
export const VIRTUAL_TOOLBELT_KINDS = [
  "camera_focus",
  "select_object",
  "transform_object",
  "patch_script",
] as const;
export type VirtualToolbeltKind = typeof VIRTUAL_TOOLBELT_KINDS[number];

function luaStr(v: unknown): string {
  return `"${String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "")}"`;
}

function luaResolvePathHelper(): string {
  return `local function _bs_resolve(path)
  if not path or path == "" then return nil end
  local ok, obj = pcall(function()
    local parts = {}
    for seg in string.gmatch(path, "[^%./]+") do table.insert(parts, seg) end
    local node = nil
    local first = parts[1]
    local svcOk, svc = pcall(function() return game:GetService(first) end)
    if svcOk and svc then node = svc else node = game:FindFirstChild(first) or workspace:FindFirstChild(first) end
    for i = 2, #parts do
      if not node then return nil end
      node = node:FindFirstChild(parts[i])
    end
    return node
  end)
  if ok then return obj end
  return nil
end`;
}

function compileCameraFocus(action: any): { source: string } {
  const target = String(action?.target_path || action?.payload?.target_path || action?.parent_path || "").trim();
  const distance = Number(action?.payload?.distance ?? 40);
  return { source: `-- BloxSmith: camera_focus\n${luaResolvePathHelper()}\nlocal cam = workspace.CurrentCamera\nlocal target = _bs_resolve(${luaStr(target)})\nif target then\n  local pos\n  if target:IsA("BasePart") then pos = target.Position\n  elseif target:IsA("Model") then local pv = target.PrimaryPart or target:FindFirstChildWhichIsA("BasePart"); pos = pv and pv.Position or (target:GetBoundingBox() and select(1, target:GetBoundingBox()).Position)\n  end\n  if pos then\n    local offset = Vector3.new(${distance}, ${distance * 0.6}, ${distance})\n    cam.CFrame = CFrame.new(pos + offset, pos)\n    if game:GetService("Selection") then game:GetService("Selection"):Set({ target }) end\n    print("[BloxSmith] Camera focused on ", target:GetFullName())\n  else\n    warn("[BloxSmith] camera_focus: target has no position: " .. tostring(target))\n  end\nelse\n  warn("[BloxSmith] camera_focus: target not found: ${target}")\nend` };
}

function compileSelectObject(action: any): { source: string } {
  const raw = action?.payload?.target_paths ?? action?.target_paths ?? [action?.target_path || action?.parent_path];
  const paths = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String);
  const list = paths.map((p) => luaStr(p)).join(", ");
  return { source: `-- BloxSmith: select_object\n${luaResolvePathHelper()}\nlocal Selection = game:GetService("Selection")\nlocal picks = {}\nfor _, p in ipairs({ ${list} }) do local o = _bs_resolve(p); if o then table.insert(picks, o) end end\nSelection:Set(picks)\nprint("[BloxSmith] Selected " .. #picks .. " object(s)")` };
}

function compileTransformObject(action: any): { source: string } {
  const p = action?.payload || {};
  const target = String(p.target_path || action?.target_path || action?.parent_path || "").trim();
  const move = p.move && Array.isArray(p.move) ? p.move : null;    // [x,y,z] delta studs
  const rotate = p.rotate && Array.isArray(p.rotate) ? p.rotate : null; // [x,y,z] degrees delta
  const scale = Number(p.scale ?? 0);                              // uniform scale factor
  const setCFrame = p.set_cframe && Array.isArray(p.set_cframe) ? p.set_cframe : null; // [x,y,z] absolute
  const parts: string[] = [];
  if (move) parts.push(`obj:PivotTo(obj:GetPivot() + Vector3.new(${Number(move[0])||0}, ${Number(move[1])||0}, ${Number(move[2])||0}))`);
  if (rotate) parts.push(`obj:PivotTo(obj:GetPivot() * CFrame.Angles(math.rad(${Number(rotate[0])||0}), math.rad(${Number(rotate[1])||0}), math.rad(${Number(rotate[2])||0})))`);
  if (scale && scale > 0 && scale !== 1) parts.push(`if obj:IsA("Model") then obj:ScaleTo((obj:GetScale() or 1) * ${scale}) elseif obj:IsA("BasePart") then obj.Size = obj.Size * ${scale} end`);
  if (setCFrame) parts.push(`obj:PivotTo(CFrame.new(${Number(setCFrame[0])||0}, ${Number(setCFrame[1])||0}, ${Number(setCFrame[2])||0}))`);
  const body = parts.join("\n  ") || `print("[BloxSmith] transform_object: no-op (no move/rotate/scale/set_cframe)")`;
  return { source: `-- BloxSmith: transform_object\n${luaResolvePathHelper()}\nlocal ChangeHistoryService = game:GetService("ChangeHistoryService")\nlocal obj = _bs_resolve(${luaStr(target)})\nif obj then\n  local rec = ChangeHistoryService:TryBeginRecording("BloxSmith Transform") or nil\n  ${body}\n  if rec then ChangeHistoryService:FinishRecording(rec, Enum.FinishRecordingOperation.Commit) end\n  print("[BloxSmith] Transformed ", obj:GetFullName())\nelse\n  warn("[BloxSmith] transform_object: target not found: ${target}")\nend` };
}

function compilePatchScript(action: any): { source: string } {
  const p = action?.payload || {};
  const target = String(p.target_path || action?.target_path || "").trim();
  const patches = Array.isArray(p.patches) ? p.patches : (p.find ? [{ find: p.find, replace: p.replace ?? "" }] : []);
  const appendSource = typeof p.append === "string" ? p.append : "";
  const prependSource = typeof p.prepend === "string" ? p.prepend : "";
  const patchLines = patches.map((pt: any, i: number) => {
    const find = luaStr(pt?.find);
    const replace = luaStr(pt?.replace ?? "");
    const literal = pt?.plain !== false; // default plain-text (safer than regex)
    return literal
      ? `do local f, r = ${find}, ${replace}; local newSrc, n = string.gsub(src, f:gsub("[%(%)%.%%%+%-%*%?%[%]%^%$]", "%%%%%%%1"), function() return r end); if n > 0 then src = newSrc; changed = changed + n; print("[BloxSmith] patch ${i+1}: ", n, " replacement(s)") else warn("[BloxSmith] patch ${i+1}: no match for pattern") end end`
      : `do local newSrc, n = string.gsub(src, ${find}, ${replace}); if n > 0 then src = newSrc; changed = changed + n; print("[BloxSmith] patch ${i+1}: ", n, " replacement(s)") else warn("[BloxSmith] patch ${i+1}: no match for pattern") end end`;
  }).join("\n  ");
  return { source: `-- BloxSmith: patch_script (preserves surrounding user edits)\n${luaResolvePathHelper()}\nlocal ChangeHistoryService = game:GetService("ChangeHistoryService")\nlocal target = _bs_resolve(${luaStr(target)})\nif not target or not (target:IsA("Script") or target:IsA("LocalScript") or target:IsA("ModuleScript")) then\n  warn("[BloxSmith] patch_script: script not found at ${target}")\n  return\nend\nlocal src = target.Source\nlocal changed = 0\nlocal rec = ChangeHistoryService:TryBeginRecording("BloxSmith Patch Script")\n  ${patchLines}\n${prependSource ? `src = ${luaStr(prependSource)} .. "\\n" .. src; changed = changed + 1` : ""}\n${appendSource ? `src = src .. "\\n" .. ${luaStr(appendSource)}; changed = changed + 1` : ""}\nif changed > 0 then\n  target.Source = src\n  print("[BloxSmith] patched " .. target:GetFullName() .. " with " .. changed .. " edits")\nelse\n  warn("[BloxSmith] patch_script produced no changes for " .. target:GetFullName())\nend\nif rec then ChangeHistoryService:FinishRecording(rec, Enum.FinishRecordingOperation.Commit) end` };
}

function tryCompileVirtualToolbelt(rawKind: string, action: any): { kind: PluginActionKind; parent_path: string; name: string; payload: Record<string, unknown> } | null {
  const k = rawKind.trim().toLowerCase().replace(/[\s-]+/g, "_");
  let compiled: { source: string } | null = null;
  let label = "";
  if (k === "camera_focus" || k === "focus_camera" || k === "camera_zoom_to") { compiled = compileCameraFocus(action); label = "CameraFocus"; }
  else if (k === "select_object" || k === "select_objects" || k === "selection_set") { compiled = compileSelectObject(action); label = "SelectObject"; }
  else if (k === "transform_object" || k === "move_object" || k === "rotate_object" || k === "scale_object") { compiled = compileTransformObject(action); label = "TransformObject"; }
  else if (k === "patch_script" || k === "edit_script" || k === "modify_script") { compiled = compilePatchScript(action); label = "PatchScript"; }
  if (!compiled) return null;
  return {
    kind: "run_lua",
    parent_path: "Workspace",
    name: `BloxSmith_${label}`,
    payload: { source: compiled.source, _toolbelt: k },
  };
}

const ALIASES: Record<string, PluginActionKind> = {
  create_script: "script",
  update_script: "script",
  server_script: "script",
  create_server_script: "script",
  serverscript: "script",
  update_serverscript: "script",
  create_local_script: "localscript",
  local_script: "localscript",
  local_script_create: "localscript",
  create_localscript: "localscript",
  update_localscript: "localscript",
  client_script: "localscript",
  clientscript: "localscript",
  create_client_script: "localscript",
  create_module_script: "modulescript",
  module_script: "modulescript",
  create_modulescript: "modulescript",
  update_modulescript: "modulescript",
  module: "modulescript",
  create_ui: "screengui",
  create_gui: "screengui",
  screen_gui: "screengui",
  create_screen_gui: "screengui",
  folder: "organize_project",
  create_folder: "organize_project",
  create_part: "part",
  create_model: "model",
  insert_model: "model",
  create_remote_event: "remoteevent",
  remote_event: "remoteevent",
  create_remote_function: "remotefunction",
  remote_function: "remotefunction",
  create_bindable_event: "bindableevent",
  bindable_event: "bindableevent",
  delete_object: "delete",
  delete_instance: "delete",
  run_test: "scan_project",
  test_project: "scan_project",
  scan_game: "scan_project",
  playtest_report: "scan_project",
  build_report: "scan_project",
  final_build_report: "scan_project",
  ai_playtest: "playtest",
  run_playtest: "playtest",
  test_game: "playtest",
  qa_test: "playtest",
  error_reader: "scan_project",
  read_errors: "scan_project",
  organize: "organize_project",
  create_folder_structure: "organize_project",
  autofix: "autofix_project",
  fix_project: "autofix_project",
  fix_errors: "autofix_project",
  fix_all: "autofix_project",
  make_premium: "autofix_project",
  optimize_mobile: "autofix_project",
  optimize_performance: "autofix_project",
  safety_scan: "autofix_project",
  insert_toolbox_asset: "insert_asset",
  search_toolbox: "insert_asset",
  search_toolbox_assets: "insert_asset",
  preview_asset: "insert_asset",
  replace_asset: "insert_asset",
  save_milestone: "snapshot",
  create_snapshot: "snapshot",
  capture_snapshot: "snapshot",
  build_checkpoint: "snapshot",
  checkpoint: "snapshot",
  timeline_save: "snapshot",
  restore_milestone: "restore_snapshot",
  rollback: "restore_snapshot",
  rollback_milestone: "restore_snapshot",
  restore_checkpoint: "restore_snapshot",
  timeline_restore: "restore_snapshot",
};

// Any kind name containing one of these tokens (after underscore-stripping)
// but not already matched above is almost certainly a script the model meant
// to write — route it to the right script type instead of throwing and
// silently dropping the whole action. Order matters: check localscript /
// modulescript signals before the generic "script" fallback.
const SCRIPT_KIND_HINTS: Array<{ test: RegExp; kind: PluginActionKind }> = [
  { test: /local|client/, kind: "localscript" },
  { test: /module/, kind: "modulescript" },
  { test: /script/, kind: "script" },
];

export function normalizePluginActionKind(kind: unknown): PluginActionKind {
  const raw = String(kind ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const canonical = raw.replace(/_/g, "");
  const direct = PLUGIN_ACTION_KINDS.find((k) => k === raw || k.replace(/_/g, "") === canonical);
  if (direct) return direct;
  const alias = ALIASES[raw] || ALIASES[canonical];
  if (alias) return alias;
  for (const hint of SCRIPT_KIND_HINTS) {
    if (hint.test.test(raw)) return hint.kind;
  }
  throw new Error(`Unsupported Studio action kind "${String(kind ?? "")}". Use one of: ${PLUGIN_ACTION_KINDS.join(", ")}.`);
}

import { validateLuau, stripCodeFences } from "@/lib/luau-validator";

export function normalizePluginAction(action: any) {
  const rawKind = action?.kind ?? action?.action ?? action?.type;
  // Virtual toolbelt kinds compile to run_lua so they need no plugin update.
  const virtual = tryCompileVirtualToolbelt(String(rawKind ?? ""), action);
  if (virtual) return virtual;
  const kind = normalizePluginActionKind(rawKind);
  const payload = action?.payload && typeof action.payload === "object" ? { ...action.payload } : {};
  if (action?.source && (kind === "script" || kind === "localscript" || kind === "modulescript" || kind === "run_lua")) {
    payload.source = action.source;
  }
  // Luau sanity check + auto-fix. Strip stray markdown fences, then fix the
  // most common LLM slip-ups deterministically before shipping to Studio.
  if (payload.source && (kind === "script" || kind === "localscript" || kind === "modulescript" || kind === "run_lua")) {
    let src = stripCodeFences(String(payload.source));
    // Modernize deprecated APIs so scripts don't throw at runtime.
    src = src
      .replace(/(?<!task\.)\bwait\s*\(/g, "task.wait(")
      .replace(/(?<!task\.)\bspawn\s*\(\s*function/g, "task.spawn(function")
      .replace(/(?<!task\.)\bdelay\s*\(/g, "task.delay(")
      .replace(/:connect\s*\(/g, ":Connect(")
      // loadstring is disabled on Roblox — replace calls with a nil-returning
      // stub so the script still parses instead of throwing at load time.
      .replace(/\bloadstring\s*\([^)]*\)/g, "(function() return nil end)()");

    payload.source = src;
    const issues = validateLuau(payload.source);
    if (issues.length) {
      payload._luau_issues = issues;
      payload._needs_retry = issues.some((i) => i.severity === "error");
    }

    // Runtime safety net for one-off run_lua actions: wrap in xpcall so a
    // "attempt to call a nil value" style error becomes a warning instead of
    // marking the whole build as failed. Real Scripts/LocalScripts/ModuleScripts
    // are left untouched because they need to run in Roblox as authored.
    if (kind === "run_lua" && !/^--\s*BloxSmith:\s*_wrapped/m.test(payload.source)) {
      const safeName = String(action?.name || "run_lua").replace(/"/g, '\\"');
      payload.source = `-- BloxSmith: _wrapped\nlocal ok, err = xpcall(function()\n${payload.source}\nend, function(e) return tostring(e) .. "\\n" .. debug.traceback() end)\nif not ok then warn("[BloxSmith] run_lua (${safeName}) recovered from error: " .. tostring(err)) end\n`;
    }
  }


  if (action?.target_path && !payload.target_path) payload.target_path = action.target_path;
  if (action?.target && !payload.parent_path) payload.parent_path = action.target;
  if (action?.properties && !payload.properties) payload.properties = action.properties;
  if (action?.asset_id && !payload.asset_id) payload.asset_id = action.asset_id;
  if (action?.assetId && !payload.asset_id) payload.asset_id = action.assetId;
  if (action?.fallback_ids && !payload.fallback_ids) payload.fallback_ids = action.fallback_ids;
  if (action?.fallbackIds && !payload.fallback_ids) payload.fallback_ids = action.fallbackIds;
  if (kind === "insert_asset") {
    const preview = payload.preview && typeof payload.preview === "object" ? payload.preview as Record<string, unknown> : {};
    if (payload.assetId && !payload.asset_id) payload.asset_id = payload.assetId;
    if (payload.fallbackIds && !payload.fallback_ids) payload.fallback_ids = payload.fallbackIds;
    payload.toolbox_only = payload.toolbox_only ?? true;
    payload.free_only = payload.free_only ?? true;
    payload.no_scripts = payload.no_scripts ?? true;
    payload.disable_procedural_fallback = payload.disable_procedural_fallback ?? true;
    payload.allow_duplicates = payload.allow_duplicates ?? false;
    payload.ground_snap = payload.ground_snap ?? true;
    payload.asset_name = payload.asset_name ?? preview.name;
    payload.creator_name = payload.creator_name ?? preview.creatorName;
    payload.source_query = payload.source_query ?? preview.sourceQuery;
    payload.category = payload.category ?? preview.category;
    payload.quality_tier = payload.quality_tier ?? preview.qualityTier;
    payload.safety_score = payload.safety_score ?? preview.safety;
    payload.relevance_score = payload.relevance_score ?? preview.relevance;
    if (!payload.tags && Array.isArray(preview.tags)) payload.tags = preview.tags;
    // Single-asset hygiene: if the planner flagged this as a single-object request,
    // tell the plugin to reject obvious packs and to extract just the matching
    // child if the inserted model turns out to be a multi-asset container.
    if (payload.single_asset_only) {
      payload.extract_single = payload.extract_single ?? true;
      payload.max_children = payload.max_children ?? 25;
      payload.reject_pack_names = payload.reject_pack_names ?? true;
    }
  }

  if (kind === "leaderstats") {
    // The Studio plugin formats stat values with %d, so any string value
    // (e.g. "0") crashes with "invalid argument #3 to 'format' (number
    // expected, got string)". Coerce values to numbers and kinds to the
    // Roblox *Value class that matches. Fall back to StringValue when the
    // value truly is non-numeric.
    const rawStats = Array.isArray(payload.stats) ? payload.stats : [];
    payload.stats = rawStats.map((s: any) => {
      const stat = s && typeof s === "object" ? { ...s } : {};
      const rawValue = stat.value ?? stat.default ?? 0;
      const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
      const isNum = Number.isFinite(num);
      let statKind = String(stat.kind || stat.type || "").trim();
      if (!statKind) statKind = isNum ? (Number.isInteger(num) ? "IntValue" : "NumberValue") : "StringValue";
      if (isNum) {
        stat.value = statKind === "StringValue" ? String(num) : num;
      } else {
        stat.value = String(rawValue ?? "");
        statKind = "StringValue";
      }
      stat.kind = statKind;
      stat.name = String(stat.name || "Stat");
      return stat;
    });
  }



  if (kind === "organize_project" && /^(folder|create[_\s-]*folder)$/i.test(String(rawKind ?? "").trim())) {
    return {
      kind,
      parent_path: "Workspace",
      name: "BloxSmith_NoEmptyFolders_Cleanup",
      payload: {
        reason: "folder_only_actions_are_forbidden",
        requested_name: String(action?.name || ""),
      },
    };
  }
  return {
    kind,
    parent_path: normalizeParentPath(kind, action),
    name: String(action?.name || action?.target_path || "BloxSmithAction"),
    payload,
  };
}

export function normalizeParentPath(kind: PluginActionKind, action: any): string {
  const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
  const raw = String(action?.parent_path || action?.target_parent_path || action?.target || payload.parent_path || "").trim();
  const path = raw.replace(/\//g, ".");

  if (kind === "script" || kind === "leaderstats") return serviceOr(path, "ServerScriptService");
  if (kind === "localscript") {
    if (/StarterGui|ScreenGui|TextButton|ImageButton|Frame/i.test(path)) return path;
    if (/StarterCharacterScripts/i.test(path)) return "StarterPlayer.StarterCharacterScripts";
    return "StarterPlayer.StarterPlayerScripts";
  }
  if (kind === "modulescript") {
    if (/^ReplicatedStorage\.Modules(\.|$)/i.test(path)) return path;
    return "ReplicatedStorage.Modules";
  }
  if (kind === "remoteevent" || kind === "remotefunction" || kind === "bindableevent") {
    if (/^ReplicatedStorage\.Remotes(\.|$)/i.test(path)) return path;
    return "ReplicatedStorage.Remotes";
  }
  if (kind === "screengui" || kind === "gui") return serviceOr(path, "StarterGui");
  if (kind === "frame" || kind === "textlabel" || kind === "textbutton" || kind === "imagelabel") {
    return serviceOr(path, "StarterGui");
  }
  if (kind === "tool") return serviceOr(path, "StarterPack");
  if (kind === "sound") return serviceOr(path, "SoundService");
  if (kind === "team") return "Teams";
  if (kind === "insert_asset") {
    if (String(payload.folder_name || "").includes("Imported") || /import/i.test(String(action?.name || ""))) {
      return "Workspace.BloxSmith_Imported_Models";
    }
    return serviceOr(path, "Workspace");
  }
  if (kind === "part" || kind === "model" || kind === "terrain") return serviceOr(path, "Workspace");
  return serviceOr(path, "Workspace");
}

function serviceOr(path: string, fallback: string): string {
  if (!path) return fallback;
  if (/^StarterPlayerScripts$/i.test(path)) return "StarterPlayer.StarterPlayerScripts";
  if (/^StarterCharacterScripts$/i.test(path)) return "StarterPlayer.StarterCharacterScripts";
  if (/^(Workspace|ReplicatedStorage|ReplicatedFirst|ServerScriptService|ServerStorage|StarterGui|StarterPack|StarterPlayer|Lighting|SoundService|Teams)(\.|$)/i.test(path)) {
    return path;
  }
  return fallback;
}
