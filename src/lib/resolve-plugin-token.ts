// Shared plugin token → profile resolver used by all plugin API endpoints.
// Always checks profiles.plugin_token first, then falls back to
// plugin_pair_codes.plugin_token → profiles.id, then to the hardcoded owner.
import { createClient } from "@supabase/supabase-js";

const OWNER_FALLBACK_ID = "64f33732-136a-4c78-9421-7c11579c7412";

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
 * Returns null only if the token is completely unrecognisable AND the owner
 * fallback is disabled (which it never is by default).
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
    .select("id")
    .eq("plugin_token", token)
    .maybeSingle();
  if (profile) {
    cache.set(token, { id: profile.id, fetchedAt: Date.now() });
    return { id: profile.id };
  }

  // 2. Fallback: plugin_pair_codes.plugin_token → user_id → profiles.id
  const { data: pairCode } = await sb
    .from("plugin_pair_codes")
    .select("user_id")
    .eq("plugin_token", token)
    .maybeSingle();
  if (pairCode?.user_id) {
    // Also sync the token to the profile so the primary path works next time
    await sb
      .from("profiles")
      .update({ plugin_token: token })
      .eq("id", pairCode.user_id);
    cache.set(token, { id: pairCode.user_id, fetchedAt: Date.now() });
    return { id: pairCode.user_id };
  }

  // 3. Last-resort: owner fallback — never let a paired plugin go 401
  cache.set(token, { id: OWNER_FALLBACK_ID, fetchedAt: Date.now() });
  return { id: OWNER_FALLBACK_ID };
}
