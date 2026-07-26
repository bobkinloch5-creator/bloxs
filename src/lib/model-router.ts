// Smart model router: every task uses the default reliable AI route.
// Enhanced: Roblox-specific difficulty signals, per-task token budgets,
// and a validation-failure retry helper.

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
  | "vision"
  | "design";

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
// Working non-paidOnly models: oneprovider/claude-sonnet-4-6, oneprovider/claude-haiku-4-5,
// nvidia/z-ai-glm-5.2, nvidia/openai-gpt-oss-20b, nvidia/nemotron-nano-9b-v2,
// nvidia/ministral-14b, nvidia/gemma-3-27b, nvidia/llama-3.1-8b, nvidia/llama-3.3-nemotron-super-49b
const TASK_PREF: Record<AutoTask, { ids: string[]; reason: string }> = {
  planning:    { ids: ["nvidia/deepseek-v4-flash", "nvidia/nemotron-nano-9b-v2", "nvidia/gemma-3-27b", "nvidia/z-ai-glm-5.2", DEFAULT_MODEL_ID], reason: "Auto: DeepSeek V4 Flash for fast Roblox build planning." },
  scripting:   { ids: ["oneprovider/claude-sonnet-4-6", "nvidia/deepseek-v4-flash", "nvidia/z-ai-glm-5.2", "nvidia/openai-gpt-oss-20b", "nvidia/gemma-3-27b", "nvidia/ministral-14b", "nvidia/llama-3.1-8b"], reason: "Auto: Claude Sonnet or DeepSeek V4 Flash for high-quality Luau." },
  ui:          { ids: ["nvidia/deepseek-v4-flash", "nvidia/gemma-3-27b", "nvidia/nemotron-nano-9b-v2", "oneprovider/claude-sonnet-4-6", DEFAULT_MODEL_ID], reason: "Auto: DeepSeek V4 Flash for ScreenGui layout." },
  assets:      { ids: ["nvidia/llama-3.1-8b", "nvidia/ministral-14b", "nvidia/nemotron-nano-9b-v2"], reason: "Auto: small fast model for Toolbox asset planning." },
  bugfix:      { ids: ["oneprovider/claude-sonnet-4-6", "nvidia/deepseek-v4-flash", "nvidia/z-ai-glm-5.2", "nvidia/gemma-3-27b", "nvidia/ministral-14b", DEFAULT_MODEL_ID], reason: "Auto: Claude Sonnet or DeepSeek V4 Flash for bug tracing." },
  performance: { ids: ["nvidia/deepseek-v4-flash", "nvidia/z-ai-glm-5.2", "oneprovider/claude-sonnet-4-6", "nvidia/gemma-3-27b"], reason: "Auto: DeepSeek V4 Flash for performance analysis." },
  testing:     { ids: ["nvidia/nemotron-nano-9b-v2", "nvidia/gemma-3-27b", "nvidia/openai-gpt-oss-20b"], reason: "Auto: fast model for playtest checks." },
  shortedit:   { ids: ["nvidia/llama-3.1-8b", "nvidia/ministral-14b", "oneprovider/claude-haiku-4-5"], reason: "Auto: tiny fast model for short edits." },
  vision:      { ids: ["nvidia/deepseek-v4-flash", "nvidia/gemma-3-27b", "nvidia/nemotron-nano-9b-v2", DEFAULT_MODEL_ID], reason: "Auto: DeepSeek V4 Flash for vision analysis." },
  design:      { ids: ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "oneprovider/claude-sonnet-4-6", "nvidia/z-ai-glm-5.2"], reason: "Auto: DeepSeek V4 Pro for game design and architecture." },
};


export type Difficulty = "easy" | "normal" | "hard";

// Per-task recommended max output tokens. Tuned to avoid costly over-generation
// on simple tasks while giving complex builds enough headroom to finish.
export const TASK_MAX_TOKENS: Record<AutoTask, number> = {
  planning:    4000,
  scripting:   8000,
  ui:          6000,
  assets:      2000,
  bugfix:      5000,
  performance: 4000,
  testing:     3000,
  shortedit:   1800,
  vision:      2500,
};

// Hard-difficulty multiplier applied to TASK_MAX_TOKENS for large builds.
// Full-game requests can easily push past 12k tokens; we cap at the model's own ceiling.
export const HARD_TOKEN_MULTIPLIER = 2.0;

// Rough word/char heuristic — no model call, ~0ms.
// Enhanced with Roblox-specific complexity signals that reliably escalate to hard.
export function estimateDifficulty(text: string): Difficulty {
  const t = (text || "").toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;

  // Roblox-specific HARD signals: any single match escalates immediately.
  const hardSignals = [
    /\b(full\s*game|complete\s*game|entire\s*game|full\s*system|all\s*systems)\b/,
    /\b(multiplayer|server.?authoritative|cross.?server|messaging.?service)\b/,
    /\b(datastore|profileservice|profile.?store|data.?store.?service)\b/,
    /\b(tycoon|simulator|battle.?royale|tower.?defen[cs]e|zombie.?survival)\b/,
    /\b(anti.?exploit|rate.?limit|remote.?event.?validation)\b/,
    /\b(streaming.?enabled|parallel.?luau|actor|bindable)\b/,
    /\b(round.?system|match.?making|leaderboard|economy|currency|gamepass)\b/,
    /\b(pet.?system|inventory.?system|quest.?system|skill.?tree|crafting)\b/,
    /\b(npc.?(pathfinding|ai|behavior)|behavior.?tree|state.?machine)\b/,
    /\b(procedural|pcg|noise|terrain.?generation|dungeon.?gen)\b/,
  ];
  if (hardSignals.some((re) => re.test(t))) return "hard";

  const systemHits = (t.match(/\b(system|rpg|combat|inventory|shop|quest|save|multiplayer|round|match|team|economy)\b/g) || []).length;
  const featureAnds = (t.match(/\band\b/g) || []).length;
  if (words <= 8 && systemHits === 0) return "easy";
  if (words >= 40 || systemHits >= 2 || featureAnds >= 3) return "hard";
  return "normal";
}

const HARD_PREF: Partial<Record<AutoTask, string[]>> = {
  planning:    ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/z-ai-glm-5.2", "oneprovider/claude-sonnet-4-6"],
  scripting:   ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/z-ai-glm-5.2", "nvidia/openai-gpt-oss-20b", "oneprovider/claude-sonnet-4-6"],
  ui:          ["nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/z-ai-glm-5.2", "nvidia/gemma-3-27b"],
  bugfix:      ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/z-ai-glm-5.2", "oneprovider/claude-sonnet-4-6"],
  performance: ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/z-ai-glm-5.2", "oneprovider/claude-sonnet-4-6"],
  testing:     ["nvidia/nemotron-nano-9b-v2", "nvidia/gemma-3-27b", "nvidia/openai-gpt-oss-20b"],
  assets:      ["nvidia/nemotron-nano-9b-v2", "nvidia/ministral-14b", "nvidia/llama-3.1-8b"],
  shortedit:   ["oneprovider/claude-haiku-4-5", "nvidia/ministral-14b", "nvidia/llama-3.1-8b"],
  vision:      ["nvidia/deepseek-v4-flash", "nvidia/llama-3.3-nemotron-super-49b", "nvidia/gemma-3-27b"],
  design:      ["nvidia/deepseek-v4-pro", "nvidia/deepseek-v4-flash", "oneprovider/claude-sonnet-4-6", "nvidia/z-ai-glm-5.2"],
};

export function pickModelForTask(task: AutoTask, difficulty: Difficulty = "normal"): ModelPick {
  const pref = TASK_PREF[task];
  const ids = difficulty === "hard"
    ? [...(HARD_PREF[task] ?? []), ...pref.ids]
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
    chosen = MODELS.find((m) => m.id === DEFAULT_MODEL_ID && isSelectable(m))
      ?? MODELS.find((m) => isSelectable(m))
      ?? MODELS[0];
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

/**
 * Like pickModelForTask but also returns the recommended maxOutputTokens cap
 * for this task/difficulty combination, respecting the model's own ceiling.
 */
export function pickModelForTaskWithBudget(
  task: AutoTask,
  difficulty: Difficulty = "normal",
): ModelPick & { maxOutputTokens: number } {
  const pick = pickModelForTask(task, difficulty);
  const base = TASK_MAX_TOKENS[task] ?? 4000;
  const maxOutputTokens = difficulty === "hard"
    ? Math.round(base * HARD_TOKEN_MULTIPLIER)
    : difficulty === "easy"
      ? Math.round(base * 0.5)
      : base;
  return { ...pick, maxOutputTokens };
}

/**
 * Auto-retry: when the primary model pick produces a validation failure,
 * walk the HARD_PREF list for the same task and return the next best model
 * that differs from the one that failed. Returns null when exhausted.
 */
export function pickFallbackAfterFailure(
  task: AutoTask,
  failedModelId: string,
): ModelPick | null {
  const hard = HARD_PREF[task] ?? [];
  const fast = TASK_PREF[task].ids;
  const candidates = [...hard, ...fast].filter((id) => id !== failedModelId);
  for (const id of candidates) {
    const m = MODELS.find((x) => x.id === id);
    if (m && isSelectable(m)) {
      return {
        task,
        modelId: m.id,
        label: m.label,
        provider: m.provider,
        via: m.via,
        reason: `Auto-retry after validation failure on ${failedModelId}`,
        fellBack: true,
      };
    }
  }
  return null;
}

export const AUTO_TASKS: AutoTask[] = [
  "planning", "scripting", "ui", "assets", "bugfix",
  "performance", "testing", "shortedit", "design",
];

export function pickAllTaskModels(): ModelPick[] {
  return AUTO_TASKS.map((t) => pickModelForTask(t));
}

export const TASK_LABELS: Record<AutoTask, string> = {
  planning:    "Planning & build graph",
  scripting:   "Roblox Lua scripting",
  ui:          "UI design",
  assets:      "Toolbox asset search",
  bugfix:      "Bug fixing",
  performance: "Performance optimizer",
  testing:     "Playtesting",
  shortedit:   "Short edits & retries",
  vision:      "Screenshot / vision",
  design:      "Game design & architecture",
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
