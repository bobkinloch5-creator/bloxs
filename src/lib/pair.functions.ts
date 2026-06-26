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

    // Get the user's plugin token via secure RPC (column is not directly readable).
    let token: string | null | undefined;
    {
      const { data: t, error: tokErr } = await context.supabase.rpc("get_my_plugin_token");
      if (tokErr) throw new Error(tokErr.message);
      token = (t as unknown as string) ?? null;
    }
    if (!token) {
      const { data: rotated, error: rotErr } = await context.supabase.rpc("regenerate_my_plugin_token");
      if (rotErr) throw new Error(rotErr.message);
      token = rotated as unknown as string;
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
