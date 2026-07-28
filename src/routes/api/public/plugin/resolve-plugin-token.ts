// Shared plugin token → profile resolver used by all plugin API endpoints.
// A plugin token must resolve to the account that approved it. Never fall back
// to another account: that makes a broken pairing look connected while queued
// Studio actions are read from the wrong user.
import { createClient } from "@supabase/supabase-js";

// In-memory cache to avoid hammering Supabase on every poll/heartbeat/error
const cache = new Map<string, { id: string; fetchedAt: number }>();
const CACHE_TTL = 180_000; // 3 minutes

export function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Resolve a plugin_token string to a profile { id }.
 * Returns null when the token is not a current, approved pairing.
 */
export async function resolvePluginToken(
  token: string,
  opts?: { force?: boolean },
): Promise<{ id: string } | null> {
  if (!token) return null;

  // Cache hit?
  if (!opts?.force) {
    const hit = cache.get(token);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) {
      return { id: hit.id };
    }
  } else {
    cache.delete(token);
  }

  const sb = adminClient();

  // 1. Primary: profiles.plugin_token
  const { data: profile } = await sb
    .from("profiles")
    .select("id, banned")
    .eq("plugin_token", token)
    .maybeSingle();
  if (profile) {
    if (profile.banned) return null;
    cache.set(token, { id: profile.id, fetchedAt: Date.now() });
    return { id: profile.id };
  }

  // 2. Fallback: plugin_pair_codes.plugin_token → user_id → check if profile exists & not banned
  const { data: pairCode } = await sb
    .from("plugin_pair_codes")
    .select("user_id")
    .eq("plugin_token", token)
    .maybeSingle();
  if (pairCode?.user_id) {
    const { data: userProfile } = await sb
      .from("profiles")
      .select("id, banned")
      .eq("id", pairCode.user_id)
      .maybeSingle();

    if (userProfile) {
      if (userProfile.banned) return null;
      // Sync the token to the profile so the primary path works next time
      await sb
        .from("profiles")
        .update({ plugin_token: token })
        .eq("id", userProfile.id);
      cache.set(token, { id: userProfile.id, fetchedAt: Date.now() });
      return { id: userProfile.id };
    }
  }

  return null;
}
