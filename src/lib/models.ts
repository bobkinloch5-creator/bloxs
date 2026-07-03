// Real model catalog. BloxSmith intentionally exposes only the NVIDIA GLM 5.2
// route so requests never fall back to paid Lovable/Quatarly models.

export type Provider = "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Z.AI" | "MiniMax" | "NVIDIA" | "Qwen";
export type Speed = "Fast" | "Medium" | "Slow";
export type Quality = "Good" | "Great" | "Best";
export type Credits = "Low" | "Medium" | "High" | "Very High";
export type Status = "Working" | "Coming Soon";
export type Gateway = "nvidia";

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
    status: "Working",
    bestFor: "Strong Roblox reasoning, Luau code, and full-game builds via Z.AI's newest GLM.",
    description: "Z.AI GLM 5.2 routed through NVIDIA Integrate (build.nvidia.com).",
    modelSettings: { temperature: 1.0, topP: 1.0, maxOutputTokens: 16384 },
  },

];


export const DEFAULT_MODEL_ID = "nvidia/glm-5.2";
export const FALLBACK_MODEL_ID = "nvidia/glm-5.2";


export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function isSelectable(m: ModelOption): boolean {
  return m.status === "Working";
}
