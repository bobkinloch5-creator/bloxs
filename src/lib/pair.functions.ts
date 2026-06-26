import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Authenticated user approves a plugin pair code by binding their plugin
// token to it. The plugin's polling endpoint then returns that token.
export const claimPairCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      code: z.string().min(4).max(12),
      projectId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();

    const { data: row, error: lookupErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .select("code, claimed_at, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!row) throw new Error("This code is not valid. Open the BloxSmith plugin in Studio and click Connect again.");
    if (new Date(row.expires_at) < new Date()) throw new Error("This code expired. Click Connect in the plugin again to get a fresh one.");

    // Read the user's plugin token via the admin client (column is RLS-protected).
    let token: string | null = null;
    {
      const { data: prof, error: tokErr } = await supabaseAdmin
        .from("profiles")
        .select("plugin_token")
        .eq("id", context.userId)
        .maybeSingle();
      if (tokErr) throw new Error(tokErr.message);
      token = (prof?.plugin_token as string | null) ?? null;
    }
    if (!token) {
      token = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
      const { error: rotErr } = await supabaseAdmin
        .from("profiles")
        .update({ plugin_token: token })
        .eq("id", context.userId);
      if (rotErr) throw new Error(rotErr.message);
    }

    const { error: updErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .update({
        user_id: context.userId,
        plugin_token: token,
        project_id: data.projectId ?? null,
        claimed_at: new Date().toISOString(),
      })
      .eq("code", code);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });
