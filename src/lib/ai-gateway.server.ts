// Server-only AI provider factory. Routes all model picks through the
// Lovable AI Gateway. Only models marked Working in src/lib/models.ts are
// accepted; anything else falls back to the default model so the chat never
// crashes with a raw "Bad request".
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { findModel, isSelectable, DEFAULT_MODEL_ID, FALLBACK_MODEL_ID, type ModelOption } from "./models";

function lovableProvider() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    throw new Error("AI is not configured yet. Please contact support — LOVABLE_API_KEY is missing.");
  }
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export function getProviderModel(modelId: string): { model: ReturnType<ReturnType<typeof lovableProvider>>; meta: ModelOption; usedFallback: boolean } {
  const requested = findModel(modelId);
  const safe = isSelectable(requested) ? requested : findModel(DEFAULT_MODEL_ID);
  const provider = lovableProvider();
  return { model: provider(safe.id), meta: safe, usedFallback: safe.id !== modelId };
}

export function getFallbackModel(): { model: ReturnType<ReturnType<typeof lovableProvider>>; meta: ModelOption } {
  const meta = findModel(FALLBACK_MODEL_ID);
  return { model: lovableProvider()(meta.id), meta };
}
