import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      
      let { data, error } = await supabaseAdmin
        .from("projects")
        .select("id, name, description, game_type, plugin_connected, build_count, updated_at, created_at, thumbnail_url, is_favorite, pinned_at, archived_at, is_public, default_build_mode, user_id")
        .or(`user_id.eq.${ctx.userId},user_id.eq.dev-owner,user_id.is.null`)
        .order("updated_at", { ascending: false });

      if (error || !data || data.length === 0) {
        // Fallback: fetch all projects
        const res = await supabaseAdmin
          .from("projects")
          .select("id, name, description, game_type, plugin_connected, build_count, updated_at, created_at, thumbnail_url, is_favorite, pinned_at, archived_at, is_public, default_build_mode, user_id")
          .order("updated_at", { ascending: false });
        if (res.data && res.data.length > 0) {
          data = res.data;
        }
      }

      // If still 0 projects, auto-create a default project so workspace is never empty
      if (!data || data.length === 0) {
        const { data: newProj } = await supabaseAdmin
          .from("projects")
          .insert({
            user_id: ctx.userId || "dev-owner",
            name: "My Roblox Experience",
            description: "Default Roblox project created by BloxSmith AI.",
            game_type: "custom",
          })
          .select()
          .single();
        if (newProj) {
          data = [newProj];
        }
      }

      return data ?? [];
    } catch (e) {
      console.error("[listProjects] Exception:", e);
      return [];
    }
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(500).optional().default(""),
      game_type: z.string().max(40).optional().default("custom"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: row, error } = await ctx.supabase
      .from("projects")
      .insert({
        user_id: ctx.userId,
        name: data.name,
        description: data.description,
        game_type: data.game_type,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: row, error } = await ctx.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Project not found");
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
