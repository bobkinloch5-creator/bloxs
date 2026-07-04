// Template marketplace — always free.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const listTemplates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({
      category: z.string().max(40).nullable().default(null),
      limit: z.number().min(1).max(60).default(30),
    }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    let q = sb
      .from("game_templates")
      .select("id,user_id,title,description,category,cover_url,downloads,created_at")
      .eq("is_public", true)
      .order("downloads", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) return { templates: [], error: error.message };
    return { templates: rows ?? [], error: null };
  });

export const getTemplate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("game_templates")
      .select("*")
      .eq("id", data.id)
      .eq("is_public", true)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const PublishSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  category: z.string().max(40).default("other"),
  prompt: z.string().max(4000).default(""),
  actionsJson: z.any().default([]),
  coverUrl: z.string().url().nullable().optional(),
});

export const publishTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("game_templates")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description,
        category: data.category,
        prompt: data.prompt,
        actions_json: data.actionsJson,
        cover_url: data.coverUrl ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Install a template into the caller's project: queues its actions to plugin_actions.
export const installTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ templateId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tpl, error: te } = await context.supabase
      .from("game_templates")
      .select("actions_json,title")
      .eq("id", data.templateId)
      .eq("is_public", true)
      .single();
    if (te || !tpl) throw new Error(te?.message ?? "Template not found");
    const actions = Array.isArray(tpl.actions_json) ? (tpl.actions_json as Array<Record<string, unknown>>) : [];
    if (actions.length === 0) return { ok: true, queued: 0 };
    const rows = actions.map((a) => ({
      project_id: data.projectId,
      user_id: context.userId,
      kind: String(a?.kind ?? "run_lua"),
      name: String(a?.name ?? `Template: ${tpl.title}`),
      parent_path: String(a?.parent_path ?? "Workspace"),
      payload: (a?.payload ?? {}) as Record<string, unknown>,
      status: "pending" as const,
    }));
    const { error } = await context.supabase.from("plugin_actions").insert(rows as never);
    if (error) throw new Error(error.message);
    return { ok: true, queued: rows.length };
  });

