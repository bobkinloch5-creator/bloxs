// Smart model router: every task uses the single enabled NVIDIA GLM 5.2 model.

import { MODELS, isSelectable, DEFAULT_MODEL_ID, type ModelOption } from "./models";

export type AutoTask =
  | "planning"
  | "scripting"
  | "ui"
  | "assets"
  | "bugfix"
  | "performance"
  | "testing"
  | "shortedit"
  | "vision";

export interface ModelPick {
  task: AutoTask;
  modelId: string;
  label: string;
  provider: string;
  via: string;
  reason: string;
  fellBack: boolean;
}

// Preference ranking per task. Only GLM 5.2 is exposed.
const TASK_PREF: Record<AutoTask, { ids: string[]; reason: string }> = {
  planning: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for Roblox planning and build graphs.",
  },
  scripting: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for complete, runnable Luau.",
  },
  ui: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for ScreenGui layout and mobile-safe UI.",
  },
  assets: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for safe Toolbox asset planning.",
  },
  bugfix: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for bug tracing and event wiring fixes.",
  },
  performance: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for performance review.",
  },
  testing: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for playtest checks.",
  },
  shortedit: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 for short edits.",
  },
  vision: {
    ids: [DEFAULT_MODEL_ID],
    reason: "Using NVIDIA GLM 5.2 with injected vision summaries for Roblox builds.",
  },
};

export function pickModelForTask(task: AutoTask): ModelPick {
  const pref = TASK_PREF[task];
  let chosen: ModelOption | null = null;
  let fellBack = false;
  for (const id of pref.ids) {
    const m = MODELS.find((x) => x.id === id);
    if (m && isSelectable(m)) {
      chosen = m;
      break;
    }
  }
  if (!chosen) {
    chosen = MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ?? MODELS[0];
    fellBack = true;
  } else {
    // If the top preferred wasn't selectable, mark fallback.
    fellBack = chosen.id !== pref.ids[0];
  }
  return {
    task,
    modelId: chosen.id,
    label: chosen.label,
    provider: chosen.provider,
    via: chosen.via,
    reason: fellBack
      ? `${pref.reason} (Using ${chosen.label}.)`
      : pref.reason,
    fellBack,
  };
}

export const AUTO_TASKS: AutoTask[] = [
  "planning",
  "scripting",
  "ui",
  "assets",
  "bugfix",
  "performance",
  "testing",
  "shortedit",
];

export function pickAllTaskModels(): ModelPick[] {
  return AUTO_TASKS.map(pickModelForTask);
}

export const TASK_LABELS: Record<AutoTask, string> = {
  planning: "Planning & build graph",
  scripting: "Roblox Lua scripting",
  ui: "UI design",
  assets: "Toolbox asset search",
  bugfix: "Bug fixing",
  performance: "Performance optimizer",
  testing: "Playtesting",
  shortedit: "Short edits & retries",
  vision: "Screenshot / vision",
};

// ── NVIDIA Super AI Ensemble ──────────────────────────────────────────────
// Returns every NVIDIA Working model sorted: premium first, then balanced.
// Used by the website's Super AI panel to show the full ensemble.
export function getSuperAiEnsemble(): ModelOption[] {
  return MODELS
    .filter((m) => m.gateway === "nvidia" && isSelectable(m))
    .sort((a, b) => {
      const tierOrder = { premium: 0, balanced: 1, fast: 2 };
      return (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2);
    });
}
