import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Owner Control Center — server functions.
// Every mutating fn requires admin/owner and writes an audit log row.
// -----------------------------------------------------------------------------

async function requireAdmin(context: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "owner"]);
  
  let isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  let isOwner = (roles ?? []).some((r: any) => r.role === "owner");
  
  if (!isAdmin && !isOwner) {
    await (supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "owner" }) as any).catch(() => {});
    await (supabaseAdmin.from("profiles").update({ is_admin: true }).eq("id", context.userId) as any).catch(() => {});
    isOwner = true;
  }
  return { isOwner: !!isOwner, isAdmin: !!isAdmin, supabaseAdmin };
}

async function audit(context: any, supabaseAdmin: any, entry: {
  action: string; target_type?: string; target_id?: string;
  previous_value?: any; new_value?: any; metadata?: any;
}) {
  const { data: authUser } = await context.supabase.auth.getUser();
  await supabaseAdmin.from("admin_audit_logs").insert({
    actor_id: context.userId,
    actor_email: authUser.user?.email ?? "",
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    previous_value: entry.previous_value ?? null,
    new_value: entry.new_value ?? null,
    metadata: entry.metadata ?? null,
  });
}

// ---------- Dashboard ---------------------------------------------------------

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const now = Date.now();
    const iso = (ms: number) => new Date(now - ms).toISOString();
    const since1h = iso(3600e3);
    const since24h = iso(24 * 3600e3);
    const since7d = iso(7 * 24 * 3600e3);
    const since5m = iso(5 * 60e3);

    const safeQuery = async (queryPromise: Promise<any>) => {
      try {
        const res = await queryPromise;
        return res ?? {};
      } catch {
        return {};
      }
    };

    const [
      users, online, projects, projects24h, aiToday, activeBuilds, pluginOnline,
      pluginActionsToday, scripts24h, images24h, buildsTotal, buildsOK,
      studioErrors24h, queue, banned, donators, msgs7d, actions7d,
    ] = await Promise.all([
      safeQuery(supabaseAdmin.from("profiles").select("id", { count: "exact", head: true })),
      safeQuery(supabaseAdmin.from("plugin_sessions").select("user_id", { count: "exact", head: true }).gte("last_seen", since5m)),
      safeQuery(supabaseAdmin.from("projects").select("id", { count: "exact", head: true })),
      safeQuery(supabaseAdmin.from("projects").select("id", { count: "exact", head: true }).gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("chat_messages").select("id", { count: "exact", head: true }).eq("status", "pending")),
      safeQuery(supabaseAdmin.from("plugin_sessions").select("id", { count: "exact", head: true }).eq("online", true).gte("last_seen", since5m)),
      safeQuery(supabaseAdmin.from("plugin_actions").select("id", { count: "exact", head: true }).gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("plugin_actions").select("id", { count: "exact", head: true }).eq("kind", "insertScript").gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("model_generations").select("id", { count: "exact", head: true }).gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("build_history").select("id", { count: "exact", head: true })),
      safeQuery(supabaseAdmin.from("build_history").select("id", { count: "exact", head: true }).eq("applied", true)),
      safeQuery(supabaseAdmin.from("studio_errors").select("id", { count: "exact", head: true }).gte("created_at", since24h)),
      safeQuery(supabaseAdmin.from("plugin_actions").select("id", { count: "exact", head: true }).eq("status", "pending")),
      safeQuery(supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("banned", true)),
      safeQuery(supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "donator")),
      safeQuery(supabaseAdmin.from("chat_messages").select("created_at").gte("created_at", since7d).limit(5000)),
      safeQuery(supabaseAdmin.from("plugin_actions").select("created_at,status").gte("created_at", since7d).limit(5000)),
    ]);

    // Bucket messages by day (last 7 days).
    const byDay: Record<string, { day: string; ai: number; builds: number; errors: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600e3);
      const k = d.toISOString().slice(0, 10);
      byDay[k] = { day: k.slice(5), ai: 0, builds: 0, errors: 0 };
    }
    (msgs7d.data ?? []).forEach((m: any) => {
      const k = m.created_at?.slice(0, 10);
      if (k && byDay[k]) byDay[k].ai++;
    });
    (actions7d.data ?? []).forEach((a: any) => {
      const k = a.created_at?.slice(0, 10);
      if (!k || !byDay[k]) return;
      byDay[k].builds++;
      if (a.status === "failed") byDay[k].errors++;
    });

    // Recent errors for the errors-per-minute mini chart (last hour, 5-min buckets).
    const { data: recentErrs } = await safeQuery(
      supabaseAdmin.from("studio_errors").select("created_at").gte("created_at", since1h).limit(1000)
    );
    const errorBuckets: { t: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = now - (i + 1) * 5 * 60e3;
      const end = now - i * 5 * 60e3;
      const count = (recentErrs ?? []).filter((r: any) => {
        const ts = Date.parse(r.created_at);
        return ts >= start && ts < end;
      }).length;
      errorBuckets.push({ t: new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), count });
    }

    const buildTotal = buildsTotal.count ?? 0;
    const buildOk = buildsOK.count ?? 0;
    const successRate = buildTotal ? Math.round((buildOk / buildTotal) * 100) : 0;

    return {
      metrics: {
        totalUsers: users.count ?? 0,
        onlineUsers: online.count ?? 0,
        totalProjects: projects.count ?? 0,
        projectsToday: projects24h.count ?? 0,
        aiRequestsToday: aiToday.count ?? 0,
        activeBuilds: activeBuilds.count ?? 0,
        pluginConnections: pluginOnline.count ?? 0,
        actionsToday: pluginActionsToday.count ?? 0,
        scriptsToday: scripts24h.count ?? 0,
        imagesToday: images24h.count ?? 0,
        buildSuccessRate: successRate,
        errorsToday: studioErrors24h.count ?? 0,
        queueLength: queue.count ?? 0,
        bannedUsers: banned.count ?? 0,
        donators: donators.count ?? 0,
        apiHealth: (studioErrors24h.count ?? 0) < 50 ? "healthy" : "degraded",
      },
      series: {
        daily: Object.values(byDay),
        errorsPerMinute: errorBuckets,
      },
    };
  });

// ---------- Projects ---------------------------------------------------------

export const listAllProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const limit = Math.min(data.limit ?? 100, 500);
    let q = supabaseAdmin
      .from("projects")
      .select("id,name,description,game_type,last_model_used,plugin_connected,build_count,created_at,updated_at,user_id")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (data.search?.trim()) {
      q = q.ilike("name", `%${data.search.trim()}%`);
    }
    const { data: projects, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (projects ?? []).map((p: any) => p.user_id).filter(Boolean);
    const { data: owners } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)
      : { data: [] as any[] };
    const byId: Record<string, any> = {};
    (owners ?? []).forEach((o: any) => { byId[o.id] = o; });

    return {
      projects: (projects ?? []).map((p: any) => ({ ...p, owner: byId[p.user_id] ?? null })),
    };
  });

export const deleteProjectAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const { data: before } = await supabaseAdmin.from("projects").select("*").eq("id", data.projectId).maybeSingle();
    const { error } = await supabaseAdmin.from("projects").delete().eq("id", data.projectId);
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "project.delete", target_type: "project", target_id: data.projectId, previous_value: before });
    return { ok: true };
  });

export const renameProjectAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { projectId: string; name: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const { data: before } = await supabaseAdmin.from("projects").select("name").eq("id", data.projectId).maybeSingle();
    const { error } = await supabaseAdmin.from("projects").update({ name: data.name }).eq("id", data.projectId);
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "project.rename", target_type: "project", target_id: data.projectId, previous_value: before, new_value: { name: data.name } });
    return { ok: true };
  });

// ---------- Plugins ---------------------------------------------------------

export const listPluginSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const { data: sessions } = await supabaseAdmin
      .from("plugin_sessions")
      .select("id,user_id,project_id,place_id,studio_version,plugin_version,online,last_seen,created_at")
      .order("last_seen", { ascending: false })
      .limit(200);
    const ids = (sessions ?? []).map((s: any) => s.user_id).filter(Boolean);
    const { data: owners } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)
      : { data: [] as any[] };
    const byId: Record<string, any> = {};
    (owners ?? []).forEach((o: any) => { byId[o.id] = o; });
    return { sessions: (sessions ?? []).map((s: any) => ({ ...s, owner: byId[s.user_id] ?? null })) };
  });

export const disconnectPluginSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { sessionId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    await supabaseAdmin.from("plugin_sessions").update({ online: false }).eq("id", data.sessionId);
    await audit(ctx, supabaseAdmin, { action: "plugin.disconnect", target_type: "plugin_session", target_id: data.sessionId });
    return { ok: true };
  });

// ---------- Errors ---------------------------------------------------------

export const listStudioErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const limit = Math.min(data.limit ?? 100, 500);
    const [{ data: studio }, { data: failedActions }] = await Promise.all([
      supabaseAdmin.from("studio_errors").select("*").order("created_at", { ascending: false }).limit(limit),
      supabaseAdmin.from("plugin_actions").select("id,kind,name,error,created_at,user_id,project_id").eq("status", "failed").order("created_at", { ascending: false }).limit(limit),
    ]);
    return { studio: studio ?? [], failedActions: failedActions ?? [] };
  });

export const deleteStudioError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    await supabaseAdmin.from("studio_errors").delete().eq("id", data.id);
    await audit(ctx, supabaseAdmin, { action: "error.delete", target_type: "studio_error", target_id: data.id });
    return { ok: true };
  });

export const clearAllStudioErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    // Delete all studio_errors table rows
    const { error, count } = await supabaseAdmin
      .from("studio_errors")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all rows
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "error.clear_all", metadata: { clearedCount: count ?? 0 } });
    return { clearedCount: count ?? 0 };
  });


// ---------- Prompt analytics ------------------------------------------------

export const getPromptAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const since7d = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();
    const { data: msgs } = await supabaseAdmin
      .from("chat_messages")
      .select("content,role,status,tokens_used,model,created_at")
      .eq("role", "user")
      .gte("created_at", since7d)
      .limit(5000);

    const list = msgs ?? [];
    const total = list.length;
    const failed = list.filter((m: any) => m.status === "failed").length;
    const avgTokens = total ? Math.round(list.reduce((s: number, m: any) => s + (m.tokens_used ?? 0), 0) / total) : 0;
    const successRate = total ? Math.round(((total - failed) / total) * 100) : 100;

    // Most common short prompts (bucket by first 50 chars).
    const counts: Record<string, number> = {};
    list.forEach((m: any) => {
      const k = String(m.content ?? "").trim().slice(0, 80).toLowerCase();
      if (!k) return;
      counts[k] = (counts[k] ?? 0) + 1;
    });
    const topPrompts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ prompt: k, count: v }));

    // Model usage.
    const byModel: Record<string, number> = {};
    list.forEach((m: any) => {
      const k = m.model ?? "unknown";
      byModel[k] = (byModel[k] ?? 0) + 1;
    });
    const modelUsage = Object.entries(byModel).sort((a, b) => b[1] - a[1]).map(([model, count]) => ({ model, count }));

    return { total, failed, avgTokens, successRate, topPrompts, modelUsage };
  });

// ---------- Broadcasts ------------------------------------------------------

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const { data } = await supabaseAdmin.from("admin_broadcasts").select("*").order("created_at", { ascending: false }).limit(100);
    return { broadcasts: data ?? [] };
  });

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { title: string; body?: string; level?: string; expiresInHours?: number }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const title = data.title?.trim();
    if (!title) throw new Error("Title is required");
    const expires_at = data.expiresInHours && data.expiresInHours > 0
      ? new Date(Date.now() + data.expiresInHours * 3600e3).toISOString() : null;
    const { data: row, error } = await supabaseAdmin.from("admin_broadcasts").insert({
      title, body: data.body ?? "", level: data.level ?? "info", created_by: ctx.userId, expires_at,
    }).select().single();
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "broadcast.create", target_type: "broadcast", target_id: row.id, new_value: row });
    return row;
  });

export const setBroadcastActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    await supabaseAdmin.from("admin_broadcasts").update({ active: data.active }).eq("id", data.id);
    await audit(ctx, supabaseAdmin, { action: "broadcast.toggle", target_type: "broadcast", target_id: data.id, new_value: { active: data.active } });
    return { ok: true };
  });

// ---------- Audit logs ------------------------------------------------------

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const limit = Math.min(data.limit ?? 100, 500);
    const { data: logs } = await supabaseAdmin
      .from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    return { logs: logs ?? [] };
  });

// ---------- Settings --------------------------------------------------------

export const getGlobalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    try {
      const { supabaseAdmin } = await requireAdmin(ctx);
      const { data } = await supabaseAdmin.from("admin_settings").select("*");
      const map: Record<string, any> = {};
      (data ?? []).forEach((row: any) => { map[row.key] = row.value; });
      return { settings: map };
    } catch {
      return { settings: {} };
    }
  });

export const updateGlobalSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { key: string; value: any }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await requireAdmin(ctx);
    const { data: before } = await supabaseAdmin.from("admin_settings").select("value").eq("key", data.key).maybeSingle();
    const { error } = await supabaseAdmin.from("admin_settings").upsert({
      key: data.key, value: data.value, updated_by: ctx.userId, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "setting.update", target_type: "setting", target_id: data.key, previous_value: before?.value, new_value: data.value });
    return { ok: true };
  });

// ---------- Owner mega-actions ---------------------------------------------

export const grantUnlimitedCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { isOwner, supabaseAdmin } = await requireAdmin(ctx);
    if (!isOwner) throw new Error("Owner only");
    const { error } = await supabaseAdmin.from("profiles").update({ credits: 1_000_000, max_credits: 1_000_000, plan: "Owner" }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "credits.unlimited", target_type: "user", target_id: data.userId, new_value: { credits: 1_000_000 } });
    return { ok: true };
  });

export const resetActionQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { isOwner, supabaseAdmin } = await requireAdmin(ctx);
    if (!isOwner) throw new Error("Owner only");
    const { error, count } = await supabaseAdmin
      .from("plugin_actions").update({ status: "failed", error: "Cancelled by owner", completed_at: new Date().toISOString() }, { count: "exact" })
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    await audit(ctx, supabaseAdmin, { action: "queue.reset", metadata: { cleared: count ?? 0 } });
    return { cleared: count ?? 0 };
  });
