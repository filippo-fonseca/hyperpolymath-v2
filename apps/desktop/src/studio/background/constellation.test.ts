import { describe, expect, it } from "vitest";

import {
  createConstellation,
  LINK_DISTANCE,
  NODE_COUNT,
  nearbyLinks,
  stepConstellation,
  type ConstellationNode,
} from "./constellation";

/** Deterministic RNG so seeding is reproducible in assertions. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("createConstellation", () => {
  it("seeds the requested node count within [0,1] bounds", () => {
    const nodes = createConstellation(seededRng(1));
    expect(nodes).toHaveLength(NODE_COUNT);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
    }
  });

  it("assigns some chromatic nodes and leaves the rest cyan (palette -1)", () => {
    const nodes = createConstellation(seededRng(7), 32, 6);
    const chromatic = nodes.filter((n) => n.palette >= 0);
    const cyan = nodes.filter((n) => n.palette === -1);
    expect(chromatic.length).toBeGreaterThan(0);
    expect(cyan.length).toBeGreaterThan(chromatic.length);
    for (const n of chromatic) expect(n.palette).toBeLessThan(6);
  });

  it("is deterministic for a fixed seed", () => {
    const a = createConstellation(seededRng(42));
    const b = createConstellation(seededRng(42));
    expect(a).toEqual(b);
  });
});

describe("stepConstellation", () => {
  it("keeps nodes inside [0,1] and reflects velocity at the borders", () => {
    const nodes: ConstellationNode[] = [
      { x: 0.99, y: 0.5, vx: 0.5, vy: 0, radius: 0.002, palette: -1 },
      { x: 0.01, y: 0.5, vx: -0.5, vy: 0, radius: 0.002, palette: -1 },
    ];
    stepConstellation(nodes, 1);
    expect(nodes[0]?.x).toBeLessThanOrEqual(1);
    expect(nodes[0]?.vx).toBeLessThan(0); // bounced off right edge
    expect(nodes[1]?.x).toBeGreaterThanOrEqual(0);
    expect(nodes[1]?.vx).toBeGreaterThan(0); // bounced off left edge
  });

  it("advances position by velocity * dt away from borders", () => {
    const nodes: ConstellationNode[] = [
      { x: 0.5, y: 0.5, vx: 0.1, vy: 0.2, radius: 0.002, palette: -1 },
    ];
    stepConstellation(nodes, 0.5);
    expect(nodes[0]?.x).toBeCloseTo(0.55, 5);
    expect(nodes[0]?.y).toBeCloseTo(0.6, 5);
  });
});

describe("nearbyLinks", () => {
  it("links only pairs closer than the threshold, with distance-faded strength", () => {
    const nodes: ConstellationNode[] = [
      { x: 0.5, y: 0.5, vx: 0, vy: 0, radius: 0.002, palette: -1 },
      { x: 0.5 + LINK_DISTANCE / 2, y: 0.5, vx: 0, vy: 0, radius: 0.002, palette: -1 },
      { x: 0.9, y: 0.9, vx: 0, vy: 0, radius: 0.002, palette: -1 },
    ];
    const links = nearbyLinks(nodes, 1);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 0, b: 1 });
    expect(links[0]?.strength).toBeCloseTo(0.5, 5);
  });

  it("returns no links when all nodes are far apart", () => {
    const nodes: ConstellationNode[] = [
      { x: 0.0, y: 0.0, vx: 0, vy: 0, radius: 0.002, palette: -1 },
      { x: 1.0, y: 1.0, vx: 0, vy: 0, radius: 0.002, palette: -1 },
    ];
    expect(nearbyLinks(nodes, 1)).toHaveLength(0);
  });
});
