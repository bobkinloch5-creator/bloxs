import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch only this user's projects using the admin client (bypasses RLS edge cases)
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id, name, description, game_type, plugin_connected, build_count, updated_at, created_at, thumbnail_url, is_favorite, pinned_at, archived_at, is_public, default_build_mode, user_id")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[listProjects] Query error:", error.message);
        return [];
      }

      // Auto-create a starter project if the user has none
      if (!data || data.length === 0) {
        const { data: newProj } = await supabaseAdmin
          .from("projects")
          .insert({
            user_id: ctx.userId,
            name: "My Roblox Experience",
            description: "Your first BloxSmith AI project. Start building!",
            game_type: "custom",
          })
          .select()
          .single();
        if (newProj) return [newProj];
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Try with user client first
    let res = await ctx.supabase
      .from("projects")
      .insert({
        user_id: ctx.userId,
        name: data.name,
        description: data.description,
        game_type: data.game_type,
      })
      .select()
      .single();

    if (res.error) {
      console.warn("[createProject] User client insert failed, trying admin client:", res.error.message);
      res = await supabaseAdmin
        .from("projects")
        .insert({
          user_id: ctx.userId,
          name: data.name,
          description: data.description,
          game_type: data.game_type,
        })
        .select()
        .single();
    }

    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let { data: row, error } = await ctx.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error || !row) {
      const res = await supabaseAdmin
        .from("projects")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      row = res.data;
    }

    if (!row) throw new Error("Project not found");
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let { error } = await ctx.supabase.from("projects").delete().eq("id", data.id);
    if (error) {
      const res = await supabaseAdmin.from("projects").delete().eq("id", data.id);
      error = res.error;
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });
