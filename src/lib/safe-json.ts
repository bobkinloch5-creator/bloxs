// Defensive JSON helpers: never throw on empty, malformed, or non-JSON input.
// Use anywhere we parse secrets, env config, AI tool args, or untrusted strings.

export function safeJsonParse<T = unknown>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  const s = String(value).trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    // Try to recover an embedded JSON object/array from a noisier blob.
    const m = s.match(/[{[][\s\S]*[}\]]/);
    if (m) {
      try { return JSON.parse(m[0]) as T; } catch { /* fall through */ }
    }
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[BloxSmith] safeJsonParse: invalid JSON, using fallback");
    }
    return fallback;
  }
}

export function safeJsonStringify(value: unknown, fallback = "{}"): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return fallback;
  }
}
