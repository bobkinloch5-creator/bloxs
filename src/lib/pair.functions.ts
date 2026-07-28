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

    // Use the actual JWT user ID directly. Never resolve to an owner fallback
    // here — the person clicking "Approve" IS the authenticated user, and
    // their auth.users row must exist for the profiles FK to work.
    const targetUserId = ctx.userId as string;

    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, plugin_token")
      .eq("id", targetUserId)
      .maybeSingle();

    // A profile normally exists from the signup trigger. If it's missing,
    // only attempt the INSERT when the user actually exists in auth.users
    // (avoids the profiles_id_fkey FK violation).
    if (!profile) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (!authUser?.user) {
        throw new Error(
          "Your account was not found. Please sign out, sign back in, and try again.",
        );
      }
      const emailName = authUser.user.email?.split("@")[0] || "Creator";
      const { data: created, error: createError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: targetUserId, username: emailName, display_name: emailName } as never)
        .select("id, plugin_token")
        .single();
      if (createError || !created) {
        throw new Error(
          `Could not prepare your plugin profile: ${createError?.message || "insert failed"}`,
        );
      }
      profile = created;
    }

    // If the profile exists but has no plugin_token yet, generate one.
    if (!profile.plugin_token) {
      const newToken = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
      await supabaseAdmin
        .from("profiles")
        .update({ plugin_token: newToken })
        .eq("id", targetUserId);
      profile = { ...profile, plugin_token: newToken };
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
