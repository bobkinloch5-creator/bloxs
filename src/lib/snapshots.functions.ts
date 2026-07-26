// Build snapshots / undo / checkpoints — free for all users.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().min(1).max(120).default("Auto snapshot"),
  kind: z.enum(["auto", "manual", "checkpoint"]).default("manual"),
  workspaceJson: z.any().optional(),
});

export const createSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const payload = data.workspaceJson ?? {};
    const size = JSON.stringify(payload).length;
    const { data: row, error } = await ctx.supabase
      .from("build_snapshots")
      .insert({
        project_id: data.projectId,
        user_id: ctx.userId,
        label: data.label,
        kind: data.kind,
        workspace_json: payload,
        size_bytes: size,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: rows, error } = await ctx.supabase
      .from("build_snapshots")
      .select("id,label,kind,size_bytes,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: row, error } = await ctx.supabase
      .from("build_snapshots")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.from("build_snapshots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Queue a restore action for the plugin to consume. Actual restore runs
// in the Studio plugin when it polls plugin_actions.
export const restoreSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: snap, error: se } = await ctx.supabase
      .from("build_snapshots")
      .select("workspace_json,label")
      .eq("id", data.id)
      .single();
    if (se || !snap) throw new Error(se?.message ?? "Snapshot not found");
    const { error } = await ctx.supabase.from("plugin_actions").insert({
      project_id: data.projectId,
      user_id: ctx.userId,
      kind: "restore_snapshot",
      name: `Restore: ${snap.label}`,
      parent_path: "Workspace",
      payload: { snapshot: snap.workspace_json },
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
