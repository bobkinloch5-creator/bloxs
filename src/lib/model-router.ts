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
      "quatarly/claude-opus-4-6-thinking",
      "quatarly/claude-sonnet-4-6-thinking",
      "quatarly/gemini-3.1-pro",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "lovable/gemini-3.5-flash",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Picked the strongest NVIDIA reasoning model available — best at breaking the Roblox idea into a clean build graph.",
  },
  scripting: {
    ids: [
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "quatarly/gpt-5.1-codex",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose an NVIDIA coding-specialist model — best at producing complete, runnable Luau.",
  },
  ui: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "lovable/gemini-3-flash-preview",
      "lovable/gemini-3.5-flash",
      "quatarly/claude-sonnet-4-6-thinking",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose a multimodal fast model — best at modern ScreenGui layout and mobile-safe UI.",
  },
  assets: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/minimax-m3",
      "nvidia/deepseek-v4-flash",
      "lovable/gemini-3-flash-preview",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose an NVIDIA model — strong at ranking safe Toolbox assets and planning insert payloads.",
  },
  bugfix: {
    ids: [
      "nvidia/deepseek-v4-pro",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose a deliberate NVIDIA reasoning/coding model — best at tracing nil-index and event-wiring bugs.",
  },
  performance: {
    ids: [
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/deepseek-v4-flash",
      "quatarly/claude-sonnet-4-6-thinking",
      "lovable/gemini-3.5-flash",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose a careful model — best at spotting laggy loops, unanchored parts, and heavy particles.",
  },
  testing: {
    ids: [
      "nvidia/deepseek-v4-flash",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "lovable/gemini-3-flash-preview",
      "lovable/gpt-5-nano",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose a fast model — playtest smoke checks don't need deep reasoning.",
  },
  shortedit: {
    ids: [
      "nvidia/deepseek-v4-flash",
      "nvidia/qwen3-coder-480b-a35b-instruct",
      "lovable/gpt-5-nano",
      "lovable/gemini-2.5-flash-lite",
      "lovable/gemini-3-flash-preview",
      "quatarly/claude-haiku-4-5",
    ],
    reason: "Chose the lowest-latency model — small edits don't need a heavyweight.",
  },
  vision: {
    ids: ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/minimax-m3", "lovable/gemini-3-flash-preview", "quatarly/claude-haiku-4-5"],
    reason: "Chose an NVIDIA model — uses injected vision summaries plus asset metadata for Roblox builds.",
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
