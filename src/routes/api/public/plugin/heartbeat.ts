// Lightweight heartbeat endpoint for the BloxSmith Studio plugin.
// Runs independently of the poll loop so long-running builds don't cause the web UI
// to flip to "Offline / disconnected". Optimized for minimal database Disk IO.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolvePluginToken } from "@/lib/resolve-plugin-token";

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
const lastWrittenVersion = new Map<string, string>();

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
            request.headers
              .get("authorization")
              ?.replace(/^Bearer\s+/i, "")
              .trim() ||
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
            const profile = await resolvePluginToken(token);
            userId = profile?.id ?? null;
            if (!userId) return json({ error: "invalid token; reconnect the Studio plugin" }, 401);
            tokenCache.set(token, { id: userId, fetchedAt: Date.now() });
          }

          if (!userId) return json({ error: "invalid user" }, 401);
          const validUserId: string = userId;

          const lastWrite = lastSessionWrite.get(validUserId) ?? 0;
          const versionChanged =
            lastWrittenVersion.get(validUserId) !== (body.plugin_version ?? "");
          if (Date.now() - lastWrite > 10_000 || versionChanged) {
            lastSessionWrite.set(validUserId, Date.now());
            lastWrittenVersion.set(validUserId, body.plugin_version ?? "");
            await sb.from("plugin_sessions").upsert(
              {
                user_id: validUserId,
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
