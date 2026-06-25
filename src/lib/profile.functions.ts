import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return data;

    // Auto-refill credits when the reset timer has expired (non-admins).
    if (!data.is_admin && data.credits_reset_at && new Date(data.credits_reset_at) <= new Date()) {
      const nextReset = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: refreshed } = await context.supabase
        .from("profiles")
        .update({ credits: data.max_credits, credits_reset_at: nextReset })
        .eq("id", context.userId)
        .select()
        .single();
      if (refreshed) return refreshed;
    }
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      display_name: z.string().max(60).optional(),
      bio: z.string().max(500).optional(),
      roblox_username: z.string().max(40).optional(),
      language: z.enum(["en", "es", "pt", "fr", "de"]).optional(),
      is_private: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regeneratePluginToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const newToken =
      "BS-" + Math.random().toString(36).slice(2, 8).toUpperCase() +
      Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await context.supabase
      .from("profiles")
      .update({ plugin_token: newToken })
      .eq("id", context.userId)
      .select("plugin_token")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
