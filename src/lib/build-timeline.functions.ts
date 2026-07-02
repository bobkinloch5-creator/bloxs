// AI Build Timeline server functions: list, save (queue snapshot), restore, delete.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectInput = z.object({ projectId: z.string().uuid() });

export const listBuildMilestones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("build_milestones")
      .select("id, label, summary, kind, parts_count, scripts_count, gui_count, size_bytes, place_id, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { ok: false as const, error: error.message, milestones: [] };
    return { ok: true as const, milestones: rows ?? [] };
  });

export const createBuildMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      label: z.string().min(1).max(80).default("Milestone"),
      summary: z.string().max(400).optional().default(""),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("plugin_actions").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: "snapshot",
      parent_path: "Workspace",
      name: `Snapshot: ${data.label}`,
      payload: { label: data.label, summary: data.summary, kind: "manual" },
      position: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreBuildMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid(),
      createBackupFirst: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: ms, error: e0 } = await sb
      .from("build_milestones")
      .select("id, label")
      .eq("id", data.milestoneId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!ms) throw new Error("Milestone not found");

    const queue: any[] = [];
    if (data.createBackupFirst) {
      queue.push({
        project_id: data.projectId,
        user_id: context.userId,
        kind: "snapshot",
        parent_path: "Workspace",
        name: `Auto-backup before restoring ${ms.label}`,
        payload: {
          label: `Before restoring "${ms.label}"`,
          summary: `Automatic safety backup`,
          kind: "pre_restore",
        },
        position: 0,
      });
    }
    queue.push({
      project_id: data.projectId,
      user_id: context.userId,
      kind: "restore_snapshot",
      parent_path: "Workspace",
      name: `Restore: ${ms.label}`,
      payload: { milestone_id: ms.id, label: ms.label },
      position: queue.length,
    });

    const { error } = await sb.from("plugin_actions").insert(queue);
    if (error) throw new Error(error.message);
    return { ok: true, queued: queue.length };
  });

export const deleteBuildMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ milestoneId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("build_milestones")
      .delete()
      .eq("id", data.milestoneId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
