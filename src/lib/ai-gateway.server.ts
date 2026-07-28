// Server-only AI provider factory. Supports a stable Groq default plus NVIDIA
// as an optional route when it is available.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  findModel,
  isSelectable,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  FALLBACK_CHAIN,
  type ModelOption,
  type Gateway,
} from "./models";


type Provider = ReturnType<typeof createOpenAICompatible>;
type LanguageModel = ReturnType<Provider>;

function buildProvider(gateway: Gateway): Provider {
  if (gateway === "lovable") {
    const key = process.env.LOVABLE_API_KEY || process.env.ONEPROVIDER_API_KEY || process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("Lovable AI is not configured.");
    const isLovableKey = !!process.env.LOVABLE_API_KEY;
    const isOneProviderKey = !isLovableKey && !!process.env.ONEPROVIDER_API_KEY;

    return createOpenAICompatible({
      name: "lovable",
      baseURL: isLovableKey
        ? "https://ai.gateway.lovable.dev/v1"
        : isOneProviderKey
        ? "https://api.oneprovider.dev/v1"
        : "https://api.openai.com/v1",
      headers: isLovableKey
        ? { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }
        : { Authorization: `Bearer ${key}` },
    });
  }
  if (gateway === "groq") {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("Groq is not configured — set GROQ_API_KEY.");
    return createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
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
  if (gateway === "oneprovider") {
    const key =
      process.env.ONEPROVIDER_API_KEY ||
      process.env.ONEPROVIDER_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.AGENTROUTER_API_KEY ||
      process.env.AGENTROUTER_KEY ||
      process.env.LOVABLE_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (!key) throw new Error("OneProvider / AgentRouter is not configured.");

    const isOneProviderKey = !!(process.env.ONEPROVIDER_API_KEY || process.env.ONEPROVIDER_KEY || process.env.ANTHROPIC_API_KEY);
    const isAgentRouterKey = !isOneProviderKey && !!(process.env.AGENTROUTER_API_KEY || process.env.AGENTROUTER_KEY);

    const baseURL = isOneProviderKey
      ? (process.env.ONEPROVIDER_BASE_URL || process.env.ANTHROPIC_BASE_URL || "https://api.oneprovider.dev/v1")
      : isAgentRouterKey
      ? (process.env.AGENTROUTER_BASE_URL || "https://agentrouter.org/v1")
      : process.env.LOVABLE_API_KEY
      ? "https://ai.gateway.lovable.dev/v1"
      : "https://api.openai.com/v1";

    const finalBaseURL = baseURL.endsWith("/v1") ? baseURL : `${baseURL.replace(/\/+$/, "")}/v1`;

    return createOpenAICompatible({
      name: "oneprovider",
      baseURL: finalBaseURL,
      headers: (isOneProviderKey || isAgentRouterKey)
        ? { Authorization: `Bearer ${key}` }
        : process.env.LOVABLE_API_KEY
        ? { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }
        : { Authorization: `Bearer ${key}` },
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

/**
 * Ordered list of fallback candidates to try when the primary model is rate-limited or at capacity.
 * Skips the currently-failing model and any not marked Working. Rotates across gateways
 * (Groq + NVIDIA family) so a 429 on one provider doesn't kill the whole request.
 */
export function getFallbackChain(excludeId?: string): Array<{
  model: LanguageModel;
  meta: ModelOption;
  extraBody?: Record<string, unknown>;
  modelSettings?: ModelOption["modelSettings"];
}> {
  return FALLBACK_CHAIN
    .filter((id) => id !== excludeId)
    .map((id) => findModel(id))
    .filter((meta) => isSelectable(meta))
    .map((meta) => ({
      model: buildModelFor(meta),
      meta,
      extraBody: meta.extraBody,
      modelSettings: meta.modelSettings,
    }));
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

