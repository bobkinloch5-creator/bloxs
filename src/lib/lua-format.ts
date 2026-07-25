// BloxSmith Lua toolkit
// ---------------------------------------------------------------------------
// Auto-format, project-wide search/replace, script import and non-destructive
// merge. Pure string tooling so it runs both on the server and in the browser.

import { stripCodeFences } from "./luau-validator";

export type ScriptFile = {
  path: string;
  name: string;
  className: "Script" | "LocalScript" | "ModuleScript";
  source: string;
};

const INDENT = "\t";

const OPENERS = /(^|\s)(function|if|for|while|repeat|do)\b/;
const CLOSERS = /^(end|until|else|elseif|\})/;

/**
 * Deterministic Lua formatter: normalises indentation, trims trailing
 * whitespace, collapses 3+ blank lines and puts a single space around common
 * operators. It never reorders statements, so it cannot change behaviour.
 */
export function formatLua(input: string): string {
  const source = stripCodeFences(input).replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const out: string[] = [];
  let depth = 0;
  let blankRun = 0;
  let inLongComment = false;

  for (const raw of lines) {
    let line = raw.trim();

    if (line === "") {
      blankRun += 1;
      if (blankRun <= 1) out.push("");
      continue;
    }
    blankRun = 0;

    if (inLongComment) {
      out.push(line);
      if (/\]\]/.test(line)) inLongComment = false;
      continue;
    }
    if (/^--\[\[/.test(line) && !/\]\]/.test(line)) {
      out.push(INDENT.repeat(depth) + line);
      inLongComment = true;
      continue;
    }

    if (CLOSERS.test(line)) depth = Math.max(0, depth - 1);

    const isComment = line.startsWith("--");
    if (!isComment) {
      line = line
        .replace(/\s*([,;])\s*/g, "$1 ")
        .replace(/\s{2,}/g, " ")
        .replace(/\s*(==|~=|<=|>=|\.\.)\s*/g, " $1 ")
        .replace(/([^=<>~+\-*/%.])=([^=])/g, "$1 = $2")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim();
    }

    out.push(INDENT.repeat(depth) + line);

    const opens =
      (OPENERS.test(line) && !/\bend\b\s*$/.test(line) && !/^--/.test(line)) ||
      /[{(]\s*$/.test(line);
    const isOneLiner = /\bfunction\b.*\bend\b/.test(line) || /\bif\b.*\bthen\b.*\bend\b/.test(line);
    if (opens && !isOneLiner) depth += 1;
    if (/^(else|elseif)\b/.test(line)) depth += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export type SearchHit = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

/** Project-wide search across every script. */
export function searchScripts(
  files: ScriptFile[],
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean } = {},
): SearchHit[] {
  if (!query) return [];
  const flags = options.caseSensitive ? "g" : "gi";
  const pattern = options.regex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

  const hits: SearchHit[] = [];
  for (const file of files) {
    const lines = file.source.split("\n");
    lines.forEach((line, index) => {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        hits.push({
          path: file.path,
          line: index + 1,
          column: match.index + 1,
          preview: line.trim().slice(0, 200),
        });
        if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
      }
    });
  }
  return hits;
}

export type ReplaceResult = {
  files: ScriptFile[];
  replacements: number;
  changedPaths: string[];
};

/** Project-wide replace. Returns new file objects; inputs are untouched. */
export function replaceInScripts(
  files: ScriptFile[],
  query: string,
  replacement: string,
  options: { caseSensitive?: boolean; regex?: boolean } = {},
): ReplaceResult {
  if (!query) return { files, replacements: 0, changedPaths: [] };
  const flags = options.caseSensitive ? "g" : "gi";
  const pattern = options.regex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

  let replacements = 0;
  const changedPaths: string[] = [];
  const next = files.map((file) => {
    let count = 0;
    const source = file.source.replace(pattern, () => {
      count += 1;
      return replacement;
    });
    if (count > 0) {
      replacements += count;
      changedPaths.push(file.path);
      return { ...file, source };
    }
    return file;
  });

  return { files: next, replacements, changedPaths };
}

/** Guess the right Roblox class for an imported file. */
export function inferClassName(fileName: string, source: string): ScriptFile["className"] {
  const lower = fileName.toLowerCase();
  if (/\.client\.lua u?$/.test(lower) || lower.includes(".client.")) return "LocalScript";
  if (lower.includes(".server.")) return "Script";
  if (/(^|[^a-z])module([^a-z]|$)/.test(lower) || /\breturn\s+[A-Za-z_][\w.]*\s*$/m.test(source.trimEnd())) {
    return "ModuleScript";
  }
  if (/game:GetService\("Players"\)\.LocalPlayer|LocalPlayer|UserInputService|RenderStepped/.test(source)) {
    return "LocalScript";
  }
  return "Script";
}

export type ImportedScript = {
  name: string;
  className: ScriptFile["className"];
  parentPath: string;
  source: string;
  notes: string[];
};

const PARENT_BY_CLASS: Record<ScriptFile["className"], string> = {
  Script: "ServerScriptService.BloxSmith_Systems",
  LocalScript: "StarterPlayer.StarterPlayerScripts.BloxSmith_Client",
  ModuleScript: "ReplicatedStorage.BloxSmith.Modules",
};

/**
 * Turn uploaded/pasted files into placeable script artifacts.
 * Folder structure is preserved as nested Folders under the service root.
 */
export function importScripts(
  input: Array<{ path: string; content: string }>,
): ImportedScript[] {
  return input
    .filter((entry) => /\.(lua|luau|txt)$/i.test(entry.path) || !entry.path.includes("."))
    .map((entry) => {
      const segments = entry.path.split(/[\\/]+/).filter(Boolean);
      const fileName = segments.pop() ?? "ImportedScript";
      const baseName = fileName.replace(/\.(lua|luau|txt)$/i, "").replace(/\.(client|server)$/i, "");
      const source = stripCodeFences(entry.content);
      const className = inferClassName(fileName, source);
      const notes: string[] = [];

      let parentPath = PARENT_BY_CLASS[className];
      if (segments.length > 0) {
        const folders = segments
          .map((segment) => segment.replace(/[^A-Za-z0-9_ ]/g, "").trim())
          .filter((segment) => segment.length > 0 && !/^src$/i.test(segment));
        if (folders.length > 0) {
          parentPath = `${parentPath}.${folders.join(".")}`;
          notes.push(`Folder structure preserved: ${folders.join(" / ")}`);
        }
      }

      notes.push(`Detected as ${className}`);
      return {
        name: baseName || "ImportedScript",
        className,
        parentPath,
        source,
        notes,
      };
    });
}

export type MergeStrategy = "keep_existing" | "append_section" | "replace";

export type MergeResult = {
  source: string;
  strategy: MergeStrategy;
  changed: boolean;
  note: string;
};

const MERGE_START = "-- >>> BloxSmith generated section (safe to regenerate)";
const MERGE_END = "-- <<< BloxSmith generated section";

/**
 * Merge generated code into a script the user may have edited.
 *
 * Rules:
 *  - identical content is a no-op
 *  - if the file already has a BloxSmith section, only that section is swapped
 *  - otherwise the generated code is appended inside a clearly marked block so
 *    hand-written code above it is never lost
 */
export function mergeScript(
  existing: string | null | undefined,
  generated: string,
  strategy: MergeStrategy = "append_section",
): MergeResult {
  const incoming = stripCodeFences(generated).trimEnd();
  const current = (existing ?? "").trimEnd();

  if (!current) {
    return { source: incoming + "\n", strategy, changed: true, note: "Created new script" };
  }
  if (current === incoming) {
    return { source: current + "\n", strategy, changed: false, note: "Already up to date" };
  }
  if (strategy === "replace") {
    return { source: incoming + "\n", strategy, changed: true, note: "Replaced existing script" };
  }
  if (strategy === "keep_existing") {
    return { source: current + "\n", strategy, changed: false, note: "Kept the user's version" };
  }

  const startIndex = current.indexOf(MERGE_START);
  const endIndex = current.indexOf(MERGE_END);
  if (startIndex !== -1 && endIndex > startIndex) {
    const before = current.slice(0, startIndex);
    const after = current.slice(endIndex + MERGE_END.length);
    const merged = `${before}${MERGE_START}\n${incoming}\n${MERGE_END}${after}`;
    return {
      source: merged.trimEnd() + "\n",
      strategy,
      changed: true,
      note: "Refreshed the generated section, user code untouched",
    };
  }

  const merged = `${current}\n\n${MERGE_START}\n${incoming}\n${MERGE_END}\n`;
  return {
    source: merged,
    strategy,
    changed: true,
    note: "Appended a generated section below the user's code",
  };
}

/** Split a Lua file into top-level definitions, used for selective regeneration. */
export function outlineLua(source: string): Array<{ name: string; line: number; kind: string }> {
  const out: Array<{ name: string; line: number; kind: string }> = [];
  source.split("\n").forEach((line, index) => {
    const fn = line.match(/^\s*(local\s+)?function\s+([\w.:]+)/);
    if (fn) {
      out.push({ name: fn[2], line: index + 1, kind: fn[1] ? "local function" : "function" });
      return;
    }
    const assigned = line.match(/^\s*(?:local\s+)?([\w.]+)\s*=\s*function\s*\(/);
    if (assigned) out.push({ name: assigned[1], line: index + 1, kind: "function" });
  });
  return out;
}
