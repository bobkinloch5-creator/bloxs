// Server-only AI provider factory. Routes each model to its gateway:
// - "lovable"   → Lovable AI Gateway (fast default path)
// - "quatarly"  → Quatarly unified API (legacy / fallback catalog)
// - "nvidia"    → NVIDIA NIM / Build.NVIDIA.com
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  findModel,
  isSelectable,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  type ModelOption,
  type Gateway,
} from "./models";

type Provider = ReturnType<typeof createOpenAICompatible>;
type LanguageModel = ReturnType<Provider>;

function buildProvider(gateway: Gateway): Provider {
  if (gateway === "lovable") {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Lovable AI is not configured — LOVABLE_API_KEY is missing.");
    return createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
  }
  if (gateway === "quatarly") {
    const key = process.env.QUATARLY_API_KEY || process.env.QUARTLY_API_KEY || process.env.QUATARY_API_KEY;
    if (!key) throw new Error("Quatarly is not configured — set QUATARLY_API_KEY.");
    return createOpenAICompatible({
      name: "quatarly",
      baseURL: "https://api.quatarly.cloud/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
  }
  if (gateway === "nvidia") {
    const key = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;
    if (!key) throw new Error("NVIDIA NIM is not configured — set NVIDIA_API_KEY.");
    return createOpenAICompatible({
      name: "nvidia",
      baseURL: "https://integrate.api.nvidia.com/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
  }
  throw new Error(`Unsupported AI gateway: ${gateway}`);
}

function buildModelFor(meta: ModelOption): LanguageModel {
  const gateway = meta.gateway;
  const upstreamId = meta.upstreamId ?? meta.id;
  const provider = buildProvider(gateway);
  return provider(upstreamId);
}

export function getProviderModel(modelId: string): {
  model: LanguageModel;
  meta: ModelOption;
  usedFallback: boolean;
  extraBody?: Record<string, unknown>;
  modelSettings?: ModelOption["modelSettings"];
} {
  const requested = findModel(modelId);
  const safe = isSelectable(requested) ? requested : findModel(DEFAULT_MODEL_ID);
  return {
    model: buildModelFor(safe),
    meta: safe,
    usedFallback: safe.id !== modelId,
    extraBody: safe.extraBody,
    modelSettings: safe.modelSettings,
  };
}

export function getFallbackModel(): {
  model: LanguageModel;
  meta: ModelOption;
  extraBody?: Record<string, unknown>;
  modelSettings?: ModelOption["modelSettings"];
} {
  const meta = findModel(FALLBACK_MODEL_ID);
  return { model: buildModelFor(meta), meta, extraBody: meta.extraBody, modelSettings: meta.modelSettings };
}

// Planner uses the same turbo model as the rest of the pipeline. Extended-
// reasoning models made the first step take 30-60s before anything else could
// start; flash-grade planning is enough for the short plan format.
export function getPlannerModel(): {
  model: LanguageModel;
  meta: ModelOption;
  extraBody?: Record<string, unknown>;
  modelSettings?: ModelOption["modelSettings"];
} {
  return getFallbackModel();
}

