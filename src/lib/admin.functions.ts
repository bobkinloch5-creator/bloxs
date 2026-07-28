import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  let userEmail = "";
  try {
    const { data: authUser } = await context.supabase.auth.getUser();
    userEmail = authUser?.user?.email?.toLowerCase() ?? "";
  } catch {}

  const isOwnerEmail = userEmail === "bobkinloch5@gmail.com" || context.userId === "64f33732-136a-4c78-9421-7c11579c7412";

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", ["admin", "owner"]);

  let isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  let isOwner = (roles ?? []).some((r: any) => r.role === "owner");

  if (isOwnerEmail) {
    if (!isOwner) {
      try {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: context.userId, role: "owner" } as any,
          { onConflict: "user_id,role" }
        );
      } catch {}
      try { await supabaseAdmin.from("profiles").update({ is_admin: true, plan: "Owner" }).eq("id", context.userId); } catch {}
    }
    isOwner = true;
    isAdmin = true;
  }

  if (!isAdmin && !isOwner) {
    throw new Error("Unauthorized: Admin access required");
  }

  return { isOwner: !!isOwner, isAdmin: !!isAdmin, supabaseAdmin };
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);

    try {
      let email = "bobkinloch5@gmail.com";
      try {
        const { data: authUser } = await ctx.supabase.auth.getUser();
        if (authUser?.user?.email) email = authUser.user.email;
      } catch {}

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, username, display_name, plan, credits, max_credits, is_admin, created_at")
        .eq("id", ctx.userId)
        .maybeSingle();

      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const [{ data: roles }, projectCount, messageCount, pendingActions, totalUsers, newUsers24h, newUsers7d, bannedUsers, donatorCount] = await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", ctx.userId),
        supabaseAdmin.from("projects").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("chat_messages").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("plugin_actions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7d),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("banned", true),
        supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "donator"),
      ]);

      const userRoles = Array.from(new Set(roles?.map((row: any) => row.role) ?? []));
      if (email === "bobkinloch5@gmail.com" || ctx.userId === "64f33732-136a-4c78-9421-7c11579c7412") {
        if (!userRoles.includes("owner")) userRoles.push("owner");
        if (!userRoles.includes("admin")) userRoles.push("admin");
      }
      if (userRoles.length === 0) userRoles.push("user");

      return {
        profile: profile ? profile : { id: ctx.userId, username: "User", display_name: "User", plan: "Free", is_admin: false },
        email,
        roles: userRoles,
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
    } catch (e) {
      console.warn("[getAdminOverview] Exception fallback:", e);
      return {
        profile: { id: ctx.userId || "owner", username: "King", display_name: "King", plan: "Owner", is_admin: true },
        email: "bobkinloch5@gmail.com",
        roles: ["owner", "admin"],
        stats: {
          projects: 0,
          messages: 0,
          pendingActions: 0,
          totalUsers: 1,
          newUsers24h: 0,
          newUsers7d: 0,
          bannedUsers: 0,
          donators: 0,
        },
      };
    }
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { search?: string; page?: number; perPage?: number; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);

    const page = Math.max(1, data.page ?? 1);
    const perPage = Math.min(Math.max(1, data.perPage ?? data.limit ?? 50), 1000);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let countQuery = supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
    let query = supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url, plan, credits, max_credits, is_admin, banned, banned_reason, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      countQuery = countQuery.or(`username.ilike.${s},display_name.ilike.${s}`);
      query = query.or(`username.ilike.${s},display_name.ilike.${s}`);
    }

    const [{ count: totalUsersCount }, { data: profiles, error }] = await Promise.all([
      countQuery,
      query,
    ]);

    if (error) throw new Error(error.message);

    const totalUsers = totalUsersCount ?? 0;
    const totalPages = Math.ceil(totalUsers / perPage) || 1;

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: rolesData } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const rolesByUser: Record<string, string[]> = {};
    (rolesData ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] ||= []).push(r.role);
    });

    // Email lookup via admin client
    const emailById: Record<string, string> = {};
    try {
      let allAuthUsers: any[] = [];
      let authPage = 1;
      let hasMore = true;
      while (hasMore && authPage <= 10) {
        const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ page: authPage, perPage: 1000 });
        const users = usersList?.users ?? [];
        allAuthUsers.push(...users);
        if (users.length < 1000) hasMore = false;
        authPage++;
      }
      allAuthUsers.forEach((u: any) => { if (u.id) emailById[u.id] = u.email ?? ""; });
    } catch {}

    return {
      users: (profiles ?? []).map((p) => ({
        ...p,
        email: emailById[p.id] ?? "",
        roles: rolesByUser[p.id] ?? [],
      })),
      totalUsers,
      totalPages,
      currentPage: page,
      perPage,
    };
  });

export const giftCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string; amount: number }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    if (!Number.isFinite(data.amount)) throw new Error("Invalid amount");
    const { data: prof, error: e1 } = await supabaseAdmin.from("profiles").select("credits, max_credits").eq("id", data.userId).maybeSingle();
    if (e1 || !prof) throw new Error(e1?.message ?? "User not found");
    const newCredits = Math.max(0, (prof.credits ?? 0) + data.amount);
    const newMax = Math.max(prof.max_credits ?? 0, newCredits);
    const { error } = await supabaseAdmin.from("profiles").update({ credits: newCredits, max_credits: newMax }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { credits: newCredits };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string; banned: boolean; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { isOwner, supabaseAdmin } = await requireAdmin(ctx);

    if (data.userId === ctx.userId) {
      throw new Error("You cannot ban your own account");
    }

    // Owner protection: owner account can NEVER be banned
    if (data.userId === "64f33732-136a-4c78-9421-7c11579c7412") {
      throw new Error("The site owner account cannot be banned under any circumstances.");
    }

    try {
      const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      if (targetUser?.user?.email?.toLowerCase() === "bobkinloch5@gmail.com") {
        throw new Error("The site owner account cannot be banned under any circumstances.");
      }
    } catch {}

    // Check target user roles
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetIsOwnerOrAdmin = (targetRoles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");

    if (targetIsOwnerOrAdmin && !isOwner) {
      throw new Error("Only the owner can ban admins or owners");
    }

    const patch: any = {
      banned: data.banned,
      banned_reason: data.banned ? (data.reason || "Suspicious activity / terms violation") : null,
      banned_at: data.banned ? new Date().toISOString() : null,
    };

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw new Error(error.message);

    // Audit log entry
    try {
      let email = "";
      try {
        const { data: authUser } = await ctx.supabase.auth.getUser();
        email = authUser.user?.email ?? "";
      } catch {}

      await supabaseAdmin.from("admin_audit_logs").insert({
        actor_id: ctx.userId,
        actor_email: email,
        action: data.banned ? "user.ban" : "user.unban",
        target_type: "user",
        target_id: data.userId,
        new_value: patch,
      });
    } catch (e) {
      console.warn("[setUserBanned] Audit log failed:", e);
    }

    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string; role: "admin" | "moderator" | "donator" | "user" | "owner"; grant: boolean }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { isOwner, supabaseAdmin } = await requireAdmin(ctx);
    if ((data.role === "admin" || data.role === "owner") && !isOwner) throw new Error("Only the owner can grant admin/owner roles");
    if (data.role === "user") throw new Error("Cannot toggle the base user role");
    if (!data.grant && data.role === "owner" && data.userId === ctx.userId) throw new Error("The owner cannot remove their own owner access");

    if (data.grant) {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    // Mirror is_admin flag on profile when toggling admin/owner
    if (data.role === "admin" || data.role === "owner") {
      const { data: remainingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .in("role", ["admin", "owner"]);
      const stillPrivileged = (remainingRoles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
      const hasOwner = (remainingRoles ?? []).some((r: any) => r.role === "owner");
      const updates: any = { is_admin: stillPrivileged };
      if (!hasOwner) {
        updates.plan = "Free";
      } else {
        updates.plan = "Owner";
      }
      await supabaseAdmin.from("profiles").update(updates).eq("id", data.userId);
    }
    return { ok: true };
  });
