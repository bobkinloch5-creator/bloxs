// NVIDIA Microsoft Trellis (image/text -> 3D) via build.nvidia.com hosted NIM.
// Docs: https://build.nvidia.com/microsoft/trellis
//
// The public NIM route responds either synchronously with a GLB asset URL /
// base64, or asynchronously via a status URL that we then poll. This wrapper
// handles both. Requires NVIDIA_API_KEY.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TRELLIS_URL = "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";
const STATUS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status";

function nvidiaKey() {
  const k = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;
  if (!k) throw new Error("NVIDIA_API_KEY is not configured.");
  return k;
}

async function pollStatus(reqId: string, key: string, maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${STATUS_URL}/${reqId}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (res.status === 202) continue;
    const body = await res.json().catch(() => null);
    if (res.ok) return body;
    throw new Error(`Trellis status ${res.status}: ${JSON.stringify(body)}`);
  }
  throw new Error("Trellis timed out after 120s.");
}

export const generateTrellis3D = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(2).max(300).optional(),
        imageUrl: z.string().trim().url().optional(),
        seed: z.number().int().optional(),
      })
      .refine((v) => v.prompt || v.imageUrl, { message: "prompt or imageUrl required" })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const key = nvidiaKey();
    const body: Record<string, unknown> = {};
    if (data.prompt) body.prompt = data.prompt;
    if (data.imageUrl) body.image = data.imageUrl;
    if (typeof data.seed === "number") body.seed = data.seed;

    const res = await fetch(TRELLIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 202) {
      const reqId = res.headers.get("nvcf-reqid");
      if (!reqId) throw new Error("Trellis returned 202 without a request id.");
      const done = await pollStatus(reqId, key);
      return { ok: true, result: done };
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Trellis error ${res.status}: ${JSON.stringify(json)}`);
    return { ok: true, result: json };
  });
