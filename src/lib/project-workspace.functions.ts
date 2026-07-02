import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

// ---------- Rename / update settings ----------
export const updateProjectSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: uuid,
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(2000).optional(),
    thumbnail_url: z.string().max(1_500_000).nullable().optional(), // allow data URLs
    is_public: z.boolean().optional(),
    default_build_mode: z.enum(["fast", "smart", "deep"]).optional(),
    default_execution_mode: z.enum(["safe", "fast", "owner"]).optional(),
    default_model: z.string().max(80).nullable().optional(),
    default_language: z.string().max(20).nullable().optional(),
    roblox_place_id: z.number().int().nullable().optional(),
    roblox_universe_id: z.number().int().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error, data: row } = await context.supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Toggle flags ----------
export const toggleProjectFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ is_favorite: data.value })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleProjectPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ pinned_at: data.value ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleProjectArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ archived_at: data.value ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Duplicate ----------
export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("projects").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !src) throw new Error(e1?.message ?? "Project not found");

    const { data: copy, error: e2 } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        name: `${src.name} (Copy)`,
        description: src.description ?? "",
        game_type: src.game_type,
        thumbnail_url: src.thumbnail_url,
        default_build_mode: src.default_build_mode,
        default_execution_mode: src.default_execution_mode,
        default_model: src.default_model,
        default_language: src.default_language,
      })
      .select().single();
    if (e2) throw new Error(e2.message);

    // Copy assets + memory (not chat/history)
    const { data: assets } = await context.supabase
      .from("project_assets").select("kind, prompt, data_url, meta").eq("project_id", data.id);
    if (assets?.length) {
      await (context.supabase.from("project_assets") as any).insert(
        assets.map((a: any) => ({ ...a, project_id: copy.id, user_id: context.userId })),
      );
    }
    const { data: memory } = await context.supabase
      .from("project_memory").select("key, value, kind, importance").eq("project_id", data.id);
    if (memory?.length) {
      await (context.supabase.from("project_memory") as any).insert(
        memory.map((m: any) => ({ ...m, project_id: copy.id, user_id: context.userId })),
      );
    }
    return copy;
  });

// ---------- Export / Import ----------
export const exportProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const [proj, assets, memory, builds] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("project_assets").select("*").eq("project_id", data.id),
      context.supabase.from("project_memory").select("*").eq("project_id", data.id),
      context.supabase.from("build_history").select("*").eq("project_id", data.id).limit(200),
    ]);
    if (proj.error || !proj.data) throw new Error(proj.error?.message ?? "Project not found");
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      project: proj.data,
      assets: assets.data ?? [],
      memory: memory.data ?? [],
      builds: builds.data ?? [],
    };
  });

export const importProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    payload: z.object({
      project: z.record(z.any()),
      assets: z.array(z.record(z.any())).optional().default([]),
      memory: z.array(z.record(z.any())).optional().default([]),
    }),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const src: any = data.payload.project;
    const { data: copy, error } = await context.supabase.from("projects").insert({
      user_id: context.userId,
      name: `${src.name ?? "Imported project"} (Imported)`,
      description: src.description ?? "",
      game_type: src.game_type ?? "custom",
      thumbnail_url: src.thumbnail_url ?? null,
      default_build_mode: src.default_build_mode ?? "smart",
      default_execution_mode: src.default_execution_mode ?? "safe",
    }).select().single();
    if (error) throw new Error(error.message);

    if (data.payload.assets.length) {
      await (context.supabase.from("project_assets") as any).insert(
        data.payload.assets.map((a: any) => ({
          project_id: copy.id, user_id: context.userId,
          kind: String(a.kind ?? "asset"),
          prompt: String(a.prompt ?? ""),
          data_url: String(a.data_url ?? a.url ?? ""),
          meta: a.meta ?? {},
        })),
      );
    }
    if (data.payload.memory.length) {
      await (context.supabase.from("project_memory") as any).insert(
        data.payload.memory.map((m: any) => ({
          project_id: copy.id, user_id: context.userId,
          key: String(m.key ?? "note"),
          value: String(m.value ?? ""),
          kind: m.kind ?? undefined,
          importance: typeof m.importance === "number" ? m.importance : undefined,
        })),
      );
    }
    return copy;
  });

// ---------- Statistics ----------
type CountableTable =
  | "build_history" | "chat_messages" | "plugin_actions" | "project_assets"
  | "model_generations" | "ui_generations" | "studio_errors" | "build_milestones";

export const getProjectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const pid = data.id;
    const count = async (table: CountableTable, extra?: (q: any) => any) => {
      let q: any = context.supabase.from(table).select("id", { count: "exact", head: true }).eq("project_id", pid);
      if (extra) q = extra(q);
      const { count: c } = await q;
      return c ?? 0;
    };
    const [
      builds, messages, actions, scripts, assets, models, uiGens, errors, milestones,
    ] = await Promise.all([
      count("build_history"),
      count("chat_messages"),
      count("plugin_actions"),
      count("plugin_actions", (q) => q.in("kind", ["script", "localscript", "modulescript"])),
      count("project_assets"),
      count("model_generations"),
      count("ui_generations"),
      count("studio_errors"),
      count("build_milestones"),
    ]);
    const { data: proj } = await context.supabase
      .from("projects").select("created_at, updated_at").eq("id", pid).maybeSingle();
    return {
      builds, messages, actions, scripts, assets, models, uiGens, errors, milestones,
      created_at: proj?.created_at ?? null,
      updated_at: proj?.updated_at ?? null,
    };
  });
