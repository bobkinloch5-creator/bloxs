// Client-side helpers for the rate limiter.
//
// Server function errors only survive serialization as a message string, so
// `enforceRateLimit` appends a compact machine-readable marker to the end of
// the message. These helpers pull the wait time back out so the UI can show a
// real countdown instead of a static "try again later".

export const RATE_LIMIT_MARKER = "[[rl:";

export type RateLimitInfo = {
  /** Human-readable text with the marker stripped off. */
  message: string;
  /** Wall-clock time the limit clears, in ms since epoch. */
  resetAt: number;
  /** Requests allowed per window. */
  limit: number;
  /** Which endpoint group was throttled, e.g. "ui_generate". */
  bucket: string;
};

const BUCKET_LABELS: Record<string, string> = {
  chat: "chat messages",
  ui_generate: "UI generations",
  model_generate: "3D model generations",
  image_generate: "image generations",
  build: "game builds",
  toolbox_search: "toolbox searches",
  export: "exports",
};

/** Friendly name for a rate limit bucket. */
export function bucketLabel(bucket: string) {
  return BUCKET_LABELS[bucket] ?? "requests";
}

/**
 * Returns rate limit details when the error came from the limiter, or null for
 * any other error. Accepts an Error, a string, or an unknown thrown value.
 */
export function parseRateLimitError(error: unknown): RateLimitInfo | null {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  if (!raw.includes(RATE_LIMIT_MARKER)) return null;

  const match = raw.match(/\[\[rl:([a-z_]+):(\d+):(\d+)\]\]/);
  if (!match) return null;

  const [, bucket, resetAtRaw, limitRaw] = match;
  const resetAt = Number(resetAtRaw);
  if (!Number.isFinite(resetAt)) return null;

  return {
    message: stripRateLimitMarker(raw),
    resetAt,
    limit: Number(limitRaw) || 0,
    bucket,
  };
}

/** Strips the marker from any message so it is never shown to a user. */
export function stripRateLimitMarker(message: string) {
  return message.replace(/\s*\[\[rl:[^\]]+\]\]\s*/, " ").trim();
}

/** "1:05" for a minute or more, "42s" below that. */
export function formatCountdown(msRemaining: number) {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
