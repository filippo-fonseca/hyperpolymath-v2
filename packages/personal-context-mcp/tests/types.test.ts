/**
 * Type-schema tests for the personal-context-mcp v1 contract (MCP-01 / CTX-03).
 *
 * Acceptance criteria from the plan's <behavior> block:
 *   - NodeSchema accepts each of the 7 valid node shapes
 *   - NodeSchema rejects { type: 'unknown', id: '...' }
 *   - ContextSnapshotSchema rejects schemaVersion !== 1
 *   - EdgeSchema accepts each of the 5 valid edge shapes
 *
 * Zod 4 UUID format strictness gotcha (documented in 999.12-02-SUMMARY.md):
 * z.string().uuid() only accepts v1–v8 UUIDs + sentinel UUIDs. Pad-counter
 * fixtures like '00000000-0000-0000-0000-000000000001' FAIL format because
 * the variant nibble must match. We use crypto.randomUUID() (v4) throughout.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  NodeSchema,
  EdgeSchema,
  ContextSnapshotSchema,
  CURRENT_SCHEMA_VERSION,
} from "../src/types";

describe("NodeSchema (v1 — 7 node types)", () => {
  it("accepts an area node", () => {
    const node = {
      type: "area" as const,
      id: randomUUID(),
      name: "Academics",
      emoji: "🎓",
      orderIndex: 0,
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts an area node with null emoji", () => {
    const node = {
      type: "area" as const,
      id: randomUUID(),
      name: "Health",
      emoji: null,
      orderIndex: 2,
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a project node", () => {
    const node = {
      type: "project" as const,
      id: randomUUID(),
      areaId: randomUUID(),
      name: "CPSC 323",
      isClass: true,
      archived: false,
      startDate: "2026-01-15",
      endDate: "2026-05-10",
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a project node with null dates", () => {
    const node = {
      type: "project" as const,
      id: randomUUID(),
      areaId: randomUUID(),
      name: "hyperpolymath v2",
      isClass: false,
      archived: false,
      startDate: null,
      endDate: null,
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a task node with all priority + status literals", () => {
    const base = {
      type: "task" as const,
      id: randomUUID(),
      title: "ship Plan 03",
      dueDate: null,
      projectIds: [randomUUID()],
    };
    for (const priority of ["P∞", "P1", "P2", "P3"] as const) {
      for (const status of [
        "not started",
        "up next",
        "in progress",
        "almost done",
        "lesno",
      ] as const) {
        const parsed = NodeSchema.safeParse({ ...base, priority, status });
        expect(parsed.success, `priority=${priority} status=${status}`).toBe(true);
      }
    }
  });

  it("rejects a task node with invalid priority", () => {
    const node = {
      type: "task" as const,
      id: randomUUID(),
      title: "x",
      priority: "URGENT",
      status: "not started" as const,
      dueDate: null,
      projectIds: [],
    };
    expect(NodeSchema.safeParse(node).success).toBe(false);
  });

  it("rejects a task node with invalid status (must be space-separated DB enum)", () => {
    const node = {
      type: "task" as const,
      id: randomUUID(),
      title: "x",
      priority: "P3" as const,
      status: "in_progress",
      dueDate: null,
      projectIds: [],
    };
    expect(NodeSchema.safeParse(node).success).toBe(false);
  });

  it("accepts a capture node", () => {
    const node = {
      type: "capture" as const,
      id: randomUUID(),
      text: "remember to call mom",
      createdAt: new Date().toISOString(),
      tags: ["personal", "family"],
      projectIds: [],
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a training_activity node with all-nullable durations/distances", () => {
    const node = {
      type: "training_activity" as const,
      id: randomUUID(),
      kind: "run",
      durationMin: null,
      distanceKm: null,
      occurredAt: "2026-06-09",
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a training_activity node with numeric durations + distances", () => {
    const node = {
      type: "training_activity" as const,
      id: randomUUID(),
      kind: "ride",
      durationMin: 45,
      distanceKm: 18.4,
      occurredAt: "2026-06-08",
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a habit node", () => {
    const node = {
      type: "habit" as const,
      id: randomUUID(),
      name: "meditate",
      currentStreak: 12,
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts a jarvis_fact node", () => {
    const node = {
      type: "jarvis_fact" as const,
      id: randomUUID(),
      text: "prefers concise replies",
      createdAt: new Date().toISOString(),
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("rejects an unknown node type", () => {
    const node = {
      type: "unknown",
      id: randomUUID(),
    } as unknown;
    expect(NodeSchema.safeParse(node).success).toBe(false);
  });

  it("rejects a node missing its discriminator", () => {
    const node = { id: randomUUID(), name: "x" } as unknown;
    expect(NodeSchema.safeParse(node).success).toBe(false);
  });
});

describe("EdgeSchema (v1 — 5 edge types)", () => {
  it("accepts project_in_area", () => {
    const edge = {
      type: "project_in_area" as const,
      from: randomUUID(),
      to: randomUUID(),
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("accepts task_in_project", () => {
    const edge = {
      type: "task_in_project" as const,
      from: randomUUID(),
      to: randomUUID(),
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("accepts capture_in_project", () => {
    const edge = {
      type: "capture_in_project" as const,
      from: randomUUID(),
      to: randomUUID(),
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("accepts capture_tagged with a tag string", () => {
    const edge = {
      type: "capture_tagged" as const,
      from: randomUUID(),
      tag: "research",
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("accepts fact_about with entityType=area", () => {
    const edge = {
      type: "fact_about" as const,
      from: randomUUID(),
      entityType: "area" as const,
      entityId: randomUUID(),
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("accepts fact_about with entityType=project", () => {
    const edge = {
      type: "fact_about" as const,
      from: randomUUID(),
      entityType: "project" as const,
      entityId: randomUUID(),
    };
    expect(EdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("rejects fact_about with entityType=task (not in the enum)", () => {
    const edge = {
      type: "fact_about" as const,
      from: randomUUID(),
      entityType: "task",
      entityId: randomUUID(),
    } as unknown;
    expect(EdgeSchema.safeParse(edge).success).toBe(false);
  });
});

describe("ContextSnapshotSchema (top-level envelope)", () => {
  it("exposes CURRENT_SCHEMA_VERSION = 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("accepts a minimal v1 snapshot", () => {
    const snap = {
      schemaVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: {
        totalNodes: 0,
        totalEdges: 0,
        nodeCounts: {},
        excludedNoExportCount: 0,
      },
    };
    expect(ContextSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("rejects schemaVersion = 0", () => {
    const snap = {
      schemaVersion: 0,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: { totalNodes: 0, totalEdges: 0, nodeCounts: {}, excludedNoExportCount: 0 },
    } as unknown;
    expect(ContextSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects schemaVersion = 2 (future version)", () => {
    const snap = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: { totalNodes: 0, totalEdges: 0, nodeCounts: {}, excludedNoExportCount: 0 },
    } as unknown;
    expect(ContextSnapshotSchema.safeParse(snap).success).toBe(false);
  });
});
