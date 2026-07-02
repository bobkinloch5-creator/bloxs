// Project Memory: persistent AI-readable facts about each project (lore,
// rules, characters, design decisions). The chat route reads these every
// turn and the AI can write to them via the `remember` tool.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListInput = z.object({ projectId: z.string().uuid() });
const SetInput = z.object({
  projectId: z.string().uuid(),
  key: z.string().min(1).max(80),
  value: z.string().min(1).max(2000),
  kind: z.enum(["lore", "rule", "decision", "character", "system", "style"]).optional(),
  importance: z.number().int().min(1).max(10).optional(),
});
const DeleteInput = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

export const listProjectMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_memory")
      .select("id, key, value, kind, importance, updated_at")
      .eq("project_id", data.projectId)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { memories: rows ?? [] };
  });

export const setProjectMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_memory")
      .upsert(
        {
          project_id: data.projectId,
          user_id: context.userId,
          key: data.key,
          value: data.value,
          kind: data.kind ?? "lore",
          importance: data.importance ?? 5,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_memory")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
