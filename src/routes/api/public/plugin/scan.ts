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
            token?: string;
            scan?: unknown;
            place_id?: string;
            chunk_index?: number;
            total_chunks?: number;
            scan_id?: string;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() || "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          const profile = await resolvePluginToken(token);
          if (!profile) return json({ error: "invalid token" }, 401);

          const isChunked = typeof body.chunk_index === "number" && typeof body.total_chunks === "number";
          const chunkIndex = body.chunk_index ?? 0;
          const totalChunks = body.total_chunks ?? 1;

          let snapshot: any = body.scan ?? [];

          if (isChunked && chunkIndex > 0) {
            const { data: session } = await sb
              .from("plugin_sessions")
              .select("last_scan")
              .eq("user_id", profile.id)
              .maybeSingle();

            let existingScan = session?.last_scan;
            if (!Array.isArray(existingScan)) {
              existingScan = [];
            }

            if (Array.isArray(snapshot)) {
              snapshot = [...existingScan, ...snapshot];
            } else {
              snapshot = existingScan;
            }
          }

          // Cap snapshot size to avoid pathological payloads (increased safely from 200k to 5M).
          const str = JSON.stringify(snapshot);
          if (str.length > 5_000_000) return json({ error: "scan too large" }, 413);

          await sb.from("plugin_sessions").upsert({
            user_id: profile.id,
            place_id: body.place_id ?? null,
            last_scan: snapshot,
            last_scan_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            online: true,
          }, { onConflict: "user_id" });

          return json({ ok: true, chunk_received: chunkIndex, total_chunks: totalChunks });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
