import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const TRELLIS_URL = "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";
const TRELLIS_STATUS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status";
const ROBLOX_ASSET_UPLOAD_URL = "https://apis.roblox.com/assets/v1/assets";
const SUPPORTED_BRIDGE_FORMATS = ["glb", "gltf", "fbx", "rbxm", "rbxmx"] as const;
const ROBLOX_MODEL_UPLOAD_LIMIT = 20 * 1024 * 1024;

function nvidiaKey() {
  const k = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;
  if (!k) throw new Error("NVIDIA_API_KEY is not configured. Set NVIDIA_API_KEY in your environment to use NVIDIA Trellis 3D generation.");
  return k;
}

async function trellisGenerate(body: Record<string, unknown>): Promise<{ glbUrl?: string; result?: unknown }> {
  const key = nvidiaKey();
  const res = await fetch(TRELLIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // 202 = async job — poll the status URL
  if (res.status === 202) {
    const reqId = res.headers.get("nvcf-reqid");
    if (!reqId) throw new Error("Trellis returned 202 without a request ID.");
    return await trellisPoll(reqId, key);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Trellis error ${res.status}: ${JSON.stringify(json)}`);
  return parseTrellisResult(json);
}

async function trellisPoll(reqId: string, key: string, maxMs = 180_000): Promise<{ glbUrl?: string; result?: unknown }> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${TRELLIS_STATUS_URL}/${reqId}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (res.status === 202) continue;
    const body = await res.json().catch(() => null);
    if (res.ok) return parseTrellisResult(body);
    throw new Error(`Trellis status ${res.status}: ${JSON.stringify(body)}`);
  }
  throw new Error("Trellis timed out after 3 minutes. Try a simpler prompt or a smaller image.");
}

function parseTrellisResult(json: any): { glbUrl?: string; result?: unknown } {
  // Trellis returns the GLB as base64 artifacts or a signed CDN URL.
  // Check common response shapes.
  const artifacts = json?.artifacts ?? json?.output?.artifacts ?? [];
  for (const a of artifacts) {
    if (a?.encoding === "base64" && a?.value) {
      // Store as a data URL so the browser model-viewer can open it
      return { glbUrl: `data:model/gltf-binary;base64,${a.value}`, result: json };
    }
    if (typeof a?.url === "string" && /\.glb/i.test(a.url)) {
      return { glbUrl: a.url, result: json };
    }
  }
  // Fallback: return the raw result for storage
  return { result: json };
}

function materialRichPrompt(prompt?: string | null) {
  const base = String(prompt || "").trim();
  const textureHint = "game-ready 3D asset with visible material textures, clean UVs, Roblox-friendly PBR materials";
  if (!base) return textureHint;
  if (/\b(texture|textured|material|pbr|uv|normal map|roughness|metalness|albedo)\b/i.test(base)) return base;
  return `${base}, ${textureHint}`;
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

function rejectReceiverUrl(url: string) {
  if (/\/api\/tripo\/bridge\/?(\?|#|$)/i.test(url)) {
    throw new Error("That is the BloxSmith bridge receiver URL, not a model file URL. Paste it into your local Tripo bridge helper. In this field, paste the exported GLB, glTF, FBX, RBXM, or RBXMX file URL.");
  }
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
  .validator((i: unknown) => z.object({ projectId: z.string().uuid().optional() }).parse(i ?? {}))
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

    // Check if the user is an owner/admin to grant unlimited generations.
    // Role checks are the single source of truth — no hardcoded emails.
    let isAdmin = false;
    try {
      const { data: adminFlag } = await supabase.rpc("current_user_has_role", { _role: "admin" });
      const { data: ownerFlag } = await supabase.rpc("current_user_has_role", { _role: "owner" });
      if (adminFlag || ownerFlag) isAdmin = true;
    } catch {}

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
  .validator((i: unknown) => z.object({
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
  .validator((i: unknown) => z.object({
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

    // Role checks — admins/owners bypass the 24h cooldown
    let isAdmin = false;
    try {
      const { data: adminFlag } = await supabase.rpc("current_user_has_role", { _role: "admin" });
      const { data: ownerFlag } = await supabase.rpc("current_user_has_role", { _role: "owner" });
      if (adminFlag || ownerFlag) isAdmin = true;
    } catch {}

    if (!isAdmin) {
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

    // ── NVIDIA Trellis generation ──────────────────────────────────────────
    let glbUrl: string | undefined;
    let trellisResult: unknown;
    try {
      const body: Record<string, unknown> = {};
      if (data.mode === "text") {
        body.prompt = materialRichPrompt(data.prompt);
      } else {
        // Trellis image-to-3D: pass the image as a URL or base64 data URL
        body.image = data.imageUrl;
      }
      const out = await trellisGenerate(body);
      glbUrl = out.glbUrl;
      trellisResult = out.result;
    } catch (e) {
      throw new Error(`NVIDIA Trellis could not generate the 3D model: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Insert the completed generation row — Trellis is synchronous so we store
    // the result immediately as SUCCEEDED rather than PENDING.
    const { data: row, error } = await supabase
      .from("model_generations")
      .insert({
        user_id: userId,
        project_id: data.projectId ?? null,
        mode: data.mode,
        prompt: data.prompt ?? null,
        image_url: data.mode === "image" ? data.imageUrl?.slice(0, 1000) ?? null : null,
        // task_id not used for Trellis — store a placeholder so existing code doesn't break
        task_id: `trellis-${Date.now()}`,
        status: glbUrl ? "SUCCEEDED" : "PENDING",
        progress: glbUrl ? 100 : 0,
        model_url: glbUrl ?? null,
        model_urls: glbUrl ? { glb: glbUrl } : {},
        completed_at: glbUrl ? new Date().toISOString() : null,
        source: "trellis",
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { generation: row, nextAvailableAt: new Date(Date.now() + COOLDOWN_MS).toISOString() };
  });

export const registerTripoBridgeModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
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
        rejectReceiverUrl(parsed.href);
      } catch (e) {
        if (e instanceof Error && e.message.includes("bridge receiver URL")) throw e;
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
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const uploadBridgeModelToRoblox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
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
    if ((gen as any).roblox_asset_id) return gen;

    const format = inferFormat(gen.model_url, (gen as any).source_format);
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
      } as any).eq("id", gen.id);
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
      } as any)
      .eq("id", gen.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const checkRobloxUploadOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: gen } = await context.supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!gen) throw new Error("Model not found.");
    if ((gen as any).roblox_asset_id) return gen;
    if (!(gen as any).roblox_operation_path) throw new Error("No Roblox upload operation is available yet.");
    const res = await fetch(`https://apis.roblox.com/assets/v1/${String((gen as any).roblox_operation_path).replace(/^\/+/, "")}`, {
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
      } as any)
      .eq("id", gen.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const queueBridgeModelToStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
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
    const assetId = normalizeRobloxAssetId(data.assetId || (gen as any).roblox_asset_id);
    if (!assetId) throw new Error("Roblox asset ID is missing. Upload the GLB/FBX to Roblox first, or paste an existing Roblox model asset ID.");
    const safeName = (data.name || gen.prompt || "BloxSmith_Imported_Model").replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "BloxSmith_Imported_Model";
    const { data: inserted, error } = await context.supabase.from("plugin_actions").insert({
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
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    await context.supabase.from("model_generations").update({
      roblox_asset_id: assetId,
      bridge_status: "Importing to Roblox Studio",
    } as any).eq("id", gen.id);
    return { ok: true, assetId, actionId: (inserted as any)?.id as string | undefined };
  });

export const pollModelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gen } = await supabase
      .from("model_generations")
      .select("*")
      .eq("id", data.generationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!gen) throw new Error("Generation not found.");
    // Trellis generations are stored as SUCCEEDED immediately — nothing to poll.
    return gen;
  });


export const ANIMATION_PRESETS = [
  "idle", "walking", "running", "jogging", "jumping",
  "dancing", "waving", "greeting", "clapping", "cheering",
  "saluting", "bowing", "thinking", "singing", "praying",
  "sitting", "standing", "crouching", "kneeling", "laying",
  "punching", "kicking", "backflip", "swimming", "falling",
] as const;
export type AnimationPreset = typeof ANIMATION_PRESETS[number];

export const rigModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid(),
  }).parse(i))
  .handler(async () => {
    throw new Error("Auto-rigging is not available with NVIDIA Trellis. Export your GLB and rig it in Blender or use a dedicated rigging service.");
  });


export const animateModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid(),
    animation: z.enum(ANIMATION_PRESETS),
  }).parse(i))
  .handler(async () => {
    throw new Error("Animation is not available with NVIDIA Trellis. Export your GLB and animate it in Blender or a dedicated animation tool.");
  });

export const retextureModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid(),
    texturePrompt: z.string().trim().min(3).max(400),
    artStyle: z.enum(["realistic", "fake-3d-cartoon", "japanese-anime", "cartoon-line-art", "realistic-hand-drawn", "fake-3d-hand-drawn", "oriental-comic-ink"]).default("realistic"),
  }).parse(i))
  .handler(async () => {
    throw new Error("Re-texturing is not available with NVIDIA Trellis. To retexture a model, use a tool like Blender or Substance Painter.");
  });

function formatRemaining(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.ceil(ms / 1000)}s`;
}
