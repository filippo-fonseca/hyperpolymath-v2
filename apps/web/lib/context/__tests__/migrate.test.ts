/**
 * migrate() — schema-version routing.
 *
 * Phase 999.12 CTX-09: snapshots are forever. The reader is tolerant —
 * v1 payloads round-trip after Zod parse; future versions fail loudly;
 * older legacy versions return as opaque `_legacy: true` wrappers so
 * the agent never lies about historical context.
 */

import { describe, it, expect } from "vitest";
import { migrate, CURRENT_SCHEMA_VERSION } from "../migrate";
import { ContextSnapshotSchema } from "../types";

const validV1Payload = {
  schemaVersion: 1 as const,
  generatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [],
  edges: [],
  meta: {
    totalNodes: 0,
    totalEdges: 0,
    nodeCounts: {},
    excludedNoExportCount: 0,
  },
};

describe("CURRENT_SCHEMA_VERSION", () => {
  it("is 1 in the v1 release", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe("migrate()", () => {
  it("returns ok with parsed snapshot for a valid v1 payload at the current version", () => {
    const result = migrate(validV1Payload, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Zod parse round-trip succeeds — typed snapshot, not a legacy wrapper.
    const parsed = ContextSnapshotSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect((result.data as typeof validV1Payload).schemaVersion).toBe(1);
  });

  it("returns err for an invalid v1 payload (missing required field)", () => {
    const invalid = { ...validV1Payload, meta: { totalNodes: 0 } }; // missing required meta fields
    const result = migrate(invalid, 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/v1 payload failed validation/);
  });

  it("returns err when payload version is newer than the reader (forward-incompatible)", () => {
    const result = migrate(validV1Payload, 99);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer than reader/);
  });

  it("returns ok with _legacy wrapper when payload version is older and no migrator is registered", () => {
    const ancient = { schemaVersion: 0, anyOldShape: "hello" };
    const result = migrate(ancient, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { _legacy: true; schemaVersion: number; anyOldShape: string };
    expect(data._legacy).toBe(true);
    expect(data.schemaVersion).toBe(0);
    expect(data.anyOldShape).toBe("hello");
  });
});
