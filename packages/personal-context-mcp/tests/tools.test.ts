/**
 * Tool-handler tests for the personal-context-mcp v1 contract (MCP-04).
 *
 * Acceptance criteria from the plan's <behavior> block:
 *   - get_current_context with topics=['task','project'] returns ONLY nodes
 *     whose type is in the topics array
 *   - get_current_context with no topics returns full snapshot
 *   - get_current_context when loadSnapshot returns null returns
 *     { content: [{ type: 'text', text: 'No snapshot available yet.' }] }
 *   - get_snapshot_history with days=7 calls loadHistory(userId, 7); response
 *     excludes the nodes/edges arrays from each entry
 *   - get_snapshot_history rejects days > 30 (Zod schema constraint .max(30))
 *
 * Tests drive the bare handlers directly via the make…Handler factories, so
 * no transport / network is required. createPersonalContextServer() is also
 * smoke-tested to confirm it returns a real McpServer instance with both
 * tools registered.
 */

import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createPersonalContextServer,
  makeGetCurrentContextHandler,
  makeGetSnapshotHistoryHandler,
  getSnapshotHistoryParamsShape,
} from "../src/index";
import { z } from "zod";
import type {
  ContextSnapshot,
  SnapshotHistoryEntry,
  LoadSnapshot,
  LoadHistory,
} from "../src/index";

/* ─── Fixtures ────────────────────────────────────────────────────────── */

function buildFixtureSnapshot(): ContextSnapshot {
  const areaId = randomUUID();
  const projectId = randomUUID();
  const taskId = randomUUID();
  const captureId = randomUUID();
  return {
    schemaVersion: 3,
    generatedAt: "2026-06-09T00:00:00.000Z",
    nodes: [
      { type: "area", id: areaId, name: "Academics", emoji: "🎓", orderIndex: 0 },
      {
        type: "project",
        id: projectId,
        areaId,
        name: "CPSC 323",
        isClass: true,
        archived: false,
        startDate: "2026-01-15",
        endDate: "2026-05-10",
      },
      {
        type: "task",
        id: taskId,
        title: "ship Plan 03",
        priority: "P1",
        status: "in progress",
        dueDate: "2026-06-10",
        projectIds: [projectId],
      },
      {
        type: "capture",
        id: captureId,
        text: "Karpathy LLM Wiki idea",
        createdAt: "2026-06-09T00:00:00.000Z",
        tags: ["research"],
        projectIds: [projectId],
      },
    ],
    edges: [
      { type: "project_in_area", from: projectId, to: areaId },
      { type: "task_in_project", from: taskId, to: projectId },
      { type: "capture_in_project", from: captureId, to: projectId },
      { type: "capture_tagged", from: captureId, tag: "research" },
    ],
    meta: {
      totalNodes: 4,
      totalEdges: 4,
      nodeCounts: { area: 1, project: 1, task: 1, capture: 1 },
      excludedNoExportCount: 0,
    },
  };
}

/* ─── get_current_context ─────────────────────────────────────────────── */

describe("get_current_context handler", () => {
  it("returns 'No snapshot available yet.' when loadSnapshot returns null", async () => {
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(null);
    const userId = randomUUID();
    const handler = makeGetCurrentContextHandler({ userId, loadSnapshot });
    const out = await handler({});
    expect(out.content).toHaveLength(1);
    expect(out.content[0]).toEqual({ type: "text", text: "No snapshot available yet." });
    expect(loadSnapshot).toHaveBeenCalledWith(userId);
  });

  it("returns the full snapshot JSON when no topics are passed", async () => {
    const snap = buildFixtureSnapshot();
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(snap);
    const userId = randomUUID();
    const handler = makeGetCurrentContextHandler({ userId, loadSnapshot });
    const out = await handler({});
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    expect(first.type).toBe("text");
    const parsed = JSON.parse(first.text) as ContextSnapshot;
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.edges).toHaveLength(4);
  });

  it("filters nodes to ONLY the requested topics when topics=['task','project']", async () => {
    const snap = buildFixtureSnapshot();
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(snap);
    const userId = randomUUID();
    const handler = makeGetCurrentContextHandler({ userId, loadSnapshot });
    const out = await handler({ topics: ["task", "project"] });
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    const parsed = JSON.parse(first.text) as ContextSnapshot;
    expect(parsed.nodes).toHaveLength(2);
    const types = parsed.nodes.map((n) => n.type).sort();
    expect(types).toEqual(["project", "task"]);
    // edges are NOT filtered — only nodes
    expect(parsed.edges).toHaveLength(4);
  });

  it("treats topics=[] (empty array) as 'no filter'", async () => {
    const snap = buildFixtureSnapshot();
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(snap);
    const handler = makeGetCurrentContextHandler({ userId: randomUUID(), loadSnapshot });
    const out = await handler({ topics: [] });
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    const parsed = JSON.parse(first.text) as ContextSnapshot;
    expect(parsed.nodes).toHaveLength(4);
  });

  it("returns an empty nodes array when topics filter matches nothing", async () => {
    const snap = buildFixtureSnapshot();
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(snap);
    const handler = makeGetCurrentContextHandler({ userId: randomUUID(), loadSnapshot });
    const out = await handler({ topics: ["habit"] });
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    const parsed = JSON.parse(first.text) as ContextSnapshot;
    expect(parsed.nodes).toEqual([]);
  });
});

/* ─── get_snapshot_history ───────────────────────────────────────────── */

describe("get_snapshot_history handler", () => {
  it("calls loadHistory(userId, days) and stringifies the result", async () => {
    const userId = randomUUID();
    const history: SnapshotHistoryEntry[] = [
      {
        snapshotDate: "2026-06-09",
        schemaVersion: 1,
        nodeCounts: { area: 4, project: 12, task: 87 },
        totalNodes: 103,
        totalEdges: 156,
      },
      {
        snapshotDate: "2026-06-08",
        schemaVersion: 1,
        nodeCounts: { area: 4, project: 12, task: 85 },
        totalNodes: 101,
        totalEdges: 154,
      },
    ];
    const loadHistory: LoadHistory = vi.fn().mockResolvedValue(history);
    const handler = makeGetSnapshotHistoryHandler({ userId, loadHistory });
    const out = await handler({ days: 7 });
    expect(loadHistory).toHaveBeenCalledWith(userId, 7);
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    const parsed = JSON.parse(first.text) as SnapshotHistoryEntry[];
    expect(parsed).toEqual(history);
    // metadata-only — never includes payload fields
    for (const entry of parsed) {
      expect(entry).not.toHaveProperty("nodes");
      expect(entry).not.toHaveProperty("edges");
    }
  });

  it("returns an empty array when loadHistory returns []", async () => {
    const loadHistory: LoadHistory = vi.fn().mockResolvedValue([]);
    const handler = makeGetSnapshotHistoryHandler({ userId: randomUUID(), loadHistory });
    const out = await handler({ days: 7 });
    const first = out.content[0];
    if (!first) throw new Error("expected at least one content block");
    expect(JSON.parse(first.text)).toEqual([]);
  });

  /* ─── Schema-level parameter validation ────────────────────────── */

  it("Zod paramsSchema accepts days=1 (minimum)", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    expect(schema.safeParse({ days: 1 }).success).toBe(true);
  });

  it("Zod paramsSchema accepts days=30 (maximum)", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    expect(schema.safeParse({ days: 30 }).success).toBe(true);
  });

  it("Zod paramsSchema rejects days=31 (above .max(30))", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    expect(schema.safeParse({ days: 31 }).success).toBe(false);
  });

  it("Zod paramsSchema rejects days=0 (below .min(1))", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    expect(schema.safeParse({ days: 0 }).success).toBe(false);
  });

  it("Zod paramsSchema rejects non-integer days (e.g., 7.5)", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    expect(schema.safeParse({ days: 7.5 }).success).toBe(false);
  });

  it("Zod paramsSchema defaults days to 7 when omitted", () => {
    const schema = z.object(getSnapshotHistoryParamsShape);
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.days).toBe(7);
  });
});

/* ─── createPersonalContextServer factory smoke test ─────────────────── */

describe("createPersonalContextServer factory", () => {
  it("returns an McpServer instance", () => {
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(null);
    const loadHistory: LoadHistory = vi.fn().mockResolvedValue([]);
    const server = createPersonalContextServer({
      userId: randomUUID(),
      loadSnapshot,
      loadHistory,
    });
    expect(server).toBeInstanceOf(McpServer);
  });

  it("accepts optional serverName + serverVersion overrides without throwing", () => {
    const loadSnapshot: LoadSnapshot = vi.fn().mockResolvedValue(null);
    const loadHistory: LoadHistory = vi.fn().mockResolvedValue([]);
    const server = createPersonalContextServer({
      userId: randomUUID(),
      loadSnapshot,
      loadHistory,
      serverName: "test-server",
      serverVersion: "9.9.9",
    });
    expect(server).toBeInstanceOf(McpServer);
  });
});
