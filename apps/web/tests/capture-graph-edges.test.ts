import {
  type CaptureGraphEdge,
  type CaptureGraphEdgeKind,
  DEFAULT_VISIBLE_EDGE_KINDS,
  GRAPH_NODE_LABEL_MAX,
  MAX_EDGES_PER_KIND,
  MAX_EDGES_TOTAL,
  type RawCoReferencePair,
  type RawPair,
  assembleCaptureEdges,
  buildCaptureNodes,
} from "@/lib/captures/graph-edges";
import { describe, expect, it } from "vitest";

const NODE_IDS = new Set(["a", "b", "c", "d"]);

function assemble(
  overrides: Partial<{
    nodeIds: Set<string>;
    sharedHashtagPairs: RawPair[];
    directReferencePairs: RawPair[];
    coReferencePairs: RawCoReferencePair[];
    sharedProjectPairs: RawPair[];
    targetLabels: Map<string, string>;
  }> = {}
) {
  return assembleCaptureEdges({
    nodeIds: NODE_IDS,
    sharedHashtagPairs: [],
    directReferencePairs: [],
    coReferencePairs: [],
    sharedProjectPairs: [],
    targetLabels: new Map(),
    ...overrides,
  });
}

function find(
  edges: CaptureGraphEdge[],
  kind: CaptureGraphEdgeKind,
  a: string,
  b: string
): CaptureGraphEdge | undefined {
  return edges.find(
    (e) =>
      e.kind === kind && ((e.source === a && e.target === b) || (e.source === b && e.target === a))
  );
}

describe("buildCaptureNodes", () => {
  const createdAt = new Date("2026-07-16T12:00:00.000Z");

  it("labels a node with its first non-empty content line", () => {
    const [node] = buildCaptureNodes(
      [{ id: "a", content: "\n\n  Ship the graph view  \nsecond line", createdAt }],
      [],
      []
    );
    expect(node.label).toBe("Ship the graph view");
  });

  it("truncates long labels to the 60-char canvas budget", () => {
    const [node] = buildCaptureNodes([{ id: "a", content: "x".repeat(200), createdAt }], [], []);
    expect(node.label.length).toBe(GRAPH_NODE_LABEL_MAX);
    expect(node.label.endsWith("…")).toBe(true);
  });

  it("gives an empty capture a placeholder rather than a blank node", () => {
    const [node] = buildCaptureNodes([{ id: "a", content: "   \n\n", createdAt }], [], []);
    expect(node.label).toBe("(empty capture)");
  });

  it("folds hashtag and project join rows onto their capture, de-duped", () => {
    const nodes = buildCaptureNodes(
      [
        { id: "a", content: "first", createdAt },
        { id: "b", content: "second", createdAt },
      ],
      [
        { captureId: "a", value: "research" },
        { captureId: "a", value: "research" },
        { captureId: "a", value: "yale" },
        { captureId: "b", value: "yale" },
      ],
      [{ captureId: "a", value: "proj-1" }]
    );
    expect(nodes[0].hashtags).toEqual(["research", "yale"]);
    expect(nodes[0].projectIds).toEqual(["proj-1"]);
    expect(nodes[1].hashtags).toEqual(["yale"]);
    expect(nodes[1].projectIds).toEqual([]);
  });

  it("ignores join rows for captures outside the window", () => {
    const nodes = buildCaptureNodes(
      [{ id: "a", content: "kept", createdAt }],
      [{ captureId: "outside-window", value: "research" }],
      [{ captureId: "outside-window", value: "proj-1" }]
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].hashtags).toEqual([]);
  });

  it("serializes createdAt to ISO and passes ISO strings through", () => {
    const nodes = buildCaptureNodes(
      [
        { id: "a", content: "date", createdAt },
        { id: "b", content: "string", createdAt: "2026-07-16T12:00:00.000Z" },
      ],
      [],
      []
    );
    expect(nodes[0].createdAt).toBe("2026-07-16T12:00:00.000Z");
    expect(nodes[1].createdAt).toBe("2026-07-16T12:00:00.000Z");
  });
});

describe("assembleCaptureEdges — normalization", () => {
  it("orients every pair so source < target", () => {
    const { edges } = assemble({ sharedHashtagPairs: [{ a: "d", b: "a", weight: 2 }] });
    expect(edges[0]).toMatchObject({ source: "a", target: "d", weight: 2 });
  });

  it("collapses the same undirected pair emitted from both ends", () => {
    const { edges } = assemble({
      directReferencePairs: [
        { a: "a", b: "b", weight: 1 },
        { a: "b", b: "a", weight: 1 },
      ],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(2);
  });

  it("drops self-loops", () => {
    const { edges } = assemble({ sharedHashtagPairs: [{ a: "a", b: "a", weight: 5 }] });
    expect(edges).toEqual([]);
  });

  it("drops pairs whose endpoint fell outside the node window", () => {
    const { edges } = assemble({
      sharedHashtagPairs: [
        { a: "a", b: "b", weight: 1 },
        { a: "a", b: "not-in-window", weight: 9 },
      ],
    });
    expect(edges).toHaveLength(1);
    expect(find(edges, "shared_hashtag", "a", "b")).toBeDefined();
  });

  it("keeps each kind as its own edge between the same pair", () => {
    const { edges } = assemble({
      sharedHashtagPairs: [{ a: "a", b: "b", weight: 2 }],
      directReferencePairs: [{ a: "a", b: "b", weight: 1 }],
    });
    expect(edges).toHaveLength(2);
    expect(find(edges, "shared_hashtag", "a", "b")?.weight).toBe(2);
    expect(find(edges, "direct_reference", "a", "b")?.weight).toBe(1);
  });

  it("floors a non-positive or non-finite weight at 1", () => {
    const { edges } = assemble({
      sharedHashtagPairs: [{ a: "a", b: "b", weight: 0 }],
      sharedProjectPairs: [{ a: "c", b: "d", weight: Number.NaN }],
    });
    expect(find(edges, "shared_hashtag", "a", "b")?.weight).toBe(1);
    expect(find(edges, "shared_project", "c", "d")?.weight).toBe(1);
  });
});

describe("assembleCaptureEdges — co_reference labelling", () => {
  it("labels the edge with the shared target's display name", () => {
    const { edges } = assemble({
      coReferencePairs: [{ a: "a", b: "b", weight: 1, targetType: "project", targetId: "p1" }],
      targetLabels: new Map([["project:p1", "Marathon training"]]),
    });
    expect(edges[0].label).toBe("Marathon training");
  });

  it("keys labels by type as well as id, so ids colliding across types stay distinct", () => {
    const { edges } = assemble({
      coReferencePairs: [
        { a: "a", b: "b", weight: 1, targetType: "person", targetId: "shared-id" },
        { a: "c", b: "d", weight: 1, targetType: "area", targetId: "shared-id" },
      ],
      targetLabels: new Map([
        ["person:shared-id", "Ada"],
        ["area:shared-id", "Health"],
      ]),
    });
    expect(find(edges, "co_reference", "a", "b")?.label).toBe("Ada");
    expect(find(edges, "co_reference", "c", "d")?.label).toBe("Health");
  });

  it("sums weight across several shared targets and keeps the first label", () => {
    const { edges } = assemble({
      coReferencePairs: [
        { a: "a", b: "b", weight: 1, targetType: "project", targetId: "p1" },
        { a: "a", b: "b", weight: 1, targetType: "task", targetId: "t1" },
      ],
      targetLabels: new Map([
        ["project:p1", "Marathon training"],
        ["task:t1", "Book the flight"],
      ]),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(2);
    expect(edges[0].label).toBe("Marathon training");
  });

  it("omits the label when the target could not be resolved (deleted target)", () => {
    const { edges } = assemble({
      coReferencePairs: [{ a: "a", b: "b", weight: 1, targetType: "task", targetId: "gone" }],
    });
    expect(edges[0].label).toBeUndefined();
  });
});

describe("assembleCaptureEdges — caps", () => {
  function hubPairs(count: number): RawPair[] {
    return Array.from({ length: count }, (_, i) => ({
      a: `n${i}`,
      b: "hub",
      weight: (i % 5) + 1,
    }));
  }

  it("caps a kind heaviest-first and reports what it dropped", () => {
    const count = MAX_EDGES_PER_KIND + 40;
    const ids = new Set(["hub", ...Array.from({ length: count }, (_, i) => `n${i}`)]);
    const { edges, droppedEdges } = assemble({
      nodeIds: ids,
      sharedHashtagPairs: hubPairs(count),
    });
    expect(edges).toHaveLength(MAX_EDGES_PER_KIND);
    expect(droppedEdges.shared_hashtag).toBe(40);
    // Heaviest-first: nothing lighter than the lightest kept edge survived.
    const weights = edges.map((e) => e.weight);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(1);
    expect(weights[0]).toBe(5);
  });

  it("caps each kind independently so a hub layer cannot starve the others", () => {
    const count = MAX_EDGES_PER_KIND + 10;
    const ids = new Set(["hub", "a", "b", ...Array.from({ length: count }, (_, i) => `n${i}`)]);
    const { edges, droppedEdges } = assemble({
      nodeIds: ids,
      sharedHashtagPairs: hubPairs(count),
      directReferencePairs: [{ a: "a", b: "b", weight: 1 }],
    });
    expect(droppedEdges.shared_hashtag).toBe(10);
    expect(droppedEdges.direct_reference).toBeUndefined();
    expect(find(edges, "direct_reference", "a", "b")).toBeDefined();
  });

  it("applies the total cap after the per-kind cut", () => {
    const perKind = MAX_EDGES_PER_KIND;
    const ids = new Set([
      "hub",
      ...Array.from({ length: perKind }, (_, i) => `n${i}`),
      ...Array.from({ length: perKind }, (_, i) => `m${i}`),
      ...Array.from({ length: perKind }, (_, i) => `o${i}`),
    ]);
    const mk = (prefix: string): RawPair[] =>
      Array.from({ length: perKind }, (_, i) => ({ a: `${prefix}${i}`, b: "hub", weight: 1 }));
    const { edges, droppedEdges } = assemble({
      nodeIds: ids,
      sharedHashtagPairs: mk("n"),
      directReferencePairs: mk("m"),
      sharedProjectPairs: mk("o"),
    });
    expect(edges).toHaveLength(MAX_EDGES_TOTAL);
    const totalDropped = Object.values(droppedEdges).reduce((s, n) => s + (n ?? 0), 0);
    expect(totalDropped).toBe(perKind * 3 - MAX_EDGES_TOTAL);
  });

  it("reports no drops and returns nothing for an empty graph", () => {
    const { edges, droppedEdges } = assemble();
    expect(edges).toEqual([]);
    expect(droppedEdges).toEqual({});
  });

  it("is deterministic across runs for tied weights", () => {
    const pairs: RawPair[] = [
      { a: "c", b: "d", weight: 1 },
      { a: "a", b: "b", weight: 1 },
    ];
    const first = assemble({ sharedHashtagPairs: pairs }).edges;
    const second = assemble({ sharedHashtagPairs: [...pairs].reverse() }).edges;
    expect(first.map((e) => `${e.source}-${e.target}`)).toEqual(
      second.map((e) => `${e.source}-${e.target}`)
    );
  });
});

describe("default layers", () => {
  it("matches the sealed S10 defaults — shared_project stays opt-in", () => {
    expect([...DEFAULT_VISIBLE_EDGE_KINDS]).toEqual([
      "shared_hashtag",
      "direct_reference",
      "co_reference",
    ]);
  });
});
