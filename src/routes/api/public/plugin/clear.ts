// Plugin POST: clear stuck pending/sent actions for the authenticated plugin user.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { getSanitizedSupabaseUrl, getSanitizedServiceKey } from "@/integrations/supabase/client.server";

function admin() {
  return createClient(getSanitizedSupabaseUrl(), getSanitizedServiceKey(), {
    auth: { persistSession: false },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/plugin/clear")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { token?: string; project_id?: string | null };
          if (!body.token) return json({ error: "missing token" }, 401);
          const sb = admin();
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          const profile = await resolvePluginToken(body.token);
          if (!profile) return json({ error: "invalid token" }, 401);

          let q = sb.from("plugin_actions")
            .update({ status: "failed", error: "Cleared by user from plugin", completed_at: new Date().toISOString() })
            .eq("user_id", profile.id)
            .in("status", ["pending", "sent"]);
          if (body.project_id) q = q.eq("project_id", body.project_id);
          const { data, error } = await q.select("id");
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true, cleared: data?.length ?? 0 });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
