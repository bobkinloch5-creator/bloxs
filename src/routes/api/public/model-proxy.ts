// Public streaming proxy for AI 3D model files (GLB/GLTF/textures).
// Third-party CDNs (Tripo, S3-signed URLs) frequently omit CORS headers, which
// makes <model-viewer>'s in-browser fetch fail with "TypeError: Failed to
// fetch". This proxy re-streams the file with permissive CORS so the viewer
// can load it. Only whitelisted hosts are allowed to prevent SSRF/abuse.
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = [
  // Tripo CDNs
  /(^|\.)tripo3d\.com$/i,
  /(^|\.)tripo3d\.ai$/i,
  /(^|\.)tripo-data\.[a-z0-9-]+\.data\.tripo3d\.com$/i,
  // Amazon S3 / CloudFront signed URLs used by Tripo
  /(^|\.)amazonaws\.com$/i,
  /(^|\.)cloudfront\.net$/i,
  // Supabase Storage
  /(^|\.)supabase\.co$/i,
  /(^|\.)supabase\.in$/i,
  // Meshy / Rodin / common providers occasionally used as sources
  /(^|\.)meshy\.ai$/i,
  /(^|\.)meshy\.pro$/i,
  /(^|\.)meshypro\.com$/i,
  /(^|\.)hyper3d\.ai$/i,
  // Google Cloud Storage — Meshy signed asset URLs
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)storage\.googleapis\.com$/i,
];

function isAllowed(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return ALLOWED_HOSTS.some((re) => re.test(url.hostname));
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "range, content-type",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
};

async function proxy(request: Request): Promise<Response> {
  const src = new URL(request.url).searchParams.get("url");
  if (!src) return new Response("Missing url", { status: 400, headers: CORS_HEADERS });
  let target: URL;
  try { target = new URL(src); } catch { return new Response("Invalid url", { status: 400, headers: CORS_HEADERS }); }
  if (!isAllowed(target)) return new Response("Host not allowed", { status: 403, headers: CORS_HEADERS });

  const forwardHeaders: Record<string, string> = { Accept: "*/*" };
  const range = request.headers.get("range");
  if (range) forwardHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow",
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err instanceof Error ? err.message : "unknown"}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  const headers = new Headers(CORS_HEADERS);
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  else {
    // Guess model MIME from extension so browsers accept it.
    const path = target.pathname.toLowerCase();
    if (path.endsWith(".glb")) headers.set("content-type", "model/gltf-binary");
    else if (path.endsWith(".gltf")) headers.set("content-type", "model/gltf+json");
    else if (path.endsWith(".obj")) headers.set("content-type", "text/plain");
    else if (path.endsWith(".mtl")) headers.set("content-type", "text/plain");
  }
  for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/public/model-proxy")({
  server: {
    handlers: {
      GET: ({ request }) => proxy(request),
      HEAD: ({ request }) => proxy(request),
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
