// Real model catalog. NVIDIA-first: Groq's free tier caps at 12K TPM which
// rejects BloxSmith's large system prompt. NVIDIA NIM endpoints have much
// larger token budgets and a wide selection, so they own the default + chain.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI" | "MiniMax" | "NVIDIA" | "Qwen" | "Groq" | "Meta" | "Mistral" | "Microsoft" | "Writer";
export type Speed = "Fast" | "Medium" | "Slow";
export type Quality = "Good" | "Great" | "Best";
export type Credits = "Low" | "Medium" | "High" | "Very High";
export type Status = "Working" | "Coming Soon";
export type Gateway = "lovable" | "nvidia" | "groq" | "oneprovider";

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

export const MODELS: ModelOption[] = [
  // ─── NVIDIA Nemotron family ────────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b",
    upstreamId: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    gateway: "nvidia",
    label: "Nemotron Ultra 253B",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "NVIDIA Llama 3.1 Nemotron Ultra 253B — re-enable when provisioned.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b",
    upstreamId: "nvidia/llama-3.3-nemotron-super-49b-v1",
    gateway: "nvidia",
    label: "Nemotron Super 49B",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "High-quality reasoning fallback for larger Roblox plans when faster models need help.",
    description: "NVIDIA Nemotron Super 49B via build.nvidia.com.",
    modelSettings: { temperature: 0.5, topP: 0.92, maxOutputTokens: 8192 },

  },
  {
    id: "nvidia/llama-3.1-nemotron-70b",
    upstreamId: "nvidia/llama-3.1-nemotron-70b-instruct",
    gateway: "nvidia",
    label: "Nemotron 70B",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "NVIDIA Llama 3.1 Nemotron 70B — re-enable when provisioned.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/nemotron-4-340b",
    upstreamId: "nvidia/nemotron-4-340b-instruct",
    gateway: "nvidia",
    label: "Nemotron 4 340B",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "NVIDIA Nemotron 4 340B — re-enable when provisioned.",
    modelSettings: { temperature: 0.5, topP: 0.95, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/nemotron-nano-9b-v2",
    upstreamId: "nvidia/nvidia-nemotron-nano-9b-v2",
    gateway: "nvidia",
    label: "Nemotron Nano 9B v2",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Very fast NVIDIA reasoning model for quick Roblox planning, chat, and small fixes.",
    description: "NVIDIA Nemotron Nano 9B v2 via build.nvidia.com.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 2048 },
  },

  // ─── Meta Llama on NVIDIA ─────────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-405b",
    upstreamId: "meta/llama-3.1-405b-instruct",
    gateway: "nvidia",
    label: "Llama 3.1 405B",
    provider: "Meta",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "Meta Llama 3.1 405B — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.6, topP: 0.9, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/llama-3.3-70b",
    upstreamId: "meta/llama-3.3-70b-instruct",
    gateway: "nvidia",
    label: "Llama 3.3 70B (NVIDIA)",
    provider: "Meta",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable / timing out on NVIDIA NIM.",
    description: "Meta Llama 3.3 70B — re-enable when endpoint is healthy.",
    modelSettings: { temperature: 0.5, topP: 0.92, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/llama-3.1-70b",
    upstreamId: "meta/llama-3.1-70b-instruct",
    gateway: "nvidia",
    label: "Llama 3.1 70B (NVIDIA)",
    provider: "Meta",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable / timing out on NVIDIA NIM.",
    description: "Meta Llama 3.1 70B — re-enable when endpoint is healthy.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/llama-3.1-8b",
    upstreamId: "meta/llama-3.1-8b-instruct",
    gateway: "nvidia",
    label: "Llama 3.1 8B (NVIDIA)",
    provider: "Meta",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "Very fast lightweight model for short edits, quick answers, and tiny build fixes.",
    description: "Meta Llama 3.1 8B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.45, topP: 0.85, maxOutputTokens: 2048 },
  },

  // ─── Qwen on NVIDIA ────────────────────────────────────────────────────────
  {
    id: "nvidia/qwen-2.5-coder-32b",
    upstreamId: "qwen/qwen2.5-coder-32b-instruct",
    gateway: "nvidia",
    label: "Qwen 2.5 Coder 32B",
    provider: "Qwen",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Fast general-purpose Qwen model — strong Luau generation, bug fixes, and build actions.",
    description: "Qwen 2.5 Coder 32B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.4, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/qwen-2.5-72b",
    upstreamId: "qwen/qwen2.5-72b-instruct",
    gateway: "nvidia",
    label: "Qwen 2.5 72B",
    provider: "Qwen",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "Qwen 2.5 72B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.5, topP: 0.92, maxOutputTokens: 8192 },
  },

  // ─── DeepSeek on NVIDIA ────────────────────────────────────────────────────
  {
    id: "nvidia/deepseek-v4-flash",
    upstreamId: "deepseek-ai/deepseek-v4-flash",
    gateway: "nvidia",
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Fast",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Temporarily disabled because this NVIDIA route is returning capacity errors.",
    description: "DeepSeek V4 Flash via NVIDIA build.nvidia.com — temporarily disabled while capacity is unstable.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 3072 },
  },
  {
    id: "nvidia/deepseek-r1",
    upstreamId: "deepseek-ai/deepseek-r1",
    gateway: "nvidia",
    label: "DeepSeek R1",
    provider: "DeepSeek",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "DeepSeek R1 — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.35, topP: 0.8, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/deepseek-v3",
    upstreamId: "deepseek-ai/deepseek-v3",
    gateway: "nvidia",
    label: "DeepSeek V3",
    provider: "DeepSeek",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "DeepSeek V3 — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 4096 },
  },
  {
    id: "nvidia/deepseek-r1-distill-llama-70b",
    upstreamId: "deepseek-ai/deepseek-r1-distill-llama-70b",
    gateway: "nvidia",
    label: "DeepSeek R1 Distill Llama 70B",
    provider: "DeepSeek",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "DeepSeek R1 Distill 70B — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 4096 },
  },

  // ─── Mistral / Microsoft / Writer on NVIDIA ────────────────────────────────
  {
    id: "nvidia/mixtral-8x22b",
    upstreamId: "mistralai/mistral-medium-3.5-128b",
    gateway: "nvidia",
    label: "Mistral Medium 3.5 128B",
    provider: "Mistral",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable / failing probe tests on NVIDIA NIM.",
    description: "Mistral Medium 3.5 128B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.5, topP: 0.92, maxOutputTokens: 6144 },
  },
  {
    id: "nvidia/mistral-large-2",
    upstreamId: "mistralai/mistral-small-4-119b-2603",
    gateway: "nvidia",
    label: "Mistral Small 4 119B",
    provider: "Mistral",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable / failing probe tests on NVIDIA NIM.",
    description: "Mistral Small 4 119B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.5, topP: 0.92, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/ministral-14b",
    upstreamId: "mistralai/ministral-14b-instruct-2512",
    gateway: "nvidia",
    label: "Ministral 14B",
    provider: "Mistral",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Good",
    credits: "Low",
    status: "Working",
    bestFor: "Very fast Mistral model for quick Roblox chat and small edits.",
    description: "Mistral Ministral 14B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 2048 },
  },
  {
    id: "nvidia/phi-4",
    upstreamId: "microsoft/phi-4-mini-instruct",
    gateway: "nvidia",
    label: "Phi-4 Mini",
    provider: "Microsoft",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "Microsoft Phi-4 Mini — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 2048 },
  },
  {
    id: "nvidia/gemma-3-27b",
    upstreamId: "google/gemma-4-31b-it",
    gateway: "nvidia",
    label: "Gemma 4 31B",
    provider: "Google",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Fast balanced model for responsive Roblox chat, UI ideas, and build planning.",
    description: "Google Gemma 4 31B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.4, topP: 0.85, maxOutputTokens: 3072 },
  },
  {
    id: "nvidia/palmyra-creative-122b",
    upstreamId: "writer/palmyra-creative-122b",
    gateway: "nvidia",
    label: "Palmyra Creative 122B",
    provider: "Writer",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Currently unavailable on NVIDIA NIM.",
    description: "Writer Palmyra Creative 122B — re-enable when the endpoint is provisioned.",
    modelSettings: { temperature: 0.55, topP: 0.9, maxOutputTokens: 3072 },
  },

  // ─── Z.AI on NVIDIA ────────────────────────────────────────────────────────
  {
    id: "nvidia/z-ai-glm-5.2",
    upstreamId: "z-ai/glm-5.2",
    gateway: "nvidia",
    label: "GLM 5.2 (Z.AI)",
    provider: "Z.AI",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Fast",
    quality: "Best",
    credits: "Low",
    status: "Working",
    bestFor: "Advanced reasoning and large-context Luau code generation by Z.AI via NVIDIA NIM.",
    description: "Z.AI GLM 5.2 via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 1, topP: 1, maxOutputTokens: 16384 },
  },

  // ─── OpenAI on NVIDIA ──────────────────────────────────────────────────────
  {
    id: "nvidia/openai-gpt-oss-20b",
    upstreamId: "openai/gpt-oss-20b",
    gateway: "nvidia",
    label: "GPT OSS 20B (OpenAI)",
    provider: "OpenAI",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Fast open-weights OpenAI model via NVIDIA NIM.",
    description: "OpenAI GPT OSS 20B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.95, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/openai-gpt-oss-120b",
    upstreamId: "openai/gpt-oss-120b",
    gateway: "nvidia",
    label: "GPT OSS 120B (OpenAI)",
    provider: "OpenAI",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "Low",
    status: "Working",
    bestFor: "High-capability open-weights OpenAI reasoning and code model via NVIDIA NIM.",
    description: "OpenAI GPT OSS 120B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.95, maxOutputTokens: 16384 },
  },

  // ─── OneProvider (Anthropic Claude family, sans Fable) ────────────────────
  {
    id: "oneprovider/claude-opus-4-8",
    upstreamId: "claude-opus-4-8",
    gateway: "oneprovider",
    label: "Claude Opus 4.8",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Top-tier Claude for hardest Roblox builds, complex systems, and deep reasoning.",
    description: "Anthropic Claude Opus 4.8 via OneProvider (api.oneprovider.dev).",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-opus-4-7",
    upstreamId: "claude-opus-4-7",
    gateway: "oneprovider",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Powerful Claude Opus revision for complex Roblox game logic.",
    description: "Anthropic Claude Opus 4.7 via OneProvider.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-opus-4-6",
    upstreamId: "claude-opus-4-6",
    gateway: "oneprovider",
    label: "Claude Opus 4.6",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "High",
    status: "Working",
    bestFor: "Claude Opus 4.6 for polished Luau and full game systems.",
    description: "Anthropic Claude Opus 4.6 via OneProvider.",
    modelSettings: { temperature: 0.45, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-opus-5",
    upstreamId: "claude-opus-5",
    gateway: "oneprovider",
    label: "Claude Opus 5",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "premium",
    speed: "Slow",
    quality: "Best",
    credits: "Very High",
    status: "Working",
    bestFor: "Flagship Claude Opus 5 for the most demanding Roblox architectures.",
    description: "Anthropic Claude Opus 5 via OneProvider.",
    modelSettings: { temperature: 0.4, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-sonnet-5",
    upstreamId: "claude-sonnet-5",
    gateway: "oneprovider",
    label: "Claude Sonnet 5",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "Balanced Claude Sonnet 5 for fast, high-quality Roblox builds.",
    description: "Anthropic Claude Sonnet 5 via OneProvider.",
    modelSettings: { temperature: 0.5, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-sonnet-4-6",
    upstreamId: "claude-sonnet-4-6",
    gateway: "oneprovider",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Medium",
    status: "Working",
    bestFor: "Claude Sonnet 4.6 — great everyday builder with strong Luau quality.",
    description: "Anthropic Claude Sonnet 4.6 via OneProvider.",
    modelSettings: { temperature: 0.5, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "oneprovider/claude-haiku-4-5",
    upstreamId: "claude-haiku-4-5-20251001",
    gateway: "oneprovider",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    via: "OneProvider",
    tier: "fast",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Fast, cheap Claude Haiku for quick chats, small edits, and fast builds.",
    description: "Anthropic Claude Haiku 4.5 via OneProvider.",
    modelSettings: { temperature: 0.5, topP: 0.9, maxOutputTokens: 4096 },
  },

  // ─── Legacy Groq / Lovable — kept as Coming Soon ─────────────────────────
  {
    id: "groq/llama-3.3-70b-versatile",
    upstreamId: "llama-3.3-70b-versatile",
    gateway: "groq",
    label: "Llama 3.3 70B (Groq)",
    provider: "Groq",
    via: "Groq",
    tier: "premium",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Disabled: Groq free tier's 12K TPM cap rejects large BloxSmith prompts.",
    description: "Re-enable when a higher-TPM Groq plan is connected.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "lovable/gemini-3-flash-preview",
    upstreamId: "google/gemini-3-flash-preview",
    gateway: "lovable",
    label: "Gemini 3 Flash",
    provider: "Google",
    via: "Lovable AI",
    tier: "premium",
    speed: "Fast",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Available when workspace AI credits are funded.",
    description: "Lovable AI Gateway route for Gemini 3 Flash.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
];



export const DEFAULT_MODEL_ID = "nvidia/qwen-2.5-coder-32b";
export const FALLBACK_MODEL_ID = "nvidia/qwen-2.5-coder-32b";

// Ordered chain of models to try when the primary is rate-limited / at capacity.
// Rotates across NVIDIA-hosted model families so a 429 on one endpoint routes
// straight to a different one instead of failing.
// Fastest-first: small/medium fast models handle most Roblox turns quickly.
// Larger reasoning models are kept as later fallbacks for hard requests.
export const FALLBACK_CHAIN: string[] = [
  "nvidia/qwen-2.5-coder-32b",
  "nvidia/z-ai-glm-5.2",
  "nvidia/openai-gpt-oss-20b",
  "nvidia/openai-gpt-oss-120b",
  "oneprovider/claude-haiku-4-5",
  "nvidia/nemotron-nano-9b-v2",
  "nvidia/ministral-14b",
  "nvidia/llama-3.1-8b",
  "nvidia/gemma-3-27b",
  "oneprovider/claude-sonnet-4-6",
  "nvidia/llama-3.3-nemotron-super-49b",
  "oneprovider/claude-sonnet-5",
  "oneprovider/claude-opus-4-6",
  "oneprovider/claude-opus-4-7",
  "oneprovider/claude-opus-4-8",
  "oneprovider/claude-opus-5",
];


export function findModel(id: string): ModelOption {
  const exact = MODELS.find((m) => m.id === id);
  if (exact) return exact;
  // Unknown / renamed id. Never fall back to MODELS[0] - the catalog is ordered
  // by family, and the first entry is a "Coming Soon" model, so that silently
  // routed stale ids into a disabled endpoint.
  return MODELS.find((m) => m.id === DEFAULT_MODEL_ID && isSelectable(m))
    ?? MODELS.find((m) => isSelectable(m))
    ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}

/** Every model the user is allowed to pick, in catalog order. */
export function selectableModels(): ModelOption[] {
  return MODELS.filter(isSelectable);
}

/**
 * Environment variable that must be present for a gateway to work at all.
 * Used by the admin health panel so a missing key reads as "not configured"
 * instead of every model on that gateway reporting "Not Working".
 */
export const GATEWAY_ENV_KEYS: Record<Gateway, string[]> = {
  lovable: ["LOVABLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  nvidia: ["NVIDIA_API_KEY", "NIM_API_KEY", "NGC_API_KEY"],
  oneprovider: ["ONEPROVIDER_API_KEY"],
};
