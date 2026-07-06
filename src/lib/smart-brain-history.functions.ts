// Fetches the Smart Brain's last-run analysis for a project so the UI can
// show "Why did it do that?" — intent, plan, specialist model picks, and
// confidence — from the persisted project_memory row.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ projectId: z.string().uuid() });

export type SmartBrainLastRun = {
  goal: string;
  intent: {
    summary: string;
    category: string;
    complexity: string;
    systems: string[];
    risks: string[];
  } | null;
  specialist_models: Array<{ task: string; model: string }>;
  confidence: number;
  at: string;
} | null;

export const getSmartBrainLastRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<SmartBrainLastRun> => {
    const { data: row, error } = await context.supabase
      .from("project_memory")
      .select("value, updated_at")
      .eq("project_id", data.projectId)
      .eq("key", "smart_brain_last_run")
      .maybeSingle();
    if (error || !row) return null;
    try {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        goal: String(parsed.goal ?? ""),
        intent: parsed.intent ?? null,
        specialist_models: Array.isArray(parsed.specialist_models) ? parsed.specialist_models : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        at: String(parsed.at ?? row.updated_at ?? new Date().toISOString()),
      };
    } catch {
      return null;
    }
  });
