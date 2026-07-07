// Luau self-test gate.
//
// Runs AFTER the canonicalizer. The canonicalizer already:
//   - stripped fences / normalized deprecated globals via autoFixLuau
//   - collected per-action Luau validator issues into `luauIssuesByAction`
//
// This gate acts on ERROR-severity issues: for each broken script it asks
// a fast NVIDIA model to regenerate ONLY that script's source in place,
// given the user request + the exact validator errors. The regen is then
// re-run through autoFix + validate. If it still errors, we keep the
// original source but attach `_luau_errors` metadata so the plugin can
// show a warning instead of silently exploding at runtime.
//
// Guarantees:
//   - Never removes actions that were already in the batch.
//   - Warn-only issues are ignored (they don't crash Studio).
//   - One regen attempt per broken script. Bounded to at most 4 per turn
//     to keep the latency envelope predictable.
//   - Best-effort: any thrown error is caught by the caller and the build
//     turn still ships.

import { generateText } from "ai";
import { getFallbackModel } from "./ai-gateway.server";
import { autoFixLuau, validateLuau, stripCodeFences, type LuauIssue } from "./luau-validator";
import type { CanonAction, CanonResult } from "./action-canonicalizer";

export type SelfTestResult = {
  fixedByRegen: string[];      // action names successfully repaired via LLM regen
  stillBroken: string[];       // action names that still have errors after regen
  attempted: number;
  ranMs: number;
};

const MAX_REGEN_PER_TURN = 4;
const REGEN_TIMEOUT_MS = 20000;

const REGEN_SYSTEM = `You are the BloxSmith LUAU REPAIR agent.
The Luau validator flagged errors in a script that was about to be shipped to Roblox Studio.
Your ONLY job: return CORRECTED Luau for that single script.

Return ONLY the raw Luau source. No prose. No markdown fences. No comments explaining the fix.

Hard rules:
- Modern APIs only: task.wait, task.spawn, task.delay, :Connect (capital C).
- pcall around DataStore/HttpService/MarketplaceService/TeleportService.
- LocalScripts use game:GetService("UserInputService"), Players.LocalPlayer, StarterGui.
- Server Scripts use game:GetService("Players").PlayerAdded, ServerScriptService.
- Match the script's declared kind (LocalScript vs Script vs ModuleScript vs run_lua).
- Every opener (function/if/for/while/repeat) needs a matching end/until.
- Balanced parentheses and braces.
- No JSON-style tables — Luau tables use key = value, not "key": value.
- No loadstring, no require by numeric assetId.
- Preserve the ORIGINAL INTENT of the script — keep the same feature, just make it correct.`;

function getSource(a: CanonAction): string | undefined {
  const s = (a.source as string | undefined) ?? (a.payload?.source as string | undefined);
  return typeof s === "string" ? s : undefined;
}

function setSource(a: CanonAction, next: string) {
  if (a.payload && typeof a.payload === "object") {
    a.payload.source = next;
  }
  if (typeof a.source === "string") a.source = next;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("luau-regen timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function regenScript(opts: {
  userText: string;
  action: CanonAction;
  brokenSource: string;
  errors: LuauIssue[];
}): Promise<string | null> {
  const { model, extraBody } = getFallbackModel();
  const errorList = opts.errors
    .filter((i) => i.severity === "error")
    .map((i, idx) => `${idx + 1}. ${i.message}`)
    .join("\n");
  const prompt = `USER REQUEST:
${opts.userText.slice(0, 800)}

SCRIPT NAME: ${String(opts.action.name || "unnamed")}
SCRIPT KIND: ${String(opts.action.kind || "run_lua")}

VALIDATOR ERRORS:
${errorList}

BROKEN SOURCE:
\`\`\`lua
${opts.brokenSource}
\`\`\`

Return corrected Luau source only.`;

  try {
    const { text } = await withTimeout(
      generateText({
        model,
        system: REGEN_SYSTEM,
        prompt,
        temperature: 0.1,
        ...(extraBody ? { providerOptions: { openai: extraBody } } : {}),
      }),
      REGEN_TIMEOUT_MS,
    );
    const cleaned = stripCodeFences(text || "").trim();
    return cleaned || null;
  } catch (err) {
    console.warn("[luau-self-test] regen call failed", { name: opts.action.name, err: (err as Error)?.message });
    return null;
  }
}

/**
 * Runs the self-test gate. Mutates `actions` in-place when a regen succeeds.
 * Attaches `_luau_errors` metadata on payload when a script still has errors.
 */
export async function runLuauSelfTest(opts: {
  userText: string;
  actions: CanonAction[];
  canon: CanonResult;
}): Promise<SelfTestResult> {
  const startedAt = Date.now();
  const fixedByRegen: string[] = [];
  const stillBroken: string[] = [];

  // Only act on ERROR-severity issues. Warn-level are informational.
  const broken = opts.canon.luauIssuesByAction
    .filter((entry) => entry.issues.some((i) => i.severity === "error"))
    .slice(0, MAX_REGEN_PER_TURN);

  if (broken.length === 0) {
    return { fixedByRegen, stillBroken, attempted: 0, ranMs: Date.now() - startedAt };
  }

  // Index actions by (name, kind) for in-place mutation.
  const findAction = (name: string, kind: string): CanonAction | undefined => {
    return opts.actions.find(
      (a) => String(a.name || "") === name && String(a.kind || "").toLowerCase() === kind.toLowerCase(),
    );
  };

  let attempted = 0;
  for (const entry of broken) {
    const action = findAction(entry.name, entry.kind);
    if (!action) continue;
    const src = getSource(action);
    if (!src) continue;

    attempted += 1;
    const regen = await regenScript({
      userText: opts.userText,
      action,
      brokenSource: src,
      errors: entry.issues,
    });

    if (!regen) {
      stillBroken.push(entry.name);
      if (action.payload && typeof action.payload === "object") {
        (action.payload as Record<string, unknown>)._luau_errors = entry.issues.map((i) => i.message);
      }
      continue;
    }

    // Auto-fix + re-validate the regen. If it still errors, keep the ORIGINAL
    // (regen might be worse) and mark for warning.
    const { source: fixed } = autoFixLuau(regen);
    const reissues = validateLuau(fixed);
    const stillErrors = reissues.filter((i) => i.severity === "error");
    if (stillErrors.length === 0) {
      setSource(action, fixed);
      fixedByRegen.push(entry.name);
    } else {
      stillBroken.push(entry.name);
      if (action.payload && typeof action.payload === "object") {
        (action.payload as Record<string, unknown>)._luau_errors = stillErrors.map((i) => i.message);
      }
    }
  }

  return { fixedByRegen, stillBroken, attempted, ranMs: Date.now() - startedAt };
}
