// Lightweight Luau static checks. Catches the most common LLM mistakes
// before scripts get queued to Studio: unbalanced blocks, stray markdown
// fences, mismatched brackets, and forbidden globals. Not a full parser.

export type LuauIssue = {
  severity: "error" | "warn";
  message: string;
};

const OPENERS = /\b(function|if|for|while|do|repeat)\b/g;
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
  if (!rawSource || typeof rawSource !== "string") return issues;

  if (/^\s*```/.test(rawSource) || /```\s*$/.test(rawSource)) {
    issues.push({ severity: "warn", message: "Source contained markdown code fences; strip ``` before sending." });
  }

  let src = rawSource;
  for (const re of STRIP_STRINGS) src = src.replace(re, "");

  const opens = (src.match(OPENERS) ?? []).length;
  const closes = (src.match(CLOSERS) ?? []).length;
  // `then` opens an `if`, but the `if` opener already counts; do/while/repeat all close with end/until.
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
    [/:connect\s*\(/, "Use :Connect (capital C) — :connect was removed."],
    [/(?<!task\.)\bwait\s*\(/, "Use task.wait(n) — legacy wait() is throttled and deprecated."],
    [/(?<!task\.)\bspawn\s*\(\s*function/, "Use task.spawn(fn) — legacy spawn() is deprecated."],
    [/(?<!task\.)\bdelay\s*\(/, "Use task.delay(n, fn) — legacy delay() is deprecated."],
  ];
  for (const [re, msg] of NIL_CALL_PATTERNS) {
    if (re.test(src)) issues.push({ severity: "warn", message: msg });
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

export function stripCodeFences(src: string): string {
  if (typeof src !== "string") return src;
  return src
    .replace(/^\s*```(?:lua|luau)?\s*\n/i, "")
    .replace(/\n```\s*$/i, "")
    .trim();
}
