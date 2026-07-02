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
        // Require an authenticated user — this endpoint spends the app's
        // Lovable API credits, so anonymous callers must be rejected.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError("Please sign in to generate images.", 401, "no_auth");

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return jsonError("Image generation is not configured.", 500, "not_configured");

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

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2",
            prompt: parsed.prompt,
            size: parsed.size ?? "1024x1024",
            quality: "low",
            stream: true,
            partial_images: 1,
            n: 1,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Image generation failed", { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
