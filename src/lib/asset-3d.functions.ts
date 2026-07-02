// Fetches Roblox's 3D thumbnail metadata (OBJ + MTL + textures) for a given
// asset id, resolved to absolute CDN URLs so a browser can load them directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ assetId: z.number().int().positive() });

type Meta = {
  obj?: string;
  mtl?: string;
  textures?: string[];
  camera?: { position?: number[]; direction?: number[]; fov?: number };
  aabb?: { min?: number[]; max?: number[] };
};

function toAbs(base: string, ref: string): string {
  try { return new URL(ref, base).toString(); } catch { return ref; }
}

export const getAsset3D = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    const url = `https://thumbnails.roblox.com/v1/assets-thumbnail-3d?assetId=${data.assetId}`;
    type Ptr = { state?: string; imageUrl?: string };
    let ptr: Ptr | null = null;
    // Poll a few times — Roblox may need to generate the 3d bake on first request.
    for (let i = 0; i < 4; i += 1) {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
        ptr = (await r.json().catch(() => null)) as Ptr | null;
      } catch { ptr = null; }
      if (ptr?.state === "Completed" && ptr.imageUrl) break;
      if (ptr?.state === "Blocked" || ptr?.state === "Error") return { ready: false as const, reason: ptr.state };
      await new Promise((res) => setTimeout(res, 700));
    }
    if (!ptr?.imageUrl || ptr.state !== "Completed") return { ready: false as const, reason: ptr?.state ?? "pending" };
    const base = ptr.imageUrl;
    let meta: Meta | null = null;
    try {
      const r = await fetch(base, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      meta = (await r.json().catch(() => null)) as Meta | null;
    } catch { meta = null; }
    if (!meta) return { ready: false as const, reason: "no_meta" };

    return {
      ready: true as const,
      obj: meta.obj ? toAbs(base, meta.obj) : null,
      mtl: meta.mtl ? toAbs(base, meta.mtl) : null,
      textures: Array.isArray(meta.textures) ? meta.textures.map((t) => toAbs(base, t)) : [],
      camera: meta.camera ?? null,
      aabb: meta.aabb ?? null,
    };
  });
