import { useEffect, useMemo, useState } from "react";
import { Timer, ShieldAlert } from "lucide-react";
import {
  bucketLabel,
  formatCountdown,
  parseRateLimitError,
  type RateLimitInfo,
} from "@/lib/rate-limit-client";

/**
 * Ticks once a second while a deadline is in the future.
 * Returns the remaining milliseconds and stops the interval at zero, so an
 * expired notice costs nothing.
 */
export function useCountdown(resetAt: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resetAt) return;
    if (resetAt <= Date.now()) return;

    setNow(Date.now());
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resetAt) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [resetAt]);

  const remaining = resetAt ? Math.max(0, resetAt - now) : 0;
  return { remaining, expired: !resetAt || remaining <= 0 };
}

/**
 * Turns a caught error into rate limit info, and clears itself automatically
 * the moment the window reopens.
 */
export function useRateLimitState(error: unknown) {
  const info = useMemo(() => parseRateLimitError(error), [error]);
  const { expired } = useCountdown(info?.resetAt);
  return info && !expired ? info : null;
}

/**
 * Live countdown shown when a user hits a rate limit. Replaces the old static
 * "try again in 30s" text, which went stale the second it rendered.
 */
export function RateLimitNotice({
  info,
  onExpire,
  className = "",
  compact = false,
}: {
  info: RateLimitInfo;
  onExpire?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { remaining, expired } = useCountdown(info.resetAt);

  // Window length inferred from when the notice first appeared, so the bar
  // drains smoothly no matter which bucket was hit.
  const [total] = useState(() => Math.max(1, info.resetAt - Date.now()));
  const progress = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));

  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  if (expired) return null;

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-amber-200 ${className}`}
      >
        <Timer className="breathe h-3 w-3" />
        Ready in {formatCountdown(remaining)}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast-in overflow-hidden rounded-xl border border-amber-400/30 bg-amber-500/[0.08] ${className}`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-400/30 bg-amber-500/15 text-amber-200">
          <ShieldAlert className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-amber-100">Slow down for a moment</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-amber-100">
              <Timer className="h-3 w-3" />
              {formatCountdown(remaining)}
            </span>
          </div>

          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            {info.limit > 0
              ? `You have used all ${info.limit} ${bucketLabel(info.bucket)} allowed in this window. `
              : `${info.message} `}
            The limit lifts automatically - no need to refresh.
          </p>

          <div
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-950/40"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label="Time until the limit resets"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-200 transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Submit button that disables itself while a limit is active and shows the
 * remaining time in place of its label.
 */
export function RateLimitedButton({
  info,
  disabled,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { info: RateLimitInfo | null }) {
  const { remaining, expired } = useCountdown(info?.resetAt);
  const blocked = !!info && !expired;

  return (
    <button {...rest} disabled={disabled || blocked} className={className}>
      {blocked ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Timer className="h-3.5 w-3.5" />
          Ready in {formatCountdown(remaining)}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
