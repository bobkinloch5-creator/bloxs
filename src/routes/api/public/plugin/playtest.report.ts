// Plugin POST: stores the latest AI playtest audit so the chat AI and project
// page can show findings and auto-queue fixes.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization, x-bloxsmith-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Finding = {
  id?: string;
  severity?: Severity;
  category?: string;
  title?: string;
  detail?: string;
  path?: string;
  suggested_fix?: string;
  auto_fixable?: boolean;
};

export const Route = createFileRoute("/api/public/plugin/playtest/report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            place_id?: string;
            metrics?: Record<string, unknown>;
            findings?: Finding[];
            summary?: Record<string, unknown>;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { data: profile } = await sb
            .from("profiles")
            .select("id")
            .eq("plugin_token", token)
            .maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);

          const findings = Array.isArray(body.findings) ? body.findings.slice(0, 500) : [];
          const metrics = (body.metrics && typeof body.metrics === "object") ? body.metrics : {};
          const summary = (body.summary && typeof body.summary === "object") ? body.summary : {};

          // Compact severity rollup for fast list/badge rendering.
          const rollup: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
          for (const f of findings) {
            const sev = (f?.severity ?? "info") as Severity;
            if (sev in rollup) rollup[sev] += 1;
          }
          const enrichedSummary = { ...summary, rollup, finding_count: findings.length };

          const { data: row, error } = await sb
            .from("playtest_reports")
            .insert({
              user_id: profile.id,
              place_id: body.place_id ?? null,
              summary: enrichedSummary,
              findings,
              metrics,
            })
            .select("id, created_at")
            .single();
          if (error) return json({ error: error.message }, 500);

          // ── Feedback loop: link this report to the most recent pipeline run
          //    that is awaiting verification, and decide whether auto-repair
          //    is needed. The UI polls listAgentPipelines and will call
          //    runPipelineRepair when it sees verification_status='report_ready'.
          let linkedPipelineId: string | null = null;
          let verification: "clean" | "report_ready" | null = null;
          try {
            const blockerCount = (rollup.critical ?? 0) + (rollup.high ?? 0);
            const { data: awaitingPipeline } = await sb
              .from("agent_pipeline_runs")
              .select("id")
              .eq("user_id", profile.id)
              .eq("verification_status", "awaiting")
              .order("completed_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            if (awaitingPipeline?.id) {
              verification = blockerCount > 0 ? "report_ready" : "clean";
              await sb
                .from("agent_pipeline_runs")
                .update({
                  latest_report_id: row?.id ?? null,
                  verification_status: verification,
                })
                .eq("id", awaitingPipeline.id);
              linkedPipelineId = awaitingPipeline.id;
            }
          } catch {
            // Best-effort — never block the report on the linkage step.
          }

          return json({
            ok: true,
            id: row?.id,
            created_at: row?.created_at,
            rollup,
            linked_pipeline_id: linkedPipelineId,
            verification_status: verification,
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
