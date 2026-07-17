/**
 * Captures graph — ink, not colour.
 *
 * /graph gives each node type its own bright hue because it plots ten kinds of
 * thing at once. This graph plots one kind of thing (captures) four kinds of
 * way, so hue would be noise: the layers separate by weight, alpha, and dash
 * instead, and everything is drawn in the register's own ink. The result reads
 * as a pen-and-paper diagram rather than a network monitor.
 *
 * Canvas can't read CSS custom properties, so the tokens are resolved off the
 * live element and normalized to rgba here (see `resolveGraphInk`).
 */

import type { CaptureGraphEdgeKind } from "@/lib/captures/graph-edges";

export interface EdgeKindMeta {
  /** Legend label. */
  label: string;
  /** One-line explanation, used by the legend and the empty state. */
  description: string;
  /** Canvas dash pattern; empty = solid. */
  dash: number[];
  /** Base ink alpha at rest. */
  alpha: number;
  /** Ink alpha when the edge touches the focused node. */
  alphaFocus: number;
  /** Base stroke width, before the weight bump. */
  width: number;
}

/**
 * Order matters: this is legend order, and it runs from the loosest
 * association (a shared tag) to the most deliberate (one capture naming
 * another), which is also weakest to strongest ink.
 */
export const EDGE_KIND_META: Record<CaptureGraphEdgeKind, EdgeKindMeta> = {
  shared_hashtag: {
    label: "Shared tag",
    description: "Both captures carry the same #tag. Thicker means more tags in common.",
    dash: [],
    alpha: 0.16,
    alphaFocus: 0.5,
    width: 0.8,
  },
  co_reference: {
    label: "Same subject",
    description: "Both captures @-mention the same task, page, project, area, or person.",
    dash: [4, 3],
    alpha: 0.3,
    alphaFocus: 0.75,
    width: 1,
  },
  direct_reference: {
    label: "Direct mention",
    description: "One capture @-mentions the other by name.",
    dash: [],
    alpha: 0.55,
    alphaFocus: 0.95,
    width: 1.4,
  },
  shared_project: {
    label: "Same project",
    description: "Both captures are filed under the same project.",
    dash: [1, 3],
    alpha: 0.22,
    alphaFocus: 0.6,
    width: 0.9,
  },
};

/** Legend/toggle order. */
export const EDGE_KIND_ORDER: CaptureGraphEdgeKind[] = [
  "shared_hashtag",
  "co_reference",
  "direct_reference",
  "shared_project",
];

export interface GraphInk {
  /** Canvas background. */
  surface: string;
  /** Node fill at rest. */
  node: string;
  /** Node fill for a capture with no visible edges. */
  nodeIsolated: string;
  /** Hairline ring around every node. */
  nodeRing: string;
  /** Node label text. */
  label: string;
  /** Focused node fill + its ring. */
  accent: string;
  /** Base edge ink, alpha applied per kind. */
  edge: string;
  /** Search hit ring. */
  highlight: string;
}

const FALLBACK_INK = "#808080";

/**
 * Normalize any CSS colour to `rgba(r, g, b, a)`.
 *
 * Never parse the token text. Tailwind 4 hands these back in whatever space it
 * settled on — the same token reads as `#212231` or `lab(96.5 0.43 1.85)`
 * depending on the value — and reading three numbers out of `lab()` as if they
 * were RGB turns a papery near-white into blood red. So the browser does the
 * conversion: paint one pixel and read it back, which works for hex, rgb, hsl,
 * lab, oklch, and anything added later.
 *
 * An unparseable value leaves `fillStyle` at the fallback, so a missing token
 * dims the graph rather than blanking or corrupting it.
 */
function withAlpha(color: string, alpha: number): string {
  const cached = inkCache.get(`${color}|${alpha}`);
  if (cached) return cached;

  const ctx = normalizeCtx();
  if (!ctx) return `rgba(128, 128, 128, ${alpha})`;

  ctx.fillStyle = FALLBACK_INK;
  const value = color.trim();
  // Assigning an unparseable colour is a no-op, leaving the fallback in place.
  if (value) ctx.fillStyle = value;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

  const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  inkCache.set(`${color}|${alpha}`, result);
  return result;
}

/**
 * Resolved colours are memoized because the link painter asks for its kind's
 * ink on every link on every frame, and each miss costs a `getImageData`
 * readback. The key space is tiny and bounded (a handful of tokens × a handful
 * of alphas), so this never grows.
 */
const inkCache = new Map<string, string>();

let cachedCtx: CanvasRenderingContext2D | null | undefined;
function normalizeCtx(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) return cachedCtx;
  if (typeof document === "undefined") {
    cachedCtx = null;
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  cachedCtx = canvas.getContext("2d", { willReadFrequently: true });
  return cachedCtx;
}

/**
 * Read the register's tokens off a live element.
 *
 * Called on mount and again whenever the theme flips, because the resolved
 * values differ between the light (papery) and dark registers and the canvas
 * holds no reference back to the CSS.
 */
export function resolveGraphInk(el: HTMLElement): GraphInk {
  const cs = getComputedStyle(el);
  const token = (name: string) => cs.getPropertyValue(name).trim();

  const ink = token("--sd-ink") || "#1b1c22";
  const inkFaint = token("--sd-ink-faint") || "#8a8b93";
  const line = token("--sd-line") || "#c4c5cc";
  const app = token("--sd-app") || "#dedfe6";
  const accent = token("--sd-accent") || ink;

  return {
    surface: withAlpha(app, 1),
    node: withAlpha(ink, 0.72),
    nodeIsolated: withAlpha(inkFaint, 0.45),
    nodeRing: withAlpha(line, 0.9),
    label: withAlpha(ink, 0.86),
    accent: withAlpha(accent, 1),
    edge: withAlpha(ink, 1),
    highlight: withAlpha(accent, 0.9),
  };
}

/** Swap the alpha on the resolved edge ink. */
export function edgeInk(ink: GraphInk, alpha: number): string {
  return withAlpha(ink.edge, alpha);
}

/**
 * Stroke width for an edge: its kind's base, nudged by how much the two
 * captures share. Compressed with a log so a 20-tag overlap is visibly heavier
 * than a 2-tag one without becoming a rope.
 */
export function edgeWidth(kind: CaptureGraphEdgeKind, weight: number, focused: boolean): number {
  const base = EDGE_KIND_META[kind].width;
  const bump = 1 + Math.log2(Math.max(1, weight)) * 0.35;
  return base * bump * (focused ? 1.6 : 1);
}

/** Node radius: gently super-linear in degree, so hubs read without dominating. */
export function nodeRadius(degree: number): number {
  return 2.2 + Math.sqrt(degree) * 0.85;
}
