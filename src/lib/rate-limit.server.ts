// Per-user sliding-window rate limiting for expensive server functions.
//
// Generation endpoints are auth-gated but were otherwise unthrottled, so a
// single account could burn through the NVIDIA / Meshy keys. This keeps an
// in-memory window per (user, bucket) pair. It is per-instance, which is the
// right trade-off here: it costs nothing, needs no extra table, and stops the
// runaway-loop case that actually drains the keys.

export type RateLimitRule = {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export const RATE_LIMITS = {
  chat: { limit: 40, windowMs: 60_000 },
  ui_generate: { limit: 12, windowMs: 60_000 },
  model_generate: { limit: 6, windowMs: 300_000 },
  image_generate: { limit: 20, windowMs: 60_000 },
  build: { limit: 6, windowMs: 60_000 },
  toolbox_search: { limit: 60, windowMs: 60_000 },
  export: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

type Entry = { hits: number[] };

const store = new Map<string, Entry>();
let lastSweep = 0;

function sweep(now: number) {
  // Drop cold keys occasionally so the map cannot grow without bound.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  const cutoff = now - 600_000;
  for (const [key, entry] of store) {
    if (!entry.hits.some((t) => t > cutoff)) store.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Milliseconds until the window frees a slot. 0 when allowed. */
  retryAfterMs: number;
  resetAt: number;
};

/** Record a hit and report whether it is allowed. Does not throw. */
export function checkRateLimit(
  userId: string,
  bucket: RateLimitBucket,
  override?: Partial<RateLimitRule>,
): RateLimitResult {
  const rule = { ...RATE_LIMITS[bucket], ...(override ?? {}) };
  const now = Date.now();
  sweep(now);

  const key = `${bucket}:${userId}`;
  const entry = store.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < rule.windowMs);

  if (entry.hits.length >= rule.limit) {
    const oldest = entry.hits[0];
    const retryAfterMs = Math.max(0, rule.windowMs - (now - oldest));
    store.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      limit: rule.limit,
      retryAfterMs,
      resetAt: oldest + rule.windowMs,
    };
  }

  entry.hits.push(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - entry.hits.length),
    limit: rule.limit,
    retryAfterMs: 0,
    resetAt: now + rule.windowMs,
  };
}

function humanizeWait(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

/**
 * Error thrown when a caller is over the limit. Carries the reset time so the
 * client can render a live countdown.
 *
 * Server function errors only survive serialization as a message string, so the
 * same values are also appended as a compact marker that the client parses with
 * `parseRateLimitError` in `rate-limit-client.ts`. Keep the two in sync.
 */
export class RateLimitError extends Error {
  readonly bucket: RateLimitBucket;
  readonly limit: number;
  readonly retryAfterMs: number;
  readonly resetAt: number;

  constructor(bucket: RateLimitBucket, result: RateLimitResult) {
    super(
      `You are going a bit fast - that is ${result.limit} requests in a row. ` +
        `Try again in ${humanizeWait(result.retryAfterMs)}. ` +
        `[[rl:${bucket}:${result.resetAt}:${result.limit}]]`,
    );
    this.name = "RateLimitError";
    this.bucket = bucket;
    this.limit = result.limit;
    this.retryAfterMs = result.retryAfterMs;
    this.resetAt = result.resetAt;
  }
}

/**
 * Enforce a limit inside a server function handler. Throws a user-facing error
 * when the caller is over the limit.
 *
 *   enforceRateLimit(context.userId, "ui_generate");
 */
export function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
  override?: Partial<RateLimitRule>,
): RateLimitResult {
  const result = checkRateLimit(userId, bucket, override);
  if (!result.allowed) throw new RateLimitError(bucket, result);
  return result;
}

/** Test helper: clear all recorded hits. */
export function resetRateLimits() {
  store.clear();
  lastSweep = 0;
}
