// Phase 5.1 (D-M5 / JARVIS-18) — remember_fact tool schema tests.
//
// RED phase: these tests are written BEFORE the implementation.
// They cover zRememberFact validation + factory pattern.

import { describe, expect, it } from "vitest";
import { zRememberFact, zRememberFactFor } from "../src/tools/remember-fact";

describe("zRememberFact (default schema — voiceActive=false)", () => {
  it("accepts a valid user_explicit entity fact", () => {
    expect(
      zRememberFact.safeParse({
        type: "entity",
        key: "Anna",
        value: "my partner",
        source: "user_explicit",
      }).success,
    ).toBe(true);
  });

  it("accepts all four type literals", () => {
    const types = ["preference", "rule", "entity", "workflow"] as const;
    for (const type of types) {
      expect(
        zRememberFact.safeParse({ type, key: "k", value: "v", source: "user_explicit" }).success,
      ).toBe(true);
    }
  });

  it("accepts both source literals", () => {
    expect(
      zRememberFact.safeParse({ type: "preference", key: "k", value: "v", source: "user_explicit" }).success,
    ).toBe(true);
    expect(
      zRememberFact.safeParse({ type: "preference", key: "k", value: "v", source: "jarvis_suggested" }).success,
    ).toBe(true);
  });

  it("rejects unknown type literal", () => {
    expect(
      zRememberFact.safeParse({ type: "habit", key: "k", value: "v", source: "user_explicit" }).success,
    ).toBe(false);
  });

  it("rejects unknown source literal", () => {
    expect(
      zRememberFact.safeParse({ type: "entity", key: "k", value: "v", source: "system" }).success,
    ).toBe(false);
  });

  it("rejects empty key (min 1)", () => {
    expect(
      zRememberFact.safeParse({ type: "entity", key: "", value: "v", source: "user_explicit" }).success,
    ).toBe(false);
  });

  it("rejects value over 500 chars", () => {
    const longValue = "x".repeat(501);
    expect(
      zRememberFact.safeParse({ type: "entity", key: "k", value: longValue, source: "user_explicit" }).success,
    ).toBe(false);
  });

  it("accepts value at exactly 500 chars", () => {
    const maxValue = "x".repeat(500);
    expect(
      zRememberFact.safeParse({ type: "entity", key: "k", value: maxValue, source: "user_explicit" }).success,
    ).toBe(true);
  });

  it("rejects empty value (min 1)", () => {
    expect(
      zRememberFact.safeParse({ type: "entity", key: "k", value: "", source: "user_explicit" }).success,
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(zRememberFact.safeParse({}).success).toBe(false);
    expect(zRememberFact.safeParse({ type: "entity" }).success).toBe(false);
    expect(zRememberFact.safeParse({ type: "entity", key: "k" }).success).toBe(false);
  });
});

describe("zRememberFactFor factory", () => {
  it("factory with voiceActive=false returns same schema as default export", () => {
    const schema = zRememberFactFor({ voiceActive: false });
    const result = schema.safeParse({
      type: "preference",
      key: "verbosity",
      value: "be concise",
      source: "user_explicit",
    });
    expect(result.success).toBe(true);
  });

  it("factory is callable with empty opts (backward compat)", () => {
    const schema = zRememberFactFor({});
    expect(schema.safeParse({ type: "rule", key: "k", value: "v", source: "user_explicit" }).success).toBe(true);
  });
});
