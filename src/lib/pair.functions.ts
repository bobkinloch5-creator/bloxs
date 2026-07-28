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

    const { getResolvedUserId } = await import("@/lib/profile.functions");

    // Resolve target user ID (handles dev-owner / fallback user contexts)
    const targetUserId = await getResolvedUserId(ctx.userId);

    // 1. Check target user profile
    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, plugin_token")
      .eq("id", targetUserId)
      .maybeSingle();

    // 2. Check ctx.userId if targetUserId was different
    if (!profile && ctx.userId && ctx.userId !== targetUserId) {
      const { data: prof2 } = await supabaseAdmin
        .from("profiles")
        .select("id, plugin_token")
        .eq("id", ctx.userId)
        .maybeSingle();
      if (prof2) profile = prof2;
    }

    // 3. Fallback to Owner profile if no direct profile row exists yet
    if (!profile) {
      const { data: ownerProf } = await supabaseAdmin
        .from("profiles")
        .select("id, plugin_token")
        .or("plan.eq.Owner,is_admin.eq.true,username.eq.King")
        .limit(1)
        .maybeSingle();
      if (ownerProf) profile = ownerProf;
    }

    const activeUserId = profile?.id || targetUserId || ctx.userId;

    // Ensure profile has a valid plugin_token
    let token = profile?.plugin_token ? String(profile.plugin_token) : "";
    if (!token) {
      token = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
      try {
        await supabaseAdmin
          .from("profiles")
          .update({ plugin_token: token })
          .eq("id", activeUserId);
      } catch (e) {
        console.warn("[claimPairCode] profile token update skipped:", e);
      }
    }

    // Also create/update a plugin_session entry right now so the web UI
    // immediately reflects "Connected" without waiting for the first heartbeat.
    try {
      await supabaseAdmin.from("plugin_sessions").upsert(
        {
          user_id: activeUserId,
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
      user_id: activeUserId,
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
