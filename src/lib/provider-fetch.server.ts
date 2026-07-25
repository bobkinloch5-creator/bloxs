// Shared HTTP helper for every external AI provider call (NVIDIA NIM, Meshy,
// ElevenLabs, Lovable gateway, Roblox APIs).
//
// Why this exists: provider calls across the codebase used
// `res.json().catch(() => null)`, which threw away the real error body and
// surfaced messages like "Trellis error 500: null" to users. Everything routed
// through here gets:
//   - the upstream error text, parsed for the useful message field
//   - an abort timeout so a hung provider cannot hold a request open
//   - automatic retries with backoff on 408/429/5xx and network failures
//   - a human-readable message that says what the user should actually do

export type ProviderRequest = {
  /** Provider label used in error messages, e.g. "NVIDIA Trellis". */
  provider: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  /** Per-attempt timeout. Defaults to 60s. */
  timeoutMs?: number;
  /** Total attempts including the first. Defaults to 3. */
  attempts?: number;
  /** Extra status codes to treat as retryable. */
  retryOn?: number[];
  /** Called before each retry, useful for logging. */
  onRetry?: (info: { attempt: number; status: number; detail: string }) => void;
};

export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(args: { provider: string; status: number; detail: string; retryable: boolean; message: string }) {
    super(args.message);
    this.name = "ProviderError";
    this.provider = args.provider;
    this.status = args.status;
    this.detail = args.detail;
    this.retryable = args.retryable;
  }
}

const DEFAULT_RETRY_STATUS = [408, 409, 425, 429, 500, 502, 503, 504];

export function isRetryableStatus(status: number, extra: number[] = []) {
  return DEFAULT_RETRY_STATUS.includes(status) || extra.includes(status) || status >= 500;
}

/** Read an error body as text, then dig out the most useful message field. */
export async function readProviderError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  if (!raw) return "";
  try {
    const json = JSON.parse(raw) as Record<string, any>;
    const detail =
      json?.detail ??
      json?.message ??
      json?.error?.message ??
      json?.error ??
      json?.title ??
      json?.errors?.[0]?.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (detail) return JSON.stringify(detail).slice(0, 500);
    return raw.slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

/** Turn a status code into something a game developer can act on. */
export function describeProviderFailure(provider: string, status: number, detail: string) {
  const tail = detail ? ` Upstream said: ${detail}` : "";
  switch (true) {
    case status === 0:
      return `${provider} could not be reached (network error or timeout). Try again in a moment.${tail}`;
    case status === 400 || status === 422:
      return `${provider} rejected the request (${status}) - usually an unsupported input.${tail}`;
    case status === 401 || status === 403:
      return `${provider} rejected the API key (${status}). Check the key in your deployment environment variables.${tail}`;
    case status === 404:
      return `${provider} endpoint returned 404. The API route may have moved, or the key lacks access.${tail}`;
    case status === 413:
      return `The payload was too large for ${provider} (413). Use a smaller input.${tail}`;
    case status === 429:
      return `${provider} rate-limited the request (429). Wait a minute and try again.${tail}`;
    case status >= 500:
      return `${provider} is failing upstream (${status}) after every retry. This is on the provider's side, not your project - retry in a few minutes.${tail}`;
    default:
      return `${provider} request failed (${status}).${tail}`;
  }
}

async function fetchOnce(request: ProviderRequest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 60_000);
  try {
    const isJsonBody = request.body !== undefined && !(request.body instanceof Uint8Array);
    return await fetch(request.url, {
      method: request.method ?? (request.body === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(request.headers ?? {}),
      },
      body:
        request.body === undefined
          ? undefined
          : isJsonBody
            ? JSON.stringify(request.body)
            : (request.body as unknown as BodyInit),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform a provider request with retries. Returns the raw Response on success
 * so callers can decide between JSON and binary handling.
 */
export async function providerFetch(request: ProviderRequest): Promise<Response> {
  const attempts = Math.max(1, request.attempts ?? 3);
  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetchOnce(request);
    } catch (err) {
      lastStatus = 0;
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt === attempts) break;
      request.onRetry?.({ attempt, status: 0, detail: lastDetail });
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      continue;
    }

    if (res.ok || res.status === 202) return res;

    lastStatus = res.status;
    lastDetail = await readProviderError(res);
    if (attempt === attempts || !isRetryableStatus(res.status, request.retryOn)) break;
    request.onRetry?.({ attempt, status: res.status, detail: lastDetail });
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }

  throw new ProviderError({
    provider: request.provider,
    status: lastStatus,
    detail: lastDetail,
    retryable: isRetryableStatus(lastStatus, request.retryOn),
    message: describeProviderFailure(request.provider, lastStatus, lastDetail),
  });
}

/** providerFetch + JSON parse, with a clear error when the body is not JSON. */
export async function providerFetchJson<T = unknown>(request: ProviderRequest): Promise<T> {
  const res = await providerFetch(request);
  const text = await res.text();
  if (!text.trim()) {
    throw new ProviderError({
      provider: request.provider,
      status: res.status,
      detail: "empty body",
      retryable: true,
      message: `${request.provider} returned an empty response.`,
    });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError({
      provider: request.provider,
      status: res.status,
      detail: text.slice(0, 200),
      retryable: false,
      message: `${request.provider} returned a non-JSON response.`,
    });
  }
}
