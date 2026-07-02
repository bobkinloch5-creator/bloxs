// Client-side prompt validation and abuse protection.
// Server-side rate limiting lives in rate-limit.server.ts.

export const PROMPT_MAX_LEN = 4000;
export const PROMPT_MIN_LEN = 2;

export type PromptCheck = { ok: true } | { ok: false; reason: string };

const SPAM_PATTERNS = [
  /(.)\1{40,}/, // 40+ of the same char
  /(https?:\/\/\S+\s*){6,}/i, // link spam
];

const DANGEROUS_LUA = [
  /\bloadstring\s*\(/i,
  /\bgetfenv\s*\(\s*0\s*\)/i,
  /\brequire\s*\(\s*\d{9,}\s*\)/i, // remote require of unknown asset
];

/** Validate a chat/build prompt before sending to the AI. */
export function validatePrompt(text: string): PromptCheck {
  if (typeof text !== "string") return { ok: false, reason: "Prompt must be text." };
  const trimmed = text.trim();
  if (trimmed.length < PROMPT_MIN_LEN) return { ok: false, reason: "Prompt is too short." };
  if (trimmed.length > PROMPT_MAX_LEN) return { ok: false, reason: `Prompt is too long (max ${PROMPT_MAX_LEN} chars).` };
  for (const p of SPAM_PATTERNS) if (p.test(trimmed)) return { ok: false, reason: "Prompt looks like spam." };
  return { ok: true };
}

/** Reject pasted Luau that contains dangerous primitives before forwarding to the plugin. */
export function validateLuau(source: string): PromptCheck {
  if (typeof source !== "string") return { ok: false, reason: "Script must be text." };
  if (source.length > 200_000) return { ok: false, reason: "Script exceeds 200KB limit." };
  for (const p of DANGEROUS_LUA) if (p.test(source)) return { ok: false, reason: "Script contains a disallowed primitive (loadstring / remote require)." };
  return { ok: true };
}

/** Simple burst detector for rapid-fire submissions from a single client. */
const clientBurst = new Map<string, number[]>();
export function checkClientBurst(key: string, maxPerMinute = 20): PromptCheck {
  const now = Date.now();
  const cutoff = now - 60_000;
  const history = (clientBurst.get(key) ?? []).filter((t) => t > cutoff);
  history.push(now);
  clientBurst.set(key, history);
  if (history.length > maxPerMinute) {
    return { ok: false, reason: "Too many requests — slow down for a minute." };
  }
  return { ok: true };
}
