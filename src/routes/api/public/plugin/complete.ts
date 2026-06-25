// Plugin POST: report action result (done | failed).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/plugin/complete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            token?: string; action_id?: string; status?: "done" | "failed";
            error?: string; result?: unknown;
          };
          if (!body.token || !body.action_id) {
            return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { "content-type": "application/json", ...CORS } });
          }
          const sb = admin();
          const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", body.token).maybeSingle();
          if (!profile) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { "content-type": "application/json", ...CORS } });

          const status = body.status === "failed" ? "failed" : "done";
          const { data: action } = await sb.from("plugin_actions")
            .update({
              status,
              error: body.error ?? null,
              result: body.result ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", body.action_id)
            .eq("user_id", profile.id)
            .select("project_id")
            .maybeSingle();

          // If failed, log a studio error too
          if (status === "failed" && body.error && action) {
            await sb.from("studio_errors").insert({
              user_id: profile.id,
              project_id: action.project_id,
              action_id: body.action_id,
              source: "plugin",
              level: "error",
              message: body.error,
            });
          }

          return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", ...CORS } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { "content-type": "application/json", ...CORS } });
        }
      },
    },
  },
});
