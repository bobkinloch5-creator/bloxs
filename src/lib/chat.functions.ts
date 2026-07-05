import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizePluginAction } from "@/lib/plugin-actions";
import { sanitizeInsertAssetActions } from "@/lib/roblox-toolbox.server";
import { stripCodeFences, validateLuau, autoFixLuau } from "@/lib/luau-validator";

const SCRIPT_ACTION_KINDS = new Set(["script", "localscript", "modulescript", "run_lua"]);

function preparedActionPayload(action: {
  payload?: unknown;
  source?: unknown;
  code?: unknown;
  lua?: unknown;
  luau?: unknown;
  script?: unknown;
}) {
  const payload = action.payload && typeof action.payload === "object" ? { ...(action.payload as Record<string, unknown>) } : {};
  if (!(typeof payload.source === "string" && payload.source.trim())) {
    const alt = action.source ?? action.code ?? action.lua ?? action.luau ?? action.script ?? payload.code ?? payload.lua ?? payload.luau ?? payload.script;
    if (typeof alt === "string" && alt.trim()) payload.source = alt;
  }
  return payload;
}

function pickPreparedActionKind(action: { kind?: string; action?: string; type?: string; payload?: unknown; source?: unknown; code?: unknown; lua?: unknown; luau?: unknown; script?: unknown; asset_id?: unknown; assetId?: unknown }) {
  const explicitKind = typeof action.kind === "string" && action.kind.trim() ? action.kind.trim() : undefined;
  if (explicitKind) return explicitKind;
  const actionValue = typeof action.action === "string" && action.action.trim() ? action.action.trim() : undefined;
  const typeValue = typeof action.type === "string" && action.type.trim() ? action.type.trim() : undefined;
  const actionIsVerb = actionValue ? /^(create|add|make|build|insert|update|edit|patch|set|generate|write|spawn)$/i.test(actionValue) : false;
  if (typeValue && (!actionValue || actionIsVerb)) return typeValue;
  if (actionValue && !actionIsVerb) return actionValue;
  if (typeValue) return typeValue;
  const payload = preparedActionPayload(action);
  if (actionIsVerb && (action.asset_id ?? action.assetId ?? payload.asset_id ?? payload.assetId) !== undefined) return "insert_asset";
  return typeof payload.source === "string" && payload.source.trim() ? "script" : "";
}

function scriptValidationErrors(action: { kind?: string; name?: string; payload?: Record<string, unknown> }) {
  if (!SCRIPT_ACTION_KINDS.has(String(action.kind ?? ""))) return [];
  const source = stripCodeFences(String(action.payload?.source ?? ""));
  const errors = validateLuau(source).filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const executable = source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  if (executable.length < 25 || /TODO|placeholder|add your code here|simple server script is running/i.test(source)) {
    errors.unshift("Script source is empty, placeholder, comment-only, or too small to be executable.");
  }
  return errors;
}

async function repairPreparedScriptActions<T extends { kind?: string; name?: string; parent_path?: string; payload?: Record<string, unknown> }>(actions: T[]) {
  // First pass: cheap deterministic autofix (JSON-style tables → Luau,
  // deprecated globals, stray markdown fences). Fixes the most common LLM
  // slip-ups without a model round-trip so builds don't stall.
  for (const action of actions) {
    if (!SCRIPT_ACTION_KINDS.has(String(action.kind ?? ""))) continue;
    const rawSource = action.payload?.source;
    if (typeof rawSource !== "string" || !rawSource.trim()) continue;
    const { source, fixes } = autoFixLuau(rawSource);
    if (fixes.length > 0 && source !== rawSource) {
      action.payload = { ...(action.payload ?? {}), source };
      console.info("[chat.functions] autoFixLuau applied", { name: action.name, fixes });
    }
  }

  const invalid = actions
    .map((action) => ({ action, errors: scriptValidationErrors(action) }))
    .filter((entry) => entry.errors.length > 0)
    .slice(0, 12);
  if (invalid.length === 0) return actions;

  try {
    const { generateLuauReplacementWithNvidia } = await import("@/lib/nvidia-critique.server");
    const repaired = await Promise.allSettled(invalid.map(({ action, errors }) =>
      generateLuauReplacementWithNvidia({
        issues: errors.map((message) => ({ severity: "error", message })),
        actionName: action.name,
        actionKind: action.kind,
        parentPath: action.parent_path,
        userRequest: String(action.payload?.request ?? action.payload?.userRequest ?? action.name ?? "Roblox Studio script"),
      })
    ));
    repaired.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        invalid[index].action.payload = { ...(invalid[index].action.payload ?? {}), source: result.value };
      }
    });
  } catch (error) {
    console.warn("[chat.functions] prepared script repair failed", error);
  }

  return actions.filter((action) => {
    const errors = scriptValidationErrors(action);
    if (errors.length > 0) {
      console.error("[chat.functions] blocked invalid prepared script before Studio queue", { kind: action.kind, name: action.name, errors });
      return false;
    }
    return true;
  });
}

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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

function compareVersions(current?: string | null, required?: string | null) {
  const parse = (value?: string | null) => String(value ?? "")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D+/g, ""), 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const a = parse(current);
  const b = parse(required);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

const MIN_FAST_POLL_PLUGIN_VERSION = "2.1.20";

export const getBuildExecutionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: msgs } = await context.supabase
      .from("chat_messages")
      .select("id, status, error, created_at, actions")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(10);

    const msg = (msgs ?? []).find((row) => {
      const actionCount = Array.isArray(row.actions) ? row.actions.length : 0;
      return actionCount > 0 || row.status === "sending" || row.status === "failed";
    });

    if (!msg) return { state: "idle" as const, message: "No build has been sent yet." };

    const { data: actions, error } = await context.supabase
      .from("plugin_actions")
      .select("id, kind, name, status, error, created_at, sent_at, completed_at")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("message_id", msg.id)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: session } = await context.supabase
      .from("plugin_sessions")
      .select("last_seen, online, plugin_version")
      .eq("user_id", context.userId)
      .maybeSingle();
    const pluginOnline = !!(
      session?.online &&
      session?.last_seen &&
      Date.now() - new Date(session.last_seen).getTime() < 30_000
    );
    const pluginVersion = session?.plugin_version ?? null;
    const pluginOutdated = pluginOnline && compareVersions(pluginVersion, MIN_FAST_POLL_PLUGIN_VERSION) < 0;

    const rows = actions ?? [];
    const total = rows.length;
    const sent = rows.filter((a) => !!a.sent_at || a.status === "sent" || a.status === "done" || a.status === "failed").length;
    const done = rows.filter((a) => a.status === "done").length;
    const failedRows = rows.filter((a) => a.status === "failed");
    const failed = failedRows.length;
    const pending = rows.filter((a) => a.status === "pending").length;
    const inFlight = rows.filter((a) => a.status === "sent").length;
    const firstCreated = rows[0]?.created_at ?? msg.created_at;
    const newestCompleted = rows.reduce<string | null>((latest, a) => {
      if (!a.completed_at) return latest;
      if (!latest || new Date(a.completed_at).getTime() > new Date(latest).getTime()) return a.completed_at;
      return latest;
    }, null);
    const ageMs = Date.now() - new Date(firstCreated).getTime();
    const durationMs = newestCompleted ? Math.max(0, new Date(newestCompleted).getTime() - new Date(firstCreated).getTime()) : null;
    const errors = failedRows.map((a) => `${a.kind} ${a.name}: ${a.error || "failed"}`).slice(0, 8);

    let state: "idle" | "queued" | "sent" | "done" | "failed" | "stalled" = "queued";
    let message = `${total} action(s) ready for Studio.`;
    if (total === 0) {
      // No plugin_actions were tied to this assistant message. That's only a
      // failure if the message itself failed — otherwise it's a chat-only
      // reply (or a Toolbox/Smart-picker insert queued outside the chat turn)
      // and should NOT surface as a red "Build failed" banner in the chat.
      const msgStatus = String((msg as { status?: string }).status ?? "");
      const msgError = String((msg as { error?: string }).error ?? "");
      if (msgStatus === "failed") {
        state = "failed";
        message = msgError ? `Build failed: ${msgError}` : "Build failed.";
      } else if (msgStatus === "sending") {
        state = "queued";
        message = "Preparing Studio actions…";
      } else {
        state = "done";
        message = "No Studio actions needed for that reply.";
      }
    } else if (failed > 0) {
      state = "failed";
      message = `Build failed: ${failed} of ${total} action(s) failed.`;
    } else if (done === total) {
      state = "done";
      message = `Studio executed ${done} of ${total} action(s).`;
    } else if (sent > 0) {
      state = ageMs > 120_000 ? "stalled" : "sent";
      message = state === "stalled"
        ? `Studio received ${sent} action(s), but they did not finish.`
        : `Studio is executing ${sent} of ${total} action(s).`;
    } else if (pending > 0 && pluginOutdated) {
      state = "stalled";
      message = `Your Studio plugin is v${pluginVersion}; update to v${MIN_FAST_POLL_PLUGIN_VERSION}+ so new builds execute immediately.`;
    } else if (pending > 0 && !pluginOnline && ageMs > 20_000) {
      state = "stalled";
      message = `Studio is not connected. Open the BloxSmith plugin in Roblox Studio, then click Execute Now.`;
    } else if (pending > 0 && ageMs > 30_000) {
      state = "stalled";
      message = `Studio has not picked up ${pending} action(s). Click Execute Now in Studio or on this page.`;
    }


    return { state, message, total, sent, done, failed, pending, inFlight, durationMs, errors, pluginOnline, pluginVersion, pluginOutdated, actions: rows.slice(0, 20) };
  });

export const executeQueuedActionsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: latestAction, error: latestError } = await context.supabase
      .from("plugin_actions")
      .select("message_id, project_id, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(latestError.message);

    let pendingQuery = context.supabase
      .from("plugin_actions")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .limit(200);
    if (latestAction?.message_id) pendingQuery = pendingQuery.eq("message_id", latestAction.message_id);
    const { data: pendingRows, error: pendingError } = await pendingQuery;
    if (pendingError) throw new Error(pendingError.message);

    // If Studio missed a delivery, re-arm sent actions so the next plugin poll
    // executes them instead of leaving the user stuck. A short grace period
    // avoids duplicating actions that Studio is actively processing.
    const staleCutoff = new Date(Date.now() - 20_000).toISOString();
    let rearmQuery = context.supabase
      .from("plugin_actions")
      .update({ status: "pending", sent_at: null, completed_at: null, error: null })
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("status", "sent")
      .lt("sent_at", staleCutoff)
      .select("id");
    if (latestAction?.message_id) rearmQuery = rearmQuery.eq("message_id", latestAction.message_id);
    const { data: rearmedRows, error: rearmError } = await rearmQuery;
    if (rearmError) throw new Error(rearmError.message);

    const pending = pendingRows?.length ?? 0;
    const rearmed = rearmedRows?.length ?? 0;
    return { ok: true, pending, rearmed, totalReady: pending + rearmed };
  });

export const queuePluginCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
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
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    executionMode: z.enum(["safe", "fast", "owner"]).optional().default("fast"),
    actions: z.array(z.object({
      kind: z.string().trim().min(1).max(80).optional(),
      action: z.string().trim().min(1).max(80).optional(),
      type: z.string().trim().min(1).max(80).optional(),
      parent_path: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? "Workspace" : v),
        z.string().trim().min(1).max(400),
      ).default("Workspace"),
      parent: z.string().trim().min(1).max(400).optional(),
      target_parent_path: z.string().trim().min(1).max(400).optional(),
      target_parent: z.string().trim().min(1).max(400).optional(),
      name: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? "BloxSmithAction" : v),
        z.string().trim().min(1).max(160),
      ).default("BloxSmithAction"),
      payload: z.any().optional(),
      source: z.string().optional(),
      code: z.string().optional(),
      lua: z.string().optional(),
      luau: z.string().optional(),
      script: z.string().optional(),
      asset_id: z.union([z.string(), z.number()]).optional(),
      assetId: z.union([z.string(), z.number()]).optional(),
      fallback_ids: z.any().optional(),
      fallbackIds: z.any().optional(),
      target_path: z.string().optional(),
      target: z.string().optional(),
      asset_name: z.string().optional(),
      source_query: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    }).passthrough()).min(1).max(80),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const normalizedInputActions = data.actions
      .map((action) => ({ ...action, kind: pickPreparedActionKind(action), payload: preparedActionPayload(action) }))
      .filter((action) => action.kind);
    const normalizedActions = await repairPreparedScriptActions(normalizedInputActions.map(normalizePluginAction));
    if (normalizedActions.length === 0) {
      throw new Error("No valid Studio actions were generated. Please resend the build request so BloxSmith can regenerate it instead of sending empty scripts.");
    }
    const { data: recent } = await context.supabase
      .from("plugin_actions")
      .select("id, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(normalizedActions.length);
    const newest = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
    if ((recent?.length ?? 0) >= normalizedActions.length && Date.now() - newest < 30_000) {
      return { ok: true, count: recent?.length ?? 0, alreadyQueued: true };
    }

    const sanitizedActions = normalizedActions as Array<typeof normalizedActions[number] & Record<string, unknown>>;
    await sanitizeInsertAssetActions(sanitizedActions as unknown as Array<Record<string, unknown>>);

    const { error } = await context.supabase.from("plugin_actions").insert(
      sanitizedActions.map((action, i) => ({
        project_id: data.projectId,
        user_id: context.userId,
        kind: action.kind,
        parent_path: action.parent_path,
        name: action.name,
        payload: {
          ...(action.payload ?? {}),
          _bloxsmith: {
            execution_mode: data.executionMode,
            structured: true,
            safe_mode_preview: data.executionMode === "safe",
            owner_mode: data.executionMode === "owner",
            no_empty_folders: true,
            no_fake_assets: true,
            retry_failed_insertions: true,
            scan_inserted_scripts: true,
          },
        },
        position: i,
      })),
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: sanitizedActions.length };
  });

export const clearMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
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
