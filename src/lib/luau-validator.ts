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
    [/\bPlayers\s*:\s*GetPlayerFromInput\s*\(/, "Players:GetPlayerFromInput does not exist — use Players.LocalPlayer in a LocalScript."],
    [/:connect\s*\(/, "Use :Connect (capital C) — :connect was removed."],
    [/(?<!task\.)\bwait\s*\(/, "Use task.wait(n) — legacy wait() is throttled and deprecated."],
    [/(?<!task\.)\bspawn\s*\(\s*function/, "Use task.spawn(fn) — legacy spawn() is deprecated."],
    [/(?<!task\.)\bdelay\s*\(/, "Use task.delay(n, fn) — legacy delay() is deprecated."],
    // Additional Roblox-specific correctness checks:
    [/Instance\.new\s*\(\s*['"][^'"]+['"]\s*,\s*[^)]+\)/, "Instance.new(class, parent) is deprecated — set .Parent last after configuring all properties."],
    [/\bgame\.Players\b/, "Use game:GetService('Players') instead of game.Players for reliable access."],
    [/:WaitForChild\s*\([^)]+\)(?!\s*--\s*timeout)/, "WaitForChild without a timeout can yield forever — pass a second timeout argument."],
    [/\bOnServerEvent\s*:\s*Connect\s*\([^)]*\)(?![\s\S]{0,500}?pcall)/, "Remote handler without pcall — wrap handler body in pcall to prevent client-triggered server crashes."],
    [/:InvokeServer\s*\(/, "RemoteFunction:InvokeServer can deadlock if the server yields indefinitely — prefer RemoteEvent for one-way calls."],
    [/RunService\.(Heartbeat|RenderStepped)\s*:\s*Connect\s*\(function[\s\S]{0,300}?(?:DataStore|HttpService|FireServer|FireAllClients)/, "DataStore/HTTP/Remote calls inside a per-frame loop cause throttle errors and network spam — use debounce."],
    [/\bHttpService\s*:\s*GetAsync\s*\(|\bHttpService\s*:\s*PostAsync\s*\(/, "Wrap HttpService calls in pcall — network failures throw errors that crash the script."],
    [/local\s+\w+\s*=\s*game\.\w+\b(?!\s*:\s*GetService)/, "Prefer game:GetService('ServiceName') over game.ServiceName for type-safety and error clarity."],
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

function previousNonWhitespace(source: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(source[i])) return source[i];
  }
  return "";
}

function nextNonWhitespaceIndex(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i;
}

function readQuotedString(source: string, index: number): { end: number; value: string } | null {
  const quote = source[index];
  if (quote !== "\"" && quote !== "'") return null;
  let value = "";
  for (let i = index + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      value += source.slice(i, Math.min(i + 2, source.length));
      i += 1;
      continue;
    }
    if (ch === quote) return { end: i + 1, value };
    value += ch;
  }
  return null;
}

function convertJsonStyleTableKeys(source: string): { source: string; changed: boolean } {
  let out = "";
  let i = 0;
  let changed = false;

  while (i < source.length) {
    if (source.startsWith("--[[", i)) {
      const end = source.indexOf("]]", i + 4);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (source.startsWith("--", i)) {
      const end = source.indexOf("\n", i + 2);
      const stop = end === -1 ? source.length : end;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    const ch = source[i];
    if (ch === "\"" || ch === "'") {
      const quoted = readQuotedString(source, i);
      if (!quoted) {
        out += ch;
        i += 1;
        continue;
      }
      const next = nextNonWhitespaceIndex(source, quoted.end);
      const prev = previousNonWhitespace(out, out.length);
      if ((prev === "{" || prev === ",") && source[next] === ":") {
        const key = quoted.value;
        out += /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${key} = ` : `[${JSON.stringify(key)}] = `;
        i = next + 1;
        changed = true;
        continue;
      }
      out += source.slice(i, quoted.end);
      i = quoted.end;
      continue;
    }

    if (/[A-Za-z_]/.test(ch) && (previousNonWhitespace(out, out.length) === "{" || previousNonWhitespace(out, out.length) === ",")) {
      const match = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (match) {
        const key = match[0];
        const next = nextNonWhitespaceIndex(source, i + key.length);
        if (source[next] === ":") {
          out += `${key} = `;
          i = next + 1;
          changed = true;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return { source: out, changed };
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
  const jsonRepair = convertJsonStyleTableKeys(src);
  src = jsonRepair.source;
  if (jsonRepair.changed) fixes.push("converted JSON-style table keys to Luau assignment");

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


// ---------------------------------------------------------------------------
// Performance analysis: memory leaks, lag, networking and mobile
// ---------------------------------------------------------------------------

export type PerfCategory = "memory" | "lag" | "network" | "mobile" | "security";

export type PerfFinding = {
  category: PerfCategory;
  severity: "error" | "warn" | "info";
  line: number;
  message: string;
  suggestion: string;
};

type PerfRule = {
  category: PerfCategory;
  severity: PerfFinding["severity"];
  pattern: RegExp;
  message: string;
  suggestion: string;
  /** Skip the finding when this pattern also appears in the file. */
  unless?: RegExp;
};

const PERF_RULES: PerfRule[] = [
  {
    category: "memory",
    severity: "warn",
    pattern: /\.(Touched|Changed|Heartbeat|Stepped|RenderStepped|InputBegan)\s*:Connect\(/,
    message: "Event connection is never disconnected",
    suggestion:
      "Store the connection and call :Disconnect() when the object dies, or use a Maid/Trove table.",
    unless: /:Disconnect\(\)|Maid|Trove|Janitor|GetPropertyChangedSignal/,
  },
  {
    category: "memory",
    severity: "warn",
    pattern: /Players\.PlayerAdded:Connect/,
    message: "Per-player state may never be cleaned up",
    suggestion: "Add a Players.PlayerRemoving handler that clears the player's entries from your tables.",
    unless: /PlayerRemoving/,
  },
  {
    category: "memory",
    severity: "info",
    pattern: /^\s*local\s+\w+\s*=\s*\{\s*\}\s*--\s*cache/i,
    message: "Unbounded cache table",
    suggestion: 'Use setmetatable(cache, { __mode = "k" }) so entries can be collected.',
    unless: /__mode/,
  },
  {
    category: "lag",
    severity: "error",
    pattern: /RunService\.(Heartbeat|Stepped|RenderStepped):Connect\(function[\s\S]{0,200}?(GetChildren|GetDescendants|FindFirstChild)\(/,
    message: "Instance tree walk inside a per-frame loop",
    suggestion: "Cache the instances outside the loop; walking the tree every frame is a top lag cause.",
  },
  {
    category: "lag",
    severity: "warn",
    pattern: /while\s+true\s+do(?![\s\S]{0,160}?task\.wait)/,
    message: "Tight while true loop without a yield",
    suggestion: "Add task.wait() inside the loop, or the script will freeze the scheduler.",
  },
  {
    category: "lag",
    severity: "warn",
    pattern: /:GetDescendants\(\)/,
    message: "GetDescendants on a large tree",
    suggestion: "Prefer CollectionService tags or a cached list instead of scanning descendants repeatedly.",
    unless: /CollectionService/,
  },
  {
    category: "lag",
    severity: "info",
    pattern: /Instance\.new\(\s*"Part"\s*\)[\s\S]{0,80}?\.Parent\s*=/,
    message: "Part parented before its properties are set",
    suggestion: "Set every property first, then assign Parent last. It avoids extra replication work.",
  },
  {
    category: "network",
    severity: "error",
    pattern: /RunService\.(Heartbeat|RenderStepped|Stepped):Connect\(function[\s\S]{0,240}?:FireServer\(/,
    message: "RemoteEvent fired every frame",
    suggestion: "Throttle to 10-20 sends per second, or send input intent only when it changes.",
  },
  {
    category: "network",
    severity: "warn",
    pattern: /:FireAllClients\(/,
    message: "Broadcast to every client",
    suggestion: "Send only to players who can see the effect, or batch updates into one payload.",
  },
  {
    category: "network",
    severity: "error",
    pattern: /OnServerEvent:Connect\(function\s*\([^)]*\)(?![\s\S]{0,300}?(typeof|type\(|tonumber|tostring|assert|if\s))/,
    message: "Remote handler does not validate client input",
    suggestion: "Never trust the client: check types and ranges before using the arguments.",
  },
  {
    category: "security",
    severity: "error",
    pattern: /OnServerEvent:Connect\(function\s*\([^)]*\)[\s\S]{0,200}?(Humanoid\.Health\s*=|leaderstats)/,
    message: "Client can set health or currency directly",
    suggestion: "Compute the new value on the server from validated inputs instead of trusting the client.",
  },
  {
    category: "mobile",
    severity: "warn",
    pattern: /UserInputService\.InputBegan(?![\s\S]{0,400}?(TouchEnabled|Touch|ContextActionService))/,
    message: "Keyboard-only input handling",
    suggestion: "Use ContextActionService or add touch buttons so phone players can trigger the action.",
  },
  {
    category: "mobile",
    severity: "warn",
    pattern: /Size\s*=\s*UDim2\.new\(\s*0\s*,\s*([0-3]?\d)\s*,\s*0\s*,\s*([0-3]?\d)\s*\)/,
    message: "Touch target smaller than 44px",
    suggestion: "Give buttons a UISizeConstraint with MinSize Vector2.new(88, 44) for comfortable tapping.",
  },
  {
    category: "mobile",
    severity: "info",
    pattern: /ScreenGui/,
    message: "ScreenGui without responsive scaling",
    suggestion: "Add a UIScale driven by ViewportSize so the UI fits phones, tablets and TVs.",
    unless: /UIScale|UIAspectRatioConstraint/,
  },
];

/**
 * Static performance and safety analysis for a Luau source file.
 * Complements validateLuau, which focuses on syntax correctness.
 */
export function analyzeLuauPerformance(rawSource: string): PerfFinding[] {
  const source = stripCodeFences(rawSource ?? "");
  if (!source.trim()) return [];

  const lines = source.split("\n");
  const findings: PerfFinding[] = [];

  for (const rule of PERF_RULES) {
    if (rule.unless && rule.unless.test(source)) continue;
    const match = rule.pattern.exec(source);
    if (!match) continue;
    const upTo = source.slice(0, match.index);
    const line = upTo.split("\n").length;
    findings.push({
      category: rule.category,
      severity: rule.severity,
      line,
      message: rule.message,
      suggestion: rule.suggestion,
    });
  }

  // Heuristic: many separate per-frame connections in one file.
  const frameLoops = (source.match(/RunService\.(Heartbeat|Stepped|RenderStepped):Connect/g) ?? []).length;
  if (frameLoops >= 3) {
    findings.push({
      category: "lag",
      severity: "warn",
      line: 1,
      message: `${frameLoops} separate per-frame loops in one script`,
      suggestion: "Merge them into a single Heartbeat loop with an accumulator; frame cost stays flat.",
    });
  }

  if (lines.length > 600) {
    findings.push({
      category: "lag",
      severity: "info",
      line: 1,
      message: `Script is ${lines.length} lines long`,
      suggestion: "Split it into ModuleScripts so Studio stays responsive and reuse gets easier.",
    });
  }

  return findings.sort((a, b) => a.line - b.line);
}

/** Rolled-up score (0-100) used by the project health panel. */
export function performanceScore(findings: PerfFinding[]): number {
  // Security errors hurt the score harder than generic errors because
  // they can result in exploitable gameplay or data loss.
  const weights = { error: 15, warn: 5, info: 2 } as const;
  const securityPenalty = findings
    .filter((f) => f.category === "security")
    .reduce((total, f) => total + (f.severity === "error" ? 20 : 8), 0);
  const penalty = findings.reduce((total, finding) => total + weights[finding.severity], 0);
  return Math.max(0, 100 - penalty - securityPenalty);
}
