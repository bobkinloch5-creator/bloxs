// Luau self-test gate (tag-only).
//
// Runs AFTER the canonicalizer, which already collected per-action Luau
// validator issues into `luauIssuesByAction`. The primary NVIDIA repair
// path (repairLuauWithNvidia + generateLuauReplacementWithNvidia in
// src/routes/api/chat.ts) has already been given a chance to regenerate
// broken scripts BEFORE we get here. Running yet another LLM regen loop
// on the same scripts doubled build-turn latency without measurably
// improving output quality, so this gate is now cheap and deterministic:
//
//   - Report which scripts still have ERROR-severity Luau issues.
//   - Attach `_luau_errors` metadata to the payload so the plugin can
//     show a load-time warning instead of silently exploding at runtime.
//
// No LLM calls. No network. Bounded, sub-millisecond per action.

import type { CanonAction, CanonResult } from "./action-canonicalizer";

export type SelfTestResult = {
  fixedByRegen: string[];   // kept for API compat — always [] in tag-only mode
  stillBroken: string[];    // action names with residual error-severity issues
  attempted: number;
  ranMs: number;
};

export async function runLuauSelfTest(opts: {
  userText: string;
  actions: CanonAction[];
  canon: CanonResult;
}): Promise<SelfTestResult> {
  const startedAt = Date.now();
  void opts.userText;
  const stillBroken: string[] = [];

  const broken = opts.canon.luauIssuesByAction.filter((entry) =>
    entry.issues.some((i) => i.severity === "error"),
  );
  if (broken.length === 0) {
    return { fixedByRegen: [], stillBroken, attempted: 0, ranMs: Date.now() - startedAt };
  }

  const findAction = (name: string, kind: string): CanonAction | undefined =>
    opts.actions.find(
      (a) => String(a.name || "") === name && String(a.kind || "").toLowerCase() === kind.toLowerCase(),
    );

  for (const entry of broken) {
    const action = findAction(entry.name, entry.kind);
    if (!action) continue;
    const errs = entry.issues.filter((i) => i.severity === "error").map((i) => i.message);
    if (errs.length === 0) continue;
    stillBroken.push(entry.name);
    if (action.payload && typeof action.payload === "object") {
      (action.payload as Record<string, unknown>)._luau_errors = errs;
    }
  }

  return { fixedByRegen: [], stillBroken, attempted: broken.length, ranMs: Date.now() - startedAt };
}

