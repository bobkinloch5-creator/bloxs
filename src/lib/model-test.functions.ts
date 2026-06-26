import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel } from "@/lib/ai-gateway.server";
import { findModel, isSelectable } from "@/lib/models";

const OWNER_EMAIL = "bobkinloch5@gmail.com";

async function assertOwner(context: { supabase: { auth: { getUser: () => Promise<{ data: { user: { email?: string | null } | null } }> } }; claims: Record<string, unknown> }) {
  const { data } = await context.supabase.auth.getUser();
  const email = (data.user?.email ?? (typeof context.claims.email === "string" ? context.claims.email : "")).toLowerCase();
  if (email !== OWNER_EMAIL) throw new Error("Not authorized");
}

export const testModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { modelId?: string };
    if (!v?.modelId || typeof v.modelId !== "string") throw new Error("modelId required");
    return { modelId: v.modelId };
  })
  .handler(async ({ data, context }) => {
    await assertOwner(context);

    const meta = findModel(data.modelId);
    if (!isSelectable(meta)) {
      return { ok: false, modelId: data.modelId, error: "Marked Coming Soon", durationMs: 0 };
    }

    const started = Date.now();
    try {
      const { model } = getProviderModel(data.modelId);
      const result = await generateText({
        model,
        prompt: "Reply with exactly the word: pong",
      });
      const durationMs = Date.now() - started;
      const text = (result.text ?? "").trim();
      return {
        ok: text.length > 0,
        modelId: data.modelId,
        reply: text.slice(0, 120),
        durationMs,
        error: text.length === 0 ? "Empty response" : undefined,
      };
    } catch (e) {
      return {
        ok: false,
        modelId: data.modelId,
        error: e instanceof Error ? e.message : "Unknown error",
        durationMs: Date.now() - started,
      };
    }
  });
