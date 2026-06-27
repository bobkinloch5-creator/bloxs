// Real model catalog. Lovable AI Gateway chat models have been removed; every
// entry below routes through a non-Lovable provider gateway. No fantasy names —
// the model id is the real provider route and the label uses the public name.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI";
export type Speed = "Fast" | "Medium" | "Slow";
export type Quality = "Good" | "Great" | "Best";
export type Credits = "Low" | "Medium" | "High" | "Very High";
export type Status = "Working" | "Coming Soon";
export type Gateway = "quatarly" | "nvidia";

export interface ModelOption {
  id: string;          // unique id used in UI (also default upstream id)
  upstreamId?: string; // override id sent to the gateway (defaults to id)
  gateway: Gateway;    // which API to route through
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
  /** Per-model generation settings required by some OpenAI-compatible routes. */
  modelSettings?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

// Every id below is routed through Quatarly or NVIDIA, not Lovable AI Gateway.
export const MODELS: ModelOption[] = [
  // ── Quatarly (Claude / Gemini / GPT via single key) ─────────────
  {
    id: "quatarly/claude-sonnet-4-6-thinking",
    upstreamId: "claude-sonnet-4-6-thinking",
    gateway: "quatarly",
    label: "Claude Sonnet 4.6 (Thinking)",
    provider: "Anthropic",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Long-form Roblox refactors, system design, careful reasoning.",
    description: "Anthropic Claude Sonnet 4.6 with extended thinking, via Quatarly.",
  },
  {
    id: "quatarly/claude-opus-4-6-thinking",
    upstreamId: "claude-opus-4-6-thinking",
    gateway: "quatarly",
    label: "Claude Opus 4.6 (Thinking)",
    provider: "Anthropic",
    via: "Quatarly",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Very High",
    status: "Working",
    bestFor: "Hardest Roblox tasks — anti-exploit, large game architectures.",
    description: "Anthropic's most powerful model, with extended thinking.",
  },
  {
    id: "quatarly/claude-haiku-4-5",
    upstreamId: "claude-haiku-4-5-20251001",
    gateway: "quatarly",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    via: "Quatarly",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "Quick Luau snippets, edits, GUI text — cheap and fast.",
    description: "Anthropic's fast/cheap Claude tier via Quatarly.",
  },
  {
    id: "quatarly/gemini-3.1-pro",
    upstreamId: "gemini-3.1-pro",
    gateway: "quatarly",
    label: "Gemini 3.1 Pro (Quatarly)",
    provider: "Google",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Large-context Roblox planning routed through Quatarly.",
    description: "Google's Gemini 3.1 Pro through Quatarly.",
  },
  {
    id: "quatarly/gemini-3-flash",
    upstreamId: "gemini-3-flash",
    gateway: "quatarly",
    label: "Gemini 3 Flash (Quatarly)",
    provider: "Google",
    via: "Quatarly",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Fast everyday Roblox builds via Quatarly.",
    description: "Google's Gemini 3 Flash through Quatarly.",
  },
  {
    id: "quatarly/gpt-5.1",
    upstreamId: "gpt-5.1",
    gateway: "quatarly",
    label: "GPT-5.1 (Quatarly)",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Medium",
    status: "Coming Soon",
    bestFor: "General Roblox scripting, UI wiring, and reliable everyday builds.",
    description: "OpenAI GPT-5.1 routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.1-codex",
    upstreamId: "gpt-5.1-codex",
    gateway: "quatarly",
    label: "GPT-5.1 Codex",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "balanced",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Roblox Luau scripts, modules, remotes, and refactors.",
    description: "OpenAI Codex-tuned GPT-5.1 routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.1-codex-max",
    upstreamId: "gpt-5.1-codex-max",
    gateway: "quatarly",
    label: "GPT-5.1 Codex Max",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Big Luau codebases and agentic coding via Quatarly.",
    description: "Maxed-out Codex variant routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.2",
    upstreamId: "gpt-5.2",
    gateway: "quatarly",
    label: "GPT-5.2 (Quatarly)",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Complex Roblox gameplay systems, premium UI, and project scans.",
    description: "OpenAI GPT-5.2 routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.2-codex",
    upstreamId: "gpt-5.2-codex",
    gateway: "quatarly",
    label: "GPT-5.2 Codex",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Large Roblox code changes, Studio actions, and bug fixing.",
    description: "OpenAI Codex-tuned GPT-5.2 routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.3-codex",
    upstreamId: "gpt-5.3-codex",
    gateway: "quatarly",
    label: "GPT-5.3 Codex",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Code-first Roblox prompts — scripts, modules, refactors.",
    description: "OpenAI Codex-tuned model specialised for code, via Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.4",
    upstreamId: "gpt-5.4",
    gateway: "quatarly",
    label: "GPT-5.4 (Quatarly)",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Coming Soon",
    bestFor: "Advanced Luau reasoning via Quatarly.",
    description: "OpenAI GPT-5.4 routed through Quatarly. Temporarily disabled because Quatarly returned 502 Bad Gateway in live checks.",
  },
  {
    id: "quatarly/gpt-5.5",
    upstreamId: "gpt-5.5",
    gateway: "quatarly",
    label: "GPT-5.5 (Quatarly)",
    provider: "OpenAI",
    via: "Quatarly",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "End-to-end Roblox builds through Quatarly.",
    description: "OpenAI GPT-5.5 routed through Quatarly.",
  },

  // ── NVIDIA Integrate (open-source frontier models) ──────────────
  {
    id: "nvidia/deepseek-v4-pro",
    upstreamId: "deepseek-ai/deepseek-v4-pro",
    gateway: "nvidia",
    label: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    via: "NVIDIA",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Deep Luau reasoning and complex Roblox systems.",
    description: "DeepSeek's flagship reasoning model via NVIDIA Integrate.",
  },
  {
    id: "nvidia/deepseek-v4-flash",
    upstreamId: "deepseek-ai/deepseek-v4-flash",
    gateway: "nvidia",
    label: "DeepSeek V4 Flash (Thinking)",
    provider: "DeepSeek",
    via: "NVIDIA",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "Fast reasoning with visible chain-of-thought.",
    description: "DeepSeek V4 Flash with thinking enabled at high reasoning effort.",
    extraBody: { chat_template_kwargs: { thinking: true, reasoning_effort: "high" } },
  },
  {
    id: "nvidia/glm-5.1",
    upstreamId: "z-ai/glm-5.1",
    gateway: "nvidia",
    label: "GLM 5.1",
    provider: "Z.AI",
    via: "NVIDIA",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "General Roblox prompts via Z.AI's open GLM family.",
    description: "Z.AI GLM 5.1 streamed through NVIDIA Integrate.",
  },
  {
    id: "nvidia/google-gemma-4-31b-it",
    upstreamId: "google/gemma-4-31b-it",
    gateway: "nvidia",
    label: "Google Gemma 4 31B IT",
    provider: "Google",
    via: "NVIDIA",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "Google/NVIDIA Roblox planning, Luau edits, and UI/system prompts.",
    description: "Google Gemma 4 31B instruction model through NVIDIA Integrate with thinking enabled.",
    extraBody: { chat_template_kwargs: { enable_thinking: true } },
  },
  {
    id: "nvidia/gpt-oss-120b",
    upstreamId: "openai/gpt-oss-120b",
    gateway: "nvidia",
    label: "GPT-OSS 120B",
    provider: "OpenAI",
    via: "NVIDIA",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Heavy Luau code with an open-weights OpenAI model.",
    description: "OpenAI's open-source 120B model via NVIDIA Integrate using the recommended GPT-OSS settings.",
    modelSettings: { temperature: 1, topP: 1, maxOutputTokens: 4096 },
  },

];

export const DEFAULT_MODEL_ID = "quatarly/gemini-3-flash";
export const FALLBACK_MODEL_ID = "quatarly/gemini-3-flash";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}
