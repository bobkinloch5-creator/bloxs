import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizePluginAction } from "@/lib/plugin-actions";

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("id, role, content, status, model, actions, image_url, error, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listProjectActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("plugin_actions")
      .select("id, message_id, kind, name, parent_path, status, error, result, created_at, sent_at, completed_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getPluginSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("plugin_sessions")
      .select("last_seen, online, place_id, studio_version, plugin_version, last_scan, last_scan_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const queuePluginCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    kind: z.enum(["scan_project", "organize_project", "autofix_project"]),
    name: z.string().min(1).max(80).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("plugin_actions").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: data.kind,
      parent_path: "Workspace",
      name: data.name ?? data.kind,
      payload: {},
      position: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const queueFixAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actions = [
      { kind: "scan_project", name: "FixAll_1_Scan", parent_path: "Workspace", payload: {}, position: 0 },
      { kind: "autofix_project", name: "FixAll_2_AutoFix", parent_path: "Workspace", payload: {}, position: 1 },
      { kind: "organize_project", name: "FixAll_3_Organize", parent_path: "Workspace", payload: {}, position: 2 },
      { kind: "scan_project", name: "FixAll_4_VerifyScan", parent_path: "Workspace", payload: {}, position: 3 },
    ];

    const { error } = await context.supabase.from("plugin_actions").insert(
      actions.map((action) => ({
        project_id: data.projectId,
        user_id: context.userId,
        ...action,
      })),
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: actions.length };
  });

export const queueTestInsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actions = [
      {
        kind: "part",
        parent_path: "Workspace",
        name: "BloxSmith_TestPart",
        payload: {
          size: [4, 1, 4],
          position: [0, 6, 0],
          color: [0.1, 0.65, 1],
          anchored: true,
          material: "Neon",
        },
        position: 0,
      },
      {
        kind: "screengui",
        parent_path: "StarterGui",
        name: "BloxSmith_TestGui",
        payload: { reset_on_spawn: true },
        position: 1,
      },
      {
        kind: "script",
        parent_path: "ServerScriptService",
        name: "BloxSmith_TestScript",
        payload: {
          source: [
            "local RunService = game:GetService(\"RunService\")",
            "print(\"BloxSmith test insert executed\", RunService:IsStudio())",
          ].join("\n"),
        },
        position: 2,
      },
    ];

    const { error } = await context.supabase.from("plugin_actions").insert(
      actions.map((action) => ({
        project_id: data.projectId,
        user_id: context.userId,
        ...action,
      })),
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: actions.length };
  });

export const queuePreparedStudioActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    actions: z.array(z.object({
      kind: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? "script" : v),
        z.string().trim().min(1).max(80),
      ).default("script"),
      parent_path: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? "Workspace" : v),
        z.string().trim().min(1).max(400),
      ).default("Workspace"),
      name: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? "BloxSmithAction" : v),
        z.string().trim().min(1).max(160),
      ).default("BloxSmithAction"),
      payload: z.any().optional(),
    })).min(1).max(80),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const normalizedActions = data.actions.map(normalizePluginAction);
    const { data: recent } = await context.supabase
      .from("plugin_actions")
      .select("id, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(normalizedActions.length);
    const newest = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
    if ((recent?.length ?? 0) >= normalizedActions.length && Date.now() - newest < 30_000) {
      return { ok: true, count: recent?.length ?? 0, alreadyQueued: true };
    }

    const { error } = await context.supabase.from("plugin_actions").insert(
      normalizedActions.map((action, i) => ({
        project_id: data.projectId,
        user_id: context.userId,
        kind: action.kind,
        parent_path: action.parent_path,
        name: action.name,
        payload: action.payload ?? {},
        position: i,
      })),
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: normalizedActions.length };
  });

export const clearMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Wipe chat memory + queued/pending plugin actions for this project.
    const { error: e1 } = await context.supabase
      .from("chat_messages")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await context.supabase
      .from("plugin_actions")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

// Cancel everything currently queued or in flight for this project, without
// touching chat history. Used by the visible Stop / Clear Queue controls.
export const clearActionQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("plugin_actions")
      .update({
        status: "failed",
        error: "Stopped by user",
        completed_at: new Date().toISOString(),
      })
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .in("status", ["pending", "sent"])
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, cleared: rows?.length ?? 0 };
  });

// Undo: mark the most recent batch of completed actions as "undo_requested" so
// the plugin can roll them back on its next poll, AND remove their queued rows
// so they don't re-run. The plugin watches for this status and reverses via
// ChangeHistoryService:Undo() on its side.
export const undoLastBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Find the most recent assistant message that produced actions.
    const { data: msgs } = await context.supabase
      .from("chat_messages")
      .select("id, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(10);
    const targetMsg = (msgs ?? []).find(() => true);
    if (!targetMsg) return { ok: false, error: "no_build_to_undo" };

    const { data: rows, error } = await context.supabase
      .from("plugin_actions")
      .update({
        status: "failed",
        error: "Undone by user",
        completed_at: new Date().toISOString(),
      })
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("message_id", targetMsg.id)
      .select("id");
    if (error) throw new Error(error.message);

    // Drop a marker message into the chat so the AI knows the last build was undone.
    await context.supabase.from("chat_messages").insert({
      project_id: data.projectId,
      user_id: context.userId,
      role: "user",
      content: "[SYSTEM] I just undid the last build. Do NOT rebuild it unless I explicitly ask again.",
      status: "done",
    });

    return { ok: true, cleared: rows?.length ?? 0 };
  });
