// Server-only AI provider factory. Routes all BloxSmith model modes through Lovable AI.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { findModel, type ModelOption } from "./models";

const SUPPORTED_LOVABLE_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5.2",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
]);

export function getProviderModel(modelId: string) {
  const m: ModelOption = findModel(modelId);
  const upstream = SUPPORTED_LOVABLE_MODELS.has(m.upstream) ? m.upstream : "google/gemini-3-flash-preview";

  if (m.provider === "lovable") {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured yet. Please try again in a moment.");
    const provider = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    return { model: provider(upstream), meta: m };
  }

  if (m.provider === "quatarly") {
    const key = process.env.QUATARLY_API_KEY;
    if (!key) throw new Error("QUATARLY_API_KEY missing");
    const provider = createOpenAICompatible({
      name: "quatarly",
      baseURL: "https://api.quatarly.cloud/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
    return { model: provider(m.upstream), meta: m };
  }

  if (m.provider === "nvidia") {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("NVIDIA_API_KEY missing");
    const provider = createOpenAICompatible({
      name: "nvidia",
      baseURL: "https://integrate.api.nvidia.com/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
    return { model: provider(m.upstream), meta: m };
  }

  if (m.provider === "groq") {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing");
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
    return { model: provider(m.upstream), meta: m };
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet. Please try again in a moment.");
  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  return { model: provider(upstream), meta: m };
}
