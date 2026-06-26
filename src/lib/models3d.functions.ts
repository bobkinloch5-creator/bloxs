import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESHY_BASE = "https://api.meshy.ai/openapi";

function meshyKey() {
  const k = process.env.MESHY_API_KEY;
  if (!k) throw new Error("MESHY_API_KEY is not configured.");
  return k;
}

async function meshyFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${MESHY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${meshyKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep as text */ }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text || `Meshy ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

export const getModelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("model_generations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);

    const projectRows = (rows || []).filter((r) => r.project_id === data.projectId);
    // 24h cooldown only counts NEW model generations, not animations of existing ones.
    const lastNew = (rows || []).find((r) => r.mode === "text" || r.mode === "image");
    const lastTs = lastNew ? new Date(lastNew.created_at).getTime() : 0;
    const remaining = Math.max(0, COOLDOWN_MS - (Date.now() - lastTs));


    return {
      cooldownMs: COOLDOWN_MS,
      remainingMs: remaining,
      canGenerate: remaining === 0,
      nextAvailableAt: remaining > 0 ? new Date(Date.now() + remaining).toISOString() : null,
      models: projectRows,
    };
  });

export const startModelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    mode: z.enum(["text", "image"]),
    prompt: z.string().trim().max(600).optional(),
    imageUrl: z.string().trim().max(2_000_000).optional(),
    artStyle: z.enum(["realistic", "sculpture"]).default("realistic"),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 24h rate-limit (per user) — only counts text/image, not animations of existing models
    const { data: last } = await supabase
      .from("model_generations")
      .select("created_at")
      .eq("user_id", userId)
      .in("mode", ["text", "image"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();


    if (last) {
      const elapsed = Date.now() - new Date(last.created_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        throw new Error(`You can generate one 3D model every 24 hours. Try again in ${formatRemaining(remaining)}.`);
      }
    }

    // Validate inputs per mode
    if (data.mode === "text" && (!data.prompt || data.prompt.length < 3)) {
      throw new Error("Please enter a prompt (at least 3 characters).");
    }
    if (data.mode === "image" && !data.imageUrl) {
      throw new Error("Please provide an image URL or upload an image.");
    }

    // Fire Meshy task
    let taskId: string;
    try {
      if (data.mode === "text") {
        const res = await meshyFetch("/v2/text-to-3d", {
          method: "POST",
          body: JSON.stringify({
            mode: "preview",
            prompt: data.prompt,
            art_style: data.artStyle,
            ai_model: "meshy-4",
            topology: "triangle",
            target_polycount: 30000,
          }),
        });
        taskId = res.result;
      } else {
        const res = await meshyFetch("/v1/image-to-3d", {
          method: "POST",
          body: JSON.stringify({
            image_url: data.imageUrl,
            enable_pbr: true,
            ai_model: "meshy-4",
          }),
        });
        taskId = res.result;
      }
    } catch (e) {
      throw new Error(`Meshy could not start the 3D job: ${e instanceof Error ? e.message : String(e)}`);
    }

    const { data: row, error } = await supabase
      .from("model_generations")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        mode: data.mode,
        prompt: data.prompt ?? null,
        image_url: data.mode === "image" ? data.imageUrl?.slice(0, 1000) ?? null : null,
        task_id: taskId,
        status: "PENDING",
        progress: 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { generation: row, nextAvailableAt: new Date(Date.now() + COOLDOWN_MS).toISOString() };
  });

export const pollModelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gen } = await supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!gen) throw new Error("Generation not found.");
    if (gen.status === "SUCCEEDED" || gen.status === "FAILED") return gen;
    if (!gen.task_id) return gen;

    const path = gen.mode === "image"
      ? `/v1/image-to-3d/${gen.task_id}`
      : `/v2/text-to-3d/${gen.task_id}`;
    let res: any;
    try {
      res = await meshyFetch(path);
    } catch (e) {
      return gen;
    }

    const status = String(res.status || gen.status).toUpperCase();
    const progress = Number(res.progress ?? gen.progress ?? 0);
    const modelUrl = res?.model_urls?.glb ?? null;
    const thumb = res?.thumbnail_url ?? null;
    const err = res?.task_error?.message ?? null;

    const update: any = { status, progress };
    if (modelUrl) update.model_url = modelUrl;
    if (thumb) update.thumbnail_url = thumb;
    if (err) update.error = err;
    if (status === "SUCCEEDED" || status === "FAILED") update.completed_at = new Date().toISOString();

    const { data: updated } = await supabase
      .from("model_generations")
      .update(update)
      .eq("id", gen.id)
      .select()
      .single();
    return updated ?? gen;
  });

function formatRemaining(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.ceil(ms / 1000)}s`;
}
