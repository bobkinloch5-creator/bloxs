// Plugin → server: poll a pair code. Once the website has approved it,
// returns the user's plugin_token so the plugin can use the normal poll loop.
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
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

export const Route = createFileRoute("/api/public/plugin/pair/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { code?: string };
          if (!body.code) return json({ error: "missing code" }, 400);
          const sb = admin();
          const { data, error } = await sb
            .from("plugin_pair_codes")
            .select("code, plugin_token, project_id, claimed_at, expires_at")
            .eq("code", body.code.toUpperCase())
            .maybeSingle();
          if (error) return json({ error: error.message }, 500);
          if (!data) return json({ status: "unknown" }, 404);
          if (new Date(data.expires_at) < new Date()) return json({ status: "expired" }, 410);
          if (!data.claimed_at || !data.plugin_token) return json({ status: "pending" });
          // Mark picked up so the website knows the plugin actually retrieved the token.
          await sb.from("plugin_pair_codes")
            .update({ picked_up_at: new Date().toISOString() })
            .eq("code", data.code);
          return json({
            status: "approved",
            plugin_token: data.plugin_token,
            project_id: data.project_id,
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
