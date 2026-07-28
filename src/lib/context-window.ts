// Token-aware context management for the chat/build endpoint.
//
// The previous approach was a fixed message count plus a raw character slice:
// keep the last 10-12 messages, and for each one keep the last N characters of
// its text. That had three problems.
//
//   1. Characters are not tokens. A message full of Luau (braces, colons,
//      CamelCase identifiers) tokenizes far denser than prose, so a
//      character-based cap either wasted budget or blew past it depending on
//      what the user happened to send.
//   2. Slicing landed mid-word, mid-string-literal, or mid-code-fence, handing
//      the model syntactically broken context.
//   3. Anything older than the window vanished completely. A user who asked for
//      a tycoon 15 messages ago and now says "add a second floor" had already
//      lost the fact that it was a tycoon.
//
// This module fixes all three: it estimates tokens, cuts on safe boundaries,
// and compresses everything that falls out of the window into a short digest
// instead of dropping it. It is deliberately dependency-free and deterministic
// so it can be unit tested without a model or a network call.

export type SimpleMessage = {
  role: string;
  parts?: Array<{ type?: string; text?: string; [k: string]: unknown }>;
};

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the token count of a string without a tokenizer.
 *
 * Rather than a flat chars/4, this weights the two regimes differently because
 * they really do tokenize differently:
 *   - prose averages ~4 characters per token
 *   - dense code averages closer to ~3, because punctuation and CamelCase
 *     identifiers split aggressively
 *
 * The estimate is intentionally slightly conservative (biased high). Running a
 * little under the real context limit is free; running over truncates the
 * response and looks to the user like the model failed.
 */
export function estimateTokens(text: string): number {
  const s = String(text ?? "");
  if (!s) return 0;

  const symbols = (s.match(/[^\w\s]/g) ?? []).length;
  const density = symbols / s.length;
  // Punctuation-heavy content (code) gets the denser divisor.
  const perToken = density > 0.12 ? 3 : 4;
  const whitespaceRuns = (s.match(/\s+/g) ?? []).length;

  return Math.max(1, Math.ceil(s.length / perToken) + Math.ceil(whitespaceRuns * 0.05));
}

/** Estimate tokens across a set of messages, including a small per-message overhead. */
export function estimateMessageTokens(messages: SimpleMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += 4; // role + delimiters
    for (const p of m.parts ?? []) {
      if (p?.type === "text" && typeof p.text === "string") total += estimateTokens(p.text);
      else total += 8; // non-text part (tool call, file ref) - small fixed cost
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Boundary-safe truncation
// ---------------------------------------------------------------------------

const BOUNDARY = /\n\n|\n|(?<=[.!?])\s|;\s|,\s/g;

/**
 * Trim `text` to roughly `maxTokens`, keeping the END of the string (the most
 * recent, most relevant part) and cutting on the nearest safe boundary.
 *
 * Code fences are balanced afterwards so the model never receives a half-open
 * fence, which reliably derails formatting for the rest of the turn.
 */
export function trimTextToTokens(
  text: string,
  maxTokens: number,
  preserveMode: "head" | "tail" = "tail"
): string {
  const s = String(text ?? "");
  if (maxTokens <= 0) return "";
  if (estimateTokens(s) <= maxTokens) return s;

  // Convert the token budget back to an approximate character budget.
  const symbols = (s.match(/[^\w\s]/g) ?? []).length;
  const perToken = symbols / s.length > 0.12 ? 3 : 4;
  const charBudget = Math.max(120, maxTokens * perToken);

  let cut: string;
  if (preserveMode === "head") {
    cut = s.slice(0, charBudget);
    // Cut back to the last clean line or sentence boundary
    const lastBoundary = cut.search(/\n(?![\s\S]*\n)|(?<=[.!?])\s(?![\s\S]*[.!?])/);
    if (lastBoundary > cut.length * 0.75) {
      cut = cut.slice(0, lastBoundary);
    }
    return `${balanceCodeFences(cut)}\n[later part of this message trimmed due to extreme length]`;
  } else {
    cut = s.slice(-charBudget);
    // Advance to the next clean boundary so we never start mid-word.
    BOUNDARY.lastIndex = 0;
    const match = BOUNDARY.exec(cut);
    if (match && match.index < cut.length * 0.25) {
      cut = cut.slice(match.index + match[0].length);
    }
    return `[earlier part of this message trimmed]\n${balanceCodeFences(cut)}`;
  }
}

/** Drop a dangling code fence left behind by truncation. */
export function balanceCodeFences(text: string): string {
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 === 0) return text;
  // Odd count means we cut inside a block. Removing the dangling opener is
  // safer than appending a closer around content we may have severed.
  const firstFence = text.indexOf("```");
  const before = text.slice(0, firstFence);
  const after = text.slice(firstFence + 3);
  return `${before}${after}`;
}

// ---------------------------------------------------------------------------
// Digest of dropped turns
// ---------------------------------------------------------------------------

const BUILD_HINT = /\b(tycoon|obby|simulator|rpg|horror|fps|racing|idle|tower defense|survival|shop|inventory|quest|pet|weapon|gun|sword|npc|enemy|leaderboard|datastore|gamepass|lobby|spawn|map|terrain|ui|gui|menu)\b/gi;

/**
 * Compress messages that fall outside the window into a short factual digest.
 *
 * This is deliberately extractive rather than generative: no model call, no
 * latency, no risk of the summary hallucinating a requirement the user never
 * stated. It captures what the conversation was ABOUT so a later "add a second
 * floor" still knows it is a tycoon.
 */
export function summarizeDroppedTurns(dropped: SimpleMessage[]): string {
  if (dropped.length === 0) return "";

  const userTexts: string[] = [];
  const topics = new Set<string>();

  for (const m of dropped) {
    const text = (m.parts ?? [])
      .map((p) => (p?.type === "text" && typeof p.text === "string" ? p.text : ""))
      .join(" ")
      .trim();
    if (!text) continue;

    BUILD_HINT.lastIndex = 0;
    for (const hit of text.match(BUILD_HINT) ?? []) topics.add(hit.toLowerCase());

    if (m.role === "user") {
      // The first line of a request carries the intent; the rest is detail.
      const firstLine = text.split(/\n/).find((l) => l.trim().length > 0) ?? text;
      userTexts.push(firstLine.trim().slice(0, 160));
    }
  }

  if (userTexts.length === 0 && topics.size === 0) return "";

  const lines: string[] = [
    `EARLIER IN THIS CONVERSATION (${dropped.length} older message${dropped.length === 1 ? "" : "s"}, condensed):`,
  ];
  if (topics.size > 0) {
    lines.push(`- Recurring subjects: ${[...topics].slice(0, 12).join(", ")}`);
  }
  // Keep the most recent of the dropped requests - they are closest in time to
  // whatever the user is asking about now.
  for (const t of userTexts.slice(-6)) {
    lines.push(`- User asked: ${t}`);
  }
  lines.push("- Treat the above as background only. The messages below are authoritative.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The window itself
// ---------------------------------------------------------------------------

export type WindowOptions = {
  /** Total token budget for conversation history (excludes the system prompt). */
  budgetTokens: number;
  /** Never shrink the newest user message below this. */
  latestUserTokens?: number;
  /** Hard ceiling on any single older message. */
  perMessageTokens?: number;
  /** Maximum messages to keep regardless of budget. */
  maxMessages?: number;
};

export type WindowResult<T extends SimpleMessage> = {
  messages: T[];
  /** Digest of whatever did not fit, or "" when nothing was dropped. */
  digest: string;
  estimatedTokens: number;
  droppedCount: number;
};

/**
 * Fit a conversation into a token budget.
 *
 * Walks backwards from the newest message so recency always wins, shrinks
 * oversized messages on safe boundaries, and hands back a digest of whatever
 * did not fit so the caller can prepend it to the system prompt.
 */
export function fitMessagesToWindow<T extends SimpleMessage>(
  messages: T[],
  options: WindowOptions,
): WindowResult<T> {
  const budget = Math.max(256, options.budgetTokens);
  const latestUserTokens = options.latestUserTokens ?? Math.max(16000, Math.floor(budget * 0.75));
  const perMessageTokens = options.perMessageTokens ?? Math.floor(budget * 0.25);
  const maxMessages = options.maxMessages ?? 24;

  if (messages.length === 0) {
    return { messages: [], digest: "", estimatedTokens: 0, droppedCount: 0 };
  }

  const kept: T[] = [];
  let used = 0;
  let index = messages.length - 1;

  for (; index >= 0; index--) {
    const message = messages[index];
    const isLatest = index === messages.length - 1;
    const isUser = message.role === "user";
    const cap = isLatest && isUser ? latestUserTokens : perMessageTokens;
    const preserveMode = isUser ? "head" : "tail";

    const parts = (message.parts ?? []).map((p) => {
      if (p?.type !== "text" || typeof p.text !== "string") return p;
      return { ...p, text: trimTextToTokens(p.text, cap, preserveMode) };
    });

    const candidate = { ...message, parts } as T;
    const cost = estimateMessageTokens([candidate]);

    // Always keep the newest message even if it alone exceeds the budget -
    // sending nothing is strictly worse than sending a trimmed request.
    if (kept.length > 0 && (used + cost > budget || kept.length >= maxMessages)) break;

    kept.unshift(candidate);
    used += cost;
  }

  const dropped = messages.slice(0, index + 1);

  return {
    messages: kept,
    digest: summarizeDroppedTurns(dropped),
    estimatedTokens: used,
    droppedCount: dropped.length,
  };
}

/**
 * Default history budgets. Chat answers are conversational so they need less
 * history than a build, which has to remember the structure it already created.
 * Expanded to comfortably handle long, detailed multi-paragraph user specifications.
 */
export const HISTORY_BUDGETS = {
  chat: 16000,
  plan: 20000,
  build: 24000,
} as const;
