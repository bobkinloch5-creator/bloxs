// BloxSmith Object Factory
// ---------------------------------------------------------------------------
// Declarative Roblox instance specs that compile to a single undo-safe run_lua
// action. Covers every object class the builder can place in a world without
// requiring a Studio plugin update (everything compiles to Lua).

import { SERVICE_ROUTES } from "./roblox-explorer";

export const OBJECT_KINDS = [
  "part",
  "model",
  "meshpart",
  "union",
  "constraint",
  "attachment",
  "particle",
  "beam",
  "trail",
  "light",
  "sound",
  "spawn",
  "teleporter",
  "proximityprompt",
  "clickdetector",
  "billboard",
  "surfacegui",
] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type Vec3 = [number, number, number];

export type ObjectSpec = {
  kind: ObjectKind;
  name: string;
  parentPath?: string;
  position?: Vec3;
  size?: Vec3;
  rotation?: Vec3;
  color?: string; // hex
  material?: string; // Enum.Material name
  anchored?: boolean;
  canCollide?: boolean;
  transparency?: number;
  /** Free-form Roblox properties applied verbatim after the defaults. */
  properties?: Record<string, string | number | boolean>;
  /** For constraints / beams / teleporters: the second endpoint path. */
  targetPath?: string;
  /** For meshparts, sounds, particles: an asset id. */
  assetId?: number | string;
  /** For prompts / billboards / surfaceguis. */
  text?: string;
  /** For teleporters: destination position. */
  destination?: Vec3;
  /** Constraint sub-class, e.g. WeldConstraint, HingeConstraint. */
  constraintClass?: string;
};

function q(value: string): string {
  return JSON.stringify(String(value ?? ""));
}

function v3(v: Vec3 | undefined, fallback: Vec3): string {
  const [x, y, z] = v && v.length === 3 ? v : fallback;
  return `Vector3.new(${num(x)}, ${num(y)}, ${num(z)})`;
}

function num(n: unknown, fallback = 0): number {
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function color3(hex: string | undefined, fallback = "#9AA0A6"): string {
  const clean = String(hex ?? fallback).replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return "Color3.fromRGB(154, 160, 166)";
  return `Color3.fromRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function propLines(target: string, props?: Record<string, string | number | boolean>): string[] {
  if (!props) return [];
  return Object.entries(props).map(([key, value]) => {
    if (typeof value === "number" || typeof value === "boolean") return `  ${target}.${key} = ${value}`;
    const raw = String(value);
    // Allow raw Luau expressions such as Enum.Material.Neon or Color3.new(...).
    if (/^(Enum\.|Color3\.|Vector3\.|CFrame\.|UDim2?\.|NumberRange\.|NumberSequence|ColorSequence|BrickColor\.)/.test(raw)) {
      return `  ${target}.${key} = ${raw}`;
    }
    return `  ${target}.${key} = ${q(raw)}`;
  });
}

/** Default parent for each object kind. */
export function defaultParentFor(kind: ObjectKind): string {
  switch (kind) {
    case "spawn":
    case "teleporter":
      return SERVICE_ROUTES.spawns;
    case "proximityprompt":
    case "clickdetector":
      return SERVICE_ROUTES.interactables;
    case "sound":
      return SERVICE_ROUTES.audio;
    default:
      return SERVICE_ROUTES.map;
  }
}

function buildBody(spec: ObjectSpec): string[] {
  const pos = v3(spec.position, [0, 5, 0]);
  const size = v3(spec.size, [4, 4, 4]);
  const lines: string[] = [];
  const commonPart = (varName: string) => {
    lines.push(`  ${varName}.Size = ${size}`);
    lines.push(`  ${varName}.CFrame = CFrame.new(${pos})` + (spec.rotation ? ` * CFrame.Angles(math.rad(${num(spec.rotation[0])}), math.rad(${num(spec.rotation[1])}), math.rad(${num(spec.rotation[2])}))` : ""));
    lines.push(`  ${varName}.Anchored = ${spec.anchored !== false}`);
    lines.push(`  ${varName}.CanCollide = ${spec.canCollide !== false}`);
    lines.push(`  ${varName}.Color = ${color3(spec.color)}`);
    if (spec.material) lines.push(`  ${varName}.Material = Enum.Material[${q(spec.material)}]`);
    if (typeof spec.transparency === "number") lines.push(`  ${varName}.Transparency = ${num(spec.transparency)}`);
  };

  switch (spec.kind) {
    case "part":
      lines.push('  local obj = Instance.new("Part")');
      commonPart("obj");
      break;
    case "meshpart":
      lines.push('  local obj = Instance.new("MeshPart")');
      commonPart("obj");
      if (spec.assetId) lines.push(`  pcall(function() obj.MeshId = "rbxassetid://${num(spec.assetId)}" end)`);
      break;
    case "union":
      // Real CSG needs geometry; emit a grouped Model with a union-style weld so
      // the result is still a single manipulable object in Studio.
      lines.push('  local obj = Instance.new("Model")');
      lines.push('  local core = Instance.new("Part")');
      lines.push(`  core.Size = ${size}`);
      lines.push(`  core.CFrame = CFrame.new(${pos})`);
      lines.push("  core.Anchored = true");
      lines.push(`  core.Color = ${color3(spec.color)}`);
      lines.push('  core.Name = "Base"');
      lines.push("  core.Parent = obj");
      lines.push("  obj.PrimaryPart = core");
      break;
    case "model":
      lines.push('  local obj = Instance.new("Model")');
      lines.push('  local core = Instance.new("Part")');
      lines.push(`  core.Size = ${size}`);
      lines.push(`  core.CFrame = CFrame.new(${pos})`);
      lines.push("  core.Anchored = true");
      lines.push(`  core.Color = ${color3(spec.color)}`);
      lines.push('  core.Name = "Root"');
      lines.push("  core.Parent = obj");
      lines.push("  obj.PrimaryPart = core");
      break;
    case "spawn":
      lines.push('  local obj = Instance.new("SpawnLocation")');
      commonPart("obj");
      lines.push("  obj.Duration = 0");
      lines.push("  obj.Neutral = true");
      break;
    case "constraint":
      lines.push(`  local obj = Instance.new(${q(spec.constraintClass || "WeldConstraint")})`);
      break;
    case "attachment":
      lines.push('  local obj = Instance.new("Attachment")');
      lines.push(`  obj.Position = ${v3(spec.position, [0, 0, 0])}`);
      break;
    case "particle":
      lines.push('  local obj = Instance.new("ParticleEmitter")');
      lines.push("  obj.Rate = 25");
      lines.push("  obj.Lifetime = NumberRange.new(0.6, 1.2)");
      lines.push("  obj.Speed = NumberRange.new(2, 6)");
      lines.push(`  obj.Color = ColorSequence.new(${color3(spec.color, "#66E0FF")})`);
      lines.push("  obj.LightEmission = 0.6");
      break;
    case "beam":
      lines.push('  local obj = Instance.new("Beam")');
      lines.push("  obj.Width0, obj.Width1 = 1, 1");
      lines.push(`  obj.Color = ColorSequence.new(${color3(spec.color, "#7C5CFF")})`);
      break;
    case "trail":
      lines.push('  local obj = Instance.new("Trail")');
      lines.push("  obj.Lifetime = 0.6");
      lines.push(`  obj.Color = ColorSequence.new(${color3(spec.color, "#FFB020")})`);
      break;
    case "light":
      lines.push('  local obj = Instance.new("PointLight")');
      lines.push("  obj.Range = 24");
      lines.push("  obj.Brightness = 2");
      lines.push(`  obj.Color = ${color3(spec.color, "#FFE8B0")}`);
      break;
    case "sound":
      lines.push('  local obj = Instance.new("Sound")');
      if (spec.assetId) lines.push(`  obj.SoundId = "rbxassetid://${num(spec.assetId)}"`);
      lines.push("  obj.Volume = 0.5");
      lines.push("  obj.RollOffMaxDistance = 120");
      break;
    case "teleporter":
      lines.push('  local obj = Instance.new("Part")');
      commonPart("obj");
      lines.push("  obj.Material = Enum.Material.Neon");
      lines.push(`  local dest = Instance.new("Vector3Value")`);
      lines.push('  dest.Name = "Destination"');
      lines.push(`  dest.Value = ${v3(spec.destination, [0, 20, 0])}`);
      lines.push("  dest.Parent = obj");
      break;
    case "proximityprompt":
      lines.push('  local obj = Instance.new("ProximityPrompt")');
      lines.push(`  obj.ActionText = ${q(spec.text || "Interact")}`);
      lines.push(`  obj.ObjectText = ${q(spec.name)}`);
      lines.push("  obj.HoldDuration = 0.35");
      lines.push("  obj.MaxActivationDistance = 12");
      lines.push("  obj.RequiresLineOfSight = false");
      break;
    case "clickdetector":
      lines.push('  local obj = Instance.new("ClickDetector")');
      lines.push("  obj.MaxActivationDistance = 24");
      break;
    case "billboard":
      lines.push('  local obj = Instance.new("BillboardGui")');
      lines.push("  obj.Size = UDim2.fromOffset(200, 50)");
      lines.push("  obj.StudsOffsetWorldSpace = Vector3.new(0, 3, 0)");
      lines.push("  obj.AlwaysOnTop = true");
      lines.push("  obj.MaxDistance = 80");
      lines.push('  local label = Instance.new("TextLabel")');
      lines.push("  label.Size = UDim2.fromScale(1, 1)");
      lines.push("  label.BackgroundTransparency = 1");
      lines.push(`  label.Text = ${q(spec.text || spec.name)}`);
      lines.push("  label.TextScaled = true");
      lines.push("  label.Font = Enum.Font.GothamBold");
      lines.push("  label.TextColor3 = Color3.fromRGB(255, 255, 255)");
      lines.push("  label.Parent = obj");
      break;
    case "surfacegui":
      lines.push('  local obj = Instance.new("SurfaceGui")');
      lines.push("  obj.Face = Enum.NormalId.Front");
      lines.push("  obj.PixelsPerStud = 50");
      lines.push("  obj.AlwaysOnTop = false");
      lines.push('  local label = Instance.new("TextLabel")');
      lines.push("  label.Size = UDim2.fromScale(1, 1)");
      lines.push("  label.BackgroundTransparency = 1");
      lines.push(`  label.Text = ${q(spec.text || spec.name)}`);
      lines.push("  label.TextScaled = true");
      lines.push("  label.Font = Enum.Font.GothamBold");
      lines.push("  label.TextColor3 = Color3.fromRGB(255, 255, 255)");
      lines.push("  label.Parent = obj");
      break;
  }

  lines.push(...propLines("obj", spec.properties));
  return lines;
}

/** Compile one or more object specs into a single idempotent Lua builder. */
export function compileObjectsLua(specs: ObjectSpec[]): string {
  const head = [
    "-- BloxSmith Object Factory build",
    'local ChangeHistoryService = game:GetService("ChangeHistoryService")',
    "",
    "local function ensurePath(path)",
    "  local segments = {}",
    '  for seg in string.gmatch(path, "[^%.]+") do table.insert(segments, seg) end',
    "  local ok, node = pcall(function() return game:GetService(segments[1]) end)",
    "  if not ok or not node then return nil end",
    "  for i = 2, #segments do",
    "    local child = node:FindFirstChild(segments[i])",
    "    if not child then",
    '      child = Instance.new("Folder")',
    "      child.Name = segments[i]",
    "      child.Parent = node",
    "    end",
    "    node = child",
    "  end",
    "  return node",
    "end",
    "",
    'local recording = ChangeHistoryService:TryBeginRecording("BloxSmith Objects")',
    "local built = 0",
  ];

  const body = specs.flatMap((spec) => {
    const parent = spec.parentPath || defaultParentFor(spec.kind);
    const block: string[] = ["do"];
    block.push(`  local parent = ensurePath(${q(parent)})`);
    block.push(`  local existing = parent and parent:FindFirstChild(${q(spec.name)})`);
    block.push("  if existing then existing:Destroy() end");
    block.push(...buildBody(spec));
    block.push(`  obj.Name = ${q(spec.name)}`);
    if (spec.kind === "constraint" || spec.kind === "beam") {
      block.push(`  local a0 = ensurePath(${q(spec.parentPath || "")})`);
      block.push(`  local a1 = ensurePath(${q(spec.targetPath || "")})`);
      block.push("  if a0 and a0:IsA(\"BasePart\") and a1 and a1:IsA(\"BasePart\") then");
      block.push('    local at0 = a0:FindFirstChild("BloxSmithAttach") or Instance.new("Attachment")');
      block.push('    at0.Name = "BloxSmithAttach"; at0.Parent = a0');
      block.push('    local at1 = a1:FindFirstChild("BloxSmithAttach") or Instance.new("Attachment")');
      block.push('    at1.Name = "BloxSmithAttach"; at1.Parent = a1');
      block.push("    obj.Attachment0, obj.Attachment1 = at0, at1");
      block.push("  end");
    }
    block.push("  if parent then obj.Parent = parent; built += 1 end");
    block.push("end");
    return block;
  });

  const tail = [
    "if recording then ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end",
    'print(("[BloxSmith] Object Factory placed %d instance(s)"):format(built))',
  ];

  return [...head, "", ...body, "", ...tail].join("\n");
}

/** Convenience: turn specs into a ready-to-queue plugin action. */
export function objectsAction(specs: ObjectSpec[], name = "BloxSmith_Objects") {
  return {
    kind: "run_lua" as const,
    parent_path: "Workspace",
    name,
    payload: { source: compileObjectsLua(specs), _bloxsmith: { source: "object_factory", count: specs.length } },
  };
}
