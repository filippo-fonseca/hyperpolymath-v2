/**
 * treeLayout.ts — U-04 · The Studiolo · data-bridge
 *
 * Pure, deterministic layout solver for the 3D tree. Given the sidebar's
 * `SidebarArea[]` it produces boughs (per active area), lanterns (per active
 * project) hung along a canonical Bézier limb curve, and ember-slot helpers
 * (Fibonacci shell around a lantern; helix on the trunk shell).
 *
 * DETERMINISM GUARANTEE: `solveTreeLayout(areas)` is a pure function — same
 * input array ⇒ deep-equal output, byte for byte. The ONLY randomness source is
 * `hash01`, a djb2 hash of stable string ids. No `Math.random`, no `Date.now`,
 * no iteration-order dependence. There are ZERO runtime imports from `three`
 * (only `import type { Vector3Tuple }`).
 *
 * U-06 builds the visible bough TubeGeometry by fitting a CatmullRom curve
 * THROUGH points sampled from `boughPoint`, so lanterns and the limb mesh share
 * exactly the same math (the seam stays exact).
 */
import type { Vector3Tuple } from "three";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { EmberState } from "./mappings";

// ── Frozen module constants (§2.1) — exported for tests ────────────────────
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399963 rad
export const AZIMUTH_OFFSET = Math.PI / 2; // bough 0 faces the vestibule camera (+z)
export const TRUNK_RADIUS = 0.35; // limb roots start on the trunk surface
export const BOUGH_ROOT_Y = 1.7; // base height of limb roots
export const BOUGH_LEN_MIN = 3.5;
export const BOUGH_LEN_MAX = 5.0; // meters (PLAN §6)
export const BOUGH_ELEV_MIN = 20; // degrees off horizontal — heavy areas sit flatter
export const BOUGH_ELEV_MAX = 35; // degrees off horizontal — light areas lift steeper
export const BOUGH_SAG = 0.15; // fraction of length, downward control-point droop
export const LANTERN_T_MIN = 0.4;
export const LANTERN_T_MAX = 0.98; // outer 60% of the curve
export const LANTERN_HANG = 0.18; // lanterns hang below the limb
export const EMBER_SHELL_RADIUS = 0.35; // Fibonacci shell around a lantern (PLAN §6)
export const TRUNK_SHELL_RADIUS = 0.6; // unprojected-task cluster
export const TRUNK_SHELL_Y = 1.2; // its base height (PLAN §6)

// ── Deterministic jitter — `hash01` (§2.2) ─────────────────────────────────
// Same djb2 recipe as pickNodeColor (AreasTree.tsx:66-70), normalized to [0,1).
export function hash01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
}

// ── Color — private verbatim copy (§2.3) ───────────────────────────────────
// Source of truth: apps/web/components/areas/AreasTree.tsx:57-70. Kept module-
// private (NOT imported from materials/tokens.ts) because U-03 is a wave-1
// parallel unit that also copies this; byte-identical copies hash identically.
// A post-wave-1 cleanup commit may dedupe both into tokens.ts.
const NODE_PALETTE = [
  "oklch(72% 0.13 210)", // cyan (brand)
  "oklch(74% 0.14 350)", // pink
  "oklch(72% 0.14 305)", // purple
  "oklch(74% 0.13 175)", // turquoise
  "oklch(76% 0.15 155)", // mint / light green
  "oklch(80% 0.13 70)", // amber / peach
] as const;

function pickNodeColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length]!;
}

// ── Types (§2.8) — part of the frozen wave-1 contract ──────────────────────
export interface BoughLayout {
  areaId: string;
  name: string;
  emoji: string | null;
  color: string; // pickNodeColor(areaId) — OKLCH string
  azimuth: number; // θᵢ, radians
  start: Vector3Tuple;
  end: Vector3Tuple;
  projects: LanternLayout[];
}

export interface LanternLayout {
  projectId: string;
  areaId: string;
  name: string;
  isClass: boolean;
  position: Vector3Tuple;
  color: string;
}

export interface EmberSlot {
  taskId: string;
  lanternId: string | null; // null → trunk cluster
  basePosition: Vector3Tuple;
  state: EmberState; // from mappings.ts
}

export interface TreeLayoutResult {
  boughs: BoughLayout[];
  byArea: Map<string, BoughLayout>;
  byProject: Map<string, LanternLayout>;
}

// ── Small pure helpers ─────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function distance(a: Vector3Tuple, b: Vector3Tuple): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function frac(x: number): number {
  return x - Math.floor(x);
}

// Stable comparator: orderIndex asc, then id asc (lexicographic).
function byOrderThenId<T extends { orderIndex: number; id: string }>(
  a: T,
  b: T,
): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ── The canonical bough curve — `boughPoint` (§2.5) ────────────────────────
// Quadratic Bézier with a droop control point:
//   P0 = start, P2 = end, P1 = midpoint(start,end) + [0, −BOUGH_SAG·L, 0]
// where L = |end − start| (equals the solve's bough length exactly, since the
// endpoint is constructed as start + L·unit). B(t) for t ∈ [0,1].
export function boughPoint(b: BoughLayout, t: number): Vector3Tuple {
  const L = distance(b.start, b.end);
  const p1x = (b.start[0] + b.end[0]) / 2;
  const p1y = (b.start[1] + b.end[1]) / 2 - BOUGH_SAG * L;
  const p1z = (b.start[2] + b.end[2]) / 2;
  const u = 1 - t;
  const a = u * u;
  const c = 2 * u * t;
  const d = t * t;
  return [
    a * b.start[0] + c * p1x + d * b.end[0],
    a * b.start[1] + c * p1y + d * b.end[1],
    a * b.start[2] + c * p1z + d * b.end[2],
  ];
}

// ── Ember slot positions (§2.7) — geometry only ────────────────────────────
// Projected tasks: Fibonacci-sphere lattice on a shell around the lantern.
export function emberShellPosition(
  lantern: Vector3Tuple,
  k: number,
  n: number,
  taskId: string,
): Vector3Tuple {
  const y = 1 - (2 * (k + 0.5)) / n; // in [−1, 1]
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = k * GOLDEN_ANGLE + 2 * Math.PI * hash01(taskId); // per-task phase
  return [
    lantern[0] + EMBER_SHELL_RADIUS * r * Math.cos(theta),
    lantern[1] + EMBER_SHELL_RADIUS * y,
    lantern[2] + EMBER_SHELL_RADIUS * r * Math.sin(theta),
  ];
}

// Unprojected tasks: golden-angle helix on the trunk shell.
export function trunkShellPosition(k: number): Vector3Tuple {
  const theta = k * GOLDEN_ANGLE;
  const y = TRUNK_SHELL_Y + 0.8 * frac(k * 0.61803398875);
  return [
    TRUNK_SHELL_RADIUS * Math.cos(theta),
    y,
    TRUNK_SHELL_RADIUS * Math.sin(theta),
  ];
}

// ── The solver (§2.4 + §2.6) ───────────────────────────────────────────────
export function solveTreeLayout(areas: SidebarArea[]): TreeLayoutResult {
  const activeAreas = areas
    .filter((a) => a.archivedAt === null)
    .slice()
    .sort(byOrderThenId);

  const boughs: BoughLayout[] = [];
  const byArea = new Map<string, BoughLayout>();
  const byProject = new Map<string, LanternLayout>();

  activeAreas.forEach((area, i) => {
    // 2. Azimuth: golden angle by rank (unnormalized — only used via cos/sin).
    const azimuth = AZIMUTH_OFFSET + i * GOLDEN_ANGLE;
    const cosT = Math.cos(azimuth);
    const sinT = Math.sin(azimuth);

    const activeProjects = area.projects
      .filter((p) => p.archivedAt === null)
      .slice()
      .sort(byOrderThenId);

    // 3–5. Load → length + elevation.
    const load = clamp(activeProjects.length / 8, 0, 1);
    const L = BOUGH_LEN_MIN + (BOUGH_LEN_MAX - BOUGH_LEN_MIN) * load;
    const phi = toRadians(
      BOUGH_ELEV_MAX - (BOUGH_ELEV_MAX - BOUGH_ELEV_MIN) * load,
    );

    // 6. Endpoints (root stagger via hash01 so limbs don't share a ring).
    const start: Vector3Tuple = [
      cosT * TRUNK_RADIUS,
      BOUGH_ROOT_Y + 0.3 * (hash01(area.id) - 0.5),
      sinT * TRUNK_RADIUS,
    ];
    const cosPhi = Math.cos(phi);
    const end: Vector3Tuple = [
      start[0] + L * cosT * cosPhi,
      start[1] + L * Math.sin(phi),
      start[2] + L * sinT * cosPhi,
    ];

    const color = pickNodeColor(area.id);
    const bough: BoughLayout = {
      areaId: area.id,
      name: area.name,
      emoji: area.emoji,
      color,
      azimuth,
      start,
      end,
      projects: [],
    };

    // Lantern distribution (§2.6): even spread over the outer 60% + hash jitter.
    const n = activeProjects.length;
    activeProjects.forEach((p, j) => {
      const t = clamp(
        0.4 + (0.6 * (j + 1)) / (n + 1) + 0.05 * (hash01(p.id) - 0.5),
        LANTERN_T_MIN,
        LANTERN_T_MAX,
      );
      const bp = boughPoint(bough, t);
      // Small horizontal jitter perpendicular to the bough azimuth so lanterns
      // don't form a perfect line: direction [−sin θ, 0, cos θ].
      const jr = 0.16 * (hash01(`${p.id}:r`) - 0.5);
      const position: Vector3Tuple = [
        bp[0] + jr * -sinT,
        bp[1] - LANTERN_HANG,
        bp[2] + jr * cosT,
      ];
      const lantern: LanternLayout = {
        projectId: p.id,
        areaId: area.id,
        name: p.name,
        isClass: p.isClass,
        position,
        color,
      };
      bough.projects.push(lantern);
      byProject.set(p.id, lantern);
    });

    boughs.push(bough);
    byArea.set(area.id, bough);
  });

  return { boughs, byArea, byProject };
}
