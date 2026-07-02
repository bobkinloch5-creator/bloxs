import { useEffect } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

/**
 * Client-side safety net: catches uncaught runtime errors and unhandled
 * promise rejections, surfaces a friendly toast, and rate-limits so a
 * misbehaving loop can't drown the user in notifications.
 *
 * Wire this once, near the top of the app tree. Route-level ErrorBoundary
 * still handles render-time crashes; this handles fire-and-forget async
 * calls that would otherwise fail silently in the console.
 */
export function GlobalErrorGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastMessage = "";
    let lastAt = 0;
    const MIN_INTERVAL_MS = 3000;

    const surface = (err: unknown, source: string) => {
      const msg = friendlyError(err, { fallback: "Something went wrong. Please try again." });
      const now = Date.now();
      // De-dupe identical messages within the rate-limit window.
      if (msg === lastMessage && now - lastAt < MIN_INTERVAL_MS) return;
      lastMessage = msg;
      lastAt = now;
      toast.error(msg);
      // Keep the raw error in the console so devs can inspect it.
      console.error(`[GlobalErrorGuard:${source}]`, err);
    };

    const onError = (event: ErrorEvent) => {
      // Ignore ResizeObserver noise and cross-origin script errors that carry no info.
      const msg = event?.message ?? "";
      if (/ResizeObserver loop|Script error\.?$/i.test(msg)) return;
      surface(event.error ?? event.message ?? "unknown", "error");
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      // Skip aborts and known-cancel signals.
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      if (/aborted|AbortError|cancell?ed/i.test(msg)) return;
      surface(reason, "unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
