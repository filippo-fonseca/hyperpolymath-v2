import { describe, it, expect } from "vitest";
import {
  resolveActionDestination,
  NOOP_TOOLS,
  type ChoreographyTarget,
} from "../useJarvisChoreography";
import { solveTreeLayout, type TreeLayoutResult } from "../../data/treeLayout";
import { mkArea, mkProject } from "../../data/__tests__/_fixtures";
import type { JarvisActionEvent } from "@/components/jarvis/jarvis-stream-client";

// ── Fixtures ──────────────────────────────────────────────────────────────────
// One area (area1) with one live project (proj1) → a lantern in layout.byProject.
const LAYOUT: TreeLayoutResult = solveTreeLayout([
  mkArea({ id: "area1", orderIndex: 0, projects: [mkProject({ id: "proj1" })] }),
]);

function ev(
  name: string,
  result: Partial<JarvisActionEvent["result"]> = {},
): JarvisActionEvent {
  return { toolUseId: "tu-1", name, result: { ok: true, ...result } };
}

function resolve(
  name: string,
  result: Partial<JarvisActionEvent["result"]> = {},
): ChoreographyTarget | null {
  return resolveActionDestination(ev(name, result), LAYOUT);
}

describe("resolveActionDestination — the per-tool truth table (§3)", () => {
  it("create_task with a valid project → lantern at that project", () => {
    const t = resolve("create_task", {
      id: "t1",
      receipt: { id: "t1", project_ids: ["proj1"], inbox: false },
    });
    expect(t).not.toBeNull();
    expect(t?.kind).toBe("lantern");
    if (t && t.kind === "lantern") {
      expect(t.areaId).toBe("area1");
      expect(t.projectId).toBe("proj1");
      expect(t.point).toEqual(LAYOUT.byProject.get("proj1")!.position);
    }
  });

  it("create_task inbox (empty project_ids) → null (trunk slot needs the wait window)", () => {
    expect(
      resolve("create_task", {
        id: "t2",
        receipt: { id: "t2", project_ids: [], inbox: true },
      }),
    ).toBeNull();
  });

  it("create_task with an archived / unknown project → null (vanished lantern)", () => {
    expect(
      resolve("create_task", {
        id: "t3",
        receipt: { id: "t3", project_ids: ["ghost"], inbox: false },
      }),
    ).toBeNull();
  });

  it("create_capture filed to a project → lantern", () => {
    const t = resolve("create_capture", {
      id: "c1",
      receipt: { id: "c1", project_ids: ["proj1"] },
    });
    expect(t?.kind).toBe("lantern");
    if (t?.kind === "lantern") expect(t.projectId).toBe("proj1");
  });

  it("create_capture unfiled (empty project_ids) → swarm at the spawn point", () => {
    const t = resolve("create_capture", {
      id: "c2",
      receipt: { id: "c2", project_ids: [] },
    });
    expect(t?.kind).toBe("swarm");
    if (t?.kind === "swarm") {
      expect(t.point).toHaveLength(3);
      expect(t.point.every((n) => Number.isFinite(n))).toBe(true);
    }
  });

  it("create_capture unfiled is deterministic in its spawn point", () => {
    const a = resolve("create_capture", { id: "same", receipt: { id: "same" } });
    const b = resolve("create_capture", { id: "same", receipt: { id: "same" } });
    expect(a?.kind).toBe("swarm");
    if (a?.kind === "swarm" && b?.kind === "swarm") {
      expect(a.point).toEqual(b.point);
    }
  });

  it("create_capture with no id and no project → null (nothing to spawn on)", () => {
    expect(resolve("create_capture", { receipt: {} })).toBeNull();
    expect(resolve("create_capture", {})).toBeNull();
  });

  it("update_task → null from the pure resolver (choreographer owns it)", () => {
    expect(
      resolve("update_task", {
        id: "t9",
        receipt: { id: "t9", after: { status: "not started" } },
      }),
    ).toBeNull();
  });

  it("deletions → null (deletion is the reconcile spring-out, not a routing)", () => {
    expect(resolve("delete_task", { id: "t1" })).toBeNull();
    expect(resolve("delete_capture", { id: "c1" })).toBeNull();
  });

  it("calendar tools → null in MVP (the Meridian Ring is Phase 2)", () => {
    expect(resolve("create_event", { id: "e1" })).toBeNull();
    expect(resolve("update_event", { id: "e1" })).toBeNull();
    expect(resolve("delete_event", { id: "e1" })).toBeNull();
  });

  it("memory / people tools → null (no spatial home in the Tree)", () => {
    expect(resolve("remember_fact", { id: "f1" })).toBeNull();
    expect(resolve("forget_fact", { id: "f1" })).toBeNull();
    expect(resolve("create_person", { id: "p1" })).toBeNull();
    expect(resolve("link_people", { id: "p1" })).toBeNull();
  });

  it("NOOP_TOOLS (find_* + ask_clarification) → null before touching the receipt", () => {
    for (const name of [
      "find_tasks",
      "find_captures",
      "find_events",
      "find_people",
      "ask_clarification",
    ]) {
      // Even with a linkable receipt present, these must no-op.
      expect(resolve(name, { id: "x", receipt: { project_ids: ["proj1"] } })).toBeNull();
      expect(NOOP_TOOLS.has(name)).toBe(true);
    }
  });
});

describe("resolveActionDestination — malformed receipt extraction (§2.2)", () => {
  it("missing receipt → treated as empty project_ids", () => {
    // create_task → inbox → null; create_capture (with id) → swarm.
    expect(resolve("create_task", { id: "t1" })).toBeNull();
    expect(resolve("create_capture", { id: "c1" })?.kind).toBe("swarm");
  });

  it("non-array project_ids → treated as empty", () => {
    expect(
      resolve("create_task", {
        id: "t1",
        receipt: { project_ids: "proj1" } as unknown as Record<string, unknown>,
      }),
    ).toBeNull();
    expect(
      resolve("create_task", {
        id: "t1",
        receipt: { project_ids: { 0: "proj1" } } as unknown as Record<string, unknown>,
      }),
    ).toBeNull();
  });

  it("non-string entries are filtered out; the first valid string id wins", () => {
    const t = resolve("create_task", {
      id: "t1",
      receipt: {
        project_ids: [123, "proj1"] as unknown as string[],
      } as Record<string, unknown>,
    });
    expect(t?.kind).toBe("lantern");
    if (t?.kind === "lantern") expect(t.projectId).toBe("proj1");
  });

  it("array of only non-strings → empty → create_task inbox → null", () => {
    expect(
      resolve("create_task", {
        id: "t1",
        receipt: { project_ids: [123, null] as unknown as string[] } as Record<
          string,
          unknown
        >,
      }),
    ).toBeNull();
  });
});
