// Smart model router: pick the best AI model for each BloxSmith task from the
// MODELS catalog. Falls back gracefully when premium models are gated.
// Used by Auto Genius Mode to assign a specialist model per task.

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

// Preference ranking per task. The router walks the list and returns the first
// SELECTABLE model. If none match, it falls back to DEFAULT_MODEL_ID.
const TASK_PREF: Record<AutoTask, { ids: string[]; reason: string }> = {
  planning: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/deepseek-v4-pro",
      "nvidia/gpt-oss-120b",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/nemotron-super-49b",
      "nvidia/llama-4-maverick-17b",
      "quatarly/claude-opus-4-6-thinking",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
    ],
    reason: "Picked the strongest NVIDIA reasoning model — best at breaking the Roblox idea into a clean build graph.",
  },
  scripting: {
    ids: [
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/deepseek-v4-flash",
      "nvidia/deepseek-v4-pro",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/mixtral-8x22b",
      "nvidia/llama-3.1-nemotron-70b",
      "nvidia/nemotron-super-49b",
      "quatarly/gpt-5.1-codex",
      "lovable/gemini-3.5-flash",
    ],
    reason: "Chose an NVIDIA coding-specialist model — best at producing complete, runnable Luau.",
  },
  ui: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/llama-4-maverick-17b",
      "nvidia/google-gemma-4-31b-it",
      "nvidia/minimax-m3",
      "lovable/gemini-3-flash-preview",
      "lovable/gemini-3.5-flash",
    ],
    reason: "Chose a multimodal NVIDIA model — best at modern ScreenGui layout and mobile-safe UI.",
  },
  assets: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/llama-4-maverick-17b",
      "nvidia/minimax-m3",
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-super-49b",
      "lovable/gemini-3-flash-preview",
    ],
    reason: "Chose an NVIDIA model — strong at ranking safe Toolbox assets and planning insert payloads.",
  },
  bugfix: {
    ids: [
      "nvidia/deepseek-v4-pro",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/mixtral-8x22b",
      "nvidia/llama-3.1-nemotron-70b",
      "nvidia/nemotron-super-49b",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
    ],
    reason: "Chose a deliberate NVIDIA reasoning/coding model — best at tracing nil-index and event-wiring bugs.",
  },
  performance: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-super-49b",
      "nvidia/mixtral-8x22b",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
    ],
    reason: "Chose a careful NVIDIA model — best at spotting laggy loops, unanchored parts, and heavy particles.",
  },
  testing: {
    ids: [
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-super-49b",
      "nvidia/llama-4-maverick-17b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "lovable/gemini-3-flash-preview",
      "lovable/gpt-5-nano",
    ],
    reason: "Chose a fast NVIDIA model — playtest smoke checks don't need deep reasoning.",
  },
  shortedit: {
    ids: [
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-super-49b",
      "nvidia/mixtral-8x22b",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/llama-4-maverick-17b",
      "lovable/gpt-5-nano",
      "lovable/gemini-2.5-flash-lite",
    ],
    reason: "Chose the lowest-latency NVIDIA model — small edits don't need a heavyweight.",
  },
  vision: {
    ids: [
      "nvidia/llama-4-maverick-17b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/minimax-m3",
      "nvidia/google-gemma-4-31b-it",
      "lovable/gemini-3-flash-preview",
    ],
    reason: "Chose an NVIDIA multimodal model — uses injected vision summaries plus asset metadata for Roblox builds.",
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
      ? `${pref.reason} (Premium specialist unavailable — auto-fell back to ${chosen.label}.)`
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
