import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

async function assertAccess(supabase: any, projectId: string, userId: string) {
  const { data, error } = await supabase.rpc("can_access_project", {
    _project_id: projectId,
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No access to this project");
}

async function assertOwner(supabase: any, projectId: string, userId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("Only the project owner can do this");
}

// ============ Collaborators ============

export const listCollaborators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: rows, error } = await context.supabase
      .from("project_collaborators")
      .select("id, user_id, role, added_at")
      .eq("project_id", data.project_id)
      .order("added_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    let profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles_public" as any)
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      for (const p of (profs as any[]) ?? []) profiles[p.id] = p;
    }
    return (rows ?? []).map((r: any) => ({ ...r, profile: profiles[r.user_id] ?? null }));
  });

export const updateCollaboratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ project_id: uuid, user_id: uuid, role: z.enum(["editor", "viewer"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.project_id, context.userId);
    const { error } = await context.supabase
      .from("project_collaborators")
      .update({ role: data.role })
      .eq("project_id", data.project_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("project_activity").insert({
      project_id: data.project_id,
      user_id: context.userId,
      kind: "collab.role_changed",
      summary: `changed role to ${data.role}`,
      meta: { target: data.user_id, role: data.role },
    });
    return { ok: true };
  });

export const removeCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid, user_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    // owner can remove anyone, or self-leave
    if (data.user_id !== context.userId) {
      await assertOwner(context.supabase, data.project_id, context.userId);
    }
    const { error } = await context.supabase
      .from("project_collaborators")
      .delete()
      .eq("project_id", data.project_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("project_activity").insert({
      project_id: data.project_id,
      user_id: context.userId,
      kind: "collab.removed",
      summary: data.user_id === context.userId ? "left the project" : "removed a collaborator",
      meta: { target: data.user_id },
    });
    return { ok: true };
  });

// ============ Invites ============

export const inviteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      project_id: uuid,
      username: z.string().trim().min(1).max(80),
      role: z.enum(["editor", "viewer"]).default("editor"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.project_id, context.userId);
    // resolve invitee by username (case-insensitive)
    const { data: profRaw, error: pErr } = await context.supabase
      .from("profiles_public" as any)
      .select("id, username")
      .ilike("username", data.username)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    const prof = profRaw as { id: string; username: string } | null;

    const invitee_user_id = prof?.id ?? null;

    // prevent inviting yourself
    if (invitee_user_id === context.userId) throw new Error("You're already the owner of this project");

    // prevent dup if already a collaborator
    if (invitee_user_id) {
      const { data: existing } = await context.supabase
        .from("project_collaborators")
        .select("id")
        .eq("project_id", data.project_id)
        .eq("user_id", invitee_user_id)
        .maybeSingle();
      if (existing) throw new Error("That user is already a collaborator");
    }

    const { data: inv, error } = await context.supabase
      .from("project_invites")
      .insert({
        project_id: data.project_id,
        invited_by: context.userId,
        invitee_username: prof?.username ?? data.username,
        invitee_user_id,
        role: data.role,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("project_activity").insert({
      project_id: data.project_id,
      user_id: context.userId,
      kind: "invite.sent",
      summary: `invited @${prof?.username ?? data.username}`,
      meta: { invite_id: inv.id, role: data.role },
    });
    return inv;
  });

export const listProjectInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_invites")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_invites")
      .select("id, project_id, role, status, created_at, invited_by")
      .eq("invitee_user_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const pids = Array.from(new Set((rows ?? []).map((r: any) => r.project_id)));
    const uids = Array.from(new Set((rows ?? []).map((r: any) => r.invited_by)));
    let projects: Record<string, any> = {};
    let inviters: Record<string, any> = {};
    if (pids.length) {
      const { data: ps } = await context.supabase
        .from("projects").select("id, name, game_type").in("id", pids);
      for (const p of ps ?? []) projects[p.id] = p;
    }
    if (uids.length) {
      const { data: us } = await context.supabase
        .from("profiles_public" as any).select("id, username, display_name, avatar_url").in("id", uids);
      for (const u of (us as any[]) ?? []) inviters[u.id] = u;
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      project: projects[r.project_id] ?? null,
      inviter: inviters[r.invited_by] ?? null,
    }));
  });

export const respondToInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ invite_id: uuid, accept: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.accept) {
      const { data: pid, error } = await context.supabase.rpc("accept_project_invite", {
        _invite_id: data.invite_id,
      });
      if (error) throw new Error(error.message);
      return { ok: true, project_id: pid };
    }
    const { error } = await context.supabase
      .from("project_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ invite_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_invites")
      .update({ status: "canceled", responded_at: new Date().toISOString() })
      .eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Team Chat ============

export const listProjectChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid, limit: z.number().int().min(1).max(200).default(100) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: rows, error } = await context.supabase
      .from("project_chat_messages")
      .select("id, user_id, body, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles_public" as any).select("id, username, display_name, avatar_url").in("id", ids);
      for (const p of (profs as any[]) ?? []) profiles[p.id] = p;
    }
    return (rows ?? []).reverse().map((r: any) => ({ ...r, profile: profiles[r.user_id] ?? null }));
  });

export const sendProjectChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid, body: z.string().trim().min(1).max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: row, error } = await context.supabase
      .from("project_chat_messages")
      .insert({ project_id: data.project_id, user_id: context.userId, body: data.body })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ Activity ============

export const listProjectActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid, limit: z.number().int().min(1).max(200).default(50) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: rows, error } = await context.supabase
      .from("project_activity")
      .select("id, user_id, kind, summary, meta, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    let profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles_public" as any).select("id, username, display_name, avatar_url").in("id", ids);
      for (const p of (profs as any[]) ?? []) profiles[p.id] = p;
    }
    return (rows ?? []).map((r: any) => ({ ...r, profile: r.user_id ? profiles[r.user_id] ?? null : null }));
  });

// ============ Comments ============

export const listProjectComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: rows, error } = await context.supabase
      .from("project_comments")
      .select("id, user_id, anchor, body, resolved, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles_public" as any).select("id, username, display_name, avatar_url").in("id", ids);
      for (const p of (profs as any[]) ?? []) profiles[p.id] = p;
    }
    return (rows ?? []).map((r: any) => ({ ...r, profile: profiles[r.user_id] ?? null }));
  });

export const addProjectComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ project_id: uuid, body: z.string().trim().min(1).max(2000), anchor: z.string().max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, context.userId);
    const { data: row, error } = await context.supabase
      .from("project_comments")
      .insert({ project_id: data.project_id, user_id: context.userId, body: data.body, anchor: data.anchor ?? null })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleCommentResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ comment_id: uuid, resolved: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_comments")
      .update({ resolved: data.resolved })
      .eq("id", data.comment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Creator Discovery & Team Hub ============

export const searchCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ query: z.string().trim().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: profs, error } = await context.supabase
      .from("profiles_public" as any)
      .select("id, username, display_name, avatar_url, bio, plan")
      .or(`username.ilike.%${data.query}%,display_name.ilike.%${data.query}%`)
      .limit(12);
    if (error) throw new Error(error.message);
    return ((profs as any[]) ?? []).filter((p) => p.id !== context.userId);
  });

export const listMyTeamProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: owned, error: oErr } = await context.supabase
      .from("projects")
      .select("id, name, description, game_type, user_id, updated_at, created_at, is_public")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (oErr) throw new Error(oErr.message);

    const { data: collabRows, error: cErr } = await context.supabase
      .from("project_collaborators")
      .select("project_id, role, added_at")
      .eq("user_id", context.userId);
    if (cErr) throw new Error(cErr.message);

    const collabPids = (collabRows ?? []).map((r: any) => r.project_id);
    let sharedProjects: any[] = [];
    if (collabPids.length > 0) {
      const { data: sp, error: spErr } = await context.supabase
        .from("projects")
        .select("id, name, description, game_type, user_id, updated_at, created_at, is_public")
        .in("id", collabPids);
      if (spErr) throw new Error(spErr.message);
      sharedProjects = sp ?? [];
    }

    const allProjects = [...(owned ?? []), ...sharedProjects];
    const allProjectIds = Array.from(new Set(allProjects.map((p) => p.id)));

    let memberMap: Record<string, any[]> = {};
    let inviteCountMap: Record<string, number> = {};

    if (allProjectIds.length > 0) {
      const { data: collabs } = await context.supabase
        .from("project_collaborators")
        .select("project_id, user_id, role")
        .in("project_id", allProjectIds);

      const { data: invs } = await context.supabase
        .from("project_invites")
        .select("project_id")
        .in("project_id", allProjectIds)
        .eq("status", "pending");

      (invs ?? []).forEach((inv: any) => {
        inviteCountMap[inv.project_id] = (inviteCountMap[inv.project_id] || 0) + 1;
      });

      const uids = Array.from(
        new Set([
          ...allProjects.map((p) => p.user_id),
          ...(collabs ?? []).map((c: any) => c.user_id),
        ]),
      );

      let profiles: Record<string, any> = {};
      if (uids.length > 0) {
        const { data: profs } = await context.supabase
          .from("profiles_public" as any)
          .select("id, username, display_name, avatar_url")
          .in("id", uids);
        for (const p of (profs as any[]) ?? []) profiles[p.id] = p;
      }

      for (const p of allProjects) {
        const ownerProf = profiles[p.user_id] ?? null;
        const projectCollabs = (collabs ?? [])
          .filter((c: any) => c.project_id === p.id)
          .map((c: any) => ({
            ...c,
            profile: profiles[c.user_id] ?? null,
          }));

        memberMap[p.id] = [
          { user_id: p.user_id, role: "owner", profile: ownerProf },
          ...projectCollabs,
        ];
      }
    }

    return {
      owned: (owned ?? []).map((p) => ({
        ...p,
        is_owner: true,
        role: "owner",
        members: memberMap[p.id] ?? [],
        pending_invites_count: inviteCountMap[p.id] ?? 0,
      })),
      shared: sharedProjects.map((p) => {
        const myCollab = collabRows?.find((r: any) => r.project_id === p.id);
        return {
          ...p,
          is_owner: false,
          role: myCollab?.role ?? "editor",
          members: memberMap[p.id] ?? [],
          pending_invites_count: inviteCountMap[p.id] ?? 0,
        };
      }),
    };
  });

export const listAllTeamActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: owned } = await context.supabase
      .from("projects")
      .select("id")
      .eq("user_id", context.userId);
    const { data: collab } = await context.supabase
      .from("project_collaborators")
      .select("project_id")
      .eq("user_id", context.userId);

    const projectIds = Array.from(
      new Set([
        ...(owned ?? []).map((p: any) => p.id),
        ...(collab ?? []).map((c: any) => c.project_id),
      ]),
    );

    if (projectIds.length === 0) return [];

    const { data: activity, error } = await context.supabase
      .from("project_activity")
      .select("id, project_id, user_id, kind, summary, meta, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);

    const pids = Array.from(new Set((activity ?? []).map((a: any) => a.project_id)));
    const uids = Array.from(new Set((activity ?? []).map((a: any) => a.user_id).filter(Boolean)));

    let projectsMap: Record<string, any> = {};
    let profilesMap: Record<string, any> = {};

    if (pids.length > 0) {
      const { data: ps } = await context.supabase
        .from("projects")
        .select("id, name")
        .in("id", pids);
      for (const p of ps ?? []) projectsMap[p.id] = p;
    }

    if (uids.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles_public" as any)
        .select("id, username, display_name, avatar_url")
        .in("id", uids);
      for (const p of (profs as any[]) ?? []) profilesMap[p.id] = p;
    }

    return (activity ?? []).map((a: any) => ({
      ...a,
      project: projectsMap[a.project_id] ?? null,
      profile: a.user_id ? profilesMap[a.user_id] ?? null : null,
    }));
  });

