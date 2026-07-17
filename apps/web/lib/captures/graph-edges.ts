/**
 * Captures link graph — pure node/edge assembly.
 *
 * The SQL side (app/actions/capture-graph.ts) does the pairing: four grouped
 * self-joins hand back raw `(a, b, weight)` rows per edge kind. Everything that
 * decides what the graph actually *shows* lives here, with no DB imports, so it
 * can be tested directly:
 *
 * - pair normalization (a < b) and de-duplication, so an undirected edge never
 *   renders twice because SQL emitted it from both ends
 * - dropping pairs whose endpoints fell outside the 500-node window
 * - co_reference edge labelling from the shared target
 * - the caps that keep a hub hashtag from turning the canvas into a hairball
 *
 * Captures have no title column, so a node's label is synthesized the same way
 * every other reference surface does it — via `captureLabel` — just shorter.
 */

import { captureLabel } from "@/lib/references/token";

/** Node label budget. Shorter than a reference chip's 80: this is canvas ink. */
export const GRAPH_NODE_LABEL_MAX = 60;

/** Most recent captures pulled into the graph window (S10). */
export const GRAPH_NODE_CAP = 500;

/**
 * Per-kind edge cap. A single hashtag on N captures contributes N·(N-1)/2 edges
 * on its own, so an unbounded shared_hashtag layer is quadratic in the worst
 * case (500 captures on one tag = ~125k edges). Heaviest-weight edges win; the
 * count of what was dropped is reported in `meta` and surfaced in the legend
 * rather than silently hidden.
 *
 * Capping per kind as well as in total is what keeps the layers legible: one
 * hub hashtag can otherwise consume the entire budget and push the reference
 * layers — the whole point of the view — off the canvas.
 */
export const MAX_EDGES_PER_KIND = 1500;

/**
 * Total edge cap, applied after the per-kind cut.
 *
 * Sized against the node cap rather than a frame budget: at 500 nodes this is
 * an average degree of 12, which is about where a force layout still reads as
 * structure instead of felt. The canvas could draw several times this many
 * lines per frame, so legibility is the binding constraint, not paint cost.
 */
export const MAX_EDGES_TOTAL = 3000;

export type CaptureGraphEdgeKind =
  | "shared_hashtag"
  | "direct_reference"
  | "co_reference"
  | "shared_project";

/** Edge kinds visible on first paint (S10: shared_project is opt-in). */
export const DEFAULT_VISIBLE_EDGE_KINDS: readonly CaptureGraphEdgeKind[] = [
  "shared_hashtag",
  "direct_reference",
  "co_reference",
];

/** A referenceable target that two captures can both point at. */
export type CoReferenceTargetType = "task" | "page" | "project" | "area" | "person";

export interface CaptureGraphNode {
  id: string;
  /** First non-empty content line, truncated to GRAPH_NODE_LABEL_MAX. */
  label: string;
  /** Canonical (lowercase) hashtag names on this capture. */
  hashtags: string[];
  projectIds: string[];
  /** ISO 8601. */
  createdAt: string;
}

export interface CaptureGraphEdge {
  source: string;
  target: string;
  kind: CaptureGraphEdgeKind;
  /**
   * How many distinct things the pair shares: hashtags for shared_hashtag,
   * projects for shared_project, shared targets for co_reference. For
   * direct_reference it counts the directed references collapsed onto the
   * undirected pair: 1 when only one capture references the other, 2 when the
   * reference is mutual (A→B and B→A).
   */
  weight: number;
  /**
   * co_reference only — what the two captures both point at, e.g. "Marathon
   * training". Rendered on hover so the edge explains itself.
   */
  label?: string;
}

export interface CaptureGraphMeta {
  totalCaptures: number;
  /** Edges dropped by the caps, per kind. Absent kinds dropped nothing. */
  droppedEdges: Partial<Record<CaptureGraphEdgeKind, number>>;
}

export interface CaptureGraph {
  nodes: CaptureGraphNode[];
  edges: CaptureGraphEdge[];
  meta: CaptureGraphMeta;
}

/** One `(a, b, weight)` row as the grouped self-joins return it. */
export interface RawPair {
  a: string;
  b: string;
  weight: number;
}

/** A co_reference pair, carrying the target the two captures share. */
export interface RawCoReferencePair extends RawPair {
  targetType: CoReferenceTargetType;
  targetId: string;
}

export interface CaptureRow {
  id: string;
  content: string;
  createdAt: Date | string;
}

export interface CaptureLinkRow {
  captureId: string;
  /** Hashtag name or project id, depending on which list this row belongs to. */
  value: string;
}

/**
 * Fold capture rows plus their hashtag/project join rows into graph nodes.
 *
 * Join rows for captures outside the window are ignored rather than treated as
 * an error: the window is a `LIMIT`, so trailing join rows are expected.
 */
export function buildCaptureNodes(
  captureRows: CaptureRow[],
  hashtagRows: CaptureLinkRow[],
  projectRows: CaptureLinkRow[]
): CaptureGraphNode[] {
  const byCapture = new Map<string, CaptureGraphNode>();

  for (const row of captureRows) {
    byCapture.set(row.id, {
      id: row.id,
      label: captureLabel(row.content, GRAPH_NODE_LABEL_MAX) || "(empty capture)",
      hashtags: [],
      projectIds: [],
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    });
  }

  for (const row of hashtagRows) {
    const node = byCapture.get(row.captureId);
    if (node && !node.hashtags.includes(row.value)) node.hashtags.push(row.value);
  }
  for (const row of projectRows) {
    const node = byCapture.get(row.captureId);
    if (node && !node.projectIds.includes(row.value)) node.projectIds.push(row.value);
  }

  return [...byCapture.values()];
}

/** Undirected key: the same pair from either end collapses to one entry. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * Normalize one kind's raw pairs: drop self-loops and pairs with an endpoint
 * outside the node window, orient each pair (source < target), and merge
 * duplicates by summing weight. `labelFor` supplies the co_reference label —
 * when several shared targets produce the same pair, the first label wins and
 * the weight counts them all ("+N more" is the renderer's business).
 */
function normalizePairs<T extends RawPair>(
  pairs: T[],
  kind: CaptureGraphEdgeKind,
  nodeIds: Set<string>,
  labelFor?: (pair: T) => string | undefined
): CaptureGraphEdge[] {
  const merged = new Map<string, CaptureGraphEdge>();

  for (const pair of pairs) {
    if (pair.a === pair.b) continue;
    if (!nodeIds.has(pair.a) || !nodeIds.has(pair.b)) continue;

    const key = pairKey(pair.a, pair.b);
    const weight = Number.isFinite(pair.weight) ? Math.max(1, pair.weight) : 1;
    const existing = merged.get(key);
    if (existing) {
      existing.weight += weight;
      continue;
    }

    const [source, target] = pair.a < pair.b ? [pair.a, pair.b] : [pair.b, pair.a];
    const edge: CaptureGraphEdge = { source, target, kind, weight };
    const label = labelFor?.(pair);
    if (label) edge.label = label;
    merged.set(key, edge);
  }

  return [...merged.values()];
}

/** Heaviest edges first; id order breaks ties so output is deterministic. */
function byWeightDesc(a: CaptureGraphEdge, b: CaptureGraphEdge): number {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  return a.target < b.target ? -1 : a.target === b.target ? 0 : 1;
}

export interface AssembleEdgesInput {
  nodeIds: Set<string>;
  sharedHashtagPairs: RawPair[];
  directReferencePairs: RawPair[];
  coReferencePairs: RawCoReferencePair[];
  sharedProjectPairs: RawPair[];
  /** `${targetType}:${targetId}` → display label, for co_reference edges. */
  targetLabels: Map<string, string>;
}

export interface AssembledEdges {
  edges: CaptureGraphEdge[];
  droppedEdges: Partial<Record<CaptureGraphEdgeKind, number>>;
}

/**
 * Turn the four raw pair sets into the rendered edge list.
 *
 * Each kind is normalized and capped independently, so a hub hashtag can never
 * starve the reference layers out of the graph — the layers a user turns on are
 * the layers they still see. The total cap then trims what remains, again
 * heaviest-first.
 */
export function assembleCaptureEdges(input: AssembleEdgesInput): AssembledEdges {
  const { nodeIds, targetLabels } = input;
  const dropped: Partial<Record<CaptureGraphEdgeKind, number>> = {};

  const perKind: Array<[CaptureGraphEdgeKind, CaptureGraphEdge[]]> = [
    ["shared_hashtag", normalizePairs(input.sharedHashtagPairs, "shared_hashtag", nodeIds)],
    ["direct_reference", normalizePairs(input.directReferencePairs, "direct_reference", nodeIds)],
    [
      "co_reference",
      normalizePairs(input.coReferencePairs, "co_reference", nodeIds, (pair) =>
        targetLabels.get(`${pair.targetType}:${pair.targetId}`)
      ),
    ],
    ["shared_project", normalizePairs(input.sharedProjectPairs, "shared_project", nodeIds)],
  ];

  const kept: CaptureGraphEdge[] = [];
  for (const [kind, edges] of perKind) {
    edges.sort(byWeightDesc);
    if (edges.length > MAX_EDGES_PER_KIND) {
      dropped[kind] = edges.length - MAX_EDGES_PER_KIND;
      kept.push(...edges.slice(0, MAX_EDGES_PER_KIND));
    } else {
      kept.push(...edges);
    }
  }

  if (kept.length <= MAX_EDGES_TOTAL) return { edges: kept, droppedEdges: dropped };

  kept.sort(byWeightDesc);
  const trimmed = kept.slice(0, MAX_EDGES_TOTAL);
  for (const edge of kept.slice(MAX_EDGES_TOTAL)) {
    dropped[edge.kind] = (dropped[edge.kind] ?? 0) + 1;
  }
  return { edges: trimmed, droppedEdges: dropped };
}
