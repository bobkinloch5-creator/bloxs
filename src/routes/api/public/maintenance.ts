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
          const enabled = value.enabled === true; // Default to false
          const message = typeof value.message === "string" && value.message.trim()
            ? value.message
            : "";
          return Response.json({
            enabled,
            message,
          });
        } catch {
          return Response.json({
            enabled: false,
            message: "",
          });
        }
      },
    },
  },
});
