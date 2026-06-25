// Client-safe model catalog. Server picks the provider implementation.

export type Provider = "lovable" | "quatarly" | "nvidia" | "groq";

export interface ModelOption {
  id: string;          // unique key used by client + server
  label: string;       // user-facing name (unique to BloxSmith)
  provider: Provider;
  upstream: string;    // upstream model id passed to provider API
  tier: "fast" | "balanced" | "premium";
  description: string;
}

export const MODELS: ModelOption[] = [
  // Lovable AI Gateway (free, default)
  { id: "lovable-ai",   label: "Lovable AI",        provider: "lovable",  upstream: "google/gemini-2.5-flash-lite",  tier: "fast",     description: "Cheapest Gemini via Lovable AI. Great default for everyday builds." },
  { id: "blox-flash",   label: "BloxSmith Flash",   provider: "lovable",  upstream: "google/gemini-3-flash-preview", tier: "fast",     description: "Default builder. Fast, free, great for most prompts." },
  { id: "blox-pro",     label: "BloxSmith Pro",     provider: "lovable",  upstream: "google/gemini-2.5-pro",         tier: "premium",  description: "Strong reasoning for full game systems." },
  { id: "blox-coder",   label: "BloxSmith Coder",   provider: "lovable",  upstream: "openai/gpt-5.5",                tier: "premium",  description: "Best for complex Luau and tycoon-scale builds." },
  { id: "blox-nano",    label: "BloxSmith Nano",    provider: "lovable",  upstream: "google/gemini-3.1-flash-lite",  tier: "fast",     description: "Lightning fast for small tweaks and fixes." },

  // Quatarly (BYO key)
  { id: "qua-sonnet",   label: "Sonnet Architect",  provider: "quatarly", upstream: "claude-sonnet-4-6-thinking",    tier: "premium",  description: "Claude Sonnet via Quatarly. Deep reasoning." },
  { id: "qua-opus",     label: "Opus Master",       provider: "quatarly", upstream: "claude-opus-4-6-thinking",      tier: "premium",  description: "Claude Opus via Quatarly. The heaviest model." },
  { id: "qua-haiku",    label: "Haiku Sprint",      provider: "quatarly", upstream: "claude-haiku-4-5-20251001",     tier: "fast",     description: "Claude Haiku via Quatarly. Quick replies." },
  { id: "qua-gem-pro",  label: "Gemini Architect",  provider: "quatarly", upstream: "gemini-3.1-pro",                tier: "premium",  description: "Gemini Pro via Quatarly." },
  { id: "qua-gpt-codex",label: "Codex Builder",     provider: "quatarly", upstream: "gpt-5.3-codex",                 tier: "premium",  description: "GPT Codex via Quatarly. Code-focused." },
  { id: "qua-gpt-55",   label: "GPT 5.5 Maestro",   provider: "quatarly", upstream: "gpt-5.5",                       tier: "premium",  description: "GPT 5.5 via Quatarly." },

  // NVIDIA NIM (BYO key) — popular open models
  { id: "nv-llama-405", label: "Nemotron Heavy",    provider: "nvidia",   upstream: "meta/llama-3.1-405b-instruct",  tier: "premium",  description: "Llama 405B on NVIDIA NIM." },
  { id: "nv-llama-70",  label: "Nemotron Standard", provider: "nvidia",   upstream: "meta/llama-3.1-70b-instruct",   tier: "balanced", description: "Llama 70B on NVIDIA NIM." },
  { id: "nv-mixtral",   label: "Mixtral Forge",     provider: "nvidia",   upstream: "mistralai/mixtral-8x22b-instruct-v0.1", tier: "balanced", description: "Mixtral 8x22B on NVIDIA NIM." },

  // Groq (BYO key) — blazing fast inference
  { id: "groq-llama-70", label: "Groq Llama 70B",    provider: "groq", upstream: "llama-3.1-70b-versatile",  tier: "balanced", description: "Llama 70B on Groq. Lightning-fast inference." },
  { id: "groq-llama-8",  label: "Groq Llama 8B",     provider: "groq", upstream: "llama-3.1-8b-instant",       tier: "fast",     description: "Llama 8B on Groq. Ultra-fast for quick builds." },
  { id: "groq-mixtral",  label: "Groq Mixtral",      provider: "groq", upstream: "mixtral-8x7b-32768",         tier: "balanced", description: "Mixtral 8x7B on Groq. Fast and capable." },
  { id: "groq-gemma",    label: "Groq Gemma 2",      provider: "groq", upstream: "gemma2-9b-it",               tier: "fast",     description: "Gemma 2 9B on Groq. Lightweight and speedy." },
];

export const DEFAULT_MODEL_ID = "blox-flash";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}
