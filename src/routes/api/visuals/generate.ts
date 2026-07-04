import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateGeneralImage } from "@/lib/general-image.server";

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

function splitDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return { mediaType: match[1], b64: match[2] };
}

function imageEventStream(dataUrl: string) {
  const encoder = new TextEncoder();
  const payload = splitDataUrl(dataUrl);
  const stream = new ReadableStream({
    async start(controller) {
      if (!payload) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ type: "error", error: { message: "Image generation returned an unsupported image format." } })}\n\n`));
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`event: image_generation.partial_image\ndata: ${JSON.stringify({ type: "image_generation.partial_image", b64_json: payload.b64, created_at: Math.floor(Date.now() / 1000), partial_image_index: 0 })}\n\n`));
      controller.enqueue(encoder.encode(`event: image_generation.completed\ndata: ${JSON.stringify({ type: "image_generation.completed", b64_json: payload.b64, created_at: Math.floor(Date.now() / 1000) })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export const Route = createFileRoute("/api/visuals/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require an authenticated user; generation runs through NVIDIA NIM.
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

        const dataUrl = await generateGeneralImage({ prompt: parsed.prompt, size: parsed.size ?? "1024x1024" });
        return imageEventStream(dataUrl);
      },
    },
  },
});
