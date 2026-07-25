// Tests for the Studio action normalizer. A bad parent path here is what
// causes "Anchored is not a valid member of Script" crashes in Roblox Studio.
import { describe, expect, it } from "vitest";
import {
  PLUGIN_ACTION_KINDS,
  normalizeParentPath,
  normalizePluginAction,
  normalizePluginActionKind,
} from "./plugin-actions";

describe("normalizePluginActionKind", () => {
  it("accepts every canonical kind", () => {
    for (const kind of PLUGIN_ACTION_KINDS) {
      expect(normalizePluginActionKind(kind)).toBe(kind);
    }
  });

  it("normalizes case, spaces and dashes", () => {
    expect(normalizePluginActionKind("Local Script")).toBe("localscript");
    expect(normalizePluginActionKind("module-script")).toBe("modulescript");
    expect(normalizePluginActionKind("  SCREENGUI ")).toBe("screengui");
  });

  it("throws a helpful error for an unknown kind", () => {
    expect(() => normalizePluginActionKind("teleport_everyone")).toThrow(/Unsupported Studio action kind/);
  });
});

describe("normalizeParentPath", () => {
  it("keeps server scripts in ServerScriptService", () => {
    expect(normalizeParentPath("script", {})).toBe("ServerScriptService");
    expect(normalizeParentPath("leaderstats", {})).toBe("ServerScriptService");
  });

  it("routes local scripts to StarterPlayerScripts by default", () => {
    expect(normalizeParentPath("localscript", {})).toBe("StarterPlayer.StarterPlayerScripts");
  });

  it("routes character local scripts correctly", () => {
    expect(normalizeParentPath("localscript", { parent_path: "StarterCharacterScripts" })).toBe(
      "StarterPlayer.StarterCharacterScripts",
    );
  });

  it("collects modules and remotes under ReplicatedStorage", () => {
    expect(normalizeParentPath("modulescript", {})).toBe("ReplicatedStorage.Modules");
    expect(normalizeParentPath("remoteevent", {})).toBe("ReplicatedStorage.Remotes");
    expect(normalizeParentPath("remotefunction", {})).toBe("ReplicatedStorage.Remotes");
  });

  it("never parents a Part under a script-only service", () => {
    expect(normalizeParentPath("part", { parent_path: "ServerScriptService" })).toBe("Workspace");
    expect(normalizeParentPath("model", { parent_path: "ReplicatedStorage" })).toBe("Workspace");
  });

  it("sends GUI objects to StarterGui", () => {
    expect(normalizeParentPath("screengui", {})).toBe("StarterGui");
    expect(normalizeParentPath("textlabel", { parent_path: "ServerScriptService" })).toBe("StarterGui");
  });

  it("puts tools, sounds and teams in their services", () => {
    expect(normalizeParentPath("tool", {})).toBe("StarterPack");
    expect(normalizeParentPath("sound", {})).toBe("SoundService");
    expect(normalizeParentPath("team", {})).toBe("Teams");
  });

  it("routes sky and atmosphere assets to Lighting", () => {
    expect(normalizeParentPath("insert_asset", { payload: { asset_name: "Night Skybox" } })).toBe("Lighting");
  });

  it("accepts slash-separated paths", () => {
    expect(normalizeParentPath("modulescript", { parent_path: "ReplicatedStorage/Modules/Combat" })).toBe(
      "ReplicatedStorage.Modules.Combat",
    );
  });
});

describe("normalizePluginAction", () => {
  it("modernizes deprecated Roblox APIs", () => {
    const action = normalizePluginAction({
      kind: "script",
      name: "Legacy",
      source: 'wait(1)\nspawn(function() print("hi") end)\npart.Touched:connect(print)\n',
    });
    const source = String((action as { payload: { source: string } }).payload.source);
    expect(source).toContain("task.wait(");
    expect(source).toContain("task.spawn(function");
    expect(source).toContain(":Connect(");
    expect(source).not.toMatch(/(?<!task\.)\bwait\(/);
  });

  it("neutralizes loadstring, which Roblox disables", () => {
    const action = normalizePluginAction({
      kind: "script",
      name: "Loader",
      source: 'local f = loadstring("print(1)")\nprint(f)\n',
    });
    const source = String((action as { payload: { source: string } }).payload.source);
    expect(source).not.toContain("loadstring(");
  });

  it("strips markdown fences before shipping to Studio", () => {
    const action = normalizePluginAction({
      kind: "localscript",
      name: "Fenced",
      source: '```lua\nprint("hi")\n```',
    });
    expect(String((action as { payload: { source: string } }).payload.source)).not.toContain("```");
  });

  it("marks scripts that still contain errors for retry", () => {
    const action = normalizePluginAction({
      kind: "script",
      name: "Broken",
      source: "local function broken()\n\tprint(1)\n",
    });
    const payload = (action as { payload: Record<string, unknown> }).payload;
    expect(payload._needs_retry).toBe(true);
    expect(Array.isArray(payload._luau_issues)).toBe(true);
  });

  it("defaults insert_asset to free, script-free toolbox assets", () => {
    const action = normalizePluginAction({ kind: "insert_asset", name: "Tree", payload: { asset_id: 123 } });
    const payload = (action as { payload: Record<string, unknown> }).payload;
    expect(payload.free_only).toBe(true);
    expect(payload.no_scripts).toBe(true);
    expect(payload.toolbox_only).toBe(true);
  });

  it("throws on an unsupported action instead of silently dropping it", () => {
    expect(() => normalizePluginAction({ kind: "mine_bitcoin" })).toThrow();
  });
});
