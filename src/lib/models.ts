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

  // Quatarly (BYO key) — branded as BloxSmith
  {
    id: "qua-sonnet",
    label: "Loom",
    provider: "quatarly",
    upstream: "claude-sonnet-4-6-thinking",
    tier: "premium",
    description: "Thoughtful planner. Strong at game design docs and balanced builds.",
    bestFor: "Game design, story-driven games, dialog systems, quest chains.",
  },
  {
    id: "qua-opus",
    label: "Titan",
    provider: "quatarly",
    upstream: "claude-opus-4-6-thinking",
    tier: "premium",
    description: "Heaviest reasoning model. Slow but extremely thorough.",
    bestFor: "Whole-game blueprints, refactoring large places, complex economies.",
  },
  {
    id: "qua-haiku",
    label: "Dash",
    provider: "quatarly",
    upstream: "claude-haiku-4-5-20251001",
    tier: "fast",
    description: "Quick replies with surprisingly good code quality.",
    bestFor: "Iterating on UI, fast prototyping, debugging Luau errors.",
  },
  {
    id: "qua-gem-pro",
    label: "Vision",
    provider: "quatarly",
    upstream: "gemini-3.1-pro",
    tier: "premium",
    description: "Multimodal pro. Great when prompts include images or references.",
    bestFor: "Map building from screenshots, UI replicas, asset-driven builds.",
  },
  {
    id: "qua-gpt-codex",
    label: "Forge X",
    provider: "quatarly",
    upstream: "gpt-5.3-codex",
    tier: "premium",
    description: "Code-focused. Excellent module structure and pattern reuse.",
    bestFor: "ModuleScripts, OOP class systems, framework-style codebases.",
  },
  {
    id: "qua-gpt-55",
    label: "Apex",
    provider: "quatarly",
    upstream: "gpt-5.5",
    tier: "premium",
    description: "Top-tier all-rounder. Smart at scripts, design, and explanations.",
    bestFor: "End-to-end game builds, polishing released games, mentor-style help.",
  },

  // NVIDIA NIM (BYO key) — branded
  {
    id: "nv-llama-405",
    label: "Anvil",
    provider: "nvidia",
    upstream: "meta/llama-3.1-405b-instruct",
    tier: "premium",
    description: "Massive open model. Heavy reasoning at lower cost than premiums.",
    bestFor: "Bulk script generation, big AI NPCs, lore/quest writing.",
  },
  {
    id: "nv-llama-70",
    label: "Iron",
    provider: "nvidia",
    upstream: "meta/llama-3.1-70b-instruct",
    tier: "balanced",
    description: "Solid mid-tier. Reliable Luau and consistent answers.",
    bestFor: "Combat scripts, pets/companions, basic shop and inventory systems.",
  },
  {
    id: "nv-mixtral",
    label: "Mosaic",
    provider: "nvidia",
    upstream: "mistralai/mixtral-8x22b-instruct-v0.1",
    tier: "balanced",
    description: "Mixture-of-experts. Strong on structured tasks.",
    bestFor: "Config files, datastore schemas, repetitive boilerplate.",
  },

  // Groq (BYO key) — branded, blazing fast
  {
    id: "groq-llama-70",
    label: "Bolt",
    provider: "groq",
    upstream: "llama-3.1-70b-versatile",
    tier: "balanced",
    description: "Sub-second responses. Strong code at insane speed.",
    bestFor: "Live iteration, in-Studio quick fixes, rapid prototyping.",
  },
  {
    id: "groq-llama-8",
    label: "Zap",
    provider: "groq",
    upstream: "llama-3.1-8b-instant",
    tier: "fast",
    description: "Near-instant replies. Lightest brain on the list.",
    bestFor: "One-liner scripts, renames, simple GUI tweaks.",
  },
  {
    id: "groq-mixtral",
    label: "Surge",
    provider: "groq",
    upstream: "mixtral-8x7b-32768",
    tier: "balanced",
    description: "Long-context fast model. Holds big projects in mind.",
    bestFor: "Refactoring large scripts, multi-file edits, big map logic.",
  },
  {
    id: "groq-gemma",
    label: "Ember",
    provider: "groq",
    upstream: "gemma2-9b-it",
    tier: "fast",
    description: "Tiny, snappy, surprisingly capable.",
    bestFor: "Beginner prompts, learning Luau, tiny gameplay scripts.",
  },
];

export const DEFAULT_MODEL_ID = "blox-flash";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}
