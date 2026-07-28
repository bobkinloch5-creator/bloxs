// Lightweight heartbeat endpoint for the BloxSmith Studio plugin.
// Runs independently of the poll loop so long-running builds don't cause the web UI
// to flip to "Offline / disconnected". Optimized for minimal database Disk IO.
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

// In-memory cache for plugin_token -> profile id & 45-second write throttling to eliminate disk IOPS
const tokenCache = new Map<string, { id: string; fetchedAt: number }>();
const lastSessionWrite = new Map<string, number>();

export const Route = createFileRoute("/api/public/plugin/heartbeat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            place_id?: string;
            studio_version?: string;
            plugin_version?: string;
            project_id?: string | null;
            busy?: boolean;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          let userId: string | null = null;
          const cached = tokenCache.get(token);
          if (cached && Date.now() - cached.fetchedAt < 180_000) {
            userId = cached.id;
          } else {
            const { data: profile } = await sb
              .from("profiles")
              .select("id")
              .eq("plugin_token", token)
              .maybeSingle();
            if (!profile) return json({ error: "invalid token" }, 401);
            userId = profile.id;
            tokenCache.set(token, { id: userId, fetchedAt: Date.now() });
          }

          // Throttle database write to at most once per 45s per user
          const lastWrite = lastSessionWrite.get(userId) ?? 0;
          if (Date.now() - lastWrite > 45_000) {
            lastSessionWrite.set(userId, Date.now());
            await sb.from("plugin_sessions").upsert(
              {
                user_id: userId,
                project_id: body.project_id ?? null,
                place_id: body.place_id ?? null,
                studio_version: body.studio_version ?? null,
                plugin_version: body.plugin_version ?? null,
                last_seen: new Date().toISOString(),
                online: true,
              },
              { onConflict: "user_id" },
            );
          }

          return json({ ok: true, busy: !!body.busy });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});

