/**
 * Constellation simulation — a tiny, dependency-free node-graph model driving the
 * ambient HUD background. Positions and velocities live in normalized [0,1] space
 * so the sim is resolution-independent; the canvas layer scales to device pixels.
 *
 * Kept pure and side-effect-free (no rAF, no canvas) so it unit-tests cleanly:
 * {@link createConstellation} seeds nodes deterministically from a caller-supplied
 * RNG, and {@link stepConstellation} advances them by a delta time, bouncing off
 * the [0,1] edges. Link discovery ({@link nearbyLinks}) is O(n^2) but n≈32, so a
 * frame is a few hundred cheap comparisons — negligible next to the voice/camera
 * loops it must never starve.
 */

/** Count of drifting nodes. Sparse by design: atmosphere, not content. */
export const NODE_COUNT = 32;

/** Max normalized distance at which two nodes are linked (link fades to this). */
export const LINK_DISTANCE = 0.16;

/** Per-second drift speed band, normalized units. Slow enough that 30fps reads smooth. */
const SPEED_MIN = 0.002;
const SPEED_MAX = 0.006;

/**
 * Fraction of nodes placed in the recessed variation tier (the rest sit front).
 *
 * These used to be the nodes that borrowed one of six NODE_PALETTE hues. Oracle
 * ruling O3 collapsed that palette to the single accent: the constellation is
 * atmosphere, not data encoding, so §21's chart exemption does not cover it and
 * §1's single-hue rule applies. The tier survives the collapse because it was
 * never really about colour — it is what keeps the mesh from reading flat — and
 * it now expresses itself through alpha. See ConstellationCanvas.
 */
export const CHROMATIC_FRACTION = 0.125;

export interface ConstellationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radius in normalized units (scaled to px at draw time). */
  radius: number;
  /**
   * Variation tier: >= 0 for a recessed node, -1 for a front one.
   *
   * Named `palette` because it used to index NODE_PALETTE, which ruling O3
   * retired (see CHROMATIC_FRACTION). The field keeps its name and range so the
   * sim's contract — and the tests pinning it — stay untouched by what is a
   * pure paint change; only the magnitude is now meaningless, since the drawer
   * reads `>= 0` and nothing else.
   */
  palette: number;
}

export interface ConstellationLink {
  a: number;
  b: number;
  /** 1 at zero distance, 0 at LINK_DISTANCE. Drives stroke alpha. */
  strength: number;
}

/** Deterministic RNG returning [0,1); pass Math.random in production, a seeded fn in tests. */
export type Rng = () => number;

export function createConstellation(
  rng: Rng = Math.random,
  count: number = NODE_COUNT,
  paletteSize = 6,
): ConstellationNode[] {
  const nodes: ConstellationNode[] = [];
  const chromatic = Math.round(count * CHROMATIC_FRACTION);
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const speed = SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN);
    nodes.push({
      x: rng(),
      y: rng(),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 0.0012 + rng() * 0.0018,
      palette: i < chromatic ? Math.floor(rng() * paletteSize) : -1,
    });
  }
  return nodes;
}

/** Advances every node by `dt` seconds, bouncing velocity off the [0,1] borders. */
export function stepConstellation(nodes: ConstellationNode[], dt: number): void {
  for (const node of nodes) {
    node.x += node.vx * dt;
    node.y += node.vy * dt;
    if (node.x <= 0) {
      node.x = 0;
      node.vx = Math.abs(node.vx);
    } else if (node.x >= 1) {
      node.x = 1;
      node.vx = -Math.abs(node.vx);
    }
    if (node.y <= 0) {
      node.y = 0;
      node.vy = Math.abs(node.vy);
    } else if (node.y >= 1) {
      node.y = 1;
      node.vy = -Math.abs(node.vy);
    }
  }
}

/**
 * Returns links between node pairs closer than {@link LINK_DISTANCE}, with a
 * `strength` fading linearly to zero at that threshold. Distance is measured in
 * an aspect-corrected space so links don't stretch on wide viewports.
 */
export function nearbyLinks(
  nodes: ConstellationNode[],
  aspect = 1,
  threshold: number = LINK_DISTANCE,
): ConstellationLink[] {
  const links: ConstellationLink[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      if (!b) continue;
      const dx = (a.x - b.x) * aspect;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < threshold) {
        links.push({ a: i, b: j, strength: 1 - dist / threshold });
      }
    }
  }
  return links;
}
