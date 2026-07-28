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
          const enabled = value.enabled !== false; // Default to true if unset or set true
          const message = typeof value.message === "string" && value.message.trim()
            ? value.message
            : "We will be back shortly! BloxSmith is currently undergoing scheduled maintenance and performance upgrades. Thank you for your patience!";
          return Response.json({
            enabled,
            message,
          });
        } catch {
          return Response.json({
            enabled: true,
            message: "We will be back shortly! BloxSmith is currently undergoing scheduled maintenance and performance upgrades. Thank you for your patience!",
          });
        }
      },
    },
  },
});
