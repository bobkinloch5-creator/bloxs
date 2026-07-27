import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROFILE_COLS = "id, username, display_name, avatar_url, bio, roblox_username, roblox_user_id, roblox_display_name, roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at, roblox_last_synced_at, roblox_public, roblox_experiences, plan, credits, max_credits, language, is_private, settings, created_at, updated_at, is_admin, credits_reset_at" as const;

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    // Sensitive columns (credits, plan, is_admin, banned, settings) are no longer
    // granted to the authenticated role at the column level, so own-profile reads
    // go through supabaseAdmin scoped to auth.uid().
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let targetUserId = ctx.userId;

    let { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", targetUserId)
      .maybeSingle();

    if (!data || targetUserId === 'dev-owner') {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const ownerUser = (usersData?.users ?? []).find(
        (u: any) => u.email?.toLowerCase() === "bobkinloch5@gmail.com"
      ) || usersData?.users?.[0];

      if (ownerUser) {
        targetUserId = ownerUser.id;
        const { data: ownerData } = await supabaseAdmin
          .from("profiles")
          .select(PROFILE_COLS)
          .eq("id", targetUserId)
          .maybeSingle();

        if (ownerData) {
          data = ownerData;
        } else {
          // Upsert owner profile row in DB
          const { data: newProfile } = await supabaseAdmin
            .from("profiles")
            .upsert({
              id: targetUserId,
              plan: "Owner",
              credits: 99999,
              max_credits: 99999,
              is_admin: true,
              display_name: "Owner",
              username: "owner",
            } as any)
            .select(PROFILE_COLS)
            .single();
          data = newProfile;
        }
      }
    }

    if (error && !data) throw new Error(error.message);
    if (!data) return data;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .in("role", ["admin", "owner"]);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
    const userEmail = authUser?.user?.email?.toLowerCase() || "";
    const isOwnerByEmail = userEmail === "bobkinloch5@gmail.com";

    if (isOwnerByEmail) {
      const hasOwnerRole = (roles ?? []).some((r: any) => r.role === "owner");
      if (!hasOwnerRole) {
        await supabaseAdmin.from("user_roles").upsert({ user_id: ctx.userId, role: "owner" } as any, { onConflict: "user_id,role" });
      }
    }

    const isPrivileged = isOwnerByEmail || (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");

    if (isPrivileged) {
      if (data.plan !== "Owner" || (data.credits ?? 0) < 99999) {
        await supabaseAdmin.from("profiles").update({ plan: "Owner", credits: 99999, max_credits: 99999 }).eq("id", ctx.userId);
      }
      return {
        ...data,
        is_admin: true,
        plan: "Owner",
        credits: 99999,
        max_credits: 99999,
      };
    }

    const profile = { ...data, is_admin: false, plan: data.plan || "Free" };

    // Default free plan gets 50 credits per month
    const currentMax = Number(profile.max_credits ?? 0);
    if (!profile.is_admin && profile.plan !== "Owner" && profile.plan !== "Pro" && currentMax < 50) {
      const newMax = 50;
      const nextReset = profile.credits_reset_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: upgraded } = await supabaseAdmin
        .from("profiles")
        .update({ max_credits: newMax, credits: Math.max(50, Number(profile.credits ?? 0)), credits_reset_at: nextReset })
        .eq("id", ctx.userId)
        .select(PROFILE_COLS)
        .single();
      if (upgraded) return { ...upgraded, is_admin: isPrivileged, plan: profile.plan };
    }

    if (!profile.is_admin && profile.credits_reset_at && new Date(profile.credits_reset_at) <= new Date()) {
      const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const newMax = Number(profile.max_credits) > 0 ? profile.max_credits : 50;
      const { data: refreshed } = await supabaseAdmin
        .from("profiles")
        .update({ credits: newMax, max_credits: newMax, credits_reset_at: nextReset })
        .eq("id", ctx.userId)
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
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { asset_mode, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (asset_mode) {
      const { data: cur } = await supabaseAdmin
        .from("profiles")
        .select("settings")
        .eq("id", ctx.userId)
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
      .eq("id", ctx.userId)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regeneratePluginToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newToken = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plugin_token: newToken })
      .eq("id", ctx.userId);
    if (error) throw new Error(error.message);
    return { plugin_token: newToken };
  });

export const getMyPluginToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plugin_token")
      .eq("id", ctx.userId)
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
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Best-effort cleanup of app tables that may not cascade.
    await supabaseAdmin.from("profiles").delete().eq("id", ctx.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Username ============
export const changeMyUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "3–24 chars, a–z 0–9 _ only") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Explicit validation because we update via admin (bypasses trigger)
    const { data: cur, error: cErr } = await supabaseAdmin
      .from("profiles").select("username, username_changed_at").eq("id", ctx.userId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (cur?.username_changed_at) {
      const last = new Date(cur.username_changed_at).getTime();
      const daysLeft = Math.ceil((last + 14 * 86400_000 - Date.now()) / 86400_000);
      if (daysLeft > 0) throw new Error(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
    }
    const { data: dup } = await supabaseAdmin
      .from("profiles").select("id").ilike("username", data.username).neq("id", ctx.userId).maybeSingle();
    if (dup) throw new Error("That username is already taken.");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .update({ username: data.username, username_changed_at: new Date().toISOString() } as never)
      .eq("id", ctx.userId)
      .select("id, username, username_changed_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });


export const checkUsernameAvailable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ username: z.string().trim().toLowerCase() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    if (!/^[a-z0-9_]{3,24}$/.test(data.username)) return { available: false, reason: "format" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username)
      .neq("id", ctx.userId)
      .maybeSingle();
    return { available: !existing, reason: existing ? "taken" : null };
  });

// ============ Avatar ============
export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ url: z.string().url().max(2000), storage_path: z.string().max(400).nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings_patch: Record<string, unknown> = {};
    if (data.storage_path !== undefined) settings_patch.avatar_storage_path = data.storage_path;
    let patch: Record<string, unknown> = { avatar_url: data.url };
    if (Object.keys(settings_patch).length) {
      const { data: cur } = await supabaseAdmin.from("profiles").select("settings").eq("id", ctx.userId).maybeSingle();
      const s = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
      patch.settings = { ...s, ...settings_patch };
    }
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin.from("profiles").select("settings").eq("id", ctx.userId).maybeSingle();
    const s = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
    const path = s.avatar_storage_path as string | undefined;
    if (path) {
      try { await supabaseAdmin.storage.from("avatars").remove([path]); } catch {}
    }
    delete s.avatar_storage_path;
    const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: null, settings: s } as never).eq("id", ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Password ============
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      current_password: z.string().min(1).max(200),
      new_password: z.string().min(8, "Password must be at least 8 characters").max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Get user's email to verify current password
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
    if (uErr) throw new Error(uErr.message);
    const email = userRes?.user?.email;
    if (!email) throw new Error("This account has no email — use Reset password instead.");

    // Verify current password by attempting a sign-in on a fresh client
    const { createClient } = await import("@supabase/supabase-js");
    const verify = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    });
    const { error: signInErr } = await verify.auth.signInWithPassword({ email, password: data.current_password });
    if (signInErr) throw new Error("Current password is incorrect");
    try { await verify.auth.signOut(); } catch {}

    const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.userId, { password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMyPasswordResetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ redirect_to: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
    if (uErr) throw new Error(uErr.message);
    const email = userRes?.user?.email;
    if (!email) throw new Error("This account has no email on file.");
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    });
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: data.redirect_to });
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });


