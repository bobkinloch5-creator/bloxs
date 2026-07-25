// NVIDIA Microsoft Trellis (image -> 3D GLB) via the build.nvidia.com hosted NIM.
// Docs: https://build.nvidia.com/microsoft/trellis
//
// Important facts this wrapper relies on (they are the cause of most 500s):
//  1. Trellis is IMAGE-to-3D only. There is no text prompt field. Sending
//     { prompt } makes the NIM reject the payload, often as a generic 500.
//  2. The image must be inline base64 (data URI) or an uploaded NVCF asset.
//     A plain https:// URL is not fetched by the NIM.
//  3. Inline payloads must stay small (~250KB). Larger images must go through
//     the NVCF asset upload API and be referenced with the
//     NVCF-INPUT-ASSET-REFERENCES header.
//  4. Responses can be JSON, or a binary ZIP / GLB stream, or a 202 + reqId to
//     poll. All three are handled below.
//
// Requires NVIDIA_API_KEY (or NIM_API_KEY / NGC_API_KEY).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.server";
import { z } from "zod";
import { generateGeneralImage } from "./general-image.server";

const TRELLIS_URL = "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";
const STATUS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status";
const ASSET_URL = "https://api.nvcf.nvidia.com/v2/nvcf/assets";

// Inline base64 payload ceiling. Anything bigger is uploaded as an NVCF asset.
const INLINE_LIMIT_BYTES = 180_000;
const RASTER_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function nvidiaKey() {
  const key = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || process.env.NGC_API_KEY;
  if (!key) {
    throw new Error(
      "NVIDIA_API_KEY is not configured on the server. Add it in your deployment environment variables, then redeploy.",
    );
  }
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Never lose the upstream error body: read text, then try to pull a message out.
async function readErrorBody(res: Response) {
  const raw = await res.text().catch(() => "");
  if (!raw) return "";
  try {
    const json = JSON.parse(raw);
    const detail =
      json?.detail ??
      json?.message ??
      json?.error?.message ??
      json?.error ??
      json?.title ??
      (Array.isArray(json?.errors) ? json.errors.map((e: any) => e?.message || String(e)).join("; ") : null);
    if (detail) return typeof detail === "string" ? detail : JSON.stringify(detail);
    return raw.slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

function describeFailure(status: number, detail: string) {
  const suffix = detail ? ` Upstream said: ${detail}` : " The upstream response had no error body.";
  if (status === 400 || status === 422) {
    return `NVIDIA Trellis rejected the request (${status}). This usually means the image was not a supported raster image (PNG, JPEG, or WebP) or was too large.${suffix}`;
  }
  if (status === 401 || status === 403) {
    return `NVIDIA rejected the API key (${status}). Check that NVIDIA_API_KEY is valid and has access to microsoft/trellis on build.nvidia.com.${suffix}`;
  }
  if (status === 404) {
    return `The Trellis endpoint returned 404. The NIM route may have moved or your key has no access to it.${suffix}`;
  }
  if (status === 413) {
    return `The image was too large for Trellis (413). Use an image under 1024x1024.${suffix}`;
  }
  if (status === 429) {
    return `NVIDIA rate-limited the request (429). Wait a minute and try again.${suffix}`;
  }
  if (status >= 500) {
    return `NVIDIA Trellis is failing upstream (${status}) after 3 attempts. This is capacity or a cold GPU on NVIDIA's side, not your project. Retry in a few minutes, or use the Meshy generator on the 3D Models page.${suffix}`;
  }
  return `Trellis request failed (${status}).${suffix}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  // Buffer exists on the server runtime; atob/btoa fallback keeps types happy.
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  return btoa(binary);
}

type ImagePayload = { bytes: Uint8Array; mime: string };

async function loadImage(imageUrl: string): Promise<ImagePayload> {
  if (imageUrl.startsWith("data:")) {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(imageUrl);
    if (!match) throw new Error("The provided data URI image could not be parsed.");
    const mime = match[1].toLowerCase();
    if (mime === "image/svg+xml") {
      throw new Error(
        "Trellis cannot use SVG images. The image generator returned a vector placeholder, which means image generation itself failed. Retry, or upload a PNG or JPEG reference image.",
      );
    }
    if (!RASTER_MIMES.includes(mime)) {
      throw new Error(`Unsupported image type "${mime}". Use PNG, JPEG, or WebP.`);
    }
    const raw = match[3];
    const bytes = match[2]
      ? Uint8Array.from(typeof Buffer !== "undefined" ? Buffer.from(raw, "base64") : atob(raw).split("").map((c) => c.charCodeAt(0)))
      : new TextEncoder().encode(decodeURIComponent(raw));
    return { bytes, mime: mime === "image/jpg" ? "image/jpeg" : mime };
  }

  const res = await fetchWithTimeout(imageUrl, { headers: { Accept: "image/*" } }, 20_000);
  if (!res.ok) {
    throw new Error(`Could not download the reference image (${res.status}). Make sure the URL is public.`);
  }
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime && !RASTER_MIMES.includes(mime)) {
    throw new Error(`The reference image is "${mime}". Trellis needs PNG, JPEG, or WebP.`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error("The reference image download was empty.");
  return { bytes, mime: mime || "image/png" };
}

// Large images: register an NVCF asset and pass it by reference.
async function uploadAsset(image: ImagePayload, key: string) {
  const createRes = await fetchWithTimeout(
    ASSET_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ contentType: image.mime, description: "BloxSmith Trellis input image" }),
    },
    30_000,
  );
  if (!createRes.ok) {
    throw new Error(`Could not register the image with NVIDIA (${createRes.status}). ${await readErrorBody(createRes)}`);
  }
  const created = (await createRes.json().catch(() => null)) as { uploadUrl?: string; assetId?: string } | null;
  if (!created?.uploadUrl || !created?.assetId) {
    throw new Error("NVIDIA did not return an upload URL for the image asset.");
  }
  const putRes = await fetchWithTimeout(
    created.uploadUrl,
    {
      method: "PUT",
      headers: {
        "Content-Type": image.mime,
        "x-amz-meta-nvcf-asset-description": "BloxSmith Trellis input image",
      },
      body: image.bytes as unknown as BodyInit,
    },
    60_000,
  );
  if (!putRes.ok) {
    throw new Error(`Uploading the image to NVIDIA storage failed (${putRes.status}).`);
  }
  return created.assetId;
}

type TrellisResult = { glbBase64?: string; glbUrl?: string; raw?: unknown };

function extractGlb(json: any): TrellisResult {
  if (!json || typeof json !== "object") return { raw: json };
  const url =
    json.url ??
    json.glb_url ??
    json.asset_url ??
    json.artifacts?.[0]?.url ??
    json.assets?.[0]?.url ??
    json.output?.[0]?.url;
  const base64 =
    json.glb ??
    json.glb_base64 ??
    json.model ??
    json.artifacts?.[0]?.base64 ??
    json.assets?.[0]?.base64 ??
    json.output?.[0]?.base64;
  return {
    glbUrl: typeof url === "string" ? url : undefined,
    glbBase64: typeof base64 === "string" ? base64 : undefined,
    raw: json,
  };
}

async function readSuccess(res: Response): Promise<TrellisResult> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => null);
    return extractGlb(json);
  }
  // Binary GLB or ZIP bundle stream.
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error("Trellis returned an empty response body.");
  return { glbBase64: toBase64(bytes), raw: { contentType, byteLength: bytes.length } };
}

async function pollStatus(reqId: string, key: string, maxMs = 300_000): Promise<TrellisResult> {
  const start = Date.now();
  let delay = 2000;
  while (Date.now() - start < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 1000, 6000);
    const res = await fetchWithTimeout(
      `${STATUS_URL}/${reqId}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
      60_000,
    );
    if (res.status === 202) continue;
    if (res.ok) return await readSuccess(res);
    throw new Error(describeFailure(res.status, await readErrorBody(res)));
  }
  throw new Error("Trellis did not finish within 5 minutes. Try a simpler reference image.");
}

async function callTrellis(
  image: ImagePayload,
  key: string,
  opts: {
    seed?: number;
    slatCfgScale?: number;
    ssCfgScale?: number;
    slatSamplingSteps?: number;
    ssSamplingSteps?: number;
  } = {},
): Promise<TrellisResult> {
  const inline = image.bytes.length <= INLINE_LIMIT_BYTES;
  const base64 = toBase64(image.bytes);
  const assetId = inline ? null : await uploadAsset(image, key);

  const body: Record<string, unknown> = {
    image: inline ? `data:${image.mime};base64,${base64}` : assetId,
    // Quality parameters — all optional; NVIDIA defaults are used when omitted.
    ...(typeof opts.slatCfgScale    === "number" ? { slat_cfg_scale:       opts.slatCfgScale }    : {}),
    ...(typeof opts.ssCfgScale      === "number" ? { ss_cfg_scale:         opts.ssCfgScale }      : {}),
    ...(typeof opts.slatSamplingSteps === "number" ? { slat_sampling_steps: opts.slatSamplingSteps } : {}),
    ...(typeof opts.ssSamplingSteps === "number" ? { ss_sampling_steps:    opts.ssSamplingSteps }  : {}),
    ...(typeof opts.seed            === "number" ? { seed:                 opts.seed }             : {}),
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (assetId) {
    headers["NVCF-INPUT-ASSET-REFERENCES"] = assetId;
    headers["NVCF-FUNCTION-ASSET-IDS"] = assetId;
  }

  let lastStatus = 0;
  let lastDetail = "";
  // 5xx and 429 from this NIM are usually cold GPUs or capacity: retry.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(TRELLIS_URL, { method: "POST", headers, body: JSON.stringify(body) }, 120_000);
    } catch (err) {
      lastStatus = 504;
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      continue;
    }

    if (res.status === 202) {
      const reqId = res.headers.get("nvcf-reqid");
      if (!reqId) throw new Error("Trellis accepted the job but returned no request id to poll.");
      return await pollStatus(reqId, key);
    }
    if (res.ok) return await readSuccess(res);

    lastStatus = res.status;
    lastDetail = await readErrorBody(res);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
  }

  throw new Error(describeFailure(lastStatus || 500, lastDetail));
}

export async function executeTrellis3D(params: {
  prompt?: string;
  imageUrl?: string;
  seed?: number;
  slatCfgScale?: number;
  ssCfgScale?: number;
  slatSamplingSteps?: number;
  ssSamplingSteps?: number;
}) {
  const key = nvidiaKey();

  let imageUrl = params.imageUrl;
  let generatedFromPrompt = false;
  if (!imageUrl && params.prompt) {
    imageUrl = await generateGeneralImage({
      prompt: `${params.prompt}. Single centered subject, plain neutral background, even lighting, full object visible, no text, no watermark.`,
      size: "1024x1024",
      kind: "item_icon",
    });
    generatedFromPrompt = true;
  }
  if (!imageUrl) throw new Error("No reference image was available for Trellis.");

  const image = await loadImage(imageUrl);
  const result = await callTrellis(image, key, {
    seed:               params.seed,
    slatCfgScale:       params.slatCfgScale,
    ssCfgScale:         params.ssCfgScale,
    slatSamplingSteps:  params.slatSamplingSteps,
    ssSamplingSteps:    params.ssSamplingSteps,
  });

  if (!result.glbUrl && !result.glbBase64) {
    throw new Error("Trellis finished but returned no GLB data. Try a different reference image.");
  }

  return {
    ok: true as const,
    glbUrl: result.glbUrl,
    glbBase64: result.glbBase64,
    mimeType: "model/gltf-binary",
    sourceImage: generatedFromPrompt ? imageUrl : undefined,
    inlineUpload: image.bytes.length <= INLINE_LIMIT_BYTES,
    params: {
      seed:              params.seed,
      slatCfgScale:      params.slatCfgScale,
      ssCfgScale:        params.ssCfgScale,
      slatSamplingSteps: params.slatSamplingSteps,
      ssSamplingSteps:   params.ssSamplingSteps,
    },
    result: result.raw,
  };
}

export const generateTrellis3D = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        prompt:             z.string().trim().min(2).max(300).optional(),
        imageUrl:           z.string().trim().min(4).optional(),
        seed:               z.number().int().optional(),
        slatCfgScale:       z.number().min(1).max(10).default(3).optional(),
        ssCfgScale:         z.number().min(1).max(20).default(7.5).optional(),
        slatSamplingSteps:  z.number().int().min(1).max(50).default(25).optional(),
        ssSamplingSteps:    z.number().int().min(1).max(50).default(25).optional(),
      })
      .refine((value) => value.prompt || value.imageUrl, { message: "prompt or imageUrl required" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    enforceRateLimit(context.userId, "model_generate");
    return executeTrellis3D(data);
  });
