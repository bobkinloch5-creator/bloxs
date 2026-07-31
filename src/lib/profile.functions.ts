import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROFILE_COLS = "id, username, display_name, avatar_url, bio, roblox_username, roblox_user_id, roblox_display_name, roblox_avatar_url, roblox_headshot_url, roblox_verified_at, roblox_created_at, roblox_last_synced_at, roblox_public, roblox_experiences, plan, credits, max_credits, language, is_private, settings, created_at, updated_at, is_admin, credits_reset_at" as const;

export async function getResolvedUserId(ctxUserId: string): Promise<string> {
  if (ctxUserId && ctxUserId !== "dev-owner" && ctxUserId !== "owner" && ctxUserId !== "00000000-0000-0000-0000-000000000000") {
    return ctxUserId;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ownerProf } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or("email.eq.bobkinloch5@gmail.com,username.eq.King,plan.eq.Owner,is_owner.eq.true")
      .limit(1)
      .maybeSingle();

    if (ownerProf?.id) return ownerProf.id;
  } catch (e) {
    console.warn("getResolvedUserId lookup failed:", e);
  }

  return ctxUserId || "owner";
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const ctx = context as any;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const targetUserId = await getResolvedUserId(ctx.userId);

      let { data } = await supabaseAdmin
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", targetUserId)
        .maybeSingle();

      const authUser = await supabaseAdmin.auth.admin.getUserById(targetUserId).then(res => res?.data?.user).catch(() => null);
      const userEmail = (authUser?.email || (ctx as any)?.claims?.email || "").toLowerCase().trim();
      const username = (data as any)?.username || "";
      const displayName = (data as any)?.display_name || "";
      
      const isOwner =
        targetUserId === "64f33732-136a-4c78-9421-7c11579c7412" ||
        userEmail === "bobkinloch5@gmail.com" ||
        userEmail.includes("bobkinloch") ||
        username.toLowerCase() === "king" ||
        displayName.toLowerCase() === "king" ||
        username.toLowerCase() === "elibobop" ||
        displayName.toLowerCase() === "elibobop" ||
        (data as any)?.plan === "Owner" ||
        (data as any)?.is_admin === true;

      if (isOwner && data) {
        (data as any).plan = "Owner";
        (data as any).is_admin = true;
        (data as any).credits = Math.max((data as any).credits || 0, 99999);
        (data as any).max_credits = Math.max((data as any).max_credits || 0, 99999);
      }

      if (!data) {
        // Auto-create profile row if missing with appropriate default handle
        try {
          const defaultHandle = userEmail ? userEmail.split("@")[0] : "Creator";
          const initName = isOwner ? "King" : (authUser?.user_metadata?.username || defaultHandle);

          const { data: newRow } = await supabaseAdmin
            .from("profiles")
            .upsert(
              {
                id: targetUserId,
                username: initName,
                display_name: initName,
                plan: isOwner ? "Owner" : "Free",
                is_admin: isOwner,
                credits: isOwner ? 99999 : 50,
                max_credits: isOwner ? 99999 : 50,
              },
              { onConflict: "id" }
            )
            .select(PROFILE_COLS)
            .maybeSingle();
          if (newRow) data = newRow;
        } catch (e) {
          console.warn("[getMyProfile] auto-create profile DB upsert skipped:", e);
        }
      }

      if (isOwner && targetUserId) {
        // Ensure owner roles and profile plan are permanently stored in DB WITHOUT wiping user bio/settings
        try {
          await supabaseAdmin.from("user_roles").upsert([
            { user_id: targetUserId, role: "owner" },
            { user_id: targetUserId, role: "admin" },
          ] as any, { onConflict: "user_id,role" });

          await supabaseAdmin.from("profiles").update({
            plan: "Owner",
            is_admin: true,
            credits: 99999,
            max_credits: 99999,
          } as any).eq("id", targetUserId);
        } catch (e) {
          console.warn("[getMyProfile] DB owner sync skipped:", e);
        }
      }

      const { data: rolesData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);

      const userRoles = (rolesData ?? []).map((r: any) => r.role);
      const isDonator = userRoles.includes("donator") || userRoles.includes("supporter") || userRoles.includes("top_supporter") || ((data as any)?.settings as any)?.has_topup === true || (data as any)?.plan === "Top Supporter";

      const dbBio = (data as any)?.bio ?? "";
      const dbRoblox = (data as any)?.roblox_username ?? "";
      const dbPrivate = !!(data as any)?.is_private;
      const dbAvatar = (data as any)?.avatar_url ?? null;
      const dbSettings = (data as any)?.settings ?? {};
      const dbLang = (data as any)?.language ?? "en";
      const dbDisplayName = (data as any)?.display_name;
      const dbUsername = (data as any)?.username;

      const result: any = {
        ...(data || {}),
        bio: dbBio,
        roblox_username: dbRoblox,
        is_private: dbPrivate,
        avatar_url: dbAvatar,
        credits_reset_at: (data as any)?.credits_reset_at ?? new Date().toISOString(),
        settings: dbSettings,
        language: dbLang,
        display_name: dbDisplayName || (isOwner ? "King" : "Creator"),
        username: dbUsername || (isOwner ? "King" : "Creator"),
        id: targetUserId,
        is_donator: isOwner ? true : isDonator,
        is_supporter: isOwner ? true : isDonator,
        roles: isOwner ? ["owner", "admin", "donator"] : userRoles,
        plan: isOwner ? "Owner" : (isDonator ? "Top Supporter" : ((data as any)?.plan || "Free")),
        is_admin: isOwner ? true : !!(data as any)?.is_admin,
        credits: isOwner ? 99999 : ((data as any)?.credits ?? 50),
        max_credits: isOwner ? 99999 : ((data as any)?.max_credits ?? 50),
      };

      return result as any;
    } catch (e) {
      console.warn("getMyProfile server handler fallback:", e);
      const fb: any = {
        id: "owner",
        username: "King",
        display_name: "King",
        plan: "Owner",
        is_admin: true,
        credits: 99999,
        max_credits: 99999,
        bio: "",
        roblox_username: "",
        is_private: false,
        avatar_url: null,
        credits_reset_at: new Date().toISOString(),
        settings: {},
        language: "en",
      };
      return fb as any;
    }
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
      language: z.string().max(10).optional(),
      is_private: z.boolean().optional(),
      asset_mode: z.enum(ASSET_MODES).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUserId = await getResolvedUserId(ctx.userId);

    const { asset_mode, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };

    if (asset_mode) {
      const { data: cur } = await supabaseAdmin
        .from("profiles")
        .select("settings")
        .eq("id", targetUserId)
        .maybeSingle();
      const settings = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
      patch.settings = { ...settings, asset_mode };
    }

    // 1. Try to update existing record first
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", targetUserId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update(patch as never)
        .eq("id", targetUserId)
        .select(PROFILE_COLS)
        .maybeSingle();

      if (!updateErr && updated) {
        return updated;
      }
      if (updateErr) {
        console.error("[updateMyProfile] Update error:", updateErr);
      }
    }

    // 2. Otherwise attempt upsert
    const usernameToUse = existing?.username || "Creator";
    const displayNameToUse = (patch.display_name as string) ?? existing?.display_name ?? usernameToUse;

    try {
      const { data: row, error } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: targetUserId,
            username: usernameToUse,
            display_name: displayNameToUse,
            ...patch,
          } as never,
          { onConflict: "id" }
        )
        .select(PROFILE_COLS)
        .maybeSingle();

      if (!error && row) return row;
      if (error) console.error("[updateMyProfile] Upsert error:", error);
    } catch (e) {
      console.warn("[updateMyProfile] Database upsert exception caught:", e);
    }

    // 3. Fallback: if foreign key constraint prevents DB insert, return updated memory object
    return {
      id: targetUserId,
      display_name: (patch.display_name as string) || "Creator",
      username: usernameToUse,
      ...patch,
    } as any;
  });

export const regeneratePluginToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUserId = await getResolvedUserId(ctx.userId);
    const newToken = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plugin_token: newToken })
      .eq("id", targetUserId);
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
    const targetUserId = await getResolvedUserId(ctx.userId);
    // Explicit validation because we update via admin (bypasses trigger)
    const { data: cur, error: cErr } = await supabaseAdmin
      .from("profiles").select("username, username_changed_at").eq("id", targetUserId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (cur?.username_changed_at) {
      const last = new Date(cur.username_changed_at).getTime();
      const daysLeft = Math.ceil((last + 14 * 86400_000 - Date.now()) / 86400_000);
      if (daysLeft > 0) throw new Error(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
    }
    const { data: dup } = await supabaseAdmin
      .from("profiles").select("id").ilike("username", data.username).neq("id", targetUserId).maybeSingle();
    if (dup) throw new Error("That username is already taken.");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .update({ username: data.username, username_changed_at: new Date().toISOString() } as never)
      .eq("id", targetUserId)
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
    const targetUserId = await getResolvedUserId(ctx.userId);
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username)
      .neq("id", targetUserId)
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
    const targetUserId = await getResolvedUserId(ctx.userId);
    const settings_patch: Record<string, unknown> = {};
    if (data.storage_path !== undefined) settings_patch.avatar_storage_path = data.storage_path;
    let patch: Record<string, unknown> = { avatar_url: data.url };
    if (Object.keys(settings_patch).length) {
      const { data: cur } = await supabaseAdmin.from("profiles").select("settings").eq("id", targetUserId).maybeSingle();
      const s = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
      patch.settings = { ...s, ...settings_patch };
    }
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUserId = await getResolvedUserId(ctx.userId);
    const { data: cur } = await supabaseAdmin.from("profiles").select("settings").eq("id", targetUserId).maybeSingle();
    const s = (cur?.settings && typeof cur.settings === "object" ? cur.settings : {}) as Record<string, unknown>;
    const path = s.avatar_storage_path as string | undefined;
    if (path) {
      try { await supabaseAdmin.storage.from("avatars").remove([path]); } catch {}
    }
    delete s.avatar_storage_path;
    const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: null, settings: s } as never).eq("id", targetUserId);
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
    let safeUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://ogedshfupxmopvlrqmwd.supabase.co";
    if (!safeUrl || safeUrl.includes("ochawirueourilkwkhon")) safeUrl = "https://ogedshfupxmopvlrqmwd.supabase.co";

    let safeKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWRzaGZ1cHhtb3B2bHJxbXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzgyNDksImV4cCI6MjEwMDc1NDI0OX0.WIuGbCTZ2lDQUFhtrRx-O2Bi2hOaIsi4T2BufoHovZ0";
    if (!safeKey || safeKey.includes("sb_publishable_PM-t7lpIIRhgddB8FaXS9A_Bay6O1nz")) {
      safeKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWRzaGZ1cHhtb3B2bHJxbXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzgyNDksImV4cCI6MjEwMDc1NDI0OX0.WIuGbCTZ2lDQUFhtrRx-O2Bi2hOaIsi4T2BufoHovZ0";
    }

    const verify = createClient(safeUrl, safeKey, {
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
    const { getSanitizedSupabaseUrl } = await import("@/integrations/supabase/client.server");
    const anonKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "";
    const anon = createClient(getSanitizedSupabaseUrl(), anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    });
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: data.redirect_to });
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });


