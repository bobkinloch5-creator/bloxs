// Offline quality evaluation for BloxSmith's generated output.
//
// Why this exists: before this module the only way to tell whether a prompt
// change, a model swap, or a knowledge-base edit made the AI better or worse
// was to run a build by hand and eyeball it. That is not a regression test -
// it is an opinion. Every "improvement" was effectively unverified.
//
// This scores output deterministically, with no model call and no network, so
// it runs in CI in milliseconds:
//
//   - Luau quality  -> the existing validator + performance analyzer
//   - Structure     -> are artifacts routed to legal Roblox service paths
//   - Intent        -> does the deterministic UI blueprint pick the right layout
//
// It cannot measure whether a model writes elegant code. It absolutely can
// catch the failures that actually reach users: syntax errors, scripts parented
// to services that cannot run them, and a "shop" prompt rendering a main menu.

import {
  analyzeLuauPerformance,
  performanceScore,
  stripCodeFences,
  validateLuau,
  type PerfFinding,
} from "@/lib/luau-validator";
import { ROBLOX_SERVICES } from "@/lib/roblox-explorer";
import { detectUiKind, type UiKind } from "@/lib/roblox-ui-blueprint";

// ---------------------------------------------------------------------------
// Script scoring
// ---------------------------------------------------------------------------

export type ScriptScore = {
  /** 0-100. 100 means no validator errors and no performance findings. */
  score: number;
  errors: number;
  warnings: number;
  performance: number;
  findings: PerfFinding[];
  /** Human-readable reasons the score is not 100. */
  reasons: string[];
};

/**
 * Score a single generated Luau source.
 *
 * Errors dominate: a script that does not parse is worthless regardless of how
 * well it scores on anything else, so each one costs heavily. Warnings and
 * performance findings shade the result rather than sink it.
 */
export function scoreScript(rawSource: string): ScriptScore {
  const source = stripCodeFences(String(rawSource ?? ""));
  const issues = validateLuau(source);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warn");
  const findings = analyzeLuauPerformance(source);
  const performance = performanceScore(findings);

  const reasons: string[] = [];
  for (const e of errors.slice(0, 5)) reasons.push(`error: ${e.message}`);
  for (const w of warnings.slice(0, 3)) reasons.push(`warn: ${w.message}`);
  for (const f of findings.filter((x) => x.severity === "error").slice(0, 3)) {
    reasons.push(`perf(${f.category}): ${f.message}`);
  }

  const penalty = errors.length * 35 + warnings.length * 6 + (100 - performance) * 0.25;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return { score, errors: errors.length, warnings: warnings.length, performance, findings, reasons };
}

// ---------------------------------------------------------------------------
// Structure scoring
// ---------------------------------------------------------------------------

/** Services that can actually run a Script or LocalScript. */
const RUNS_SERVER_CODE = ["ServerScriptService", "Workspace"];
const RUNS_CLIENT_CODE = ["StarterPlayer", "StarterGui", "StarterPack", "ReplicatedFirst"];

export type StructureIssue = { path: string; problem: string };

export type PlacedArtifact = {
  className: string;
  /** Full explorer path, e.g. "ServerScriptService/BloxSmith/Systems/Shop". */
  path: string;
};

/**
 * Check that generated artifacts are parented somewhere legal.
 *
 * These are the mistakes that produce a build which "looks fine" in the
 * explorer and then does nothing at runtime: a server Script under StarterGui,
 * a LocalScript under ServerScriptService, or anything under a service that
 * does not exist.
 */
export function checkStructure(artifacts: PlacedArtifact[]): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const services = new Set<string>(ROBLOX_SERVICES as readonly string[]);

  for (const a of artifacts) {
    const root = String(a.path ?? "").split("/")[0]?.trim() ?? "";
    if (!root) {
      issues.push({ path: a.path, problem: "empty path" });
      continue;
    }
    if (!services.has(root)) {
      issues.push({ path: a.path, problem: `"${root}" is not a Roblox service` });
      continue;
    }
    if (a.className === "Script" && !RUNS_SERVER_CODE.includes(root)) {
      issues.push({ path: a.path, problem: `a Script under ${root} will never run` });
    }
    if (a.className === "LocalScript" && !RUNS_CLIENT_CODE.includes(root)) {
      issues.push({ path: a.path, problem: `a LocalScript under ${root} will never run` });
    }
    if (a.className === "RemoteEvent" && root !== "ReplicatedStorage") {
      issues.push({ path: a.path, problem: "remotes must live in ReplicatedStorage to be visible to both sides" });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Intent golden set
// ---------------------------------------------------------------------------

export type IntentCase = {
  id: string;
  prompt: string;
  expected: UiKind;
};

/**
 * Prompts a user would realistically type, paired with the layout they clearly
 * meant. These are the regression guard for `detectUiKind`: this is exactly the
 * class of bug the user hit when a main-menu prompt rendered a shop.
 */
export const UI_INTENT_GOLDEN_SET: IntentCase[] = [
  { id: "menu-basic", prompt: "Main menu with a big title, Play / Shop / Settings buttons, and hover animations", expected: "main-menu" },
  { id: "menu-title", prompt: "title screen with a play button", expected: "main-menu" },
  { id: "menu-start", prompt: "start screen for my obby with a big logo", expected: "main-menu" },
  { id: "shop-basic", prompt: "shop window where players buy swords with coins", expected: "shop" },
  { id: "shop-store", prompt: "in game store with item cards and a purchase button", expected: "shop" },
  { id: "inventory-basic", prompt: "inventory grid showing collected items with rarity borders", expected: "inventory" },
  { id: "inventory-backpack", prompt: "backpack screen with equipped slots", expected: "inventory" },
  { id: "settings-basic", prompt: "settings panel with music volume slider and graphics toggle", expected: "settings" },
  { id: "hud-basic", prompt: "hud showing health bar coins and level in the corner", expected: "hud" },
  { id: "loading-basic", prompt: "loading screen with a progress bar and rotating tips", expected: "loading" },
  { id: "leaderboard-basic", prompt: "leaderboard showing the top 10 players by wins", expected: "leaderboard" },
  { id: "quests-basic", prompt: "daily quests panel with progress bars and claim buttons", expected: "quests" },
  { id: "pause-basic", prompt: "pause menu with resume and quit", expected: "pause" },
  { id: "battlepass-basic", prompt: "battle pass with free and premium reward tracks", expected: "battlepass" },
  { id: "crafting-basic", prompt: "crafting bench ui with recipe list and ingredient slots", expected: "crafting" },
  { id: "dialog-basic", prompt: "npc dialogue box with the character name and reply choices", expected: "dialog" },
  { id: "trading-basic", prompt: "trading window where two players offer items and accept", expected: "trading" },
];

export type IntentResult = {
  id: string;
  prompt: string;
  expected: UiKind;
  actual: UiKind;
  pass: boolean;
};

export type IntentReport = {
  results: IntentResult[];
  passed: number;
  total: number;
  /** 0-1. */
  accuracy: number;
  failures: IntentResult[];
};

/** Run the intent golden set. Pure and instant - no model, no network. */
export function runIntentEval(cases: IntentCase[] = UI_INTENT_GOLDEN_SET): IntentReport {
  const results: IntentResult[] = cases.map((c) => {
    const actual = detectUiKind(c.prompt);
    return { id: c.id, prompt: c.prompt, expected: c.expected, actual, pass: actual === c.expected };
  });
  const passed = results.filter((r) => r.pass).length;
  return {
    results,
    passed,
    total: results.length,
    accuracy: results.length === 0 ? 1 : passed / results.length,
    failures: results.filter((r) => !r.pass),
  };
}

/**
 * Accuracy floor for the intent classifier.
 *
 * Set just below current measured accuracy so the suite fails on a real
 * regression rather than on noise. Raise it as the classifier improves; never
 * lower it to make a failing build pass.
 */
export const INTENT_ACCURACY_FLOOR = 0.94;

/** Format a report for a CI log. */
export function formatIntentReport(report: IntentReport): string {
  const lines = [`intent accuracy: ${report.passed}/${report.total} (${(report.accuracy * 100).toFixed(1)}%)`];
  for (const f of report.failures) {
    lines.push(`  FAIL ${f.id}: expected ${f.expected}, got ${f.actual} -- "${f.prompt.slice(0, 60)}"`);
  }
  return lines.join("\n");
}
