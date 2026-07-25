import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, enforceRateLimit, resetRateLimits } from "./rate-limit.server";

beforeEach(() => resetRateLimits());

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let i = 0; i < 6; i += 1) {
      expect(checkRateLimit("user-a", "model_generate").allowed).toBe(true);
    }
    expect(checkRateLimit("user-a", "model_generate").allowed).toBe(false);
  });

  it("counts each user separately", () => {
    for (let i = 0; i < 6; i += 1) checkRateLimit("user-a", "model_generate");
    expect(checkRateLimit("user-b", "model_generate").allowed).toBe(true);
  });

  it("counts each bucket separately", () => {
    for (let i = 0; i < 6; i += 1) checkRateLimit("user-a", "model_generate");
    expect(checkRateLimit("user-a", "ui_generate").allowed).toBe(true);
  });

  it("reports remaining slots and a retry hint", () => {
    const first = checkRateLimit("user-c", "build");
    expect(first.remaining).toBe(first.limit - 1);
    for (let i = 1; i < first.limit; i += 1) checkRateLimit("user-c", "build");
    const blocked = checkRateLimit("user-c", "build");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("respects a per-call override", () => {
    expect(checkRateLimit("user-d", "chat", { limit: 1 }).allowed).toBe(true);
    expect(checkRateLimit("user-d", "chat", { limit: 1 }).allowed).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  it("throws a friendly message once over the limit", () => {
    enforceRateLimit("user-e", "chat", { limit: 1 });
    expect(() => enforceRateLimit("user-e", "chat", { limit: 1 })).toThrow(/Try again in/);
  });

  it("does not throw while under the limit", () => {
    expect(() => enforceRateLimit("user-f", "chat")).not.toThrow();
  });
});
