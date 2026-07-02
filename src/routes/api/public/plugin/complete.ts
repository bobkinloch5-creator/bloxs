// Plugin POST: report action result (done | failed).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { blacklistAssetIds } from "@/lib/roblox-toolbox.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-bloxsmith-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/plugin/complete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            token?: string;
            // single
            action_id?: string; status?: "done" | "failed"; error?: string; result?: unknown;
            // batch
            results?: Array<{ action_id: string; status?: "done" | "failed"; error?: string; result?: unknown }>;
          };
          if (!body.token) {
            return new Response(JSON.stringify({ error: "missing token" }), { status: 400, headers: { "content-type": "application/json", ...CORS } });
          }
          const sb = admin();
          const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", body.token).maybeSingle();
          if (!profile) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { "content-type": "application/json", ...CORS } });

          const items = Array.isArray(body.results) && body.results.length > 0
            ? body.results
            : (body.action_id ? [{ action_id: body.action_id, status: body.status, error: body.error, result: body.result }] : []);
          if (items.length === 0) {
            return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { "content-type": "application/json", ...CORS } });
          }

          const now = new Date().toISOString();
          const affectedMessageIds = new Set<string>();
          const affectedProjectIds = new Set<string>();
          let okCount = 0;
          let failCount = 0;
          // Process in parallel for speed.
          await Promise.all(items.map(async (it) => {
            const status = it.status === "failed" ? "failed" : "done";
            if (status === "failed") failCount += 1;
            else okCount += 1;
            const { data: action } = await sb.from("plugin_actions")
              .update({ status, error: it.error ?? null, result: it.result ?? null, completed_at: now })
              .eq("id", it.action_id)
              .eq("user_id", profile.id)
              .select("project_id, message_id, kind, payload")
              .maybeSingle();
            if (action?.message_id) affectedMessageIds.add(action.message_id);
            if (action?.project_id) affectedProjectIds.add(action.project_id);
            if (status === "failed" && it.error && action) {
              await sb.from("studio_errors").insert({
                user_id: profile.id, project_id: action.project_id,
                action_id: it.action_id, source: "plugin", level: "error", message: it.error,
              });
              // If an insert_asset failed with an authorization / InsertService
              // error, blacklist ONLY the specific asset ID that failed (parsed
              // from the error message when possible, else the primary). Never
              // blacklist fallback IDs — those haven't been tried yet and the
              // plugin should retry them on the next attempt.
              if (action.kind === "insert_asset" && /not authorized|InsertService|failed to load asset|asset.*(private|deleted|moderated|off ?sale|unauthorized)/i.test(it.error)) {
                const payload = (action.payload ?? {}) as Record<string, unknown>;
                const bad: number[] = [];
                // Prefer an ID mentioned in the error message (Roblox's error
                // usually includes the offending assetId).
                const idInError = it.error.match(/\b(\d{6,})\b/g);
                if (idInError) {
                  for (const s of idInError) {
                    const n = Number(s);
                    if (Number.isFinite(n) && n > 0) bad.push(n);
                  }
                }
                if (bad.length === 0) {
                  const primary = Number(payload.asset_id ?? payload.assetId);
                  if (Number.isFinite(primary) && primary > 0) bad.push(primary);
                }
                if (bad.length > 0) blacklistAssetIds(bad, "studio_insert_unauthorized");
              }
            }
          }));

          for (const messageId of affectedMessageIds) {
            const { data: rows } = await sb.from("plugin_actions")
              .select("status, error")
              .eq("message_id", messageId)
              .eq("user_id", profile.id);
            const total = rows?.length ?? 0;
            const failed = rows?.filter((r) => r.status === "failed") ?? [];
            const done = rows?.filter((r) => r.status === "done").length ?? 0;
            const nextStatus = failed.length > 0 ? "failed" : (total > 0 && done === total ? "done" : "sending");
            const errorText = failed.length > 0
              ? failed.map((r) => r.error).filter(Boolean).slice(0, 5).join("\n") || "Studio reported one or more action failures."
              : null;
            await sb.from("chat_messages")
              .update({ status: nextStatus, error: errorText })
              .eq("id", messageId)
              .eq("user_id", profile.id);
          }

          for (const projectId of affectedProjectIds) {
            await sb.from("build_history")
              .update({
                plugin_status: failCount > 0 ? "Failed" : "Verified",
                applied: failCount === 0 && okCount > 0,
                errors_count: failCount,
              })
              .eq("project_id", projectId)
              .eq("user_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(1);

            await sb.from("project_activity").insert({
              project_id: projectId,
              user_id: profile.id,
              kind: failCount > 0 ? "build.failed" : "build.verified",
              summary: failCount > 0
                ? `Studio reported ${failCount} failed action(s), ${okCount} succeeded.`
                : `Studio confirmed ${okCount} action(s) executed successfully.`,
            });
          }

          console.info("[plugin/complete] execution results", {
            userId: profile.id,
            received: items.length,
            okCount,
            failCount,
            messageIds: affectedMessageIds.size,
            projectIds: affectedProjectIds.size,
          });

          return new Response(JSON.stringify({ ok: true, count: items.length }), { headers: { "content-type": "application/json", ...CORS } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { "content-type": "application/json", ...CORS } });
        }
      },
    },
  },
});
