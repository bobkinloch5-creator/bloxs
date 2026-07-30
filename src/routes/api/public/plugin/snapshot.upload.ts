// Plugin POST: stores a captured workspace snapshot as a build milestone.
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

export const Route = createFileRoute("/api/public/plugin/snapshot/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            project_id?: string;
            place_id?: string;
            label?: string;
            summary?: string;
            kind?: string;
            snapshot?: unknown;
            counts?: { parts?: number; scripts?: number; gui?: number };
          };
          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = (body.token && body.token.trim()) || headerToken;
          if (!token) return json({ error: "missing token" }, 401);

          const sb = admin();
          const { resolvePluginToken } = await import("@/lib/resolve-plugin-token");
          const profile = await resolvePluginToken(token);
          if (!profile) return json({ error: "invalid token" }, 401);

          if (!body.project_id) return json({ error: "missing project_id" }, 400);

          // Verify the project belongs to this user.
          const { data: proj } = await sb
            .from("projects")
            .select("id")
            .eq("id", body.project_id)
            .eq("user_id", profile.id)
            .maybeSingle();
          if (!proj) return json({ error: "project not found" }, 404);

          const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
          const serialized = JSON.stringify(snapshot);
          const sizeBytes = serialized.length;
          // Hard cap at ~6 MB to protect the DB and Worker memory.
          if (sizeBytes > 6 * 1024 * 1024) {
            return json({ error: "snapshot too large (>6 MB) — try a smaller project or contact support" }, 413);
          }

          const counts = body.counts ?? {};
          const { data: row, error } = await sb
            .from("build_milestones")
            .insert({
              user_id: profile.id,
              project_id: body.project_id,
              label: (body.label ?? "Milestone").slice(0, 80),
              summary: (body.summary ?? "").slice(0, 400),
              kind: ["manual", "auto", "pre_restore"].includes(body.kind ?? "") ? body.kind : "manual",
              snapshot_data: snapshot,
              parts_count: Number(counts.parts ?? 0) | 0,
              scripts_count: Number(counts.scripts ?? 0) | 0,
              gui_count: Number(counts.gui ?? 0) | 0,
              size_bytes: sizeBytes,
              place_id: body.place_id ?? null,
            })
            .select("id, created_at")
            .single();
          if (error) return json({ error: error.message }, 500);

          // Keep at most 25 milestones per project — drop oldest beyond that.
          const { data: extra } = await sb
            .from("build_milestones")
            .select("id, created_at")
            .eq("project_id", body.project_id)
            .order("created_at", { ascending: false })
            .range(25, 200);
          if (extra && extra.length > 0) {
            await sb.from("build_milestones").delete().in("id", extra.map((r: any) => r.id));
          }

          return json({ ok: true, id: row?.id, created_at: row?.created_at });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
