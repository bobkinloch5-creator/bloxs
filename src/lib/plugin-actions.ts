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
  "folder",
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
  create_local_script: "localscript",
  local_script: "localscript",
  local_script_create: "localscript",
  create_module_script: "modulescript",
  module_script: "modulescript",
  create_ui: "screengui",
  create_gui: "screengui",
  screen_gui: "screengui",
  create_screen_gui: "screengui",
  create_folder: "folder",
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

export function normalizePluginActionKind(kind: unknown): PluginActionKind {
  const raw = String(kind ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const canonical = raw.replace(/_/g, "");
  const direct = PLUGIN_ACTION_KINDS.find((k) => k === raw || k.replace(/_/g, "") === canonical);
  if (direct) return direct;
  const alias = ALIASES[raw] || ALIASES[canonical];
  if (alias) return alias;
  throw new Error(`Unsupported Studio action kind "${String(kind ?? "")}". Use one of: ${PLUGIN_ACTION_KINDS.join(", ")}.`);
}

export function normalizePluginAction(action: any) {
  return {
    kind: normalizePluginActionKind(action?.kind),
    parent_path: String(action?.parent_path || action?.target_parent_path || "Workspace"),
    name: String(action?.name || action?.target_path || "BloxSmithAction"),
    payload: action?.payload && typeof action.payload === "object" ? action.payload : {},
  };
}
