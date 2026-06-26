// Plugin GET: returns pending actions for the authenticated plugin (via plugin_token).
// Also updates plugin_sessions heartbeat.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export const Route = createFileRoute("/api/public/plugin/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string; place_id?: string; studio_version?: string; plugin_version?: string; project_id?: string | null;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { data: profile } = await sb.from("profiles")
            .select("id")
            .eq("plugin_token", token)
            .maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);

          // Heartbeat
          await sb.from("plugin_sessions").upsert({
            user_id: profile.id,
            project_id: body.project_id ?? null,
            place_id: body.place_id ?? null,
            studio_version: body.studio_version ?? null,
            plugin_version: body.plugin_version ?? null,
            last_seen: new Date().toISOString(),
            online: true,
          }, { onConflict: "user_id" });

          // Pull pending actions (across user's projects unless project_id given)
          let q = sb.from("plugin_actions")
            .select("id, project_id, kind, parent_path, name, payload, position")
            .eq("user_id", profile.id)
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(100);
          if (body.project_id) q = q.eq("project_id", body.project_id);
          const { data: actions, error } = await q;
          if (error) return json({ error: error.message }, 500);

          if (actions && actions.length > 0) {
            const ids = actions.map((a) => a.id);
            await sb.from("plugin_actions")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .in("id", ids);
            const projectIds = [...new Set(actions.map((a) => a.project_id))];
            for (const pid of projectIds) {
              await sb.from("projects").update({ plugin_connected: true }).eq("id", pid);
            }
          }

          return json({ user_id: profile.id, actions: actions ?? [] });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization, x-bloxsmith-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", ...cors() },
  });
}
