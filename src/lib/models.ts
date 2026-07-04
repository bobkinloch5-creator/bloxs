// Real model catalog. NVIDIA-first: Groq's free tier caps at 12K TPM which
// rejects BloxSmith's large system prompt. NVIDIA NIM endpoints have much
// larger token budgets and a wide selection, so they own the default + chain.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI" | "MiniMax" | "NVIDIA" | "Qwen" | "Groq" | "Meta" | "Mistral" | "Microsoft" | "Writer";
export type Speed = "Fast" | "Medium" | "Slow";
export type Quality = "Good" | "Great" | "Best";
export type Credits = "Low" | "Medium" | "High" | "Very High";
export type Status = "Working" | "Coming Soon";
export type Gateway = "lovable" | "nvidia" | "groq";

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
    status: "Working",
    bestFor: "Top-end NVIDIA reasoning model for complex full-game builds and Luau planning.",
    description: "NVIDIA Llama 3.1 Nemotron Ultra 253B via build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.95, maxOutputTokens: 8192 },
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
    bestFor: "Default NVIDIA reasoning model — fast, high-quality Roblox planning and Luau code.",
    description: "NVIDIA Nemotron Super 49B via build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.95, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "Strong instruction-following NVIDIA model for Luau + build actions.",
    description: "NVIDIA Llama 3.1 Nemotron 70B via build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.95, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "Very large NVIDIA reasoning model for deep planning.",
    description: "NVIDIA Nemotron 4 340B via build.nvidia.com.",
    modelSettings: { temperature: 0.5, topP: 0.95, maxOutputTokens: 4096 },
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
    status: "Working",
    bestFor: "Meta's flagship 405B parameter model for hard reasoning.",
    description: "Meta Llama 3.1 405B via NVIDIA build.nvidia.com.",
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
    status: "Working",
    bestFor: "Meta Llama 3.3 70B — solid all-around Roblox builder.",
    description: "Meta Llama 3.3 70B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "Meta Llama 3.1 70B fallback for general Roblox work.",
    description: "Meta Llama 3.1 70B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    bestFor: "Fast lightweight fallback for simple builds.",
    description: "Meta Llama 3.1 8B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 },
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
    bestFor: "Code-specialized model for Luau generation on NVIDIA.",
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
    status: "Working",
    bestFor: "Qwen 2.5 72B general instruction model for Roblox builds.",
    description: "Qwen 2.5 72B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "Latest DeepSeek V4 Flash — fast responses with light reasoning for chat and Luau.",
    description: "DeepSeek V4 Flash via NVIDIA build.nvidia.com (thinking + low reasoning for speed).",
    extraBody: { chat_template_kwargs: { thinking: true, reasoning_effort: "low" } },
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 },
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
    status: "Working",
    bestFor: "DeepSeek R1 reasoning model for hard planning & Luau problem-solving.",
    description: "DeepSeek R1 via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.7, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "DeepSeek V3 general model for Roblox builds.",
    description: "DeepSeek V3 via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "R1 reasoning distilled into a fast 70B fallback.",
    description: "DeepSeek R1 Distill Llama 70B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.9, maxOutputTokens: 8192 },
  },

  // ─── Mistral / Microsoft / Writer on NVIDIA ────────────────────────────────
  {
    id: "nvidia/mixtral-8x22b",
    upstreamId: "mistralai/mixtral-8x22b-instruct-v0.1",
    gateway: "nvidia",
    label: "Mixtral 8x22B",
    provider: "Mistral",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Mixtral 8x22B mixture-of-experts fallback.",
    description: "Mistral Mixtral 8x22B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/mistral-large-2",
    upstreamId: "mistralai/mistral-large-2-instruct",
    gateway: "nvidia",
    label: "Mistral Large 2",
    provider: "Mistral",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Mistral Large 2 for high-quality Luau + planning.",
    description: "Mistral Large 2 via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/phi-4",
    upstreamId: "microsoft/phi-4",
    gateway: "nvidia",
    label: "Phi-4",
    provider: "Microsoft",
    via: "NVIDIA NIM",
    tier: "fast",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Microsoft Phi-4 small strong reasoning model.",
    description: "Microsoft Phi-4 via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.6, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/gemma-3-27b",
    upstreamId: "google/gemma-3-27b-it",
    gateway: "nvidia",
    label: "Gemma 3 27B",
    provider: "Google",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Fast",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Google Gemma 3 27B general fallback via NVIDIA.",
    description: "Google Gemma 3 27B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    status: "Working",
    bestFor: "Writer Palmyra Creative for expressive UI/story content.",
    description: "Writer Palmyra Creative 122B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.8, topP: 0.9, maxOutputTokens: 8192 },
  },

  // ─── Legacy Groq / Lovable — kept as Coming Soon (Groq free tier caps at 12K TPM
  //     which is smaller than BloxSmith's system prompt, so it kept failing). ──
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


export const DEFAULT_MODEL_ID = "nvidia/llama-3.3-nemotron-super-49b";
export const FALLBACK_MODEL_ID = "nvidia/llama-3.3-70b";

// Ordered chain of models to try when the primary is rate-limited / at capacity.
// Rotates across NVIDIA-hosted model families so a 429 on one endpoint routes
// straight to a different one instead of failing.
// Fastest-first: small/medium fast models handle most Roblox turns quickly.
// Larger reasoning models are kept as later fallbacks for hard requests.
export const FALLBACK_CHAIN: string[] = [
  "nvidia/llama-3.3-70b",
  "nvidia/deepseek-v4-flash",
  "nvidia/qwen-2.5-coder-32b",
  "nvidia/llama-3.3-nemotron-super-49b",
  "nvidia/llama-3.1-nemotron-70b",
  "nvidia/qwen-2.5-72b",
  "nvidia/mixtral-8x22b",
  "nvidia/deepseek-v3",
  "nvidia/deepseek-r1-distill-llama-70b",
  "nvidia/llama-3.1-70b",
  "nvidia/mistral-large-2",
  "nvidia/gemma-3-27b",
  "nvidia/phi-4",
  "nvidia/llama-3.1-8b",
];

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}
