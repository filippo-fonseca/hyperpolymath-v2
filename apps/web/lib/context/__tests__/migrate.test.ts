/**
 * migrate() — schema-version routing.
 *
 * Phase 999.12 CTX-09: snapshots are forever. The reader is tolerant: v3
 * payloads round-trip after Zod parse; v1 and v2 payloads are migrated via
 * the registered migrators (additive schema bumps plus the v3 page-field
 * backfill); future versions fail loudly; legacy versions with no migrator
 * return as opaque `_legacy: true` wrappers so the agent never lies about
 * historical context.
 */

import { describe, it, expect } from "vitest";
import { migrate, CURRENT_SCHEMA_VERSION } from "../migrate";
import { ContextSnapshotSchema } from "../types";

const validV4Payload = {
  schemaVersion: 4 as const,
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

// A v3 payload on disk — schemaVersion 3, predates person nodes / mentions_person edges.
const validV3Payload = {
  schemaVersion: 3,
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

// A v2 payload on disk — schemaVersion 2, page nodes predate folderId/folderPath.
const validV2Payload = {
  schemaVersion: 2,
  generatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [
    {
      type: "page" as const,
      id: "11111111-1111-4111-8111-111111111111",
      title: "Old page",
      content: "body",
      emoji: null,
      projectIds: ["22222222-2222-4222-8222-222222222222"],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    },
  ],
  edges: [],
  meta: {
    totalNodes: 1,
    totalEdges: 0,
    nodeCounts: { page: 1 },
    excludedNoExportCount: 0,
  },
};

// A v1 payload on disk — schemaVersion 1, no journal_entry nodes.
const validV1Payload = {
  schemaVersion: 1,
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
  it("is 4 in the v4 release", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
  });
});

describe("migrate()", () => {
  it("returns ok with parsed snapshot for a valid v4 payload at the current version", () => {
    const result = migrate(validV4Payload, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Zod parse round-trip succeeds — typed snapshot, not a legacy wrapper.
    const parsed = ContextSnapshotSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect((result.data as typeof validV4Payload).schemaVersion).toBe(4);
  });

  it("returns err for an invalid v4 payload (missing required field)", () => {
    const invalid = { ...validV4Payload, meta: { totalNodes: 0 } }; // missing required meta fields
    const result = migrate(invalid, 4);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/v4 payload failed validation/);
  });

  it("migrates a v2 payload to v3, backfilling folderId/folderPath on page nodes", () => {
    const result = migrate(validV2Payload, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = ContextSnapshotSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schemaVersion).toBe(4);
    const page = parsed.data.nodes.find((n) => n.type === "page");
    expect(page).toBeDefined();
    if (page?.type !== "page") return;
    // Backfilled to the unfiled defaults; the direct-only projectIds are untouched.
    expect(page.folderId).toBeNull();
    expect(page.folderPath).toEqual([]);
    expect(page.projectIds).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("migrates a v1 payload all the way to v3 via the chained migrators", () => {
    const result = migrate(validV1Payload, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The v1 migrator chains through v2 (additive journal_entry) into v3 (page
    // backfill); an empty v1 payload re-parses cleanly under the current schema.
    const parsed = ContextSnapshotSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schemaVersion).toBe(4);
  });

  it("migrates a v3 payload to v4 (additive person nodes / mentions_person edges)", () => {
    const result = migrate(validV3Payload, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = ContextSnapshotSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Old v3 payload simply lacks person nodes / mentions_person edges; the v4
    // schema accepts that, so the migrator only lifts the version and re-parses.
    expect(parsed.data.schemaVersion).toBe(4);
    expect(parsed.data.nodes).toEqual([]);
    expect(parsed.data.edges).toEqual([]);
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
