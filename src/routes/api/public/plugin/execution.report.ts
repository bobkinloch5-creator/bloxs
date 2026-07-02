// Plugin POST: submit a full execution report at the end of a build batch.
// Persists to public.execution_reports for user-visible history.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-bloxsmith-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function clampInt(n: unknown, max = 100000) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(0, Math.min(max, v));
}

function clampStr(s: unknown, max: number) {
  if (typeof s !== "string") return null;
  return s.slice(0, max);
}

function clampJson(v: unknown, max = 200) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max);
}

export const Route = createFileRoute("/api/public/plugin/execution/report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            project_id?: string | null;
            source?: string;
            total?: number;
            ok_count?: number;
            fail_count?: number;
            skip_count?: number;
            repair_count?: number;
            retry_count?: number;
            duration_ms?: number;
            plan?: unknown;
            steps?: unknown;
            summary?: string;
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

          const stepsClamped = clampJson(body.steps, 500) as Array<{
            kind?: string; name?: string; status?: string; path?: string;
          }>;

          const { error } = await sb.from("execution_reports").insert({
            user_id: profile.id,
            project_id: body.project_id ?? null,
            source: clampStr(body.source, 40) ?? "plugin",
            total: clampInt(body.total),
            ok_count: clampInt(body.ok_count),
            fail_count: clampInt(body.fail_count),
            skip_count: clampInt(body.skip_count),
            repair_count: clampInt(body.repair_count),
            retry_count: clampInt(body.retry_count),
            duration_ms: clampInt(body.duration_ms, 60 * 60 * 1000),
            plan: clampJson(body.plan, 50),
            steps: stepsClamped,
            summary: clampStr(body.summary, 2000),
          });
          if (error) return json({ error: error.message }, 500);

          // Release 2 — Project Awareness: after every build, upsert a
          // `last_build` project_memory entry so the AI knows what it just
          // created and can modify existing instances instead of rebuilding.
          if (body.project_id && Array.isArray(stepsClamped) && stepsClamped.length > 0) {
            const done = stepsClamped.filter((s) => s?.status === "done");
            const byKind: Record<string, number> = {};
            const paths: string[] = [];
            for (const s of done) {
              const k = (s?.kind || "other").toString();
              byKind[k] = (byKind[k] ?? 0) + 1;
              if (s?.path && paths.length < 30) paths.push(String(s.path));
            }
            const kindSummary = Object.entries(byKind)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => `${k}×${n}`)
              .join(", ");
            const value = [
              `${new Date().toISOString()} — ${done.length} action(s) applied (${kindSummary || "none"}).`,
              paths.length ? `Created paths:\n${paths.map((p) => `  - ${p}`).join("\n")}` : "",
              `Full report: ${clampInt(body.ok_count)} ok · ${clampInt(body.fail_count)} failed · ${clampInt(body.skip_count)} skipped.`,
              `IMPORTANT: modify these existing instances on future edits — do not rebuild them.`,
            ].filter(Boolean).join("\n").slice(0, 1900);

            await sb.from("project_memory").upsert(
              {
                project_id: body.project_id,
                user_id: profile.id,
                key: "last_build",
                value,
                kind: "decision",
                importance: 9,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "project_id,key" },
            );
          }

          return json({ ok: true });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
