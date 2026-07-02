import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROFILE_COLS = "id, username, display_name, avatar_url, bio, roblox_username, roblox_user_id, roblox_display_name, roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at, roblox_last_synced_at, roblox_public, roblox_experiences, plan, credits, max_credits, language, is_private, settings, created_at, updated_at, is_admin, credits_reset_at" as const;

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Sensitive columns (credits, plan, is_admin, banned, settings) are no longer
    // granted to the authenticated role at the column level, so own-profile reads
    // go through supabaseAdmin scoped to auth.uid().
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return data;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "owner"]);
    const isPrivileged = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    const profile = { ...data, is_admin: isPrivileged, plan: isPrivileged && data.plan === "Free" ? "Owner" : data.plan };

    if (!profile.is_admin && profile.credits_reset_at && new Date(profile.credits_reset_at) <= new Date()) {
      const nextReset = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: refreshed } = await supabaseAdmin
        .from("profiles")
        .update({ credits: profile.max_credits, credits_reset_at: nextReset })
        .eq("id", context.userId)
        .select(PROFILE_COLS)
        .single();
      if (refreshed) return { ...refreshed, is_admin: isPrivileged, plan: profile.plan };
    }
    return profile;
  });

export const ASSET_MODES = ["toolbox_only", "both", "procedural"] as const;
export type AssetMode = (typeof ASSET_MODES)[number];

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      display_name: z.string().max(60).optional(),
      bio: z.string().max(500).optional(),
      roblox_username: z.string().max(40).optional(),
      language: z.enum(["en","es","pt","fr","de","it","ru","ar","zh","ja","ko","hi","tr","pl","nl"]).optional(),
      is_private: z.boolean().optional(),
      asset_mode: z.enum(ASSET_MODES).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { asset_mode, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (asset_mode) {
      const { data: cur } = await supabaseAdmin
        .from("profiles")
        .select("settings")
        .eq("id", context.userId)
        .maybeSingle();
      const settings = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
      patch.settings = { ...settings, asset_mode };
    }
    // Non-privileged fields only (privilege-escalation trigger enforces this),
    // but reads/writes must go through admin because sensitive columns are no
    // longer granted at column level to the authenticated role.
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regeneratePluginToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newToken = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plugin_token: newToken })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { plugin_token: newToken };
  });

export const getMyPluginToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plugin_token")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { plugin_token: (data?.plugin_token as string | null) ?? null };
  });

/**
 * Permanently delete the current user's account and all associated data.
 * Deletes the auth user via the admin API; FK cascades remove profile rows,
 * projects, messages, roles, etc.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ confirm: z.literal("DELETE") }).parse(input),
  )
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Best-effort cleanup of app tables that may not cascade.
    await supabaseAdmin.from("profiles").delete().eq("id", context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

