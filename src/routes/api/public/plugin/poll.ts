// Plugin GET: returns pending actions for the authenticated plugin (via plugin_token).
// Also updates plugin_sessions heartbeat.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { normalizePluginAction } from "@/lib/plugin-actions";

import { getSanitizedSupabaseUrl, getSanitizedServiceKey } from "@/integrations/supabase/client.server";

function admin() {
  return createClient(getSanitizedSupabaseUrl(), getSanitizedServiceKey(), {
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
            token?: string; place_id?: string; studio_version?: string; plugin_version?: string; project_id?: string | null; force?: boolean;
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          // Resolve through the shared resolver so tokens handed out by the
          // pairing flow (stored on plugin_pair_codes before they are synced
          // onto the profile) authenticate here too. Previously this endpoint
          // only looked at profiles.plugin_token, so a freshly paired plugin
          // showed "connected" via heartbeat but got 401 on every poll and
          // never executed a single queued action.
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          const resolved = await resolvePluginToken(token);
          if (!resolved) return json({ error: "invalid token" }, 401);
          const { data: profile } = await sb.from("profiles")
            .select("id, credits, max_credits, plan, is_admin, credits_reset_at")
            .eq("id", resolved.id)
            .maybeSingle();
          if (!profile) return json({ error: "invalid token" }, 401);
          const profileId: string = profile.id;

          const touchSession = async () => {
            await sb.from("plugin_sessions").upsert({
              user_id: profile.id,
              project_id: body.project_id ?? null,
              place_id: body.place_id ?? null,
              studio_version: body.studio_version ?? null,
              plugin_version: body.plugin_version ?? null,
              last_seen: new Date().toISOString(),
              online: true,
            }, { onConflict: "user_id" });
          };

          // Only force/manual polls touch the session here. The plugin has a
          // separate lightweight heartbeat, so idle long-polls no longer write
          // to the database every few seconds for every open Studio window.
          if (body.force === true) await touchSession();

          // Pull the newest queued build for this account, not the project id
          // saved inside older installed plugins. That saved id can be stale
          // after the user opens a different project on the web app, which made
          // Studio poll the wrong queue and appear to ignore new prompts.
          const actionSelect = "id, project_id, message_id, kind, parent_path, name, payload, position, created_at, sent_at";

          async function fetchPending(): Promise<PluginActionRow[] | { error: string }> {
            const latest = await sb.from("plugin_actions")
              .select("project_id, message_id, created_at")
              .eq("user_id", profileId)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latest.error) return { error: latest.error.message };
            if (!latest.data) return [];

            // Execute the newest generated build first. Older pending rows from
            // previous attempts must not sit ahead of the current prompt and
            // make the website look stuck on "queued".
            let pendingQuery = sb.from("plugin_actions")
              .select(actionSelect)
              .eq("user_id", profileId)
              .eq("status", "pending")
              .order("created_at", { ascending: true })
              .order("position", { ascending: true })
              .limit(100);
            pendingQuery = latest.data.message_id
              ? pendingQuery.eq("message_id", latest.data.message_id)
              : pendingQuery.eq("project_id", latest.data.project_id);
            const pending = await pendingQuery;
            if (pending.error) return { error: pending.error.message };
            return pending.data ?? [];
          }

          // Self-heal orphaned deliveries: if an earlier poll marked actions
          // "sent" but the plugin never reported them done/failed (dropped
          // response, Studio closed, token re-paired mid-build), they would sit
          // at "sent" forever and passive polling below refuses to replay them —
          // so the plugin shows "0 pending" and nothing builds while the website
          // already said "sent to Studio". Re-arm rows stuck past a grace window
          // back to "pending" so the very next fetch delivers them again. The
          // 25s window is comfortably longer than a normal execute+report cycle,
          // so genuinely in-flight actions are not duplicated.
          async function rearmStaleSent(): Promise<void> {
            const staleCutoff = new Date(Date.now() - 25_000).toISOString();
            const { error } = await sb.from("plugin_actions")
              .update({ status: "pending", sent_at: null })
              .eq("user_id", profileId)
              .eq("status", "sent")
              .is("completed_at", null)
              .lt("sent_at", staleCutoff);
            if (error) {
              console.warn("[plugin/poll] rearmStaleSent failed", { userId: profileId, error: error.message });
            }
          }

          let actions: PluginActionRow[] = [];
          let first = await fetchPending();
          if (!Array.isArray(first)) return json({ error: first.error }, 500);
          // Nothing fresh pending — try recovering any stuck "sent" work before
          // giving up, so a lost delivery does not strand the user's build.
          if (first.length === 0) {
            await rearmStaleSent();
            first = await fetchPending();
            if (!Array.isArray(first)) return json({ error: first.error }, 500);
          }
          actions = first;

          // Long-poll briefly if nothing is pending. Keep this short so one
          // Studio window cannot sit on an 8s request while the user expects a
          // one-action build to execute immediately.
          if (actions.length === 0 && body.force !== true) {
            const deadline = Date.now() + 2_500;
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 75));
              const next = await fetchPending();
              if (!Array.isArray(next)) return json({ error: next.error }, 500);
              if (next.length > 0) { actions = next; break; }
            }
          }

          // Do not auto-replay old `sent` rows from normal polling. A previous
          // Studio window can hang on a heavy asset, and replaying that stale
          // batch on reconnect blocks brand-new one-action builds. The website's
          // explicit "Execute now" path can re-arm the newest in-flight message
          // when the user asks, but passive polling only pulls fresh pending work.

          if (actions.length > 0) {
            const before = actions.map((a) => ({
              id: a.id,
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
            await Promise.all(actions.map(async (a) => {
              const old = before.find((row) => row.id === a.id);
              const changed = old?.kind !== a.kind || old?.parent_path !== a.parent_path || old?.name !== a.name || JSON.stringify(old?.payload ?? null) !== JSON.stringify(a.payload ?? null);
              if (!changed) return;
              await sb.from("plugin_actions").update({ kind: a.kind, parent_path: a.parent_path, name: a.name, payload: a.payload }).eq("id", a.id);
            }));
          }

          if (actions && actions.length > 0) {
            if (body.force !== true) await touchSession();
            const ids = actions.map((a) => a.id);
            await sb.from("plugin_actions")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .in("id", ids);
            const projectIds = [...new Set(actions.map((a) => a.project_id))];
            await Promise.all(projectIds.map((pid) => sb.from("projects").update({ plugin_connected: true }).eq("id", pid)));
            console.info("[plugin/poll] actions sent to Studio", {
              userId: profile.id,
              requestedProjectId: body.project_id ?? null,
              actionCount: actions.length,
              projectIds,
              messageIds: [...new Set(actions.map((a) => a.message_id).filter(Boolean))],
              placeId: body.place_id ?? null,
              studioVersion: body.studio_version ?? null,
              pluginVersion: body.plugin_version ?? null,
              mode: "pending_only",
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
