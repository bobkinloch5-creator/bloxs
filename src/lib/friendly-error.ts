// Shared friendly-error helper. Use everywhere we call a server fn or
// surface an error to the user. Keep the messages short, human, and
// actionable — no stack traces, no raw "TypeError: …" leaks.

export type FriendlyErrorOptions = {
  /** Optional context tag like "Toolbox" or "Studio" prepended to the message. */
  context?: string;
  /** Fallback shown when the error is empty/unrecognizable. */
  fallback?: string;
};

export function friendlyError(err: unknown, opts: FriendlyErrorOptions = {}): string {
  const { context, fallback = "Something went wrong. Please try again." } = opts;
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message ?? "")
          : "";
  const msg = (raw || "").trim();

  let friendly: string;
  if (!msg) friendly = fallback;
  else if (/project not found/i.test(msg)) friendly = "Project not found — refresh the page and try again.";
  else if (/credits.*exhausted|402/i.test(msg)) friendly = "AI credits exhausted on this workspace. Add credits to keep building.";
  else if (/rate.?limit|429/i.test(msg)) friendly = "AI gateway is rate-limited. Try again in a moment.";
  else if (/ResourceExhausted|worker.*limit|request limit reached|capacity|overloaded|503/i.test(msg)) friendly = "The AI model is at capacity right now. Try again in a few seconds, or switch to a different model.";
  else if (/unauthorized|401|forbidden|403/i.test(msg)) friendly = "Your session expired. Sign in again and retry.";
  else if (/not paired|no plugin|plugin offline|studio offline/i.test(msg)) friendly = "Roblox Studio plugin isn't paired. Open Studio and click Sync, then retry.";
  else if (/timeout|timed out/i.test(msg)) friendly = "Request timed out. Try again in a moment.";
  else if (/network|fetch failed|failed to fetch|enotfound|econnrefused/i.test(msg)) friendly = "Network hiccup — check your connection and retry.";
  else if (/too short|min.*characters|3 characters/i.test(msg)) friendly = "That input is too short. Add a bit more detail and retry.";
  else if (/too long|max.*characters|exceeds/i.test(msg)) friendly = "That input is too long. Trim it down a bit and retry.";
  else if (/invalid|validation|expected/i.test(msg)) friendly = msg.length < 160 ? msg : "Some of that input doesn't look right. Check it and retry.";
  else if (/quota|limit reached/i.test(msg)) friendly = "You've hit a usage limit. Try again later or upgrade your plan.";
  else friendly = msg.length < 200 ? msg : fallback;

  return context ? `${context}: ${friendly}` : friendly;
}

/** True when the error looks like a transient network/gateway hiccup that's worth retrying. */
export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /429|rate.?limit|timeout|timed out|network|fetch failed|failed to fetch|502|503|504/i.test(msg);
}
