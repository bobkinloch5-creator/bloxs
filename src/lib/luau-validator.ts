// Lightweight Luau static checks. Catches the most common LLM mistakes
// before scripts get queued to Studio: unbalanced blocks, stray markdown
// fences, mismatched brackets, and forbidden globals. Not a full parser.

export type LuauIssue = {
  severity: "error" | "warn";
  message: string;
};

// NOTE: `do` is intentionally NOT here — in Luau, `for ... do ... end` and
// `while ... do ... end` share a single `end` with the `for`/`while` opener,
// so counting `do` separately double-reports opens and false-fires on valid
// loops. Bare `do ... end` blocks are rare and not worth the false positives.
const OPENERS = /\b(function|if|for|while|repeat)\b/g;
const CLOSERS = /\b(end|until)\b/g;

const STRIP_STRINGS = [
  /--\[\[[\s\S]*?\]\]/g,                  // block comments
  /--[^\n]*/g,                            // line comments
  /\[(=*)\[[\s\S]*?\]\1\]/g,              // long brackets
  /"(?:\\.|[^"\\\n])*"/g,                 // double strings
  /'(?:\\.|[^'\\\n])*'/g,                 // single strings
];

export function validateLuau(rawSource: string): LuauIssue[] {
  const issues: LuauIssue[] = [];
  if (typeof rawSource !== "string") {
    return [{ severity: "error", message: "Script source is missing." }];
  }

  const trimmedSource = stripCodeFences(rawSource).trim();
  if (!trimmedSource) {
    return [{ severity: "error", message: "Script source is empty." }];
  }

  const executableSource = trimmedSource
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  if (!executableSource) {
    issues.push({ severity: "error", message: "Script source only contains comments; executable Luau is required." });
  }

  if (/^\s*```/.test(rawSource) || /```\s*$/.test(rawSource)) {
    issues.push({ severity: "warn", message: "Source contained markdown code fences; strip ``` before sending." });
  }

  if (hasJsonStyleTableSyntax(trimmedSource)) {
    issues.push({ severity: "error", message: "JSON-style table syntax found; use key = value in Luau tables." });
  }

  let src = trimmedSource;
  for (const re of STRIP_STRINGS) src = src.replace(re, "");

  const opens = (src.match(OPENERS) ?? []).length;
  const closes = (src.match(CLOSERS) ?? []).length;
  if (opens !== closes) {
    issues.push({
      severity: opens > closes ? "error" : "warn",
      message: `Unbalanced blocks: ${opens} open keyword(s) vs ${closes} closer(s).`,
    });
  }


  const parens = balance(src, "(", ")");
  if (parens !== 0) issues.push({ severity: "error", message: `Unbalanced parentheses (${parens > 0 ? "+" : ""}${parens}).` });
  const braces = balance(src, "{", "}");
  if (braces !== 0) issues.push({ severity: "error", message: `Unbalanced braces (${braces > 0 ? "+" : ""}${braces}).` });
  const brackets = balance(src, "[", "]");
  if (brackets !== 0) issues.push({ severity: "warn", message: `Unbalanced brackets (${brackets > 0 ? "+" : ""}${brackets}).` });

  if (/\brequire\s*\(\s*\d+\s*\)/.test(rawSource)) {
    issues.push({ severity: "warn", message: "require(<assetId>) is disabled in most experiences; require by path instead." });
  }
  if (/\bloadstring\s*\(/.test(rawSource)) {
    issues.push({ severity: "error", message: "loadstring() is disabled on the Roblox client; remove it." });
  }
  if (/\bgetfenv\s*\(|\bsetfenv\s*\(/.test(rawSource)) {
    issues.push({ severity: "warn", message: "getfenv/setfenv are deprecated in Luau." });
  }

  // Known-invalid API calls that cause "attempt to call a nil value" at runtime.
  const NIL_CALL_PATTERNS: Array<[RegExp, string]> = [
    [/\bLighting\s*:\s*GetEffect\b/, "Lighting has no :GetEffect — use :FindFirstChildOfClass or iterate :GetChildren()."],
    [/\bWorkspace\s*:\s*GetPart\b/, "Workspace has no :GetPart — use :FindFirstChild or :GetDescendants()."],
    [/\bPlayers\s*:\s*GetPlayerFromInput\s*\(/, "Players:GetPlayerFromInput does not exist — use Players.LocalPlayer in a LocalScript, or pass intent to the server through a RemoteEvent."],
    [/:connect\s*\(/, "Use :Connect (capital C) — :connect was removed."],
    [/(?<!task\.)\bwait\s*\(/, "Use task.wait(n) — legacy wait() is throttled and deprecated."],
    [/(?<!task\.)\bspawn\s*\(\s*function/, "Use task.spawn(fn) — legacy spawn() is deprecated."],
    [/(?<!task\.)\bdelay\s*\(/, "Use task.delay(n, fn) — legacy delay() is deprecated."],
  ];
  for (const [re, msg] of NIL_CALL_PATTERNS) {
    if (re.test(src)) issues.push({ severity: "warn", message: msg });
  }

  if (/\bUserInputService\b/.test(src) && /\bPlayers\.PlayerAdded\b/.test(src)) {
    issues.push({ severity: "error", message: "Mixed server/client script: UserInputService input belongs in a LocalScript, while Players.PlayerAdded belongs in a server Script." });
  }

  return issues;
}

function balance(s: string, open: string, close: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) n++;
    else if (s[i] === close) n--;
  }
  return n;
}

function hasJsonStyleTableSyntax(source: string): boolean {
  let src = source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "");

  src = src.replace(/"(?:\\.|[^"\\\n])*"/g, (match, offset, full) => {
    let before = offset - 1;
    while (before >= 0 && /\s/.test(full[before])) before -= 1;
    let after = offset + match.length;
    while (after < full.length && /\s/.test(full[after])) after += 1;
    if ((full[before] === "{" || full[before] === ",") && full[after] === ":") return match;
    return '""';
  });
  src = src.replace(/'(?:\\.|[^'\\\n])*'/g, "''");

  return /[{,]\s*"[^"\n]+"\s*:/.test(src)
    || /[{,]\s*[A-Za-z_][A-Za-z0-9_]*\s*:(?!\s*[A-Za-z_][A-Za-z0-9_]*\s*\()/.test(src);
}

export function stripCodeFences(src: string): string {
  if (typeof src !== "string") return src;
  return src
    .replace(/^\s*```(?:lua|luau)?\s*\n/i, "")
    .replace(/\n```\s*$/i, "")
    .trim();
}

// Safe automatic fixes applied to every emitted Luau source before it ships
// to Studio. Only touches things that are ALWAYS wrong (deprecated globals,
// stray fences, :connect casing) — never edits logic. Returns the possibly
// modified source plus a list of applied fixes for logging.
export function autoFixLuau(rawSource: string): { source: string; fixes: string[] } {
  if (typeof rawSource !== "string" || !rawSource) return { source: rawSource, fixes: [] };
  const fixes: string[] = [];
  let src = stripCodeFences(rawSource);
  if (src !== rawSource.trim() && /```/.test(rawSource)) fixes.push("stripped markdown fences");

  // JSON-style table syntax → Luau table syntax.
  // Runs BEFORE string-guarding because guarding turns `"key":` into a token
  // and we'd never see it. Restricted to keys that immediately follow `{` or
  // `,` (with optional whitespace/newline) so we don't touch method calls or
  // string contents like `"http://…"`.
  const jsonKeyPre = src;
  src = src.replace(/([{,]\s*)"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g, "$1$2 = ");
  src = src.replace(/([{,]\s*)"([^"\n]+)"\s*:/g, '$1["$2"] = ');
  // Bare unquoted JSON-ish keys: `{ key: value, other: value }` → `{ key = value, other = value }`
  // Guard against `obj:method(` (colon followed by an identifier + `(`) by requiring the colon
  // is NOT immediately followed by an identifier that starts a call.
  src = src.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:(?!\s*[A-Za-z_][A-Za-z0-9_]*\s*\()/g, "$1$2 = ");
  if (src !== jsonKeyPre) fixes.push("converted JSON-style table keys to Luau assignment");

  // Preserve string literals and comments — protect them from replacements
  // by swapping in unique tokens, applying fixes, then restoring.
  const guards: string[] = [];
  const guard = (m: string) => {
    guards.push(m);
    return `\u0000${guards.length - 1}\u0000`;
  };
  src = src
    .replace(/--\[\[[\s\S]*?\]\]/g, guard)
    .replace(/--[^\n]*/g, guard)
    .replace(/\[(=*)\[[\s\S]*?\]\1\]/g, guard)
    .replace(/"(?:\\.|[^"\\\n])*"/g, guard)
    .replace(/'(?:\\.|[^'\\\n])*'/g, guard);

  const before = src;
  src = src.replace(/(?<![.:\w])wait\s*\(/g, "task.wait(");
  src = src.replace(/(?<![.:\w])spawn\s*\(\s*function/g, "task.spawn(function");
  src = src.replace(/(?<![.:\w])delay\s*\(/g, "task.delay(");
  src = src.replace(/:connect\s*\(/g, ":Connect(");
  if (src !== before) fixes.push("normalized deprecated globals (wait/spawn/delay/:connect)");

  src = src.replace(/\u0000(\d+)\u0000/g, (_m, i) => guards[Number(i)]);
  return { source: src, fixes };
}

