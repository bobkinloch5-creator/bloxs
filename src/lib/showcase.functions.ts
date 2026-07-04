// Showcase gallery — free public game gallery.
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

export const listShowcase = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(60).default(30) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb
      .from("showcase_posts")
      .select("id,user_id,title,description,cover_url,roblox_place_id,tags,likes,views,created_at")
      .eq("is_published", true)
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) return { posts: [], error: error.message };
    return { posts: rows ?? [], error: null };
  });

const PublishSchema = z.object({
  projectId: z.string().uuid().nullable(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  coverUrl: z.string().url().nullable().optional(),
  robloxPlaceId: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().min(1).max(24)).max(6).default([]),
});

export const publishShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("showcase_posts")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        title: data.title,
        description: data.description,
        cover_url: data.coverUrl ?? null,
        roblox_place_id: data.robloxPlaceId ?? null,
        tags: data.tags,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const likeShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("showcase_likes")
      .insert({ post_id: data.postId, user_id: context.userId });
    if (error && !/duplicate|conflict/i.test(error.message)) throw new Error(error.message);
    // Denorm bump handled by the app on read side; skip RPC.

    return { ok: true };
  });

export const unlikeShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("showcase_likes")
      .delete()
      .eq("post_id", data.postId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
