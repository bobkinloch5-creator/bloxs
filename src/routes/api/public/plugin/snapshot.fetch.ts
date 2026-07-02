// Plugin GET: returns the snapshot_data for a milestone so it can be restored.
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

async function handle(token: string, milestoneId: string) {
  if (!token) return json({ error: "missing token" }, 401);
  if (!milestoneId) return json({ error: "missing id" }, 400);
  const sb = admin();
  const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", token).maybeSingle();
  if (!profile) return json({ error: "invalid token" }, 401);
  const { data: row, error } = await sb
    .from("build_milestones")
    .select("id, label, summary, snapshot_data, created_at, project_id")
    .eq("id", milestoneId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ error: "milestone not found" }, 404);
  return json({ ok: true, milestone: row });
}

export const Route = createFileRoute("/api/public/plugin/snapshot/fetch")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
          request.headers.get("x-bloxsmith-token")?.trim() ||
          url.searchParams.get("token") ||
          "";
        return handle(token, url.searchParams.get("id") || "");
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { token?: string; id?: string };
        const token =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
          request.headers.get("x-bloxsmith-token")?.trim() ||
          body.token ||
          "";
        return handle(token, body.id || "");
      },
    },
  },
});
