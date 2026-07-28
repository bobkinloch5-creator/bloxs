import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Authenticated user approves a plugin pair code by binding their plugin
// token to it. The plugin's polling endpoint then returns that token.
export const claimPairCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      code: z.string().min(4).max(12),
      projectId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getResolvedUserId } = await import("@/lib/profile.functions");
    const code = data.code.toUpperCase();

    const { data: row, error: lookupErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .select("code, claimed_at, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!row) throw new Error("This code is not valid. Open the BloxSmith plugin in Studio and click Connect again.");
    if (new Date(row.expires_at) < new Date()) throw new Error("This code expired. Click Connect in the plugin again to get a fresh one.");

    const targetUserId = await getResolvedUserId(ctx.userId);

    // Read the user's plugin token via the admin client (column is RLS-protected).
    let token: string | null = null;
    if (targetUserId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("plugin_token")
        .eq("id", targetUserId)
        .maybeSingle();
      token = (prof?.plugin_token as string | null) ?? null;
    }

    if (!token) {
      token = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
    }

    // Ensure profile row exists in public.profiles with this plugin_token
    if (targetUserId) {
      try {
        await supabaseAdmin
          .from("profiles")
          .upsert(
            { id: targetUserId, plugin_token: token } as never,
            { onConflict: "id" }
          );
      } catch (e) {
        console.warn("[claimPairCode] Profile upsert skipped:", e);
      }
    }

    // Attempt to update plugin_pair_codes with targetUserId.
    // If foreign key constraint on user_id fails, fall back to updating without setting user_id.
    const patch: Record<string, unknown> = {
      plugin_token: token,
      project_id: data.projectId ?? null,
      claimed_at: new Date().toISOString(),
    };
    if (targetUserId) {
      patch.user_id = targetUserId;
    }

    const { error: updErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .update(patch as any)
      .eq("code", code);

    if (updErr) {
      console.warn("[claimPairCode] Update with user_id failed, trying fallback without user_id:", updErr.message);
      delete patch.user_id;
      const { error: fbErr } = await supabaseAdmin
        .from("plugin_pair_codes")
        .update(patch as any)
        .eq("code", code);
      if (fbErr) throw new Error(fbErr.message);
    }

    return { ok: true };
  });
