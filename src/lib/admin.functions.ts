import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
  if (!isAdmin && !isOwner) throw new Error("Forbidden");
  return { isOwner: !!isOwner };
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);

    const { data: authUser } = await context.supabase.auth.getUser();
    const email = authUser.user?.email ?? "";

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, plan, credits, max_credits, is_admin, created_at")
      .eq("id", context.userId)
      .maybeSingle();

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [{ data: roles }, projectCount, messageCount, pendingActions, totalUsers, newUsers24h, newUsers7d, bannedUsers, donatorCount] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("projects").select("id", { count: "exact", head: true }),
      context.supabase.from("chat_messages").select("id", { count: "exact", head: true }),
      context.supabase.from("plugin_actions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      context.supabase.from("profiles").select("id", { count: "exact", head: true }),
      context.supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since24h),
      context.supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7d),
      context.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("banned", true),
      context.supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "donator"),
    ]);

    return {
      profile,
      email,
      roles: roles?.map((row: any) => row.role) ?? [],
      stats: {
        projects: projectCount.count ?? 0,
        messages: messageCount.count ?? 0,
        pendingActions: pendingActions.count ?? 0,
        totalUsers: totalUsers.count ?? 0,
        newUsers24h: newUsers24h.count ?? 0,
        newUsers7d: newUsers7d.count ?? 0,
        bannedUsers: bannedUsers.count ?? 0,
        donators: donatorCount.count ?? 0,
      },
    };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const limit = Math.min(data.limit ?? 100, 500);

    let q = context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, plan, credits, max_credits, is_admin, banned, banned_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`username.ilike.${s},display_name.ilike.${s}`);
    }
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: rolesData } = await context.supabase.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const rolesByUser: Record<string, string[]> = {};
    (rolesData ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] ||= []).push(r.role);
    });

    // Email lookup via admin client
    const emailById: Record<string, string> = {};
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      (usersList?.users ?? []).forEach((u: any) => { if (u.id) emailById[u.id] = u.email ?? ""; });
    } catch {}

    return {
      users: (profiles ?? []).map((p) => ({
        ...p,
        email: emailById[p.id] ?? "",
        roles: rolesByUser[p.id] ?? [],
      })),
    };
  });

export const giftCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; amount: number }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (!Number.isFinite(data.amount)) throw new Error("Invalid amount");
    const { data: prof, error: e1 } = await context.supabase.from("profiles").select("credits, max_credits").eq("id", data.userId).maybeSingle();
    if (e1 || !prof) throw new Error(e1?.message ?? "User not found");
    const newCredits = Math.max(0, (prof.credits ?? 0) + data.amount);
    const newMax = Math.max(prof.max_credits ?? 0, newCredits);
    const { error } = await context.supabase.from("profiles").update({ credits: newCredits, max_credits: newMax }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { credits: newCredits };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; banned: boolean; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: any = { banned: data.banned, banned_reason: data.banned ? (data.reason ?? "") : null, banned_at: data.banned ? new Date().toISOString() : null };
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "moderator" | "donator" | "user" | "owner"; grant: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { isOwner } = await requireAdmin(context);
    if ((data.role === "admin" || data.role === "owner") && !isOwner) throw new Error("Only the owner can grant admin/owner roles");
    if (data.role === "user") throw new Error("Cannot toggle the base user role");

    if (data.grant) {
      const { error } = await context.supabase.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    // Mirror is_admin flag on profile when toggling admin/owner
    if (data.role === "admin" || data.role === "owner") {
      const { data: stillAdmin } = await context.supabase.rpc("has_role", { _user_id: data.userId, _role: "admin" });
      const { data: stillOwner } = await context.supabase.rpc("has_role", { _user_id: data.userId, _role: "owner" });
      await context.supabase.from("profiles").update({ is_admin: !!stillAdmin || !!stillOwner }).eq("id", data.userId);
    }
    return { ok: true };
  });
