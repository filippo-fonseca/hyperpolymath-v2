"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  GRID_COLS,
  GRID_MAX_ROWS,
  loadWidgetSpans,
  setWidgetSpan,
  useWidgetSpans,
  type Span,
  type WidgetId,
} from "./useWidgetSpans";

interface Props {
  /** Tasks — the action-dense hero tile (default 2×1, left column). */
  hero: ReactNode;
  /** Study review — today's topics, grouped by what they are for (default 2×1). */
  review: ReactNode;
  habits: ReactNode;
  training: ReactNode;
  captures: ReactNode;
  insights: ReactNode;
}

/** Cell gap in px — mirrors the `gap-4` on the grid container. */
const GRID_GAP = 16;

// Entrances at the 220ms enter/exit step with the contract 20ms stagger
// (SDC-1 §2.7). Opacity only on the cells: they also carry Motion `layout`
// for span reflow, and §2.7 forbids `layout` and a `y` transform on the same
// node (both write `transform`; an interrupted entrance would leave the tile
// permanently translated — the drooping-wiki-tiles bug).
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0.04,
    },
  },
};

const child = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] as const },
  },
};

const CELLS: { id: WidgetId; label: string; key: keyof Props }[] = [
  { id: "tasks", label: "Tasks", key: "hero" },
  { id: "review", label: "Review", key: "review" },
  { id: "habits", label: "Habits", key: "habits" },
  { id: "training", label: "Training", key: "training" },
  { id: "captures", label: "Captures", key: "captures" },
  { id: "insights", label: "Insights", key: "insights" },
];

/**
 * LifeOsBentoGrid — the one-viewport, resizable widget deck (UI-CONTRACT-SD3 §2).
 *
 * A 4-column · 2-row UNIT grid with `grid-auto-flow: dense`. Each widget owns a
 * `{w,h}` span (1–2 each axis, 2×2 max) persisted in localStorage. The default
 * fills the grid hole-free: Tasks takes the tall 2×2 left block, the other four
 * ride the right 2×2 as 1×1 cells.
 *
 *   ┌───────────────┬────────┬────────┐  row 1
 *   │               │ Habits │  Trn   │
 *   │  Tasks (2×2)  ├────────┼────────┤  row 2
 *   │               │ Capt.  │  Ins   │
 *   └───────────────┴────────┴────────┘
 *     col 1–2          col 3    col 4
 *
 * Each cell exposes a bottom-right drag handle (pointer-fine, on hover). Dragging
 * projects a 1px cyan dashed span outline snapped to whole cells; releasing
 * commits the span — clamped so the whole deck still packs into ≤2 rows (the
 * sealed one-viewport law). Reflow rides Motion `layout` (140ms, transform-only,
 * reduced-motion instant). A Reset verb in the canvas header clears the layout.
 *
 * Below `@3xl/main` the grid relaxes to a single auto-height column and the
 * handles hide (resize is a desktop affordance; the canvas region clips).
 */
export function LifeOsBentoGrid({
  hero,
  review,
  habits,
  training,
  captures,
  insights,
}: Props) {
  const reduced = useReducedMotion();
  const spans = useWidgetSpans();
  const gridRef = useRef<HTMLDivElement>(null);

  // Reconcile to the persisted layout after mount (SSR renders defaults).
  useEffect(() => {
    loadWidgetSpans();
  }, []);

  // Live drag projection: which widget, and the span the pointer currently maps
  // to (pre-clamp preview). `null` when not dragging.
  const [projection, setProjection] = useState<{ id: WidgetId; span: Span } | null>(null);

  const nodes: Record<keyof Props, ReactNode> = {
    hero,
    review,
    habits,
    training,
    captures,
    insights,
  };

  const cells = CELLS.map(({ id, label, key }) => (
    <ResizableCell
      key={id}
      id={id}
      label={label}
      span={spans[id]}
      reduced={!!reduced}
      gridRef={gridRef}
      projectedSpan={projection?.id === id ? projection.span : null}
      onProject={(span) => setProjection({ id, span })}
      onCommit={(span) => {
        setProjection(null);
        setWidgetSpan(id, span);
      }}
      onCancel={() => setProjection(null)}
    >
      {nodes[key]}
    </ResizableCell>
  ));

  const gridClass =
    "grid h-full grid-cols-1 gap-4 @3xl/main:grid-cols-4 @3xl/main:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]";

  if (reduced) {
    return (
      <div ref={gridRef} className={gridClass} style={{ gridAutoFlow: "dense" }}>
        {cells}
      </div>
    );
  }

  return (
    <motion.div
      ref={gridRef}
      className={gridClass}
      style={{ gridAutoFlow: "dense" }}
      variants={container}
      initial="hidden"
      animate="show"
    >
      {cells}
    </motion.div>
  );
}

/**
 * One grid cell: the widget, plus a bottom-right resize handle and (while
 * dragging) a dashed span projection. The cell carries the `grid-column` /
 * `grid-row` span inline so it snaps between whole cells; `layout` animates the
 * reflow. The handle lives at the CELL level (a sibling of the WidgetCard, above
 * its link overlay) so no out-of-fence card edit is needed.
 */
function ResizableCell({
  id,
  label,
  span,
  reduced,
  gridRef,
  projectedSpan,
  onProject,
  onCommit,
  onCancel,
  children,
}: {
  id: WidgetId;
  label: string;
  span: Span;
  reduced: boolean;
  gridRef: React.RefObject<HTMLDivElement | null>;
  projectedSpan: Span | null;
  onProject: (span: Span) => void;
  onCommit: (span: Span) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ span: Span } | null>(null);

  // Measure the current 4×2 cell footprint from the grid box; returns null when
  // the grid isn't in its @3xl unit layout (measurement would be meaningless).
  const measureCell = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const cellW = (rect.width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;
    const cellH = (rect.height - (GRID_MAX_ROWS - 1) * GRID_GAP) / GRID_MAX_ROWS;
    if (cellW <= 0 || cellH <= 0) return null;
    return { cellW, cellH };
  }, [gridRef]);

  const spanFromPointer = useCallback(
    (e: { clientX: number; clientY: number }): Span | null => {
      const cell = cellRef.current;
      const dims = measureCell();
      if (!cell || !dims) return null;
      const origin = cell.getBoundingClientRect();
      const extentW = e.clientX - origin.left;
      const extentH = e.clientY - origin.top;
      const toSpan = (extent: number, unit: number): 1 | 2 => {
        const n = Math.round((extent + GRID_GAP) / (unit + GRID_GAP));
        return n >= 2 ? 2 : 1;
      };
      return { w: toSpan(extentW, dims.cellW), h: toSpan(extentH, dims.cellH) };
    },
    [measureCell],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { span };
      onProject(span);
    },
    [span, onProject],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return;
      const next = spanFromPointer(e);
      if (next) {
        dragRef.current.span = next;
        onProject(next);
      }
    },
    [spanFromPointer, onProject],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return;
      const finalSpan = dragRef.current.span;
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onCommit(finalSpan);
    },
    [onCommit],
  );

  // Keyboard resize (a11y): arrows nudge the span, snapping stays clamped.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = (dw: number, dh: number) => {
        e.preventDefault();
        const w = Math.min(2, Math.max(1, span.w + dw)) as 1 | 2;
        const h = Math.min(2, Math.max(1, span.h + dh)) as 1 | 2;
        onCommit({ w, h });
      };
      if (e.key === "ArrowRight") step(1, 0);
      else if (e.key === "ArrowLeft") step(-1, 0);
      else if (e.key === "ArrowDown") step(0, 1);
      else if (e.key === "ArrowUp") step(0, -1);
      else if (e.key === "Escape") onCancel();
    },
    [span, onCommit, onCancel],
  );

  // Projection rect in px (extends past the cell into the cells it would claim).
  const projStyle = (() => {
    if (!projectedSpan) return undefined;
    const dims = measureCell();
    if (!dims) return undefined;
    return {
      width: projectedSpan.w * dims.cellW + (projectedSpan.w - 1) * GRID_GAP,
      height: projectedSpan.h * dims.cellH + (projectedSpan.h - 1) * GRID_GAP,
    };
  })();

  return (
    <motion.div
      ref={cellRef}
      layout={!reduced}
      transition={reduced ? { duration: 0 } : { duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
      variants={reduced ? undefined : child}
      className="group/cell relative min-h-0"
      style={{ gridColumn: `span ${span.w}`, gridRow: `span ${span.h}` }}
    >
      {/* The widget arrives as an RSC-serialized element owned by LifeOsPage
          (its Flight `validated` flag is unset), so placing it directly in
          this motion.div's children ARRAY (next to the projection + handle)
          trips React 19's missing-key reconciler warning on every hard load.
          A client-owned `display: contents` wrapper gives the array a locally
          created member instead — zero layout impact, warning gone. */}
      <div className="contents">{children}</div>

      {projStyle && (
        <div aria-hidden className="lifeos-resize-projection" style={projStyle} />
      )}

      <button
        type="button"
        aria-label={`Resize ${label} widget`}
        aria-description="Drag or use arrow keys to resize between 1 and 2 grid cells"
        className="lifeos-resize-handle cursor-pointer-always"
        // The class in globals.css (U0-owned, frozen for wave 2) still says
        // 5px; the radius ladder has no 5. Inline wins regardless of layer
        // order, so this is the one override that cannot lose the cascade.
        style={{ borderRadius: 4 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden>⌟</span>
      </button>
    </motion.div>
  );
}
