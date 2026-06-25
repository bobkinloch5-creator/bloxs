// Server-only AI provider factory. Routes calls to Lovable, Quatarly, or NVIDIA.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { findModel, type ModelOption } from "./models";

export function getProviderModel(modelId: string) {
  const m: ModelOption = findModel(modelId);

  if (m.provider === "lovable") {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const provider = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    return { model: provider(m.upstream), meta: m };
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

  throw new Error(`Unknown provider for model ${modelId}`);
}
