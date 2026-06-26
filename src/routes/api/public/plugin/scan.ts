// Plugin POST: stores a snapshot of the user's Roblox game tree so the AI can
// reason about what already exists.
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
    status, headers: { "content-type": "application/json", ...cors() },
  });
}

export const Route = createFileRoute("/api/public/plugin/scan")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string; scan?: unknown; place_id?: string;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() || "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", token).maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);

          // Cap snapshot size to avoid pathological payloads.
          const snapshot = body.scan ?? {};
          const str = JSON.stringify(snapshot);
          if (str.length > 200_000) return json({ error: "scan too large" }, 413);

          await sb.from("plugin_sessions").upsert({
            user_id: profile.id,
            place_id: body.place_id ?? null,
            last_scan: snapshot,
            last_scan_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            online: true,
          }, { onConflict: "user_id" });

          return json({ ok: true });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
