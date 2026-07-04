// Server-only sliding-window rate limiter backed by public.rate_limits.
// Callers should catch RateLimitError and surface a friendly toast.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class RateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type LimitOpts = {
  userId: string;
  action: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Increment the counter for (userId, action) within the current window and
 * throw RateLimitError when the caller exceeds `limit` requests.
 *
 * Cheap best-effort implementation: uses a single row per (user, action) that
 * rolls over when the window expires. Do NOT use for money-critical limits.
 */
export async function enforceRateLimit({ userId, action, limit, windowSeconds }: LimitOpts): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  const { data: existing } = await supabaseAdmin
    .from("rate_limits")
    .select("id, count, window_start")
    .eq("user_id", userId)
    .eq("action", action)
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const windowStart = existing ? new Date((existing as any).window_start).getTime() : 0;
  const stillInWindow = existing && now - windowStart < windowMs;

  if (stillInWindow) {
    const nextCount = ((existing as any).count as number) + 1;
    if (nextCount > limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
      throw new RateLimitError(
        `Rate limit reached for "${action}". Retry in ${retryAfter}s.`,
        retryAfter,
      );
    }
    await supabaseAdmin
      .from("rate_limits")
      .update({ count: nextCount, updated_at: new Date().toISOString() })
      .eq("id", (existing as any).id);
    return;
  }

  await supabaseAdmin.from("rate_limits").insert({
    user_id: userId,
    action,
    count: 1,
    window_start: new Date(now).toISOString(),
  });
}

/** Sensible presets keyed by action name. */
export const RATE_LIMITS = {
  ai_prompt: { limit: 120, windowSeconds: 60 },
  ai_build: { limit: 60, windowSeconds: 60 },
  image_gen: { limit: 40, windowSeconds: 60 },
  plugin_action: { limit: 600, windowSeconds: 60 },
  asset_search: { limit: 240, windowSeconds: 60 },
  file_upload: { limit: 30, windowSeconds: 60 },
  auth_attempt: { limit: 8, windowSeconds: 300 },

  auth_attempt: { limit: 8, windowSeconds: 300 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export async function enforce(userId: string, key: RateLimitKey): Promise<void> {
  const cfg = RATE_LIMITS[key];
  await enforceRateLimit({ userId, action: key, ...cfg });
}
