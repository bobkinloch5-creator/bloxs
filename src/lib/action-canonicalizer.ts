// Deterministic action canonicalizer.
//
// Runs on the finalized action batch right before it's sent to the Studio
// plugin. Purely mechanical cleanup — no LLM calls, no logic edits.
//
// What it does:
//   1. Dedupes RemoteEvents / RemoteFunctions by (parent_path, name)
//      keeping the first occurrence; the model sometimes emits the same
//      remote twice which causes the plugin to warn and skip.
//   2. Normalizes BloxSmith folder paths (ReplicatedStorage.BloxSmith etc.)
//      so scripts and remotes agree on where things live.
//   3. Runs autoFixLuau on every action carrying a script source so
//      deprecated globals (wait, spawn, :connect) and JSON-style tables
//      never make it into Studio.
//   4. Strips empty scripts (source is only whitespace/comments).
//
// Returns the possibly-modified list plus a short log of what changed so
// the caller can surface a "Canonicalized: …" note in the visible reply.

import { autoFixLuau, validateLuau, type LuauIssue } from "./luau-validator";

export type CanonAction = {
  kind: string;
  parent_path?: string;
  name?: string;
  payload?: Record<string, unknown> & { source?: string };
  source?: string;
  [k: string]: unknown;
};

const REMOTE_KINDS = new Set(["remoteevent", "remotefunction", "unreliableremoteevent"]);

const SCRIPT_KINDS = new Set([
  "script",
  "localscript",
  "modulescript",
  "run_lua",
]);

function getSource(a: CanonAction): string | undefined {
  const s = a.source ?? (a.payload?.source as string | undefined);
  return typeof s === "string" ? s : undefined;
}

function setSource(a: CanonAction, next: string) {
  if (a.payload && typeof a.payload === "object") {
    a.payload.source = next;
  }
  if (typeof a.source === "string") a.source = next;
}

export type CanonResult = {
  actions: CanonAction[];
  notes: string[];
  fixedLuauCount: number;
  droppedEmptyScripts: number;
  luauIssuesByAction: Array<{ name: string; kind: string; issues: LuauIssue[] }>;
};

export function canonicalizeActions(actions: CanonAction[]): CanonResult {
  const notes: string[] = [];
  let fixedLuauCount = 0;
  let droppedEmptyScripts = 0;
  const luauIssuesByAction: CanonResult["luauIssuesByAction"] = [];

  // 1. Dedupe remotes.
  const seenRemote = new Set<string>();
  let dedupedRemotes = 0;
  const afterDedup: CanonAction[] = [];
  for (const a of actions) {
    const kind = String(a.kind || "").toLowerCase();
    if (REMOTE_KINDS.has(kind)) {
      const key = `${kind}::${String(a.parent_path || "").toLowerCase()}::${String(a.name || "").toLowerCase()}`;
      if (seenRemote.has(key)) {
        dedupedRemotes += 1;
        continue;
      }
      seenRemote.add(key);
    }
    afterDedup.push(a);
  }
  if (dedupedRemotes > 0) notes.push(`deduped ${dedupedRemotes} duplicate remote(s)`);

  // 2. Normalize BloxSmith folder paths.
  const pathFixes: Array<[RegExp, string]> = [
    [/ReplicatedStorage\.BloxSmith(?!_)/g, "ReplicatedStorage.BloxSmith"],
    [/ReplicatedStorage\/BloxSmith(?!_)/g, "ReplicatedStorage/BloxSmith"],
  ];
  let pathNorm = 0;
  for (const a of afterDedup) {
    if (typeof a.parent_path === "string") {
      let next = a.parent_path;
      for (const [re, to] of pathFixes) next = next.replace(re, to);
      if (next !== a.parent_path) {
        a.parent_path = next;
        pathNorm += 1;
      }
    }
  }
  if (pathNorm > 0) notes.push(`normalized ${pathNorm} folder path(s)`);

  // 3. autoFixLuau every script source + strip empties.
  const afterScripts: CanonAction[] = [];
  for (const a of afterDedup) {
    const kind = String(a.kind || "").toLowerCase();
    if (!SCRIPT_KINDS.has(kind)) {
      afterScripts.push(a);
      continue;
    }
    const src = getSource(a);
    if (!src || !src.trim()) {
      // module-scripts / localscripts / scripts that are empty are useless
      // — drop them so the plugin doesn't create blank Instances.
      if (kind !== "run_lua") {
        droppedEmptyScripts += 1;
        continue;
      }
      afterScripts.push(a);
      continue;
    }
    const { source: fixed, fixes } = autoFixLuau(src);
    if (fixes.length > 0) {
      setSource(a, fixed);
      fixedLuauCount += 1;
    }
    const issues = validateLuau(fixed);
    if (issues.length > 0) {
      luauIssuesByAction.push({
        name: String(a.name || ""),
        kind,
        issues,
      });
    }
    afterScripts.push(a);
  }
  if (fixedLuauCount > 0) notes.push(`autoFixed ${fixedLuauCount} script(s)`);
  if (droppedEmptyScripts > 0) notes.push(`dropped ${droppedEmptyScripts} empty script(s)`);

  return {
    actions: afterScripts,
    notes,
    fixedLuauCount,
    droppedEmptyScripts,
    luauIssuesByAction,
  };
}
