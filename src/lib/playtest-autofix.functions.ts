// Playtest auto-fix loop — thin wrappers around the shared core so both the
// plugin ingest route and user-triggered calls run the same logic.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RunInput = z.object({ run_id: z.string().uuid() });

export const runPlaytestAutofix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { runPlaytestAutofixCore } = await import("./playtest-autofix.server");
    return runPlaytestAutofixCore(ctx.supabase as any, ctx.userId as string, data.run_id);
  });

const TimelineInput = z.object({ run_id: z.string().uuid() });

export const getPlaytestRunTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TimelineInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
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
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const { error } = await sb.from("playtest_loop_state").update({
      directive: "stop",
      reason: "Stopped by user.",
      updated_at: new Date().toISOString(),
    }).eq("run_id", data.run_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

