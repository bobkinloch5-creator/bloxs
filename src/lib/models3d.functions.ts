import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESHY_BASE = "https://api.meshy.ai/openapi";
const ROBLOX_ASSET_UPLOAD_URL = "https://apis.roblox.com/assets/v1/assets";
const SUPPORTED_BRIDGE_FORMATS = ["glb", "gltf", "fbx", "rbxm", "rbxmx"] as const;
const ROBLOX_MODEL_UPLOAD_LIMIT = 20 * 1024 * 1024;

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

function robloxOpenCloudKey() {
  const k = process.env.ROBLOX_OPEN_CLOUD_API_KEY || process.env.ROBLOX_API_KEY;
  if (!k) throw new Error("Roblox Open Cloud key is missing. Set ROBLOX_OPEN_CLOUD_API_KEY before uploading GLB/FBX models.");
  return k;
}

function robloxCreator() {
  const groupId = process.env.ROBLOX_CREATOR_GROUP_ID;
  const userId = process.env.ROBLOX_CREATOR_USER_ID;
  if (groupId) return { groupId: Number(groupId) };
  if (userId) return { userId: Number(userId) };
  throw new Error("Roblox Open Cloud creator is missing. Set ROBLOX_CREATOR_GROUP_ID or ROBLOX_CREATOR_USER_ID.");
}

function inferFormat(input: string, explicit?: string | null) {
  const clean = (explicit || input.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  if (!SUPPORTED_BRIDGE_FORMATS.includes(clean as any)) {
    throw new Error(`Unsupported model format "${clean || "unknown"}". Use GLB, glTF, FBX, RBXM, or RBXMX.`);
  }
  return clean as typeof SUPPORTED_BRIDGE_FORMATS[number];
}

function contentTypeFor(format: string) {
  if (format === "glb") return "model/gltf-binary";
  if (format === "gltf") return "model/gltf+json";
  if (format === "fbx") return "application/octet-stream";
  if (format === "rbxm" || format === "rbxmx") return "application/octet-stream";
  return "application/octet-stream";
}

function normalizeRobloxAssetId(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/\d+/);
  return match ? match[0] : "";
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

    // Check if the user is an owner/admin to grant unlimited generations
    let isAdmin = false;
    const email = context.claims?.email as string | undefined;
    if (email?.toLowerCase() === "bobkinloch5@gmail.com") {
      isAdmin = true;
    } else {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.is_admin) {
          isAdmin = true;
        }
      } catch {}
    }

    // 24h cooldown only counts brand-new text/image generations, not animations/retexture/refine of existing ones.
    const lastNew = (rows || []).find((r) => r.mode === "text" || r.mode === "image");
    const lastTs = lastNew ? new Date(lastNew.created_at).getTime() : 0;
    const remaining = isAdmin ? 0 : Math.max(0, COOLDOWN_MS - (Date.now() - lastTs));

    return {
      cooldownMs: COOLDOWN_MS,
      remainingMs: remaining,
      canGenerate: remaining === 0,
      nextAvailableAt: remaining > 0 ? new Date(Date.now() + remaining).toISOString() : null,
      models: projectRows,
    };
  });

export const deleteModelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    generationId: z.string().uuid(),
    deleteRelated: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error: readError } = await context.supabase
      .from("model_generations")
      .select("id, parent_id")
      .eq("user_id", context.userId);
    if (readError) throw new Error(readError.message);

    const allRows = rows ?? [];
    const target = allRows.find((row) => row.id === data.generationId);
    if (!target) throw new Error("3D model not found.");

    const ids = new Set<string>([data.generationId]);
    if (data.deleteRelated) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of allRows) {
          if (row.parent_id && ids.has(row.parent_id) && !ids.has(row.id)) {
            ids.add(row.id);
            changed = true;
          }
        }
      }
    }

    const idList = Array.from(ids);
    const { error } = await context.supabase
      .from("model_generations")
      .delete()
      .eq("user_id", context.userId)
      .in("id", idList);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: idList.length };
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
    // ai_model is always "latest" (Meshy 6) for highest quality; not exposed as user input
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Check if the user is an owner/admin to grant unlimited generations
    let isAdmin = false;
    const email = context.claims?.email as string | undefined;
    if (email?.toLowerCase() === "bobkinloch5@gmail.com") {
      isAdmin = true;
    } else {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.is_admin) {
          isAdmin = true;
        }
      } catch {}
    }

    if (!isAdmin) {
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
    }

    if (data.mode === "text" && (!data.prompt || data.prompt.length < 3)) {
      throw new Error("Please enter a prompt (at least 3 characters).");
    }
    if (data.mode === "image" && !data.imageUrl) {
      throw new Error("Please provide an image URL or upload an image.");
    }

    let taskId: string;
    try {
      if (data.mode === "text") {
        // Use "latest" = Meshy 6 (highest quality; meshy-4 is retired as of March 2026)
        // should_remesh defaults to false for meshy-6/latest per Meshy docs
        const body: Record<string, unknown> = {
          mode: "preview",
          prompt: data.prompt,
          ai_model: "latest",
          topology: data.topology,
          target_polycount: data.targetPolycount,
        };
        if (data.negativePrompt) body.negative_prompt = data.negativePrompt;
        if (data.artStyle) body.art_style = data.artStyle;
        const res = await meshyFetch("/v2/text-to-3d", {
          method: "POST",
          body: JSON.stringify(body),
        });
        taskId = res.result;
      } else {
        // image-to-3d: enable_pbr is not supported by all model versions — omit to avoid job failure.
        // "latest" gives Meshy 6 quality for image-to-3d as well.
        const body: Record<string, unknown> = {
          image_url: data.imageUrl,
          ai_model: "latest",
          topology: data.topology,
          target_polycount: data.targetPolycount,
        };
        const res = await meshyFetch("/v1/image-to-3d", {
          method: "POST",
          body: JSON.stringify(body),
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
        // art_style is sent to Meshy only — the DB schema does not have this column
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

export const registerTripoBridgeModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    prompt: z.string().trim().min(2).max(200).default("Tripo DCC Bridge model"),
    modelUrl: z.string().trim().max(2000).optional(),
    thumbnailUrl: z.string().trim().url().max(2000).optional(),
    format: z.enum(SUPPORTED_BRIDGE_FORMATS).optional(),
    robloxAssetId: z.string().trim().max(80).optional(),
    source: z.enum(["tripo_api", "tripo_bridge", "external_model"]).default("tripo_bridge"),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const modelUrl = data.modelUrl?.trim() || "";
    const robloxAssetId = normalizeRobloxAssetId(data.robloxAssetId);
    if (!modelUrl && !robloxAssetId) {
      throw new Error("Paste a direct GLB/FBX/RBXM/RBXMX URL, or paste a Roblox model asset ID if it is already uploaded.");
    }
    if (modelUrl) {
      try {
        const parsed = new URL(modelUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad_protocol");
      } catch {
        throw new Error("Invalid model URL. Use a full http:// or https:// link to a GLB, FBX, glTF, RBXM, or RBXMX file. Local Windows paths like C:\\... cannot preview in the browser.");
      }
    }
    const format = modelUrl ? inferFormat(modelUrl, data.format) : (data.format ?? "glb");
    const { data: row, error } = await context.supabase
      .from("model_generations")
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        mode: data.source,
        prompt: data.prompt,
        model_url: modelUrl || null,
        model_urls: modelUrl ? { [format]: modelUrl } : {},
        thumbnail_url: data.thumbnailUrl ?? null,
        status: "SUCCEEDED",
        progress: 100,
        completed_at: new Date().toISOString(),
        source: data.source,
        source_format: format,
        bridge_status: robloxAssetId ? "Asset ID Ready" : "Preview Ready",
        roblox_asset_id: robloxAssetId || null,
        roblox_upload_status: robloxAssetId ? "uploaded" : null,
        bridge_metadata: {
          path: data.source === "tripo_bridge" ? "Tripo DCC/web credits via BloxSmith bridge import" : "Tripo/API model URL import",
          supportedFormats: SUPPORTED_BRIDGE_FORMATS,
        },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const uploadBridgeModelToRoblox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    generationId: z.string().uuid(),
    displayName: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(1000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: gen } = await context.supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!gen) throw new Error("Model not found.");
    if (!gen.model_url) throw new Error("No GLB/FBX model URL is available to upload.");
    if (gen.roblox_asset_id) return gen;

    const format = inferFormat(gen.model_url, gen.source_format);
    const head = await fetch(gen.model_url, { method: "HEAD" }).catch(() => null);
    const size = Number(head?.headers.get("content-length") || 0);
    if (size > ROBLOX_MODEL_UPLOAD_LIMIT) {
      throw new Error("Model file is too large for Roblox Open Cloud upload. Roblox model upload limit is 20 MB.");
    }

    const fileRes = await fetch(gen.model_url);
    if (!fileRes.ok) throw new Error(`Could not download model file: ${fileRes.status} ${fileRes.statusText}`);
    const blob = await fileRes.blob();
    if (blob.size > ROBLOX_MODEL_UPLOAD_LIMIT) {
      throw new Error("Model file is too large for Roblox Open Cloud upload. Roblox model upload limit is 20 MB.");
    }

    const nameBase = (data.displayName || gen.prompt || "BloxSmith Tripo Model").replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "BloxSmith Tripo Model";
    const request = {
      assetType: "Model",
      displayName: nameBase,
      description: data.description || "Uploaded by BloxSmith from a Tripo/DCC Bridge model.",
      creationContext: { creator: robloxCreator() },
    };

    const form = new FormData();
    form.append("request", JSON.stringify(request));
    form.append("fileContent", new Blob([blob], { type: contentTypeFor(format) }), `${nameBase}.${format}`);

    const uploadRes = await fetch(ROBLOX_ASSET_UPLOAD_URL, {
      method: "POST",
      headers: { "x-api-key": robloxOpenCloudKey() },
      body: form,
    });
    const text = await uploadRes.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!uploadRes.ok) {
      const msg = json?.message || json?.error || text || `Roblox upload failed (${uploadRes.status})`;
      await context.supabase.from("model_generations").update({
        roblox_upload_status: "failed",
        roblox_upload_error: String(msg),
        bridge_status: "Failed",
      }).eq("id", gen.id);
      throw new Error(String(msg));
    }

    const operationPath = json?.path || json?.operation?.path || json?.name || null;
    const assetId = normalizeRobloxAssetId(json?.response?.assetId || json?.assetId || json?.asset?.assetId);
    const { data: updated, error } = await context.supabase
      .from("model_generations")
      .update({
        roblox_asset_id: assetId || null,
        roblox_operation_path: operationPath,
        roblox_upload_status: assetId ? "uploaded" : "uploading",
        roblox_upload_error: null,
        bridge_status: assetId ? "Asset ID Ready" : "Uploading",
        bridge_metadata: { ...(gen.bridge_metadata as any || {}), robloxUploadResponse: json },
      })
      .eq("id", gen.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const checkRobloxUploadOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: gen } = await context.supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!gen) throw new Error("Model not found.");
    if (gen.roblox_asset_id) return gen;
    if (!gen.roblox_operation_path) throw new Error("No Roblox upload operation is available yet.");
    const res = await fetch(`https://apis.roblox.com/assets/v1/${String(gen.roblox_operation_path).replace(/^\/+/, "")}`, {
      headers: { "x-api-key": robloxOpenCloudKey() },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!res.ok) throw new Error(json?.message || json?.error || text || `Roblox operation check failed (${res.status})`);
    const assetId = normalizeRobloxAssetId(json?.response?.assetId || json?.assetId || json?.asset?.assetId);
    const done = !!json?.done || !!assetId;
    const errorMessage = json?.error?.message || json?.error;
    const { data: updated, error } = await context.supabase
      .from("model_generations")
      .update({
        roblox_asset_id: assetId || null,
        roblox_upload_status: errorMessage ? "failed" : done ? "uploaded" : "uploading",
        roblox_upload_error: errorMessage ? String(errorMessage) : null,
        bridge_status: errorMessage ? "Failed" : assetId ? "Asset ID Ready" : "Uploading",
        bridge_metadata: { ...(gen.bridge_metadata as any || {}), robloxOperationResponse: json },
      })
      .eq("id", gen.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const queueBridgeModelToStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    generationId: z.string().uuid(),
    assetId: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    scale: z.number().min(0.01).max(100).default(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: gen } = await context.supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!gen) throw new Error("Model not found.");
    const assetId = normalizeRobloxAssetId(data.assetId || gen.roblox_asset_id);
    if (!assetId) throw new Error("Roblox asset ID is missing. Upload the GLB/FBX to Roblox first, or paste an existing Roblox model asset ID.");
    const safeName = (data.name || gen.prompt || "BloxSmith_Imported_Model").replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "BloxSmith_Imported_Model";
    const { error } = await context.supabase.from("plugin_actions").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: "insert_asset",
      parent_path: "Workspace.BloxSmith_Imported_Models",
      name: safeName,
      payload: {
        asset_id: Number(assetId),
        position: [0, 5, 0],
        scale: data.scale,
        tags: ["BloxSmithAsset", "BloxSmithImportedModel", "TripoBridge"],
      },
      position: 0,
    });
    if (error) throw new Error(error.message);
    await context.supabase.from("model_generations").update({
      roblox_asset_id: assetId,
      bridge_status: "Importing to Roblox Studio",
    }).eq("id", gen.id);
    return { ok: true, assetId };
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
    if (gen.status === "FAILED") return gen;
    const savedUrls = (gen.model_urls || {}) as Record<string, string>;
    const hasSavedPreview = !!(gen.model_url || savedUrls.glb || savedUrls.gltf);
    if (gen.status === "SUCCEEDED" && hasSavedPreview) return gen;
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
          const refine = await meshyFetch("/v2/text-to-3d", {
            method: "POST",
            body: JSON.stringify({ mode: "refine", preview_task_id: gen.task_id }),
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
      // enable_pbr is supported on text-to-texture endpoint; wrap in try/catch so an
      // unsupported field never kills the whole retexture job.
      const textureBody: Record<string, unknown> = {
        model_url: source.model_url,
        object_prompt: source.prompt ?? "3D model",
        style_prompt: data.texturePrompt,
        enable_original_uv: true,
        enable_pbr: true,
        art_style: data.artStyle,
      };
      let res: any;
      try {
        res = await meshyFetch("/v1/text-to-texture", {
          method: "POST",
          body: JSON.stringify(textureBody),
        });
      } catch (pbr_err) {
        // If enable_pbr or another optional field caused rejection, retry without them
        const msg = pbr_err instanceof Error ? pbr_err.message : String(pbr_err);
        if (msg.toLowerCase().includes("enable_pbr") || msg.toLowerCase().includes("not supported")) {
          delete textureBody.enable_pbr;
          res = await meshyFetch("/v1/text-to-texture", {
            method: "POST",
            body: JSON.stringify(textureBody),
          });
        } else {
          throw pbr_err;
        }
      }
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
