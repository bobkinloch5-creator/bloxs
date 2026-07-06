import { createFileRoute } from "@tanstack/react-router";

// Public status endpoint. Returns a small snapshot the /status page can read
// without auth. No PII — only rollups + booleans.
export const Route = createFileRoute("/api/public/status")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let maintenance = false;
        let maintenanceMessage = "";
        let pluginActive24h = 0;
        let buildsLast24h = 0;
        let aiOk = true;
        const errors: string[] = [];

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Maintenance flag
          try {
            const { data } = await supabaseAdmin
              .from("admin_settings")
              .select("value")
              .eq("key", "maintenance")
              .maybeSingle();
            const v: any = data?.value ?? {};
            maintenance = !!v.enabled;
            maintenanceMessage = typeof v.message === "string" ? v.message : "";
          } catch (e: any) { errors.push(`maintenance: ${e?.message ?? e}`); }

          // Plugin activity (sessions seen in the last 24h)
          try {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { count } = await supabaseAdmin
              .from("plugin_sessions")
              .select("id", { count: "exact", head: true })
              .gte("last_seen_at", since);
            pluginActive24h = count ?? 0;
          } catch (e: any) { errors.push(`plugin: ${e?.message ?? e}`); }

          // Build volume (agent runs in the last 24h)
          try {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { count } = await supabaseAdmin
              .from("plugin_actions")
              .select("id", { count: "exact", head: true })
              .gte("created_at", since);
            buildsLast24h = count ?? 0;
          } catch (e: any) { errors.push(`builds: ${e?.message ?? e}`); }
        } catch (e: any) {
          errors.push(`db: ${e?.message ?? e}`);
        }

        // Cheap AI gateway ping — reachable, not authenticated call.
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/models", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          aiOk = res.status < 500;
        } catch { aiOk = false; }

        return Response.json({
          ok: !maintenance && aiOk && errors.length === 0,
          maintenance,
          maintenance_message: maintenanceMessage,
          services: {
            website: { status: "operational" },
            ai_gateway: { status: aiOk ? "operational" : "degraded" },
            studio_plugin: { status: "operational", active_24h: pluginActive24h },
            build_pipeline: { status: buildsLast24h > 0 || pluginActive24h > 0 ? "operational" : "idle", actions_24h: buildsLast24h },
            database: { status: errors.length === 0 ? "operational" : "degraded" },
          },
          checked_at: new Date().toISOString(),
          latency_ms: Date.now() - started,
        }, {
          headers: { "Cache-Control": "public, max-age=30" },
        });
      },
    },
  },
});
