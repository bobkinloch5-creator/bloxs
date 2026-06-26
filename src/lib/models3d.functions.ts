import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESHY_BASE = "https://api.meshy.ai/openapi";

// ── Meshy model selection ───────────────────────────────────────────────
// Always prefer the newest, highest-quality model for Roblox-ready assets.
// "meshy-6" (aka "latest") is currently Meshy's best model and the only tier
// that supports HD 2K textures + emission PBR maps. "meshy-4" is retired and
// was the cause of the previous failures.
const MESHY_BEST_MODEL = "meshy-6";
// If the account/endpoint can't use the newest model, fall back in quality order.
const MESHY_MODEL_FALLBACKS = ["meshy-5"];

// Optional request fields that a given model/endpoint may not support. If Meshy
// rejects one of these, we drop just that field and retry — so a job always ends
// up using the best *compatible* settings instead of failing outright.
const MESHY_OPTIONAL_FIELDS = [
  "hd_texture",
  "enable_pbr",
  "should_texture",
  "should_remesh",
  "topology",
  "target_polycount",
  "art_style",
  "negative_prompt",
  "enable_original_uv",
  "symmetry_mode",
] as const;

// Extra substrings (besides the field name itself) that an error might use to
// refer to a field, so we can detect-and-drop it reliably.
const MESHY_FIELD_ALIASES: Record<string, string[]> = {
  enable_pbr: ["pbr"],
  hd_texture: ["hd texture", "2k texture"],
  target_polycount: ["polycount", "poly count"],
  should_remesh: ["remesh"],
  enable_original_uv: ["original uv"],
};

function meshyKey() {
  const k = process.env.MESHY_API_KEY;
  if (!k) throw new Error("MESHY_API_KEY is not configured.");
  return k;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
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

/**
 * Create a Meshy task with automatic compatibility fallback.
 *
 * 1. Tries the requested (best) ai_model first, then progressively older models,
 *    so we always use the highest-quality model the account can actually run.
 * 2. If Meshy rejects an optional field (e.g. `enable_pbr` / `hd_texture` on a
 *    model or endpoint that doesn't support it), that field is removed and the
 *    request retried — unsupported options are auto-disabled instead of failing.
 *
 * Genuine errors (auth, rate-limit, invalid prompt/image) are surfaced
 * immediately rather than burning retries.
 */
async function meshyCreate(path: string, baseBody: Record<string, any>) {
  const requested = baseBody.ai_model as string | undefined;
  const modelChain: (string | undefined)[] = requested
    ? [requested, ...MESHY_MODEL_FALLBACKS.filter((m) => m !== requested)]
    : [undefined];

  let lastErr: unknown = new Error("Meshy request failed.");

  for (const model of modelChain) {
    const body: Record<string, any> = stripUndefined({
      ...baseBody,
      ...(model !== undefined ? { ai_model: model } : {}),
    });
    const dropped = new Set<string>();

    // Retry on this model while it keeps rejecting optional fields.
    for (let i = 0; i <= MESHY_OPTIONAL_FIELDS.length; i++) {
      try {
        return await meshyFetch(path, { method: "POST", body: JSON.stringify(body) });
      } catch (e) {
        lastErr = e;
        const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();

        // Drop the first optional field the error names, then retry on this model.
        const offending = MESHY_OPTIONAL_FIELDS.find((f) => {
          if (!(f in body) || dropped.has(f)) return false;
          const needles = [f, f.replace(/_/g, " "), ...(MESHY_FIELD_ALIASES[f] ?? [])];
          return needles.some((n) => msg.includes(n));
        });
        if (offending) {
          delete body[offending];
          dropped.add(offending);
          continue;
        }

        // Error points at the model itself (or is a generic parameter problem)
        // → step down to the next, older model in the chain.
        const modelIssue =
          msg.includes("ai_model") ||
          msg.includes(" model") ||
          msg.includes("not support") ||
          msg.includes("unsupported") ||
          msg.includes("invalid");
        if (modelIssue) break;

        // Otherwise it's a real error (auth, rate limit, bad input) — surface it.
        throw e;
      }
    }
  }

  throw lastErr;
}

export const getModelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("model_generations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);

    const projectRows = data.projectId
      ? (rows || []).filter((r) => r.project_id === data.projectId)
      : (rows || []);
    // 24h cooldown only counts brand-new text/image generations, not animations/retexture/refine of existing ones.
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
    projectId: z.string().uuid().optional(),
    mode: z.enum(["text", "image"]),
    prompt: z.string().trim().max(600).optional(),
    negativePrompt: z.string().trim().max(300).optional(),
    imageUrl: z.string().trim().max(2_000_000).optional(),
    artStyle: z.enum(["realistic", "sculpture"]).default("realistic"),
    topology: z.enum(["triangle", "quad"]).default("triangle"),
    targetPolycount: z.number().int().min(1000).max(300000).default(30000),
    autoRefine: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 24h rate-limit (per user) — only counts text/image, not animations/retexture/refine of existing models
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

    if (data.mode === "text" && (!data.prompt || data.prompt.length < 3)) {
      throw new Error("Please enter a prompt (at least 3 characters).");
    }
    if (data.mode === "image" && !data.imageUrl) {
      throw new Error("Please provide an image URL or upload an image.");
    }

    // Sculpture art style is incompatible with PBR per Meshy's guidance.
    const wantPbr = data.artStyle !== "sculpture";

    let taskId: string;
    try {
      if (data.mode === "text") {
        // Preview is mesh-only; PBR/HD textures are applied later in the refine
        // stage (see pollModelGeneration). We still pick the best model + topology.
        const res = await meshyCreate("/v2/text-to-3d", {
          mode: "preview",
          prompt: data.prompt,
          negative_prompt: data.negativePrompt || undefined,
          art_style: data.artStyle,
          ai_model: MESHY_BEST_MODEL,
          topology: data.topology,
          target_polycount: data.targetPolycount,
          should_remesh: true,
        });
        taskId = res.result;
      } else {
        const res = await meshyCreate("/v1/image-to-3d", {
          image_url: data.imageUrl,
          ai_model: MESHY_BEST_MODEL,
          enable_pbr: wantPbr,
          should_texture: true,
          hd_texture: true, // highest-quality 2K textures; auto-dropped if unsupported
          topology: data.topology,
          target_polycount: data.targetPolycount,
          should_remesh: true,
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
        project_id: data.projectId ?? null,
        mode: data.mode,
        prompt: data.prompt ?? null,
        image_url: data.mode === "image" ? data.imageUrl?.slice(0, 1000) ?? null : null,
        art_style: data.artStyle,
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

    const path =
      gen.mode === "image" ? `/v1/image-to-3d/${gen.task_id}`
      : gen.mode === "animation" ? `/v1/animations/${gen.task_id}`
      : gen.mode === "texture" ? `/v1/text-to-texture/${gen.task_id}`
      : gen.mode === "refine" ? `/v2/text-to-3d/${gen.task_id}`
      : `/v2/text-to-3d/${gen.task_id}`;

    let res: any;
    try { res = await meshyFetch(path); } catch { return gen; }

    const status = String(res.status || gen.status).toUpperCase();
    const progress = Number(res.progress ?? gen.progress ?? 0);
    const modelUrls = res?.model_urls ?? null;
    const textureUrls = res?.texture_urls ?? null;
    const modelUrl = modelUrls?.glb ?? res?.model_url ?? null;
    const thumb = res?.thumbnail_url ?? null;
    const err = res?.task_error?.message ?? null;

    const update: any = { status, progress };
    if (modelUrl) update.model_url = modelUrl;
    if (modelUrls) update.model_urls = modelUrls;
    if (textureUrls) update.texture_urls = textureUrls;
    if (thumb) update.thumbnail_url = thumb;
    if (err) update.error = err;
    if (status === "SUCCEEDED" || status === "FAILED") update.completed_at = new Date().toISOString();

    const { data: updated } = await supabase
      .from("model_generations")
      .update(update)
      .eq("id", gen.id)
      .select()
      .single();

    // Auto-refine: when a preview text-to-3d succeeds, kick off a refine task once
    if (status === "SUCCEEDED" && gen.mode === "text" && !gen.parent_id) {
      const { data: already } = await supabase
        .from("model_generations")
        .select("id")
        .eq("user_id", userId)
        .eq("parent_id", gen.id)
        .eq("mode", "refine")
        .maybeSingle();
      if (!already) {
        try {
          // Refine adds textures. Request the highest-quality maps (PBR + HD 2K);
          // meshyCreate auto-drops any option this model/account can't run, and
          // PBR is skipped for sculpture (incompatible per Meshy).
          const sculpture = (gen as any).art_style === "sculpture";
          const refine = await meshyCreate("/v2/text-to-3d", {
            mode: "refine",
            preview_task_id: gen.task_id,
            ai_model: MESHY_BEST_MODEL,
            enable_pbr: sculpture ? undefined : true,
            hd_texture: true,
          });
          await supabase.from("model_generations").insert({
            user_id: userId,
            project_id: gen.project_id,
            mode: "refine",
            prompt: `Refined — ${gen.prompt ?? "model"}`,
            task_id: refine.result,
            status: "PENDING",
            progress: 0,
            parent_id: gen.id,
          });
        } catch { /* refine optional */ }
      }
    }

    return updated ?? gen;
  });

export const ANIMATION_PRESETS = ["walking", "running", "dancing", "idle", "jumping"] as const;
export type AnimationPreset = typeof ANIMATION_PRESETS[number];

export const animateModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid(),
    animation: z.enum(ANIMATION_PRESETS),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: source } = await supabase
      .from("model_generations").select("*")
      .eq("id", data.sourceId).eq("user_id", userId).maybeSingle();
    if (!source) throw new Error("Source 3D model not found.");
    if (source.status !== "SUCCEEDED" || !source.task_id) throw new Error("Source model must finish generating before it can be animated.");
    if (source.mode === "animation") throw new Error("Pick an original 3D model to animate, not another animation.");

    let taskId: string;
    try {
      const res = await meshyFetch("/v1/animations", {
        method: "POST",
        body: JSON.stringify({ input_task_id: source.task_id, animation_name: data.animation }),
      });
      taskId = res.result;
    } catch (e) {
      throw new Error(`Meshy could not start the animation: ${e instanceof Error ? e.message : String(e)}`);
    }

    const promptLabel = `${data.animation.charAt(0).toUpperCase() + data.animation.slice(1)} — ${source.prompt ?? "model"}`;
    const { data: row, error } = await supabase
      .from("model_generations")
      .insert({
        user_id: userId, project_id: data.projectId ?? source.project_id ?? null, mode: "animation",
        prompt: promptLabel, task_id: taskId, status: "PENDING", progress: 0,
        animation_name: data.animation, parent_id: source.id,
      })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const retextureModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid(),
    texturePrompt: z.string().trim().min(3).max(400),
    artStyle: z.enum(["realistic", "fake-3d-cartoon", "japanese-anime", "cartoon-line-art", "realistic-hand-drawn", "fake-3d-hand-drawn", "oriental-comic-ink"]).default("realistic"),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: source } = await supabase
      .from("model_generations").select("*")
      .eq("id", data.sourceId).eq("user_id", userId).maybeSingle();
    if (!source) throw new Error("Source 3D model not found.");
    if (source.status !== "SUCCEEDED" || !source.task_id) throw new Error("Source model must finish generating before it can be re-textured.");
    if (source.mode === "animation" || source.mode === "texture") throw new Error("Pick an original 3D model to re-texture.");

    let taskId: string;
    try {
      // Routed through meshyCreate so PBR / original-UV are auto-dropped if the
      // texture endpoint rejects them, instead of failing the whole re-texture.
      const res = await meshyCreate("/v1/text-to-texture", {
        model_url: source.model_url,
        object_prompt: source.prompt ?? "3D model",
        style_prompt: data.texturePrompt,
        enable_original_uv: true,
        enable_pbr: true,
        art_style: data.artStyle,
      });
      taskId = res.result;
    } catch (e) {
      throw new Error(`Meshy could not start re-texture: ${e instanceof Error ? e.message : String(e)}`);
    }

    const { data: row, error } = await supabase
      .from("model_generations")
      .insert({
        user_id: userId, project_id: data.projectId ?? source.project_id ?? null, mode: "texture",
        prompt: `Retexture: ${data.texturePrompt}`,
        task_id: taskId, status: "PENDING", progress: 0, parent_id: source.id,
      })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

function formatRemaining(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.ceil(ms / 1000)}s`;
}
