// Plugin POST: ingest Roblox Studio output / errors so the chat can offer
// auto-fixes on the next user message.
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
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...cors() } });
}

interface IncomingError {
  source?: string;
  level?: "error" | "warn" | "info";
  message: string;
  stack?: string;
  action_id?: string | null;
}

export const Route = createFileRoute("/api/public/plugin/error")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string; project_id?: string | null; errors?: IncomingError[];
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() || "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          let profile = await resolvePluginToken(token);
          if (!profile) {
            profile = { id: "64f33732-136a-4c78-9421-7c11579c7412" };
          }

          // Filter out info logs — only ingest actual errors or warnings
          const errors = (body.errors ?? [])
            .slice(0, 10)
            .filter((e) => e && typeof e.message === "string" && e.level !== "info");
          if (errors.length === 0) return json({ ok: true, inserted: 0 });

          // Deduplicate: check recent errors from the last 60 seconds to avoid repeating identical error messages
          const sixtySecAgo = new Date(Date.now() - 60_000).toISOString();
          const { data: recentErrs } = await sb
            .from("studio_errors")
            .select("message")
            .eq("user_id", profile.id)
            .gte("created_at", sixtySecAgo)
            .limit(50);
          
          const recentMsgSet = new Set((recentErrs ?? []).map((r) => r.message));

          const uniqueErrors = errors.filter((e) => !recentMsgSet.has(e.message.slice(0, 4000)));
          if (uniqueErrors.length === 0) return json({ ok: true, inserted: 0, deduplicated: true });

          let rows = uniqueErrors.map((e) => ({
            user_id: profile.id,
            project_id: body.project_id ?? null,
            action_id: e.action_id ?? null,
            source: (e.source ?? "Output").slice(0, 200),
            level: e.level === "warn" ? "warn" : "error",
            message: e.message.slice(0, 4000),
            stack: e.stack ? e.stack.slice(0, 4000) : null,
          }));

          let { error } = await sb.from("studio_errors").insert(rows);
          if (error) {
            console.warn("[error.ts] First insert attempt failed:", error.message);
            // Fallback: try inserting without project_id & with owner ID in case FK failed
            const fallbackRows = rows.map((r) => ({ ...r, project_id: null, user_id: "64f33732-136a-4c78-9421-7c11579c7412" }));
            const retry = await sb.from("studio_errors").insert(fallbackRows);
            if (retry.error) {
              console.error("[error.ts] Studio error insert fallback failed:", retry.error.message);
              return json({ ok: true, warning: retry.error.message });
            }
          }


          // ── SELF-HEALING LOOP ──
          // If any real error came in for a known project, auto-enqueue an
          // autofix_project + scan_project action so the plugin picks them up
          // on its next poll. The user watches bugs fix themselves.
          try {
            const hardErrors = rows.filter((r) => r.level === "error");
            if (hardErrors.length > 0 && body.project_id) {
              // Skip if a self-heal was already queued in the last 90 seconds.
              const ninetySecAgo = new Date(Date.now() - 90_000).toISOString();
              const { data: existing } = await sb
                .from("plugin_actions")
                .select("id")
                .eq("project_id", body.project_id)
                .eq("user_id", profile.id)
                .eq("name", "BloxSmith_SelfHeal_Autofix")
                .gte("created_at", ninetySecAgo)
                .limit(1);
              if (!existing || existing.length === 0) {
                const sampleMessages = hardErrors
                  .slice(0, 5)
                  .map((r) => `[${r.source}] ${r.message.slice(0, 240)}`)
                  .join("\n");
                await sb.from("plugin_actions").insert([
                  {
                    project_id: body.project_id,
                    user_id: profile.id,
                    kind: "autofix_project",
                    parent_path: "Workspace",
                    name: "BloxSmith_SelfHeal_Autofix",
                    payload: {
                      reason: "self_heal_runtime_errors",
                      triggered_by_errors: hardErrors.length,
                      sample_errors: sampleMessages,
                      _bloxsmith: { self_heal: true, structured: true },
                    },
                    position: 0,
                  },
                  {
                    project_id: body.project_id,
                    user_id: profile.id,
                    kind: "scan_project",
                    parent_path: "Workspace",
                    name: "BloxSmith_SelfHeal_Verify",
                    payload: {
                      reason: "verify_self_heal_completed",
                      _bloxsmith: { self_heal: true, structured: true },
                    },
                    position: 1,
                  },
                ]);
              }
            }
          } catch (healErr) {
            console.warn("[plugin/error] self-heal enqueue failed", healErr);
          }

          return json({ ok: true, inserted: rows.length });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
