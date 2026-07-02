// One-Click Optimize suite: queues curated batches of plugin_actions plus
// concrete Luau ModuleScripts that re-tune the running game for FPS, memory,
// lighting, scripts, or mobile. Every call writes a project_activity row so
// the auto-changelog can pick it up.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPTIMIZE_KINDS = ["fps", "memory", "lighting", "scripts", "mobile"] as const;
export type OptimizeKind = typeof OPTIMIZE_KINDS[number];

const Input = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(OPTIMIZE_KINDS),
});

type Action = {
  kind: string;
  parent_path: string;
  name: string;
  payload: Record<string, unknown>;
  position: number;
};

function fpsActions(): Action[] {
  return [
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_FPS_1_Scan", payload: {}, position: 0 },
    {
      kind: "setting",
      parent_path: "Workspace",
      name: "StreamingEnabled",
      payload: { service: "Workspace", property: "StreamingEnabled", value: true },
      position: 1,
    },
    {
      kind: "setting",
      parent_path: "Workspace",
      name: "StreamingTargetRadius",
      payload: { service: "Workspace", property: "StreamingTargetRadius", value: 1024 },
      position: 2,
    },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_FPS_AnchorStatic",
      payload: {
        source: [
          "-- Anchor heavy static map parts so the physics solver can skip them.",
          "local count = 0",
          "for _, d in ipairs(workspace:GetDescendants()) do",
          "  if d:IsA('BasePart') and not d.Anchored then",
          "    local m = d.AssemblyMass or 0",
          "    if m > 25 or d:IsDescendantOf(workspace:FindFirstChild('Map') or workspace) then",
          "      d.Anchored = true",
          "      count = count + 1",
          "    end",
          "  end",
          "end",
          "print('[Optimize FPS] anchored', count, 'static parts')",
        ].join("\n"),
      },
      position: 3,
    },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_FPS_KillRunaways",
      payload: {
        source: [
          "-- Kill obvious tight loops without task.wait/RunService heartbeat.",
          "local killed = 0",
          "for _, s in ipairs(workspace:GetDescendants()) do",
          "  if (s:IsA('Script') or s:IsA('LocalScript')) and s.Disabled == false then",
          "    local src = s.Source or ''",
          "    if src:find('while%s+true%s+do') and not src:find('wait') and not src:find('Heartbeat') then",
          "      s.Disabled = true; killed = killed + 1",
          "    end",
          "  end",
          "end",
          "print('[Optimize FPS] disabled', killed, 'busy-loop scripts')",
        ].join("\n"),
      },
      position: 4,
    },
    { kind: "autofix_project", parent_path: "Workspace", name: "Optimize_FPS_5_AutoFix", payload: {}, position: 5 },
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_FPS_6_Verify", payload: {}, position: 6 },
  ];
}

function memoryActions(): Action[] {
  return [
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_Mem_1_Scan", payload: {}, position: 0 },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_Mem_Dedup",
      payload: {
        source: [
          "-- Remove duplicate MeshParts / Decals at the same position.",
          "local seen, removed = {}, 0",
          "for _, d in ipairs(workspace:GetDescendants()) do",
          "  if d:IsA('BasePart') and d.Parent then",
          "    local key = string.format('%s|%d|%d|%d', d.Name, math.floor(d.Position.X), math.floor(d.Position.Y), math.floor(d.Position.Z))",
          "    if seen[key] then d:Destroy(); removed = removed + 1 else seen[key] = true end",
          "  end",
          "end",
          "print('[Optimize Memory] removed', removed, 'duplicates')",
        ].join("\n"),
      },
      position: 1,
    },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_Mem_ClearEmpty",
      payload: {
        source: [
          "local removed = 0",
          "for _, f in ipairs(workspace:GetDescendants()) do",
          "  if f:IsA('Folder') and #f:GetChildren() == 0 then f:Destroy(); removed = removed + 1 end",
          "end",
          "print('[Optimize Memory] removed', removed, 'empty folders')",
        ].join("\n"),
      },
      position: 2,
    },
    { kind: "organize_project", parent_path: "Workspace", name: "Optimize_Mem_3_Organize", payload: {}, position: 3 },
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_Mem_4_Verify", payload: {}, position: 4 },
  ];
}

function lightingActions(): Action[] {
  return [
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "Technology",
      payload: { service: "Lighting", property: "Technology", value: "Future" },
      position: 0,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "GlobalShadows",
      payload: { service: "Lighting", property: "GlobalShadows", value: true },
      position: 1,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "EnvironmentDiffuseScale",
      payload: { service: "Lighting", property: "EnvironmentDiffuseScale", value: 0.4 },
      position: 2,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "EnvironmentSpecularScale",
      payload: { service: "Lighting", property: "EnvironmentSpecularScale", value: 0.6 },
      position: 3,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "Brightness",
      payload: { service: "Lighting", property: "Brightness", value: 2 },
      position: 4,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "ExposureCompensation",
      payload: { service: "Lighting", property: "ExposureCompensation", value: 0.1 },
      position: 5,
    },
  ];
}

function scriptsActions(): Action[] {
  return [
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_Scripts_1_Scan", payload: {}, position: 0 },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_Scripts_RenameUntitled",
      payload: {
        source: [
          "local n = 0",
          "for _, s in ipairs(game:GetDescendants()) do",
          "  if (s:IsA('Script') or s:IsA('LocalScript') or s:IsA('ModuleScript')) and (s.Name == 'Script' or s.Name == 'LocalScript' or s.Name == 'ModuleScript') then",
          "    s.Name = s.ClassName .. '_' .. s.Parent.Name; n = n + 1",
          "  end",
          "end",
          "print('[Optimize Scripts] renamed', n, 'untitled scripts')",
        ].join("\n"),
      },
      position: 1,
    },
    { kind: "autofix_project", parent_path: "Workspace", name: "Optimize_Scripts_3_AutoFix", payload: {}, position: 2 },
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_Scripts_4_Verify", payload: {}, position: 3 },
  ];
}

function mobileActions(): Action[] {
  return [
    {
      kind: "setting",
      parent_path: "Workspace",
      name: "TouchControls",
      payload: { service: "StarterPlayer", property: "DevTouchMovementMode", value: "DynamicThumbstick" },
      position: 0,
    },
    {
      kind: "setting",
      parent_path: "Workspace",
      name: "DevComputerMovement",
      payload: { service: "StarterPlayer", property: "DevComputerMovementMode", value: "UserChoice" },
      position: 1,
    },
    {
      kind: "setting",
      parent_path: "Lighting",
      name: "Technology",
      payload: { service: "Lighting", property: "Technology", value: "ShadowMap" },
      position: 2,
    },
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "Optimize_Mobile_UIScale",
      payload: {
        source: [
          "local Players = game:GetService('Players')",
          "local StarterGui = game:GetService('StarterGui')",
          "for _, g in ipairs(StarterGui:GetDescendants()) do",
          "  if g:IsA('ScreenGui') and not g:FindFirstChildOfClass('UIScale') then",
          "    local s = Instance.new('UIScale'); s.Scale = 1; s.Parent = g",
          "  end",
          "end",
          "print('[Optimize Mobile] ensured UIScale on every ScreenGui')",
        ].join("\n"),
      },
      position: 3,
    },
    { kind: "scan_project", parent_path: "Workspace", name: "Optimize_Mobile_5_Verify", payload: {}, position: 4 },
  ];
}

function buildActions(kind: OptimizeKind): Action[] {
  switch (kind) {
    case "fps": return fpsActions();
    case "memory": return memoryActions();
    case "lighting": return lightingActions();
    case "scripts": return scriptsActions();
    case "mobile": return mobileActions();
  }
}

const LABELS: Record<OptimizeKind, string> = {
  fps: "Optimize FPS",
  memory: "Optimize Memory",
  lighting: "Optimize Lighting",
  scripts: "Optimize Scripts",
  mobile: "Optimize Mobile",
};

export const queueOptimize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const actions = buildActions(data.kind);
    const { error } = await sb.from("plugin_actions").insert(
      actions.map((a) => ({
        project_id: data.projectId,
        user_id: context.userId,
        ...a,
      })),
    );
    if (error) throw new Error(error.message);

    await sb.from("project_activity").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: `optimize.${data.kind}`,
      summary: `queued ${LABELS[data.kind]} (${actions.length} actions)`,
      meta: { count: actions.length },
    });

    return { ok: true, count: actions.length, label: LABELS[data.kind] };
  });
