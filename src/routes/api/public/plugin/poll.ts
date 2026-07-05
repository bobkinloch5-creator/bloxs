// Plugin GET: returns pending actions for the authenticated plugin (via plugin_token).
// Also updates plugin_sessions heartbeat.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sanitizeInsertAssetActions, type InsertSanitizeReport } from "@/lib/roblox-toolbox.server";
import { normalizePluginAction } from "@/lib/plugin-actions";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

type PluginActionRow = {
  id: string;
  project_id: string;
  message_id?: string | null;
  kind: string;
  parent_path: string;
  name: string;
  payload: unknown;
  position: number | null;
  created_at?: string;
  sent_at?: string | null;
};

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
            .select("id, credits, max_credits, plan, is_admin, credits_reset_at")
            .eq("plugin_token", token)
            .maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);
          const profileId = profile.id as string;

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

          // Pull the newest queued build for this account, not the project id
          // saved inside older installed plugins. That saved id can be stale
          // after the user opens a different project on the web app, which made
          // Studio poll the wrong queue and appear to ignore new prompts.
          const actionSelect = "id, project_id, message_id, kind, parent_path, name, payload, position, created_at, sent_at";

          async function fetchPending(): Promise<PluginActionRow[] | { error: string }> {
            const lp = await sb.from("plugin_actions")
              .select("project_id, message_id, created_at")
              .eq("user_id", profile.id)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (lp.error) return { error: lp.error.message };
            if (!lp.data) return [];
            const newestAt = new Date(lp.data.created_at).getTime();
            const recentBuildWindow = new Date(newestAt - 10 * 60_000).toISOString();
            const pending = await sb.from("plugin_actions")
              .select(actionSelect)
              .eq("user_id", profile.id)
              .eq("status", "pending")
              .gte("created_at", recentBuildWindow)
              .order("created_at", { ascending: true })
              .order("position", { ascending: true })
              .limit(100);
            if (pending.error) return { error: pending.error.message };
            return pending.data ?? [];
          }

          let actions: PluginActionRow[] = [];
          const first = await fetchPending();
          if (!Array.isArray(first)) return json({ error: first.error }, 500);
          actions = first;

          // Long-poll: hold the connection up to ~18s if nothing is pending,
          // returning the instant new actions appear. Drops queue->execute
          // latency to sub-second regardless of the plugin's poll cadence.
          if (actions.length === 0) {
            const deadline = Date.now() + 18_000;
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 600));
              const next = await fetchPending();
              if (!Array.isArray(next)) return json({ error: next.error }, 500);
              if (next.length > 0) { actions = next; break; }
            }
          }

          if (actions.length === 0) {
            const staleSentCutoff = new Date(Date.now() - 45_000).toISOString();
            const latestStaleSent = await sb.from("plugin_actions")
              .select("project_id, message_id, sent_at")
              .eq("user_id", profile.id)
              .eq("status", "sent")
              .lt("sent_at", staleSentCutoff)
              .order("sent_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latestStaleSent.error) return json({ error: latestStaleSent.error.message }, 500);

            if (latestStaleSent.data) {
              let retryQ = sb.from("plugin_actions")
                .select(actionSelect)
                .eq("user_id", profile.id)
                .eq("status", "sent")
                .lt("sent_at", staleSentCutoff)
                .order("sent_at", { ascending: true })
                .order("position", { ascending: true })
                .limit(100);
              if (latestStaleSent.data.message_id) {
                retryQ = retryQ.eq("message_id", latestStaleSent.data.message_id);
              } else {
                retryQ = retryQ.eq("project_id", latestStaleSent.data.project_id);
              }
              const retry = await retryQ;
              if (retry.error) return json({ error: retry.error.message }, 500);
              actions = retry.data ?? [];
            }
          }

          if (actions.length > 0) {
            const before = actions.map((a) => ({
              id: a.id,
              message_id: a.message_id,
              kind: a.kind,
              parent_path: a.parent_path,
              name: a.name,
              payload: a.payload,
            }));
            actions = actions.map((a) => {
              try {
                const normalized = normalizePluginAction(a);
                return {
                  ...a,
                  kind: normalized.kind,
                  parent_path: normalized.parent_path,
                  name: normalized.name,
                  payload: normalized.payload,
                };
              } catch (e) {
                console.warn("[plugin/poll] action normalize failed; sending original", { actionId: a.id, error: e instanceof Error ? e.message : String(e) });
                return a;
              }
            });
            const report: InsertSanitizeReport = { dropped: [], replaced: [] };
            await sanitizeInsertAssetActions(actions as unknown as Array<Record<string, unknown>>, report);
            const survivingIds = new Set(actions.map((a) => a.id));
            const droppedIds = before.filter((a) => !survivingIds.has(a.id)).map((a) => a.id);
            if (droppedIds.length > 0) {
              await sb.from("plugin_actions")
                .update({ status: "failed", error: "No authorized ginsert/GetObjects-compatible Toolbox asset found.", completed_at: new Date().toISOString() })
                .in("id", droppedIds);
              const affectedMessageIds = [...new Set(before
                .filter((row) => droppedIds.includes(row.id))
                .map((row) => row.message_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0))];
              await Promise.all(affectedMessageIds.map(async (messageId) => {
                const { data: rows } = await sb.from("plugin_actions")
                  .select("status")
                  .eq("message_id", messageId)
                  .eq("user_id", profile.id);
                const remaining = rows?.some((row) => row.status !== "done" && row.status !== "failed") ?? false;
                if (!remaining) {
                  await sb.from("chat_messages")
                    .update({ status: "failed", error: "No authorized ginsert/GetObjects-compatible Toolbox asset was found for that request." })
                    .eq("id", messageId)
                    .eq("user_id", profile.id);
                }
              }));
            }
            await Promise.all(actions.map(async (a) => {
              const old = before.find((row) => row.id === a.id);
              const changed = old?.kind !== a.kind || old?.parent_path !== a.parent_path || old?.name !== a.name || JSON.stringify(old?.payload ?? null) !== JSON.stringify(a.payload ?? null);
              if (!changed) return;
              await sb.from("plugin_actions").update({ kind: a.kind, parent_path: a.parent_path, name: a.name, payload: a.payload }).eq("id", a.id);
            }));
            if (report.dropped.length > 0 || report.replaced.length > 0) {
              console.info("[plugin/poll] sanitized insert assets before Studio", {
                userId: profile.id,
                dropped: report.dropped,
                replaced: report.replaced,
              });
            }
          }

          if (actions && actions.length > 0) {
            const ids = actions.map((a) => a.id);
            await sb.from("plugin_actions")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .in("id", ids);
            const projectIds = [...new Set(actions.map((a) => a.project_id))];
            for (const pid of projectIds) {
              await sb.from("projects").update({ plugin_connected: true }).eq("id", pid);
            }
            console.info("[plugin/poll] actions sent to Studio", {
              userId: profile.id,
              requestedProjectId: body.project_id ?? null,
              actionCount: actions.length,
              projectIds,
              messageIds: [...new Set(actions.map((a) => a.message_id).filter(Boolean))],
              placeId: body.place_id ?? null,
              studioVersion: body.studio_version ?? null,
              pluginVersion: body.plugin_version ?? null,
            });
          } else {
            console.info("[plugin/poll] heartbeat no actions", {
              userId: profile.id,
              requestedProjectId: body.project_id ?? null,
              placeId: body.place_id ?? null,
              pluginVersion: body.plugin_version ?? null,
            });
          }

          return json({
            user_id: profile.id,
            actions: actions ?? [],
            credits: profile.credits ?? 0,
            max_credits: profile.max_credits ?? 0,
            plan: profile.plan ?? "Free",
            is_admin: !!profile.is_admin,
            credits_reset_at: profile.credits_reset_at ?? null,
          });
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
