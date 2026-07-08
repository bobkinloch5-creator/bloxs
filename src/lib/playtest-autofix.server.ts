// Shared Playtest auto-fix worker. Called by both:
//  - the plugin report ingest route (auto, using admin client), and
//  - the runPlaytestAutofix server fn (user, using the auth-scoped client).
// Reads the latest attempt's failing findings, asks the AI for a fix plan,
// stores it into the report's summary.autofix, and advances the loop directive.
import { generateText } from "ai";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

export const AUTOFIX_SYSTEM = `You are BloxSmith's Playtest auto-fix agent for Roblox Studio.
The Playtest verifier just ran the user's project and reported failing findings.
Output a TIGHT, MECHANICAL fix plan the build pipeline can execute in Studio.

Rules:
- Focus ONLY on the listed failing findings. Do not scope-creep.
- Prefer the smallest change that resolves each finding.
- Never claim a fix without listing WHICH finding IDs it targets.
- Return STRICT JSON only (no markdown), shape:
{
  "attempted": true,
  "targets": ["finding_id_1"],
  "plan": "3-6 sentences of exact edits to make",
  "actions": [ { "kind": "edit_script"|"add_remote"|"add_spawn"|"add_ui"|"remove_loop"|"other",
                 "path": "Roblox path or script name",
                 "detail": "one sentence" } ],
  "confidence": 0-100,
  "notes": "short"
}`;

export async function runPlaytestAutofixCore(
  sb: any,
  userId: string,
  runId: string,
): Promise<{ ok: boolean; directive: string; autofix?: any; error?: string }> {
  const { data: loop } = await sb
    .from("playtest_loop_state")
    .select("run_id, attempt, max_attempts, directive")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!loop) return { ok: false, directive: "idle", error: "run not found" };
  if (loop.directive !== "wait_for_ai") {
    return { ok: false, directive: loop.directive, error: `directive=${loop.directive}` };
  }

  const { data: report } = await sb
    .from("playtest_reports")
    .select("id, findings, phase_results, summary, screenshot_urls, attempt")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!report) return { ok: false, directive: loop.directive, error: "no report" };

  const failing = (Array.isArray(report.findings) ? report.findings : [])
    .filter((f: any) => f?.severity === "critical" || f?.severity === "high")
    .slice(0, 25);

  if (failing.length === 0) {
    await sb.from("playtest_loop_state").update({
      directive: "passed",
      reason: "no blocking findings",
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);
    return { ok: true, directive: "passed" };
  }

  const prompt = [
    `Attempt ${loop.attempt} of ${loop.max_attempts}.`,
    `Failing findings (JSON):`,
    JSON.stringify(failing, null, 2),
    report.phase_results && Object.keys(report.phase_results).length > 0
      ? `Phase evidence: ${JSON.stringify(report.phase_results).slice(0, 3000)}`
      : "",
  ].filter(Boolean).join("\n\n");

  let planText = "";
  try {
    const { model } = getProviderModel(FALLBACK_MODEL_ID);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("autofix timed out"), 20000);
    const { text } = await generateText({
      model,
      system: AUTOFIX_SYSTEM,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 900,
      abortSignal: controller.signal,
    });
    clearTimeout(timeout);
    planText = (text || "").trim();
  } catch {
    planText = "";
  }

  let planJson: any = null;
  try {
    const match = planText.match(/\{[\s\S]*\}/);
    if (match) planJson = JSON.parse(match[0]);
  } catch {
    planJson = null;
  }

  try {
    const mergedSummary = { ...(report.summary ?? {}), autofix: planJson ?? { raw: planText } };
    await sb.from("playtest_reports").update({ summary: mergedSummary }).eq("id", report.id);
  } catch {
    // best-effort
  }

  const nextAttempt = (loop.attempt ?? 1) + 1;
  const reachedCap = nextAttempt > loop.max_attempts;
  await sb.from("playtest_loop_state").update({
    directive: reachedCap ? "stop" : "rerun",
    attempt: nextAttempt,
    reason: reachedCap
      ? `Reached max attempts (${loop.max_attempts}).`
      : `AI produced a fix plan; plugin should re-run Playtest.`,
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);

  return {
    ok: true,
    directive: reachedCap ? "stop" : "rerun",
    autofix: planJson ?? { raw: planText },
  };
}
