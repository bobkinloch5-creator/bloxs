import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const FORMATS = ["glb", "gltf", "fbx", "rbxm", "rbxmx"] as const;

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function inferFormat(url: string, explicit?: string | null) {
  const clean = (explicit || url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  if (!FORMATS.includes(clean as any)) {
    throw new Error(`Unsupported model format "${clean || "unknown"}". Use GLB, glTF, FBX, RBXM, or RBXMX.`);
  }
  return clean as typeof FORMATS[number];
}

function normalizeAssetId(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/\d+/);
  return match ? match[0] : "";
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-bloxsmith-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const Route = createFileRoute("/api/tripo/bridge")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        return json({
          ok: true,
          name: "BloxSmith Tripo Bridge Receiver",
          endpoint: `${url.origin}/api/tripo/bridge`,
          accepts: ["modelUrl", "model_url", "robloxAssetId", "roblox_asset_id", "prompt", "projectId", "project_id", "format"],
          auth: "POST requires your BloxSmith plugin token in x-bloxsmith-token, Authorization: Bearer <token>, or body.token.",
          note: "Paste this receiver URL into a local Tripo/BloxSmith bridge helper. To preview directly in the website, paste a direct GLB/glTF/FBX file URL into the model URL box.",
        });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const input = z.object({
            token: z.string().trim().optional(),
            projectId: z.string().uuid().optional(),
            project_id: z.string().uuid().optional(),
            prompt: z.string().trim().min(1).max(200).default("Tripo Bridge model"),
            modelUrl: z.string().trim().max(2000).optional(),
            model_url: z.string().trim().max(2000).optional(),
            thumbnailUrl: z.string().trim().url().max(2000).optional(),
            thumbnail_url: z.string().trim().url().max(2000).optional(),
            format: z.enum(FORMATS).optional(),
            robloxAssetId: z.string().trim().max(80).optional(),
            roblox_asset_id: z.string().trim().max(80).optional(),
          }).parse(body);

          const headerToken =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
            request.headers.get("x-bloxsmith-token")?.trim() ||
            "";
          const token = input.token || headerToken;
          if (!token) return json({ ok: false, error: "missing BloxSmith token" }, 401);

          const sb = admin();
          const { data: profile } = await sb.from("profiles").select("id").eq("plugin_token", token).maybeSingle();
          if (!profile) return json({ ok: false, error: "invalid BloxSmith token" }, 401);

          const modelUrl = (input.modelUrl || input.model_url || "").trim();
          const assetId = normalizeAssetId(input.robloxAssetId || input.roblox_asset_id);
          if (!modelUrl && !assetId) {
            return json({ ok: false, error: "Send a direct GLB/glTF/FBX/RBXM/RBXMX modelUrl or a Roblox asset ID." }, 400);
          }
          if (modelUrl) {
            const parsed = new URL(modelUrl);
            if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("modelUrl must be http:// or https://");
          }

          const projectId = input.projectId || input.project_id || null;
          if (projectId) {
            const { data: project } = await sb.from("projects").select("id").eq("id", projectId).eq("user_id", profile.id).maybeSingle();
            if (!project) return json({ ok: false, error: "project not found for this token" }, 404);
          }

          const format = modelUrl ? inferFormat(modelUrl, input.format) : (input.format ?? "glb");
          const { data: row, error } = await sb.from("model_generations").insert({
            user_id: profile.id,
            project_id: projectId,
            mode: "tripo_bridge",
            prompt: input.prompt,
            model_url: modelUrl || null,
            model_urls: modelUrl ? { [format]: modelUrl } : {},
            thumbnail_url: input.thumbnailUrl || input.thumbnail_url || null,
            status: "SUCCEEDED",
            progress: 100,
            source: "tripo_bridge",
            source_format: format,
            roblox_asset_id: assetId || null,
            bridge_status: assetId ? "Asset ID Ready" : "Preview Ready",
            bridge_metadata: {
              receiver: "api/tripo/bridge",
              path: "Tripo DCC/web credits via BloxSmith bridge receiver",
              receivedAt: new Date().toISOString(),
            },
            completed_at: new Date().toISOString(),
          }).select("id").single();
          if (error) throw new Error(error.message);

          return json({ ok: true, id: row.id, status: assetId ? "Asset ID Ready" : "Preview Ready" });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : "Bridge import failed." }, 400);
        }
      },
    },
  },
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
