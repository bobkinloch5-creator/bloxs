// Real model catalog. Each entry is a real, connected model on the Lovable AI
// Gateway. No fantasy names — the model id is the actual provider model id and
// the label uses the real public name. UI shows provider, best-for, speed, and
// credit cost so creators know exactly what they're picking.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI" | "Lovable AI";
export type Speed = "Fast" | "Medium" | "Slow";
export type Quality = "Good" | "Great" | "Best";
export type Credits = "Low" | "Medium" | "High" | "Very High";
export type Status = "Working" | "Coming Soon";
export type Gateway = "lovable" | "quatarly" | "nvidia";

export interface ModelOption {
  id: string;          // unique id used in UI (also default upstream id)
  upstreamId?: string; // override id sent to the gateway (defaults to id)
  gateway?: Gateway;   // which API to route through (defaults to "lovable")
  label: string;       // real public model name
  provider: Provider;  // who actually trained the model
  via: string;         // routing path description
  tier: "fast" | "balanced" | "premium";
  speed: Speed;
  quality: Quality;
  credits: Credits;
  status: Status;
  bestFor: string;     // Roblox use-case
  description: string;
  /** Extra body fields to send to the provider (e.g. NVIDIA thinking flags). */
  extraBody?: Record<string, unknown>;
}

// Every id below is a real Lovable AI Gateway model id (see ai-models-catalog).
export const MODELS: ModelOption[] = [
  // ── Google Gemini ───────────────────────────────────────────────
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Default Roblox builder — scripts, GUIs, quick edits.",
    description: "Balanced speed and quality for most prompts. Recommended default.",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "Tiny tweaks, renames, color/material swaps, GUI text edits.",
    description: "Fastest and cheapest Gemini — great for one-line fixes.",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Rapid Luau iteration, debugging, fast prototyping.",
    description: "High-efficiency Gemini for fast coding and reasoning.",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Combat scripts, pets, shops, inventory — solid mid-tier.",
    description: "Reliable balanced Gemini with multimodal support.",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "Beginner prompts, learning Luau, tiny gameplay scripts.",
    description: "Cheapest Gemini option for high-volume simple tasks.",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Full tycoons, RPGs, datastore systems, round-based games.",
    description: "Strong multimodal reasoning for complex multi-system builds.",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (Preview)",
    provider: "Google",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Planning large Roblox systems and game design docs.",
    description: "Next-gen Gemini reasoning when quality matters more than latency.",
  },

  // ── OpenAI GPT ──────────────────────────────────────────────────
  {
    id: "openai/gpt-5-nano",
    label: "GPT-5 Nano",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "One-liner scripts, renames, simple GUI tweaks.",
    description: "Fast, low-cost OpenAI model for simple or high-volume tasks.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "General Roblox scripting with strong reasoning at lower cost.",
    description: "Lower-cost OpenAI model with strong general performance.",
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Full game planning, code, and UI with nuance.",
    description: "Powerful all-rounder for accuracy and multimodal tasks.",
  },
  {
    id: "openai/gpt-5.2",
    label: "GPT-5.2",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Complex Luau problem-solving and refactors.",
    description: "Enhanced reasoning for complex problem solving.",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "ModuleScripts, OOP systems, framework-style codebases.",
    description: "Advanced reasoning, code generation, and analysis.",
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "Balanced reasoning + cost for everyday Roblox builds.",
    description: "Smaller, faster GPT-5.4 with strong capability per credit.",
  },
  {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "High-volume quick fixes and simple Luau snippets.",
    description: "Fastest, lowest-cost GPT-5.4 variant.",
  },
  {
    id: "openai/gpt-5.4-pro",
    label: "GPT-5.4 Pro",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Very High",
    status: "Working",
    bestFor: "Hardest Roblox systems: anti-exploit, networking, large refactors.",
    description: "Premium GPT-5.4 variant for the most complex reasoning tasks.",
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "End-to-end game builds, polishing released games.",
    description: "Most capable GPT-5.5 model for demanding reasoning and code.",
  },
  {
    id: "openai/gpt-5.5-pro",
    label: "GPT-5.5 Pro",
    provider: "OpenAI",
    via: "Lovable AI Gateway",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Very High",
    status: "Working",
    bestFor: "Whole-game blueprints, complex economies, deep refactors.",
    description: "Premium GPT-5.5 with extended reasoning for the hardest problems.",
  },

  // ── Coming Soon (not selectable) ────────────────────────────────
  {
    id: "anthropic/claude-sonnet",
    label: "Claude Sonnet",
    provider: "OpenAI", // placeholder; gated by status
    via: "Coming Soon",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Planning large Roblox systems and long-form design.",
    description: "Anthropic Claude integration is coming soon.",
  },
  {
    id: "groq/qwen2.5-coder-32b",
    label: "Qwen 2.5 Coder 32B",
    provider: "OpenAI",
    via: "Coming Soon",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Roblox Luau scripts and debugging at high speed.",
    description: "Groq-hosted Qwen Coder integration is coming soon.",
  },
];

export const DEFAULT_MODEL_ID = "google/gemini-3-flash-preview";
export const FALLBACK_MODEL_ID = "google/gemini-2.5-flash-lite";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}
