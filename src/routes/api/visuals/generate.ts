import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Body = z.object({
  prompt: z.string().min(2).max(2000),
  size: z.enum(["512x512", "1024x1024", "1024x1536", "1536x1024"]).optional(),
});

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/visuals/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require an authenticated user, but do not call paid image gateways in
        // NVIDIA-only mode.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError("Please sign in to generate images.", 401, "no_auth");

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
        );
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return jsonError("Session expired. Please sign in again.", 401, "expired");

        let parsed: z.infer<typeof Body>;
        try { parsed = Body.parse(await request.json()); }
        catch (e: any) { return jsonError(e?.message || "Bad input", 400, "bad_input"); }

        return jsonError("Image generation is disabled in NVIDIA-only mode.", 503, "nvidia_only_mode");
      },
    },
  },
});
