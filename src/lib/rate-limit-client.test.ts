import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  formatCountdown,
  parseRateLimitError,
  stripRateLimitMarker,
} from "./rate-limit-client";
import { enforceRateLimit, resetRateLimits, RateLimitError } from "./rate-limit.server";

describe("formatCountdown", () => {
  it("uses seconds under a minute", () => {
    expect(formatCountdown(1)).toBe("1s");
    expect(formatCountdown(42_000)).toBe("42s");
    expect(formatCountdown(59_400)).toBe("60s");
  });

  it("uses m:ss at a minute or more", () => {
    expect(formatCountdown(60_000)).toBe("1:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(300_000)).toBe("5:00");
  });

  it("never goes negative", () => {
    expect(formatCountdown(-5_000)).toBe("0s");
  });
});

describe("parseRateLimitError", () => {
  it("returns null for ordinary errors", () => {
    expect(parseRateLimitError(new Error("Something broke"))).toBeNull();
    expect(parseRateLimitError("plain string")).toBeNull();
    expect(parseRateLimitError(null)).toBeNull();
    expect(parseRateLimitError(undefined)).toBeNull();
    expect(parseRateLimitError({})).toBeNull();
  });

  it("extracts the reset time, limit and bucket", () => {
    const resetAt = Date.now() + 30_000;
    const info = parseRateLimitError(new Error(`Too fast. [[rl:ui_generate:${resetAt}:12]]`));
    expect(info).not.toBeNull();
    expect(info!.bucket).toBe("ui_generate");
    expect(info!.resetAt).toBe(resetAt);
    expect(info!.limit).toBe(12);
  });

  it("never leaks the marker into the user-facing message", () => {
    const info = parseRateLimitError(new Error(`Too fast. [[rl:chat:${Date.now()}:40]]`));
    expect(info!.message).not.toContain("[[rl:");
    expect(info!.message).toBe("Too fast.");
  });

  it("reads the marker off a thrown string as well as an Error", () => {
    const resetAt = Date.now() + 1_000;
    expect(parseRateLimitError(`nope [[rl:build:${resetAt}:6]]`)!.bucket).toBe("build");
  });
});

describe("stripRateLimitMarker", () => {
  it("leaves unmarked messages untouched", () => {
    expect(stripRateLimitMarker("Generation failed.")).toBe("Generation failed.");
  });

  it("removes the marker and trims", () => {
    expect(stripRateLimitMarker("Slow down. [[rl:export:123:10]]")).toBe("Slow down.");
  });
});

describe("bucketLabel", () => {
  it("names the known buckets", () => {
    expect(bucketLabel("ui_generate")).toBe("UI generations");
    expect(bucketLabel("model_generate")).toBe("3D model generations");
  });

  it("falls back for unknown buckets", () => {
    expect(bucketLabel("something_new")).toBe("requests");
  });
});

describe("server error is readable by the client parser", () => {
  it("round-trips through the thrown message", () => {
    resetRateLimits();
    enforceRateLimit("round-trip-user", "ui_generate", { limit: 1 });

    let thrown: unknown;
    try {
      enforceRateLimit("round-trip-user", "ui_generate", { limit: 1 });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(RateLimitError);

    const info = parseRateLimitError(thrown);
    expect(info).not.toBeNull();
    expect(info!.bucket).toBe("ui_generate");
    expect(info!.limit).toBe(1);
    // The reset time must be in the future, otherwise the countdown would show 0.
    expect(info!.resetAt).toBeGreaterThan(Date.now());
    expect(info!.message).not.toContain("[[rl:");
  });

  it("exposes the reset time on the error object for server-side callers", () => {
    resetRateLimits();
    enforceRateLimit("fields-user", "build", { limit: 1 });
    try {
      enforceRateLimit("fields-user", "build", { limit: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as RateLimitError;
      expect(err.bucket).toBe("build");
      expect(err.retryAfterMs).toBeGreaterThan(0);
      expect(err.resetAt).toBeGreaterThan(Date.now());
    }
  });
});
