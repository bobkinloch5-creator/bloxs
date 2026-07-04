import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/maintenance")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("admin_settings")
            .select("value")
            .eq("key", "maintenance")
            .maybeSingle();
          const value: any = data?.value ?? {};
          return Response.json({
            enabled: !!value.enabled,
            message: typeof value.message === "string" ? value.message : "",
          });
        } catch {
          return Response.json({ enabled: false, message: "" });
        }
      },
    },
  },
});
