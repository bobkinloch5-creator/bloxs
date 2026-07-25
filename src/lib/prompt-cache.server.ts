// System-prompt assembly cache.
//
// The build system prompt is the largest single input the endpoint sends. It is
// assembled from nine blocks on every request, and for the overwhelming
// majority of requests the leading blocks are byte-identical: the same mode,
// the same language, the same quality tier, the same asset mode.
//
// This module does two things:
//
//   1. Memoizes the assembled static prefix so identical request shapes reuse
//      one string instead of rebuilding and re-allocating it.
//   2. Exposes hit/miss counters so caching behaviour is observable rather than
//      assumed.
//
// Deliberate scope note: this is process-local prefix caching. Token-level
// caching (Anthropic `cache_control`, which is what actually stops you paying
// for the same 1,800-line prompt on every turn) requires an Anthropic-native
// endpoint. The current gateways are OpenAI-compatible shims, and silently
// attaching provider-specific options to a shim that ignores them would look
// like a win while changing nothing. `anthropicCacheHint()` below builds the
// correct payload for when a native endpoint is available, and is intentionally
// not wired in until then.

export type PromptCacheStats = {
  hits: number;
  misses: number;
  entries: number;
  /** Approximate characters served from cache rather than rebuilt. */
  charsSaved: number;
};

const MAX_ENTRIES = 64;
const cache = new Map<string, string>();
let hits = 0;
let misses = 0;
let charsSaved = 0;

/** FNV-1a. Fast, stable across runs, and good enough to identify a prefix. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Return the assembled static prefix for a request shape, building it only the
 * first time that shape is seen.
 *
 * `key` must capture every input `build` depends on. Getting that wrong would
 * serve the wrong prompt to a request shape, so callers must key on primitives
 * only - never on user text.
 */
export function cachedPrefix(key: string, build: () => string): string {
  const existing = cache.get(key);
  if (existing !== undefined) {
    hits += 1;
    charsSaved += existing.length;
    // Refresh LRU position.
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  misses += 1;
  const built = build();
  cache.set(key, built);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return built;
}

export function promptCacheStats(): PromptCacheStats {
  return { hits, misses, entries: cache.size, charsSaved };
}

export function resetPromptCache() {
  cache.clear();
  hits = 0;
  misses = 0;
  charsSaved = 0;
}

/**
 * Build the Anthropic prompt-caching payload for a static prefix.
 *
 * Anthropic bills cached prefix reads at a fraction of input price, but only
 * for prefixes above a minimum length and only on native endpoints. Returns
 * null when caching would not apply, so callers can spread the result
 * unconditionally.
 */
export function anthropicCacheHint(
  prefix: string,
  modelId: string,
  minChars = 4000,
): { anthropic: { cacheControl: { type: "ephemeral" } } } | null {
  if (!/claude/i.test(modelId)) return null;
  if (prefix.length < minChars) return null;
  return { anthropic: { cacheControl: { type: "ephemeral" } } };
}
