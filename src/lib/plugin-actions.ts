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
] as const;

export type PluginActionKind = typeof PLUGIN_ACTION_KINDS[number];

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
  organize: "organize_project",
  autofix: "autofix_project",
  fix_project: "autofix_project",
  insert_toolbox_asset: "insert_asset",
  search_toolbox: "insert_asset",
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

export function normalizePluginAction(action: any) {
  const kind = normalizePluginActionKind(action?.kind);
  if (kind === "organize_project" && /^(folder|create[_\s-]*folder)$/i.test(String(action?.kind ?? "").trim())) {
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
    payload: action?.payload && typeof action.payload === "object" ? action.payload : {},
  };
}

export function normalizeParentPath(kind: PluginActionKind, action: any): string {
  const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
  const raw = String(action?.parent_path || action?.target_parent_path || payload.parent_path || "").trim();
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
