// Smart model router: every task uses the default reliable AI route.

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

// Preference ranking per task. Fastest reliable model for the task first, then
// stronger fallbacks. Order matters: the first Working entry wins.
const TASK_PREF: Record<AutoTask, { ids: string[]; reason: string }> = {
  planning: {
    ids: ["nvidia/nemotron-nano-9b-v2", "nvidia/gemma-3-27b", "nvidia/qwen-2.5-coder-32b", DEFAULT_MODEL_ID],
    reason: "Auto: very fast model for responsive Roblox planning.",
  },
  scripting: {
    ids: ["nvidia/qwen-2.5-coder-32b", "nvidia/gemma-3-27b", "nvidia/deepseek-v4-flash", DEFAULT_MODEL_ID],
    reason: "Auto: Qwen coder-class model for complete runnable Luau.",
  },
  ui: {
    ids: ["nvidia/gemma-3-27b", "nvidia/nemotron-nano-9b-v2", "nvidia/qwen-2.5-coder-32b", DEFAULT_MODEL_ID],
    reason: "Auto: very fast model for ScreenGui layout.",
  },
  assets: {
    ids: ["nvidia/llama-3.1-8b", "nvidia/ministral-14b", "nvidia/llama-3.3-70b"],
    reason: "Auto: small fast model for Toolbox asset planning.",
  },
  bugfix: {
    ids: ["nvidia/qwen-2.5-coder-32b", "nvidia/deepseek-v4-flash", DEFAULT_MODEL_ID],
    reason: "Auto: coder-tuned model for bug tracing and fixes.",
  },
  performance: {
    ids: ["nvidia/qwen-2.5-coder-32b", "nvidia/gemma-3-27b", "nvidia/deepseek-v4-flash"],
    reason: "Auto: fast coder model for performance fixes.",
  },
  testing: {
    ids: ["nvidia/nemotron-nano-9b-v2", "nvidia/gemma-3-27b", "nvidia/qwen-2.5-coder-32b"],
    reason: "Auto: fast model for playtest checks.",
  },
  shortedit: {
    ids: ["nvidia/llama-3.1-8b", "nvidia/ministral-14b", "nvidia/llama-3.3-70b"],
    reason: "Auto: tiny fast model for short edits.",
  },
  vision: {
    ids: ["nvidia/gemma-3-27b", "nvidia/nemotron-nano-9b-v2", DEFAULT_MODEL_ID],
    reason: "Auto: fast model with injected vision summaries.",
  },
};


export type Difficulty = "easy" | "normal" | "hard";

// Rough word/char heuristic — no model call, ~0ms.
export function estimateDifficulty(text: string): Difficulty {
  const t = (text || "").toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const systemHits = (t.match(/\b(system|tycoon|simulator|rpg|battle royale|combat|inventory|shop|quest|save|datastore|multiplayer|round|match|team|leaderboard|economy)\b/g) || []).length;
  const featureAnds = (t.match(/\band\b/g) || []).length;
  if (words <= 8 && systemHits === 0) return "easy";
  if (words >= 40 || systemHits >= 2 || featureAnds >= 3) return "hard";
  return "normal";
}

export function pickModelForTask(task: AutoTask, difficulty: Difficulty = "normal"): ModelPick {
  const pref = TASK_PREF[task];
  // For hard tasks, prefer the strongest (last) candidate; for easy, the fastest (first).
  const ids = difficulty === "hard"
    ? [...pref.ids].reverse()
    : difficulty === "easy"
      ? pref.ids
      : pref.ids;
  let chosen: ModelOption | null = null;
  let fellBack = false;
  for (const id of ids) {
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
    fellBack = chosen.id !== ids[0];
  }
  const diffTag = difficulty === "hard" ? " [hard→strong]" : difficulty === "easy" ? " [easy→fast]" : "";
  return {
    task,
    modelId: chosen.id,
    label: chosen.label,
    provider: chosen.provider,
    via: chosen.via,
    reason: fellBack
      ? `${pref.reason}${diffTag} (Using ${chosen.label}.)`
      : `${pref.reason}${diffTag}`,
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
