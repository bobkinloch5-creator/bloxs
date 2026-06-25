// Client-safe model catalog. Server picks the provider implementation.
// User-facing names are branded BloxSmith identities — the underlying
// provider/model is intentionally hidden so creators pick by USE CASE.

export type Provider = "lovable" | "quatarly" | "nvidia" | "groq";

export interface ModelOption {
  id: string;          // unique key used by client + server
  label: string;       // BloxSmith brand name — no provider exposed
  provider: Provider;  // internal only
  upstream: string;    // upstream model id passed to provider API (internal)
  tier: "fast" | "balanced" | "premium";
  description: string; // what it does
  bestFor: string;     // which Roblox build it shines at
}

export const MODELS: ModelOption[] = [
  // Lovable AI Gateway (free, default)
  {
    id: "lovable-ai",
    label: "Spark",
    provider: "lovable",
    upstream: "google/gemini-2.5-flash-lite",
    tier: "fast",
    description: "Cheapest everyday builder. Plans simple scripts, GUIs, and tweaks fast.",
    bestFor: "Obbies, small minigames, quick edits, and learning Luau.",
  },
  {
    id: "blox-flash",
    label: "Forge",
    provider: "lovable",
    upstream: "google/gemini-3-flash-preview",
    tier: "fast",
    description: "Default builder. Balanced speed and quality for most prompts.",
    bestFor: "Simulators, tycoons starter systems, leaderboards, shop UIs.",
  },
  {
    id: "blox-pro",
    label: "Architect",
    provider: "lovable",
    upstream: "google/gemini-2.5-pro",
    tier: "premium",
    description: "Deep reasoning for multi-system game design.",
    bestFor: "Full tycoons, RPG progression, datastore systems, round-based games.",
  },
  {
    id: "blox-coder",
    label: "Maestro",
    provider: "lovable",
    upstream: "openai/gpt-5.5",
    tier: "premium",
    description: "Strongest coder. Writes clean, optimized Luau and complex modules.",
    bestFor: "Combat systems, anti-exploit, networking, performance-critical scripts.",
  },
  {
    id: "blox-nano",
    label: "Pixel",
    provider: "lovable",
    upstream: "google/gemini-3.1-flash-lite",
    tier: "fast",
    description: "Lightning fast for tiny tweaks and one-line fixes.",
    bestFor: "Renaming parts, color/material swaps, GUI text edits, quick patches.",
  },

  // Premium BloxSmith modes. All route through Lovable AI so every picker option works without extra keys.
  {
    id: "qua-sonnet",
    label: "Loom",
    provider: "lovable",
    upstream: "google/gemini-3.1-pro-preview",
    tier: "premium",
    description: "Thoughtful planner. Strong at game design docs and balanced builds.",
    bestFor: "Game design, story-driven games, dialog systems, quest chains.",
  },
  {
    id: "qua-opus",
    label: "Titan",
    provider: "lovable",
    upstream: "openai/gpt-5.5-pro",
    tier: "premium",
    description: "Heaviest reasoning model. Slow but extremely thorough.",
    bestFor: "Whole-game blueprints, refactoring large places, complex economies.",
  },
  {
    id: "qua-haiku",
    label: "Dash",
    provider: "lovable",
    upstream: "google/gemini-3.5-flash",
    tier: "fast",
    description: "Quick replies with surprisingly good code quality.",
    bestFor: "Iterating on UI, fast prototyping, debugging Luau errors.",
  },
  {
    id: "qua-gem-pro",
    label: "Vision",
    provider: "lovable",
    upstream: "google/gemini-2.5-pro",
    tier: "premium",
    description: "Multimodal pro. Great when prompts include images or references.",
    bestFor: "Map building from screenshots, UI replicas, asset-driven builds.",
  },
  {
    id: "qua-gpt-codex",
    label: "Forge X",
    provider: "lovable",
    upstream: "openai/gpt-5.4",
    tier: "premium",
    description: "Code-focused. Excellent module structure and pattern reuse.",
    bestFor: "ModuleScripts, OOP class systems, framework-style codebases.",
  },
  {
    id: "qua-gpt-55",
    label: "Apex",
    provider: "lovable",
    upstream: "openai/gpt-5.5",
    tier: "premium",
    description: "Top-tier all-rounder. Smart at scripts, design, and explanations.",
    bestFor: "End-to-end game builds, polishing released games, mentor-style help.",
  },

  // Extra branded modes backed by maintained Lovable AI models.
  {
    id: "nv-llama-405",
    label: "Anvil",
    provider: "lovable",
    upstream: "google/gemini-2.5-pro",
    tier: "premium",
    description: "Massive open model. Heavy reasoning at lower cost than premiums.",
    bestFor: "Bulk script generation, big AI NPCs, lore/quest writing.",
  },
  {
    id: "nv-llama-70",
    label: "Iron",
    provider: "lovable",
    upstream: "google/gemini-2.5-flash",
    tier: "balanced",
    description: "Solid mid-tier. Reliable Luau and consistent answers.",
    bestFor: "Combat scripts, pets/companions, basic shop and inventory systems.",
  },
  {
    id: "nv-mixtral",
    label: "Mosaic",
    provider: "lovable",
    upstream: "google/gemini-2.5-flash",
    tier: "balanced",
    description: "Mixture-of-experts. Strong on structured tasks.",
    bestFor: "Config files, datastore schemas, repetitive boilerplate.",
  },

  // Fast modes also run through Lovable AI.
  {
    id: "groq-llama-70",
    label: "Bolt",
    provider: "lovable",
    upstream: "google/gemini-3.5-flash",
    tier: "balanced",
    description: "Sub-second responses. Strong code at insane speed.",
    bestFor: "Live iteration, in-Studio quick fixes, rapid prototyping.",
  },
  {
    id: "groq-llama-8",
    label: "Zap",
    provider: "lovable",
    upstream: "openai/gpt-5-nano",
    tier: "fast",
    description: "Near-instant replies. Lightest brain on the list.",
    bestFor: "One-liner scripts, renames, simple GUI tweaks.",
  },
  {
    id: "groq-mixtral",
    label: "Surge",
    provider: "lovable",
    upstream: "google/gemini-2.5-flash",
    tier: "balanced",
    description: "Long-context fast model. Holds big projects in mind.",
    bestFor: "Refactoring large scripts, multi-file edits, big map logic.",
  },
  {
    id: "groq-gemma",
    label: "Ember",
    provider: "lovable",
    upstream: "google/gemini-2.5-flash-lite",
    tier: "fast",
    description: "Tiny, snappy, surprisingly capable.",
    bestFor: "Beginner prompts, learning Luau, tiny gameplay scripts.",
  },
];

export const DEFAULT_MODEL_ID = "blox-flash";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}
