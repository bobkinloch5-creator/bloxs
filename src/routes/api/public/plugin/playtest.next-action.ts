// Plugin GET/POST: returns the next loop directive for a Playtest run.
// The plugin polls this after uploading a failing report so it knows whether
// to wait for the AI, re-run tests, or stop.
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

async function resolveProfile(token: string) {
  const sb = admin();
  const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
  const profile = await resolvePluginToken(token);
  return profile ? { sb, profileId: profile.id as string } : null;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  let runId = url.searchParams.get("run_id") || "";
  if (!token || !runId) {
    if (request.method !== "GET") {
      const body = (await request.json().catch(() => ({}))) as { token?: string; run_id?: string };
      token = token || body.token || "";
      runId = runId || body.run_id || "";
    }
  }
  const headerToken =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-bloxsmith-token")?.trim() ||
    "";
  token = token || headerToken;
  if (!token) return json({ error: "missing token" }, 401);
  if (!runId) return json({ error: "missing run_id" }, 400);

  const ctx = await resolveProfile(token);
  if (!ctx) return json({ error: "invalid token" }, 401);
  const { sb, profileId } = ctx;

  const { data: loop } = await sb
    .from("playtest_loop_state")
    .select("run_id, attempt, max_attempts, directive, reason, updated_at")
    .eq("run_id", runId)
    .eq("user_id", profileId)
    .maybeSingle();

  if (!loop) return json({ directive: "idle", attempt: 0, reason: "run not found" });
  return json({
    directive: loop.directive,
    attempt: loop.attempt,
    max_attempts: loop.max_attempts,
    reason: loop.reason,
    updated_at: loop.updated_at,
  });
}

export const Route = createFileRoute("/api/public/plugin/playtest/next-action")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
