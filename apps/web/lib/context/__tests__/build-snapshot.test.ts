/**
 * buildSnapshot — contract test.
 *
 * We mock each per-node loader directly rather than stubbing Drizzle's
 * chainable query API. The loaders themselves are intentionally thin
 * around Drizzle (Task 2 grep verifies the WHERE no_export = false filter);
 * here we verify the orchestration contract:
 *   - Result<T> envelope (never throws)
 *   - Promise.all over the 7 loaders
 *   - aggregate meta (totalNodes, totalEdges, nodeCounts, excludedNoExportCount)
 *   - ContextSnapshotSchema parse (belt-and-suspenders) before returning
 *   - no_export rows excluded from nodes AND counted in meta.excludedNoExportCount
 *
 * We also assert the deriveEdges hand-off shape directly (a unit test of
 * deriveEdges below) so the orchestration test stays focused.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveEdges } from "../edges";
import type { Node } from "../types";

// Mock all loaders BEFORE importing buildSnapshot.
vi.mock("../nodes/areas", () => ({ loadAreas: vi.fn() }));
vi.mock("../nodes/projects", () => ({ loadProjects: vi.fn() }));
vi.mock("../nodes/tasks", () => ({ loadTasks: vi.fn() }));
vi.mock("../nodes/captures", () => ({ loadCaptures: vi.fn() }));
vi.mock("../nodes/training", () => ({ loadTraining: vi.fn() }));
vi.mock("../nodes/habits", () => ({ loadHabits: vi.fn() }));
vi.mock("../nodes/jarvis-facts", () => ({ loadJarvisFacts: vi.fn() }));
vi.mock("../nodes/journal", () => ({ loadJournalEntries: vi.fn() }));
// Phase 29 made loadPages call getFoldersWithProjects(userId), which issues
// folder + folder_projects selects the empty `db` mock cannot serve. Mock the
// pages loader like the others so the orchestration contract stays the focus.
vi.mock("../nodes/pages", () => ({ loadPages: vi.fn() }));
// loadPeople + loadPeopleReferences read people / people_references; mock both so
// the orchestration contract (not Drizzle) stays the focus.
vi.mock("../nodes/people", () => ({ loadPeople: vi.fn(), loadPeopleReferences: vi.fn() }));

// Also stub the @/lib/db module so importing build-snapshot doesn't touch postgres.
vi.mock("@/lib/db", () => ({ db: {} }));

import { buildSnapshot, CURRENT_SCHEMA_VERSION } from "../build-snapshot";
import { loadAreas } from "../nodes/areas";
import { loadProjects } from "../nodes/projects";
import { loadTasks } from "../nodes/tasks";
import { loadCaptures } from "../nodes/captures";
import { loadTraining } from "../nodes/training";
import { loadHabits } from "../nodes/habits";
import { loadJarvisFacts } from "../nodes/jarvis-facts";
import { loadPages } from "../nodes/pages";
import { loadJournalEntries } from "../nodes/journal";
import { loadPeople, loadPeopleReferences } from "../nodes/people";

// Zod 4's `z.string().uuid()` enforces v1–v8 format (or the all-zero / all-ff
// sentinels). Pad-counted IDs like 00000000-…-0010 fail format because the
// version nibble must be 1–8 and the variant nibble must be 8/9/a/b. We use
// crypto.randomUUID() (v4) so every fixture passes validation.
const USER_ID = crypto.randomUUID();

function uuid(_n?: number): string {
  return crypto.randomUUID();
}

function setAllLoadersEmpty() {
  const empty = { nodes: [], excluded: 0 };
  vi.mocked(loadAreas).mockResolvedValue(empty);
  vi.mocked(loadProjects).mockResolvedValue(empty);
  vi.mocked(loadTasks).mockResolvedValue(empty);
  vi.mocked(loadCaptures).mockResolvedValue(empty);
  vi.mocked(loadTraining).mockResolvedValue(empty);
  vi.mocked(loadHabits).mockResolvedValue(empty);
  vi.mocked(loadJarvisFacts).mockResolvedValue(empty);
  vi.mocked(loadJournalEntries).mockResolvedValue(empty);
  vi.mocked(loadPages).mockResolvedValue(empty);
  vi.mocked(loadPeople).mockResolvedValue(empty);
  vi.mocked(loadPeopleReferences).mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("buildSnapshot — empty user", () => {
  it("returns ok with empty arrays + zero meta", async () => {
    setAllLoadersEmpty();
    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.data.nodes).toEqual([]);
    expect(result.data.edges).toEqual([]);
    expect(result.data.meta.totalNodes).toBe(0);
    expect(result.data.meta.totalEdges).toBe(0);
    expect(result.data.meta.excludedNoExportCount).toBe(0);
    expect(Object.keys(result.data.meta.nodeCounts)).toEqual([]);
    expect(typeof result.data.generatedAt).toBe("string");
  });

  it("calls each loader exactly once with the userId (Promise.all)", async () => {
    setAllLoadersEmpty();
    await buildSnapshot(USER_ID);
    expect(loadAreas).toHaveBeenCalledTimes(1);
    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(loadTasks).toHaveBeenCalledTimes(1);
    expect(loadCaptures).toHaveBeenCalledTimes(1);
    expect(loadTraining).toHaveBeenCalledTimes(1);
    expect(loadHabits).toHaveBeenCalledTimes(1);
    expect(loadJarvisFacts).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadAreas).mock.calls[0][0]).toBe(USER_ID);
  });
});

describe("buildSnapshot — no_export rows", () => {
  it("counts loader-reported excluded rows in meta.excludedNoExportCount", async () => {
    const empty = { nodes: [] as Node[], excluded: 0 };
    vi.mocked(loadAreas).mockResolvedValue(empty);
    vi.mocked(loadProjects).mockResolvedValue(empty);
    vi.mocked(loadTraining).mockResolvedValue(empty);
    vi.mocked(loadHabits).mockResolvedValue(empty);
    vi.mocked(loadTasks).mockResolvedValue({ nodes: [], excluded: 2 });
    vi.mocked(loadCaptures).mockResolvedValue({ nodes: [], excluded: 1 });
    vi.mocked(loadJarvisFacts).mockResolvedValue({ nodes: [], excluded: 3 });
    vi.mocked(loadJournalEntries).mockResolvedValue(empty);
    vi.mocked(loadPages).mockResolvedValue(empty);
    vi.mocked(loadPeople).mockResolvedValue(empty);
    vi.mocked(loadPeopleReferences).mockResolvedValue([]);

    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // People are never export-excluded (no no_export column), so the count is
    // unchanged by the people loader.
    expect(result.data.meta.excludedNoExportCount).toBe(6); // 2 + 1 + 3
  });

  it("private rows are absent from snapshot.nodes (loader filtered them; builder counts only)", async () => {
    // Simulate: 1 public capture in snapshot, 1 private capture filtered by loader.
    const visibleCaptureId = uuid();
    const empty = { nodes: [] as Node[], excluded: 0 };
    vi.mocked(loadAreas).mockResolvedValue(empty);
    vi.mocked(loadProjects).mockResolvedValue(empty);
    vi.mocked(loadTasks).mockResolvedValue(empty);
    vi.mocked(loadTraining).mockResolvedValue(empty);
    vi.mocked(loadHabits).mockResolvedValue(empty);
    vi.mocked(loadJarvisFacts).mockResolvedValue(empty);
    vi.mocked(loadJournalEntries).mockResolvedValue(empty);
    vi.mocked(loadPages).mockResolvedValue(empty);
    vi.mocked(loadPeople).mockResolvedValue(empty);
    vi.mocked(loadPeopleReferences).mockResolvedValue([]);
    vi.mocked(loadCaptures).mockResolvedValue({
      nodes: [
        {
          type: "capture",
          id: visibleCaptureId,
          text: "public capture",
          createdAt: "2026-06-09T00:00:00.000Z",
          tags: [],
          projectIds: [],
        },
      ],
      excluded: 1, // one no_export=true row filtered at the loader
    });

    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const captureNodes = result.data.nodes.filter((n) => n.type === "capture");
    expect(captureNodes).toHaveLength(1);
    expect(captureNodes[0].id).toBe(visibleCaptureId);
    expect(result.data.meta.excludedNoExportCount).toBe(1);
  });
});

describe("buildSnapshot — node assembly + edges", () => {
  it("aggregates nodeCounts per type and derives edges from junction data", async () => {
    const areaId = uuid();
    const projectId = uuid();
    const taskId = uuid();
    const captureId = uuid();

    vi.mocked(loadAreas).mockResolvedValue({
      nodes: [
        { type: "area", id: areaId, name: "Health", emoji: null, orderIndex: 0 },
      ],
      excluded: 0,
    });
    vi.mocked(loadProjects).mockResolvedValue({
      nodes: [
        {
          type: "project",
          id: projectId,
          areaId,
          name: "Marathon training",
          isClass: false,
          archived: false,
          startDate: null,
          endDate: null,
        },
      ],
      excluded: 0,
    });
    vi.mocked(loadTasks).mockResolvedValue({
      nodes: [
        {
          type: "task",
          id: taskId,
          title: "Long run Sunday",
          priority: "P2",
          status: "not started",
          dueDate: null,
          projectIds: [projectId],
          tags: [],
        },
      ],
      excluded: 0,
    });
    vi.mocked(loadCaptures).mockResolvedValue({
      nodes: [
        {
          type: "capture",
          id: captureId,
          text: "felt strong on the long run",
          createdAt: "2026-06-09T00:00:00.000Z",
          tags: ["running"],
          projectIds: [projectId],
        },
      ],
      excluded: 0,
    });
    vi.mocked(loadTraining).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadHabits).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadJarvisFacts).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadJournalEntries).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadPages).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadPeople).mockResolvedValue({ nodes: [], excluded: 0 });
    vi.mocked(loadPeopleReferences).mockResolvedValue([]);

    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.meta.totalNodes).toBe(4);
    expect(result.data.meta.nodeCounts).toEqual({
      area: 1,
      project: 1,
      task: 1,
      capture: 1,
    });

    const edges = result.data.edges;
    expect(edges).toContainEqual({ type: "project_in_area", from: projectId, to: areaId });
    expect(edges).toContainEqual({ type: "task_in_project", from: taskId, to: projectId });
    expect(edges).toContainEqual({
      type: "capture_in_project",
      from: captureId,
      to: projectId,
    });
    expect(edges).toContainEqual({ type: "capture_tagged", from: captureId, tag: "running" });
    expect(result.data.meta.totalEdges).toBe(4);
  });
});

describe("buildSnapshot — people + mentions_person", () => {
  it("includes person nodes and emits mentions_person edges from loaded references", async () => {
    const taskId = uuid();
    const personId = uuid();
    const empty = { nodes: [] as Node[], excluded: 0 };
    vi.mocked(loadAreas).mockResolvedValue(empty);
    vi.mocked(loadProjects).mockResolvedValue(empty);
    vi.mocked(loadCaptures).mockResolvedValue(empty);
    vi.mocked(loadTraining).mockResolvedValue(empty);
    vi.mocked(loadHabits).mockResolvedValue(empty);
    vi.mocked(loadJarvisFacts).mockResolvedValue(empty);
    vi.mocked(loadJournalEntries).mockResolvedValue(empty);
    vi.mocked(loadPages).mockResolvedValue(empty);
    vi.mocked(loadTasks).mockResolvedValue({
      nodes: [
        {
          type: "task",
          id: taskId,
          title: "coffee with Ada",
          priority: "P3",
          status: "not started",
          dueDate: null,
          projectIds: [],
          tags: [],
        },
      ],
      excluded: 0,
    });
    vi.mocked(loadPeople).mockResolvedValue({
      nodes: [
        {
          type: "person",
          id: personId,
          name: "Ada Lovelace",
          email: null,
          phone: null,
          bio: null,
          tags: ["friend"],
          createdAt: "2026-06-09T00:00:00.000Z",
          updatedAt: "2026-06-09T00:00:00.000Z",
        },
      ],
      excluded: 0,
    });
    // One resolvable reference (task -> person) plus one dangling reference whose
    // person is not in the loaded set; only the resolvable one becomes an edge.
    vi.mocked(loadPeopleReferences).mockResolvedValue([
      { fromType: "task", fromId: taskId, personId },
      { fromType: "task", fromId: taskId, personId: uuid() },
    ]);

    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const personNodes = result.data.nodes.filter((n) => n.type === "person");
    expect(personNodes).toHaveLength(1);
    expect(personNodes[0].id).toBe(personId);
    expect(result.data.meta.nodeCounts.person).toBe(1);

    const mentionEdges = result.data.edges.filter((e) => e.type === "mentions_person");
    expect(mentionEdges).toHaveLength(1);
    expect(mentionEdges[0]).toEqual({
      type: "mentions_person",
      from: taskId,
      to: personId,
      fromType: "task",
    });
  });
});

describe("buildSnapshot — error path", () => {
  it("returns err Result when a loader throws (never throws itself)", async () => {
    setAllLoadersEmpty();
    vi.mocked(loadTasks).mockRejectedValueOnce(new Error("DB conn dropped"));

    const result = await buildSnapshot(USER_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/DB conn dropped/);
  });
});

describe("deriveEdges — pure derivation", () => {
  it("drops project→area edges when area is not in the loaded set (defensive)", () => {
    const danglingAreaId = uuid();
    const projectId = uuid();
    const edges = deriveEdges({
      areaIds: new Set<string>(), // empty: the area was archived between project loader + edges
      projects: [
        {
          type: "project",
          id: projectId,
          areaId: danglingAreaId,
          name: "P",
          isClass: false,
          archived: false,
          startDate: null,
          endDate: null,
        },
      ],
      tasks: [],
      captures: [],
      pages: [],
      facts: [],
    });
    expect(edges).toEqual([]);
  });

  it("drops mentions_person edges to unloaded people or unloaded from-entities (defensive)", () => {
    const taskId = uuid();
    const personId = uuid();
    const danglingPersonId = uuid();
    const danglingTaskId = uuid();
    const edges = deriveEdges({
      areaIds: new Set(),
      projects: [],
      tasks: [
        {
          type: "task",
          id: taskId,
          title: "t",
          priority: "P3",
          status: "not started",
          dueDate: null,
          projectIds: [],
          tags: [],
        },
      ],
      captures: [],
      pages: [],
      facts: [],
      people: [
        {
          type: "person",
          id: personId,
          name: "Loaded Person",
          email: null,
          phone: null,
          bio: null,
          tags: [],
          createdAt: "2026-06-09T00:00:00.000Z",
          updatedAt: "2026-06-09T00:00:00.000Z",
        },
      ],
      references: [
        { fromType: "task", fromId: taskId, personId }, // both loaded -> emit
        { fromType: "task", fromId: taskId, personId: danglingPersonId }, // person gone
        { fromType: "task", fromId: danglingTaskId, personId }, // from-entity gone
        { fromType: "event", fromId: taskId, personId }, // event ids never loaded
      ],
    });
    const mentions = edges.filter((e) => e.type === "mentions_person");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toEqual({
      type: "mentions_person",
      from: taskId,
      to: personId,
      fromType: "task",
    });
  });

  it("emits fact_about edges only when both entityType and entityId are present", () => {
    const bareFactId = uuid();
    const wiredFactId = uuid();
    const projectId = uuid();
    const edges = deriveEdges({
      areaIds: new Set(),
      projects: [],
      tasks: [],
      captures: [],
      pages: [],
      facts: [
        { id: bareFactId }, // bare — no entity ref, should NOT emit
        { id: wiredFactId, aboutEntityType: "project", aboutEntityId: projectId },
      ],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      type: "fact_about",
      from: wiredFactId,
      entityType: "project",
      entityId: projectId,
    });
  });
});
