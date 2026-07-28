import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Authenticated user approves a plugin pair code by binding their plugin
// token to it. The plugin's polling endpoint then returns that token.
export const claimPairCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        code: z.string().min(4).max(12),
        projectId: z.string().uuid().optional(),
      })
      .parse(input),
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
    if (!row)
      throw new Error(
        "This code is not valid. Open the BloxSmith plugin in Studio and click Connect again.",
      );
    if (new Date(row.expires_at) < new Date())
      throw new Error("This code expired. Click Connect in the plugin again to get a fresh one.");

    // Pair with exactly the signed-in user's profile. Sharing one token with
    // an owner/fallback profile violates the unique token constraint and can
    // leave Studio holding a token that no profile owns.
    const targetUserId = await getResolvedUserId(ctx.userId);

    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, plugin_token")
      .eq("id", targetUserId)
      .maybeSingle();

    // A profile normally exists from the signup trigger. Create the minimal
    // valid profile if a legacy account is missing one, and fail loudly if
    // that cannot be done—never approve a code with an unusable random token.
    if (!profile) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      const emailName = authUser?.user?.email?.split("@")[0] || "Creator";
      const { data: created, error: createError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: targetUserId, username: emailName, display_name: emailName } as never)
        .select("id, plugin_token")
        .single();
      if (createError || !created?.plugin_token) {
        throw new Error(
          `Could not prepare your plugin profile: ${createError?.message || "missing plugin token"}`,
        );
      }
      profile = created;
    }
    const token = String(profile.plugin_token);

    // Also create/update a plugin_session entry right now so the web UI
    // immediately reflects "Connected" without waiting for the first heartbeat.
    try {
      await supabaseAdmin.from("plugin_sessions").upsert(
        {
          user_id: targetUserId,
          project_id: data.projectId ?? null,
          last_seen: new Date().toISOString(),
          online: true,
        },
        { onConflict: "user_id" },
      );
    } catch (e) {
      console.warn("[claimPairCode] plugin_sessions upsert skipped:", e);
    }

    // Update the pair code row — ALWAYS include user_id using the admin client
    // (bypasses RLS, so no FK-rejection issues).
    const patch: Record<string, unknown> = {
      plugin_token: token,
      user_id: targetUserId,
      project_id: data.projectId ?? null,
      claimed_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .update(patch as any)
      .eq("code", code);

    if (updErr) throw new Error(updErr.message);

    return { ok: true, token };
  });
