import { describe, expect, it } from "vitest";
import {
  MODELS,
  FALLBACK_CHAIN,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  GATEWAY_ENV_KEYS,
  findModel,
  isSelectable,
  selectableModels,
  isPaidOnlyModel,
} from "./models";

// These are the invariants that decide whether a model can perform at all.
// A broken entry here does not throw - it silently routes users to a dead
// endpoint, or truncates their build. That is why they are pinned in tests.

describe("model catalog integrity", () => {
  it("has no duplicate ids", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every model a non-empty label, provider and gateway", () => {
    for (const m of MODELS) {
      expect(m.label.trim(), m.id).not.toBe("");
      expect(m.provider.trim(), m.id).not.toBe("");
      expect(Object.keys(GATEWAY_ENV_KEYS), m.id).toContain(m.gateway);
    }
  });

  it("gives every gateway at least one env key", () => {
    for (const [gateway, keys] of Object.entries(GATEWAY_ENV_KEYS)) {
      expect(keys.length, gateway).toBeGreaterThan(0);
    }
  });

  it("never ships an empty upstream id", () => {
    for (const m of MODELS) {
      const upstream = m.upstreamId ?? m.id;
      expect(upstream.trim(), m.id).not.toBe("");
      // A bare catalog id like "nvidia/foo" is only valid upstream when the
      // provider actually namespaces that way. Anything routed to oneprovider
      // or groq must strip our internal prefix.
      if (m.gateway === "oneprovider" || m.gateway === "groq") {
        expect(upstream.startsWith(`${m.gateway}/`), m.id).toBe(false);
      }
    }
  });
});

describe("selectable models are actually usable", () => {
  it("exposes at least one working model", () => {
    expect(selectableModels().length).toBeGreaterThan(0);
  });

  it("gives every working model sane generation settings", () => {
    for (const m of selectableModels()) {
      const s = m.modelSettings;
      expect(s, m.id).toBeDefined();
      if (s?.temperature !== undefined) {
        expect(s.temperature, m.id).toBeGreaterThanOrEqual(0);
        expect(s.temperature, m.id).toBeLessThanOrEqual(1.2);
      }
      if (s?.topP !== undefined) {
        expect(s.topP, m.id).toBeGreaterThan(0);
        expect(s.topP, m.id).toBeLessThanOrEqual(1);
      }
      // Anything under 2048 cannot emit a full bloxsmith-actions block.
      expect(s?.maxOutputTokens ?? 0, m.id).toBeGreaterThanOrEqual(2048);
    }
  });

  it("explains why every disabled model is disabled", () => {
    for (const m of MODELS.filter((x) => !isSelectable(x))) {
      expect(m.bestFor.trim(), m.id).not.toBe("");
    }
  });
});

describe("routing defaults", () => {
  it("points the default and fallback ids at working models", () => {
    expect(isSelectable(findModel(DEFAULT_MODEL_ID))).toBe(true);
    expect(isSelectable(findModel(FALLBACK_MODEL_ID))).toBe(true);
    expect(findModel(DEFAULT_MODEL_ID).id).toBe(DEFAULT_MODEL_ID);
  });

  it("resolves an unknown id to a working model, never a disabled one", () => {
    // Regression: findModel used to return MODELS[0], which is "Coming Soon".
    const resolved = findModel("nvidia/this-model-was-renamed");
    expect(isSelectable(resolved)).toBe(true);
  });

  it("resolves an empty id to a working model", () => {
    expect(isSelectable(findModel(""))).toBe(true);
  });
});

describe("fallback chain", () => {
  it("contains only ids that exist in the catalog", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    for (const id of FALLBACK_CHAIN) expect(ids.has(id), id).toBe(true);
  });

  it("contains only working models", () => {
    for (const id of FALLBACK_CHAIN) {
      expect(isSelectable(findModel(id)), id).toBe(true);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(FALLBACK_CHAIN).size).toBe(FALLBACK_CHAIN.length);
  });

  it("starts at the default model so the first attempt is the advertised one", () => {
    expect(FALLBACK_CHAIN[0]).toBe(DEFAULT_MODEL_ID);
  });

  it("spans more than one gateway so a provider outage cannot kill every retry", () => {
    const gateways = new Set(FALLBACK_CHAIN.map((id) => findModel(id).gateway));
    expect(gateways.size).toBeGreaterThan(1);
  });

  it("can reach every working non-paidOnly model", () => {
    // paidOnly models (GPT-5.6 series, Claude Fable 5) are reserved for
    // top-up supporters & owners and intentionally excluded from the public
    // fallback chain — they are user-selected, not routed automatically.
    const unreachable = selectableModels()
      .filter((m) => !isPaidOnlyModel(m))
      .map((m) => m.id)
      .filter((id) => !FALLBACK_CHAIN.includes(id));
    expect(unreachable).toEqual([]);
  });
});
