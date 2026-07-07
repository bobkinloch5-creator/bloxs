// Post-build action critic + auto-repair.
//
// Runs after parseActions() has extracted the action batch from the model
// reply. For every required surface the user asked for (main menu, shop UI,
// dash, sprint, ...) but the batch fails to cover, we ask a fast NVIDIA
// model to generate PATCH actions — a minimal JSON array of additional
// bloxsmith actions that build the missing surface — and append them.
//
// This is the "goal-aware safety net" that catches the class of bugs like:
//   > "you asked for a main menu but the batch had no ScreenGui action"
//
// Guarantees:
//   - Never removes existing actions.
//   - Never runs an LLM call when nothing is missing (zero-cost fast path).
//   - Falls back to a deterministic build-hint template on model failure so
//     the surface is at least visible in Studio, even if not perfect.

import { generateText } from "ai";
import { getFallbackModel } from "./ai-gateway.server";
import { safeJsonParse } from "./safe-json";
import {
  extractRequiredSurfaces,
  checkActionCoverage,
  type RequiredSurface,
  type CoverageAction,
} from "./surfaces";

export type CriticAction = CoverageAction & { [k: string]: unknown };

export type CriticResult = {
  patchActions: CriticAction[];
  requested: string[]; // surface labels the user asked for
  missingBefore: string[];
  repairedBySurface: Record<string, number>; // label -> patch action count
  usedModel: boolean;
  usedFallbackTemplate: string[]; // surface labels that fell back to template
  ranMs: number;
  notes: string[];
};

const REPAIR_SYSTEM = `You are the BloxSmith action REPAIR agent. The primary generator
just emitted a batch of Roblox Studio actions but SILENTLY DROPPED one or more
surfaces the user explicitly asked for. Your ONLY job: return a JSON array of
additional bloxsmith actions that add the missing surface(s) WITHOUT touching
what already exists.

Return ONLY valid JSON. No prose. No markdown fences. Shape:
[
  { "kind": "screengui" | "script" | "localscript" | "modulescript" | "remoteevent" | "run_lua" | ...,
    "parent_path": "ServerScriptService" | "StarterGui" | "StarterPlayerScripts" | "ReplicatedStorage.BloxSmith" | ...,
    "name": "MainMenu",
    "payload": { "source": "-- Luau here", ... } }
]

Hard rules:
- Every action must be independently valid — no forward references to instances
  the batch didn't create.
- All Luau must use modern APIs: task.wait, task.spawn, :Connect (capital C),
  pcall around DataStore/HttpService/MarketplaceService/TeleportService.
- LocalScripts belong in StarterPlayerScripts / StarterGui. Server Scripts belong
  in ServerScriptService. ModuleScripts default to ReplicatedStorage.BloxSmith
  unless the surface hint says otherwise.
- Every UI surface goes inside a ScreenGui parented to StarterGui; use a single
  ScreenGui named "BloxSmith_Game_UI" and put Frames inside it.
- No placeholder TODOs, no empty scripts, no fake asset IDs.
- Never emit a surface twice — one action set per surface.`;

function renderDeterministicPatch(surface: RequiredSurface): CriticAction[] {
  // Very small, guaranteed-visible fallback for each surface so the plugin
  // ALWAYS produces something the user can see, even if the repair model
  // fails or times out.
  switch (surface.id) {
    case "main_menu":
      return [
        {
          kind: "screengui",
          parent_path: "StarterGui",
          name: "BloxSmith_Game_UI",
          payload: {},
        },
        {
          kind: "localscript",
          parent_path: "StarterGui.BloxSmith_Game_UI",
          name: "MainMenu",
          payload: {
            source: `-- BloxSmith fallback MainMenu
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local gui = script.Parent
local frame = Instance.new("Frame")
frame.Name = "MainMenu"
frame.Size = UDim2.fromScale(0.4, 0.5)
frame.Position = UDim2.fromScale(0.3, 0.25)
frame.BackgroundColor3 = Color3.fromRGB(20, 24, 32)
frame.BackgroundTransparency = 0.05
frame.Parent = gui
local title = Instance.new("TextLabel", frame)
title.Size = UDim2.new(1, 0, 0, 60)
title.BackgroundTransparency = 1
title.Text = "MAIN MENU"
title.TextColor3 = Color3.fromRGB(240, 240, 240)
title.TextScaled = true
title.Font = Enum.Font.GothamBold
local layout = Instance.new("UIListLayout", frame)
layout.Padding = UDim.new(0, 12)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.VerticalAlignment = Enum.VerticalAlignment.Center
for _, label in ipairs({ "Play", "Shop", "Inventory", "Settings" }) do
    local btn = Instance.new("TextButton", frame)
    btn.Size = UDim2.new(0.7, 0, 0, 44)
    btn.BackgroundColor3 = Color3.fromRGB(40, 90, 200)
    btn.Text = label
    btn.TextScaled = true
    btn.Font = Enum.Font.Gotham
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.MouseButton1Click:Connect(function()
        print(("[BloxSmith] MainMenu button clicked: %s"):format(label))
        if label == "Play" then frame.Visible = false end
    end)
end
`,
          },
        },
      ];
    case "dash_ability":
      return [
        {
          kind: "localscript",
          parent_path: "StarterPlayerScripts",
          name: "Dash",
          payload: {
            source: `-- BloxSmith fallback Dash (horizontal, non-lethal, Q key)
local Players = game:GetService("Players")
local ContextActionService = game:GetService("ContextActionService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local lastDash = 0
local COOLDOWN = 1.1
local DURATION = 0.22
local IMPULSE = 90
local function tryDash(_, state)
    if state ~= Enum.UserInputState.Begin then return end
    local now = os.clock()
    if now - lastDash < COOLDOWN then return end
    lastDash = now
    local char = player.Character
    local hrp = char and char:FindFirstChild("HumanoidRootPart")
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    if not (hrp and hum and hum.Health > 0) then return end
    local look = hrp.CFrame.LookVector
    look = Vector3.new(look.X, 0, look.Z).Unit
    local att = Instance.new("Attachment", hrp)
    local lv = Instance.new("LinearVelocity")
    lv.Attachment0 = att
    lv.MaxAxesForce = Vector3.new(1e6, 0, 1e6)
    lv.VectorVelocity = look * IMPULSE
    lv.RelativeTo = Enum.ActuatorRelativeTo.World
    lv.Parent = hrp
    task.delay(DURATION, function()
        if lv then lv:Destroy() end
        if att then att:Destroy() end
    end)
end
ContextActionService:BindAction("BloxSmithDash", tryDash, false, Enum.KeyCode.Q)
`,
          },
        },
      ];
    // Generic fallback for other surfaces: a printing stub so the user sees
    // proof the surface was queued even if the primary model failed and
    // the repair model refused.
    default:
      return [
        {
          kind: "run_lua",
          parent_path: "ServerScriptService",
          name: `BloxSmith_Repair_${surface.id}`,
          payload: {
            source: `-- BloxSmith fallback stub for missing surface: ${surface.label}
-- Build hint: ${surface.buildHint.replace(/\n/g, " ")}
print("[BloxSmith] Missing surface queued for manual review: ${surface.label}")
`,
          },
        },
      ];
  }
}

async function askRepairModel(
  userText: string,
  missing: RequiredSurface[],
  existing: CoverageAction[],
): Promise<CriticAction[] | null> {
  try {
    const fb = getFallbackModel();
    const missingBlock = missing
      .map((s, i) => `${i + 1}. ${s.label} — ${s.buildHint}`)
      .join("\n");
    const existingSummary = existing
      .slice(0, 20)
      .map((a) => `- ${a.kind} :: ${a.parent_path ?? "?"} :: ${a.name ?? "?"}`)
      .join("\n") || "(none)";
    const { text } = await generateText({
      model: fb.model,
      system: REPAIR_SYSTEM,
      prompt: [
        `USER GOAL:\n${userText.slice(0, 800)}`,
        `MISSING SURFACES (build each one):\n${missingBlock}`,
        `EXISTING ACTIONS IN BATCH (do NOT duplicate these):\n${existingSummary}`,
      ].join("\n\n"),
      temperature: 0,
      maxOutputTokens: 1600,
    });
    // Model may still fence its output despite instructions — strip fences.
    const cleaned = text
      .replace(/```(?:json|bloxsmith-actions)?/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = safeJsonParse<unknown>(cleaned, null);
    if (!Array.isArray(parsed)) return null;
    const out: CriticAction[] = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const kind = String(r.kind ?? "").toLowerCase();
      if (!kind) continue;
      out.push({
        kind,
        parent_path: typeof r.parent_path === "string" ? r.parent_path : "ServerScriptService",
        name: typeof r.name === "string" ? r.name : "BloxSmithRepair",
        payload:
          r.payload && typeof r.payload === "object"
            ? (r.payload as Record<string, unknown>)
            : {},
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export async function critiqueAndRepairActions(params: {
  userText: string;
  actions: CoverageAction[];
  // Optional pre-extracted surfaces (from smart-brain). If not given we
  // extract them ourselves from userText.
  requiredSurfaces?: RequiredSurface[];
  // Cap to avoid a runaway repair storm on pathological prompts.
  maxRepairModelCalls?: number;
}): Promise<CriticResult> {
  const started = Date.now();
  const notes: string[] = [];
  const required =
    params.requiredSurfaces && params.requiredSurfaces.length
      ? params.requiredSurfaces
      : extractRequiredSurfaces(params.userText);

  const requestedLabels = required.map((s) => s.label);

  if (!required.length) {
    return {
      patchActions: [],
      requested: [],
      missingBefore: [],
      repairedBySurface: {},
      usedModel: false,
      usedFallbackTemplate: [],
      ranMs: Date.now() - started,
      notes: ["(no required surfaces extracted)"],
    };
  }

  const coverage = checkActionCoverage(params.actions, required);
  if (!coverage.missing.length) {
    return {
      patchActions: [],
      requested: requestedLabels,
      missingBefore: [],
      repairedBySurface: {},
      usedModel: false,
      usedFallbackTemplate: [],
      ranMs: Date.now() - started,
      notes: [`all ${coverage.covered.length} required surface(s) already covered`],
    };
  }

  notes.push(`missing surfaces: ${coverage.missing.map((s) => s.label).join(", ")}`);

  // One model call attempts to cover ALL missing surfaces at once. Fast Build
  // can opt out so the visible response does not wait on a second AI pass.
  const modelPatch = params.maxRepairModelCalls === 0
    ? null
    : await askRepairModel(params.userText, coverage.missing, params.actions);

  const patchActions: CriticAction[] = [];
  const repairedBySurface: Record<string, number> = {};
  const usedFallbackTemplate: string[] = [];
  let usedModel = false;

  if (modelPatch && modelPatch.length) {
    usedModel = true;
    patchActions.push(...modelPatch);
    // Recheck coverage against the combined batch.
    const combined = [...params.actions, ...modelPatch];
    const recheck = checkActionCoverage(combined, coverage.missing);
    for (const s of recheck.covered) {
      repairedBySurface[s.label] = (repairedBySurface[s.label] ?? 0) + 1;
    }
    // For anything the model STILL didn't cover, fall back to templates.
    for (const s of recheck.missing) {
      const tpl = renderDeterministicPatch(s);
      patchActions.push(...tpl);
      usedFallbackTemplate.push(s.label);
      repairedBySurface[s.label] = tpl.length;
    }
  } else {
    // No usable model response — go straight to templates for every missing.
    for (const s of coverage.missing) {
      const tpl = renderDeterministicPatch(s);
      patchActions.push(...tpl);
      usedFallbackTemplate.push(s.label);
      repairedBySurface[s.label] = tpl.length;
    }
    notes.push("repair model unavailable; used deterministic templates");
  }

  return {
    patchActions,
    requested: requestedLabels,
    missingBefore: coverage.missing.map((s) => s.label),
    repairedBySurface,
    usedModel,
    usedFallbackTemplate,
    ranMs: Date.now() - started,
    notes,
  };
}
