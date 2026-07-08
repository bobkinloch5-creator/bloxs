// Playtest auto-fix loop — reads the latest failing report for a run, prompts
// the AI with concrete findings + phase evidence, records the AI's plan in
// project_memory so the plugin's next batch executes it, then flips the loop
// directive back to `rerun` so the plugin fires another Playtest.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const RunInput = z.object({ run_id: z.string().uuid() });

const AUTOFIX_SYSTEM = `You are BloxSmith's Playtest auto-fix agent for Roblox Studio.
The Playtest verifier just ran the user's project and reported failing findings.
You will read those findings and output a TIGHT, MECHANICAL fix plan the build
pipeline can execute in Studio.

Rules:
- Focus ONLY on the listed failing findings. Do not scope-creep.
- Prefer the smallest change that resolves each finding (patch a script, wire a
  RemoteEvent, add a missing SpawnLocation, disable an infinite loop).
- Never claim a fix without listing WHICH finding IDs it targets.
- Return STRICT JSON only (no markdown), shape:
{
  "attempted": true,
  "targets": ["finding_id_1", "..."],
  "plan": "3-6 sentence explanation of the exact edits to make",
  "actions": [
    { "kind": "edit_script"|"add_remote"|"add_spawn"|"add_ui"|"remove_loop"|"other",
      "path": "Roblox path or script name",
      "detail": "one sentence" }
  ],
  "confidence": 0-100,
  "notes": "short"
}`;

export const runPlaytestAutofix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const userId = context.userId as string;

    const { data: loop } = await sb
      .from("playtest_loop_state")
      .select("run_id, attempt, max_attempts, directive")
      .eq("run_id", data.run_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!loop) return { ok: false as const, error: "run not found" };
    if (loop.directive !== "wait_for_ai") {
      return { ok: false as const, error: `directive=${loop.directive}` };
    }

    const { data: report } = await sb
      .from("playtest_reports")
      .select("id, findings, phase_results, summary, screenshot_urls, attempt")
      .eq("run_id", data.run_id)
      .eq("user_id", userId)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!report) return { ok: false as const, error: "no report for run" };

    const failing = (Array.isArray(report.findings) ? report.findings : [])
      .filter((f: any) => f?.severity === "critical" || f?.severity === "high")
      .slice(0, 25);

    if (failing.length === 0) {
      // Nothing critical/high — mark as passed to unblock the plugin.
      await sb.from("playtest_loop_state").update({
        directive: "passed",
        reason: "no blocking findings",
        updated_at: new Date().toISOString(),
      }).eq("run_id", data.run_id);
      return { ok: true as const, autofix: null, directive: "passed" as const };
    }

    const prompt = [
      `Attempt ${loop.attempt} of ${loop.max_attempts}.`,
      `Failing findings (JSON):`,
      JSON.stringify(failing, null, 2),
      report.phase_results && Object.keys(report.phase_results).length > 0
        ? `Phase evidence: ${JSON.stringify(report.phase_results).slice(0, 3000)}`
        : "",
      report.screenshot_urls && report.screenshot_urls.length > 0
        ? `Screenshots captured: ${report.screenshot_urls.length}`
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
    } catch (e) {
      planText = "";
    }

    let planJson: any = null;
    try {
      const match = planText.match(/\{[\s\S]*\}/);
      if (match) planJson = JSON.parse(match[0]);
    } catch {
      planJson = null;
    }

    // Persist the AI plan into the report's summary so the UI + next chat
    // pass can see what was attempted for this attempt.
    try {
      const mergedSummary = { ...(report.summary ?? {}), autofix: planJson ?? { raw: planText } };
      await sb.from("playtest_reports").update({ summary: mergedSummary }).eq("id", report.id);
    } catch {
      // Best-effort; never block the loop on the persist step.
    }

    // Advance directive so the plugin re-runs Playtest.
    const nextAttempt = (loop.attempt ?? 1) + 1;
    const reachedCap = nextAttempt > loop.max_attempts;
    await sb.from("playtest_loop_state").update({
      directive: reachedCap ? "stop" : "rerun",
      attempt: nextAttempt,
      reason: reachedCap
        ? `Reached max attempts (${loop.max_attempts}).`
        : `AI produced a fix plan; plugin should re-run Playtest.`,
      updated_at: new Date().toISOString(),
    }).eq("run_id", data.run_id);

    return {
      ok: true as const,
      autofix: planJson ?? { raw: planText },
      directive: reachedCap ? ("stop" as const) : ("rerun" as const),
      next_attempt: nextAttempt,
    };
  });

const TimelineInput = z.object({ run_id: z.string().uuid() });

export const getPlaytestRunTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TimelineInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: reports } = await sb
      .from("playtest_reports")
      .select("id, created_at, attempt, status, summary, findings, phase_results, screenshot_urls, duration_ms, finding_fingerprint")
      .eq("run_id", data.run_id)
      .order("attempt", { ascending: true });
    const { data: loop } = await sb
      .from("playtest_loop_state")
      .select("directive, attempt, max_attempts, reason, updated_at")
      .eq("run_id", data.run_id)
      .maybeSingle();
    return { ok: true as const, reports: reports ?? [], loop: loop ?? null };
  });

const StopInput = z.object({ run_id: z.string().uuid() });

export const stopPlaytestLoop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StopInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("playtest_loop_state").update({
      directive: "stop",
      reason: "Stopped by user.",
      updated_at: new Date().toISOString(),
    }).eq("run_id", data.run_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
