// Real model catalog. Keep a non-NVIDIA default so builds do not fail when
// NVIDIA's public endpoint returns transient "Too Many Requests" errors.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI" | "MiniMax" | "NVIDIA" | "Qwen" | "Groq";
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
    status: "Working",
    bestFor: "Reliable Roblox planning, Luau generation, UI fixes, and build actions without external key failures.",
    description: "Default Lovable AI route for dependable BloxSmith builds and chat.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
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
    bestFor: "Optional fast route when external provider keys are stable.",
    description: "Temporarily disabled as a selectable route so failed external-key requests do not break builds.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
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
    bestFor: "NVIDIA-hosted reasoning model for Roblox planning and Luau code.",
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
    id: "nvidia/llama-3.3-70b",
    upstreamId: "meta/llama-3.3-70b-instruct",
    gateway: "nvidia",
    label: "Llama 3.3 70B (NVIDIA)",
    provider: "NVIDIA",
    via: "NVIDIA NIM",
    tier: "balanced",
    speed: "Medium",
    quality: "Great",
    credits: "Low",
    status: "Working",
    bestFor: "Meta Llama 3.3 70B hosted on NVIDIA — solid all-around fallback.",
    description: "Meta Llama 3.3 70B via NVIDIA build.nvidia.com.",
    modelSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
  },
  {
    id: "nvidia/qwen-2.5-coder-32b",
    upstreamId: "qwen/qwen2.5-coder-32b-instruct",
    gateway: "nvidia",
    label: "Qwen 2.5 Coder 32B",
    provider: "NVIDIA",
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
    id: "nvidia/glm-5.2",
    upstreamId: "z-ai/glm-5.2",
    gateway: "nvidia",
    label: "GLM 5.2",
    provider: "Z.AI",
    via: "NVIDIA NIM",
    tier: "premium",
    speed: "Medium",
    quality: "Best",
    credits: "Low",
    status: "Coming Soon",
    bestFor: "Strong Roblox reasoning, Luau code, and full-game builds via Z.AI's newest GLM.",
    description: "Z.AI GLM 5.2 routed through NVIDIA Integrate (build.nvidia.com).",
    modelSettings: { temperature: 1.0, topP: 1.0, maxOutputTokens: 16384 },
  },
];


export const DEFAULT_MODEL_ID = "lovable/gemini-3-flash-preview";
export const FALLBACK_MODEL_ID = "lovable/gemini-3-flash-preview";

// Ordered chain of models to try when the primary model is rate-limited or at capacity.
// Rotates across providers (Groq → NVIDIA family) so a 429 on one endpoint doesn't kill the request.
export const FALLBACK_CHAIN: string[] = [
  "lovable/gemini-3-flash-preview",
  "groq/llama-3.3-70b-versatile",
  "nvidia/llama-3.3-nemotron-super-49b",
  "nvidia/llama-3.1-nemotron-70b",
  "nvidia/llama-3.3-70b",
  "nvidia/qwen-2.5-coder-32b",
];

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}

