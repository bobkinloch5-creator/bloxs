// Plugin POST: uploads a viewport screenshot for a Playtest run.
// Auth: plugin_token (Bearer or x-bloxsmith-token). Body: JSON:
//   { token, run_id, attempt, phase, image_b64 }  -- image_b64 is a base64
//   encoded PNG. Returns the public URL saved into playtest_reports.screenshot_urls.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { getSanitizedSupabaseUrl, getSanitizedServiceKey } from "@/integrations/supabase/client.server";

function admin() {
  return createClient(getSanitizedSupabaseUrl(), getSanitizedServiceKey(), {
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

const BUCKET = "playtest-screenshots";

export const Route = createFileRoute("/api/public/plugin/playtest/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            run_id?: string;
            attempt?: number;
            phase?: string;
            image_b64?: string;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);
          if (!body.run_id || !body.image_b64) return json({ error: "missing run_id or image" }, 400);

          const sb = admin();
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          const profile = await resolvePluginToken(token);
          if (!profile) return json({ error: "invalid token" }, 401);

          const phase = (body.phase || "frame").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "frame";
          const attempt = Math.max(1, Math.min(20, body.attempt ?? 1));
          const key = `${profile.id}/${body.run_id}/${attempt}-${phase}-${Date.now()}.png`;

          // Cap the payload at ~4 MB decoded to keep worker memory sane.
          const b64 = body.image_b64.replace(/^data:image\/png;base64,/, "");
          if (b64.length > 6_000_000) return json({ error: "image too large" }, 413);
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

          const { error: upErr } = await sb.storage
            .from(BUCKET)
            .upload(key, bytes, { contentType: "image/png", upsert: false });
          if (upErr) return json({ error: upErr.message }, 500);

          // Bucket is private — mint a long-lived signed URL for the report UI.
          const { data: signed, error: signErr } = await sb.storage
            .from(BUCKET)
            .createSignedUrl(key, 60 * 60 * 24 * 30); // 30 days
          if (signErr) return json({ error: signErr.message }, 500);

          return json({ ok: true, url: signed?.signedUrl, path: key });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
