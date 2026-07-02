import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ limit: z.number().int().min(1).max(20).default(1) });

export const getLatestPlaytest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("playtest_reports")
      .select("id, created_at, summary, findings, metrics, place_id")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) return { ok: false as const, error: error.message, reports: [] };
    return { ok: true as const, reports: rows ?? [] };
  });
