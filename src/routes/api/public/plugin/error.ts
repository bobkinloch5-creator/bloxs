// Plugin POST: ingest Roblox Studio output / errors so the chat can offer
// auto-fixes on the next user message.
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
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...cors() } });
}

interface IncomingError {
  source?: string;
  level?: "error" | "warn" | "info";
  message: string;
  stack?: string;
  action_id?: string | null;
}

export const Route = createFileRoute("/api/public/plugin/error")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string; project_id?: string | null; errors?: IncomingError[];
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() || "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", token).maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);

          const errors = (body.errors ?? []).slice(0, 25).filter((e) => e && typeof e.message === "string");
          if (errors.length === 0) return json({ ok: true, inserted: 0 });

          const rows = errors.map((e) => ({
            user_id: profile.id,
            project_id: body.project_id ?? null,
            action_id: e.action_id ?? null,
            source: (e.source ?? "Output").slice(0, 200),
            level: e.level === "warn" || e.level === "info" ? e.level : "error",
            message: e.message.slice(0, 4000),
            stack: e.stack ? e.stack.slice(0, 4000) : null,
          }));
          const { error } = await sb.from("studio_errors").insert(rows);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true, inserted: rows.length });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
