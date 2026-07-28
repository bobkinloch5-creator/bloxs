// Showcase gallery — free public game gallery & community hub.
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

export type ShowcasePostAuthor = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  roblox_username: string | null;
};

export type ShowcasePostItem = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string;
  cover_url: string | null;
  roblox_place_id: number | null;
  tags: string[];
  likes: number;
  views: number;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  author?: ShowcasePostAuthor | null;
  is_liked?: boolean;
};

// List all community showcase posts with search, tag filtering, sorting, and author details
export const listShowcase = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(100).default(48),
        query: z.string().optional(),
        tag: z.string().optional(),
        sortBy: z.enum(["trending", "newest", "most_liked", "most_viewed"]).default("trending"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();

    let queryBuilder = sb
      .from("showcase_posts")
      .select("id, user_id, project_id, title, description, cover_url, roblox_place_id, tags, likes, views, created_at, updated_at, is_published")
      .eq("is_published", true);

    if (data.tag && data.tag !== "All") {
      queryBuilder = queryBuilder.contains("tags", [data.tag]);
    }

    if (data.query && data.query.trim()) {
      const q = `%${data.query.trim()}%`;
      queryBuilder = queryBuilder.or(`title.ilike.${q},description.ilike.${q}`);
    }

    if (data.sortBy === "newest") {
      queryBuilder = queryBuilder.order("created_at", { ascending: false });
    } else if (data.sortBy === "most_liked") {
      queryBuilder = queryBuilder.order("likes", { ascending: false }).order("created_at", { ascending: false });
    } else if (data.sortBy === "most_viewed") {
      queryBuilder = queryBuilder.order("views", { ascending: false }).order("created_at", { ascending: false });
    } else {
      // Default: trending (likes + views priority)
      queryBuilder = queryBuilder.order("likes", { ascending: false }).order("views", { ascending: false }).order("created_at", { ascending: false });
    }

    const { data: rows, error } = await queryBuilder.limit(data.limit);
    if (error) return { posts: [], error: error.message };

    const posts = rows ?? [];
    if (posts.length === 0) return { posts: [], error: null };

    // Fetch author profile info for all unique user_ids
    const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, display_name, avatar_url, roblox_username")
      .in("id", userIds);

    const profileMap = new Map<string, ShowcasePostAuthor>();
    if (profiles) {
      for (const pr of profiles) {
        profileMap.set(pr.id, {
          username: pr.username,
          display_name: pr.display_name,
          avatar_url: pr.avatar_url,
          roblox_username: pr.roblox_username,
        });
      }
    }

    const enrichedPosts: ShowcasePostItem[] = posts.map((p) => ({
      ...p,
      author: profileMap.get(p.user_id) ?? null,
    }));

    return { posts: enrichedPosts, error: null };
  });

// Get a single showcase post details & record view
export const getShowcasePost = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: post, error } = await sb
      .from("showcase_posts")
      .select("*")
      .eq("id", data.postId)
      .single();

    if (error || !post) return { post: null, error: error?.message ?? "Post not found" };

    // Increment view count asynchronously
    await sb.from("showcase_posts").update({ views: (post.views ?? 0) + 1 }).eq("id", data.postId);

    // Fetch author profile
    const { data: authorProfile } = await sb
      .from("profiles")
      .select("username, display_name, avatar_url, roblox_username")
      .eq("id", post.user_id)
      .maybeSingle();

    return {
      post: {
        ...post,
        views: (post.views ?? 0) + 1,
        author: authorProfile ?? null,
      } as ShowcasePostItem,
      error: null,
    };
  });

// Fetch user's own projects to allow easy 1-click publishing from dashboard
export const getUserProjectsForShowcase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: projects, error } = await ctx.supabase
      .from("projects")
      .select("id, name, description, game_type, roblox_place_id, thumbnail_url, updated_at")
      .eq("user_id", ctx.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) return { projects: [], error: error.message };
    return { projects: projects ?? [], error: null };
  });

const PublishSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(2, "Title must be at least 2 characters").max(120, "Title cannot exceed 120 characters"),
  description: z.string().max(2000).default(""),
  coverUrl: z.string().url().nullable().optional().or(z.literal("")),
  robloxPlaceId: z.number().int().positive().nullable().optional(),
  robloxUrl: z.string().optional(),
  tags: z.array(z.string().min(1).max(24)).max(6).default([]),
});

export const publishShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;

    let placeId = data.robloxPlaceId ?? null;

    // Parse place ID from Roblox URL if provided
    if (!placeId && data.robloxUrl) {
      const match = data.robloxUrl.match(/games\/(\d+)/i) || data.robloxUrl.match(/placeId=(\d+)/i) || data.robloxUrl.match(/(\d{7,12})/);
      if (match) {
        placeId = parseInt(match[1], 10);
      }
    }

    let finalCoverUrl = data.coverUrl && data.coverUrl.trim() ? data.coverUrl.trim() : null;

    // If no cover URL provided but placeId exists, attempt to generate Roblox thumbnail URL
    if (!finalCoverUrl && placeId) {
      finalCoverUrl = `https://assetgame.roblox.com/Game/Tools/ThumbnailAsset.ashx?aid=${placeId}&fmt=png&wd=768&ht=432`;
    }

    const { data: row, error } = await ctx.supabase
      .from("showcase_posts")
      .insert({
        user_id: ctx.userId,
        project_id: data.projectId ?? null,
        title: data.title.trim(),
        description: data.description.trim(),
        cover_url: finalCoverUrl,
        roblox_place_id: placeId,
        tags: data.tags,
        is_published: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Award +10 bonus credits for publishing a game to the community showcase
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("credits")
      .eq("id", ctx.userId)
      .single();

    if (profile) {
      await ctx.supabase
        .from("profiles")
        .update({ credits: (profile.credits ?? 0) + 10 })
        .eq("id", ctx.userId);
    }

    return { post: row, bonusCredits: 10, error: null };
  });

export const deleteShowcasePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("showcase_posts")
      .delete()
      .eq("id", data.postId)
      .eq("user_id", ctx.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const likeShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("showcase_likes")
      .insert({ post_id: data.postId, user_id: ctx.userId });

    if (error && !/duplicate|conflict/i.test(error.message)) throw new Error(error.message);

    // Increment like count on showcase_posts
    const { data: post } = await ctx.supabase
      .from("showcase_posts")
      .select("likes")
      .eq("id", data.postId)
      .single();

    if (post) {
      await ctx.supabase
        .from("showcase_posts")
        .update({ likes: (post.likes ?? 0) + 1 })
        .eq("id", data.postId);
    }

    return { ok: true, likes: (post?.likes ?? 0) + 1 };
  });

export const unlikeShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("showcase_likes")
      .delete()
      .eq("post_id", data.postId)
      .eq("user_id", ctx.userId);

    if (error) throw new Error(error.message);

    // Decrement like count on showcase_posts
    const { data: post } = await ctx.supabase
      .from("showcase_posts")
      .select("likes")
      .eq("id", data.postId)
      .single();

    if (post && post.likes > 0) {
      await ctx.supabase
        .from("showcase_posts")
        .update({ likes: post.likes - 1 })
        .eq("id", data.postId);
    }

    return { ok: true, likes: Math.max(0, (post?.likes ?? 1) - 1) };
  });
