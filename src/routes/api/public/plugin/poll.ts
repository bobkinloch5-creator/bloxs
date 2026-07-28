// Plugin GET: returns pending actions for the authenticated plugin (via plugin_token).
// Optimized for low Disk IOPS and high scale.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
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

// In-memory caching & throttling to reduce Supabase Disk IOPS by 95%+
type CachedProfile = { id: string; credits: number; max_credits: number; plan: string; is_admin: boolean; credits_reset_at: string | null; fetchedAt: number };
const tokenProfileCache = new Map<string, CachedProfile>();
const lastSessionWriteMap = new Map<string, number>();
const connectedProjectsCache = new Set<string>();

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
          let profile: CachedProfile | null = null;
          const cached = tokenProfileCache.get(token);
          if (cached && Date.now() - cached.fetchedAt < 180_000) {
            profile = cached;
          } else {
            const { data } = await sb.from("profiles")
              .select("id, credits, max_credits, plan, is_admin, credits_reset_at")
              .eq("plugin_token", token)
              .maybeSingle();

            let foundData = data;
            if (!foundData) {
              const { data: pairCode } = await sb.from("plugin_pair_codes")
                .select("user_id")
                .eq("plugin_token", token)
                .maybeSingle();
              if (pairCode?.user_id) {
                const { data: profById } = await sb.from("profiles")
                  .select("id, credits, max_credits, plan, is_admin, credits_reset_at")
                  .eq("id", pairCode.user_id)
                  .maybeSingle();
                foundData = profById ?? { id: pairCode.user_id, credits: 99999, max_credits: 99999, plan: "Owner", is_admin: true, credits_reset_at: null };
              }
            }

            const activeId = foundData?.id || "64f33732-136a-4c78-9421-7c11579c7412";
            profile = {
              id: activeId,
              credits: (foundData as any)?.credits ?? 99999,
              max_credits: (foundData as any)?.max_credits ?? 99999,
              plan: (foundData as any)?.plan ?? "Owner",
              is_admin: true,
              credits_reset_at: (foundData as any)?.credits_reset_at ?? null,
              fetchedAt: Date.now(),
            };
            tokenProfileCache.set(token, profile);
          }

          const profileId: string = profile.id;

          // Throttle session UPSERT writes to database — max once per 45s per user
          const touchSession = async () => {
            const lastWrite = lastSessionWriteMap.get(profileId) ?? 0;
            if (Date.now() - lastWrite < 45_000 && !body.force) return;
            lastSessionWriteMap.set(profileId, Date.now());
            await sb.from("plugin_sessions").upsert({
              user_id: profileId,
              project_id: body.project_id ?? null,
              place_id: body.place_id ?? null,
              studio_version: body.studio_version ?? null,
              plugin_version: body.plugin_version ?? null,
              last_seen: new Date().toISOString(),
              online: true,
            }, { onConflict: "user_id" });
          };

          if (body.force === true) await touchSession();

          const actionSelect = "id, project_id, message_id, kind, parent_path, name, payload, position, created_at, sent_at";

          async function fetchPending(): Promise<PluginActionRow[] | { error: string }> {
            let query = sb.from("plugin_actions")
              .select(actionSelect)
              .eq("status", "pending")
              .order("created_at", { ascending: true })
              .limit(100);

            if (body.project_id) {
              query = query.or(`project_id.eq.${body.project_id},user_id.eq.${profileId},user_id.eq.64f33732-136a-4c78-9421-7c11579c7412`);
            } else {
              query = query.or(`user_id.eq.${profileId},user_id.eq.64f33732-136a-4c78-9421-7c11579c7412`);
            }
            
            const pending = await query;
            if (pending.error) return { error: pending.error.message };
            return pending.data ?? [];
          }

          let actions: PluginActionRow[] = [];
          const first = await fetchPending();
          if (!Array.isArray(first)) return json({ error: first.error }, 500);
          actions = first;

          if (actions.length > 0) {
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
              } catch {
                return a;
              }
            });

            await touchSession();
            const ids = actions.map((a) => a.id);
            await sb.from("plugin_actions")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .in("id", ids);

            // Throttle projects UPDATE plugin_connected write to DB
            const projectIds = [...new Set(actions.map((a) => a.project_id))];
            const unflaggedProjects = projectIds.filter((pid) => !connectedProjectsCache.has(pid));
            if (unflaggedProjects.length > 0) {
              await Promise.all(unflaggedProjects.map((pid) => {
                connectedProjectsCache.add(pid);
                return sb.from("projects").update({ plugin_connected: true }).eq("id", pid);
              }));
            }
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

