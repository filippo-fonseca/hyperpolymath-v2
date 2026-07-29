"use client";

/**
 * `TimelineBar` — one project's span on the canvas.
 *
 * Deliberately contains ZERO pointer-drag logic: u4 owns drag/resize. This
 * component exposes the seams u4 needs and nothing more — a forwarded ref plus
 * `data-timeline-bar` / `data-project-id` / `data-bar-left-px` /
 * `data-bar-width-px` so a drag layer can find a bar and read its geometry
 * without re-deriving date math.
 *
 * Visual law (DESIGN.md + DESIGN-SYSTEM.md §21):
 *   - --sd-accent fill only. Cyan is always the primary series; identity lives
 *     in the row label, never in a per-project hue.
 *   - Ghost (archived / past its effective end) = reduced-opacity accent. Never
 *     a grey gradient.
 *   - Hover moves the border and nothing else — no scale, no glow (§78/§133).
 *   - Popover-open = --sd-selected backplate on the row (TimelineGroup's job)
 *     plus an accent chip on the label here. Never an accent ring (§37).
 *
 * The fill and the label are separate elements on purpose: the terminus fade is
 * a mask, and masking the label along with the fill would dissolve the project
 * name into the ∞ affordance.
 */

import { type PointerEvent as ReactPointerEvent, forwardRef } from "react";

import type { DragMode } from "@/components/projects/timeline/drag-plan";
import type { TimelineBarGeometry, TimelineRowProject } from "@/lib/projects/timeline";
import { cn } from "@/lib/utils";

/**
 * Space Grotesk at 13px/500 averages ~6.6px per character. Estimating rather
 * than measuring keeps the label rule out of the layout-thrash business (a
 * measure-then-reposition pass on every zoom change would fight the scroller)
 * and makes "is the bar narrower than its label" a pure, unit-testable rule.
 */
const APPROX_CHAR_PX = 6.6;
/** Breathing room inside the bar so a label never kisses the pill's edge. */
const LABEL_INSET_PX = 16;

export function estimateLabelWidthPx(label: string): number {
  return label.length * APPROX_CHAR_PX;
}

/**
 * Notion's rule: a label that cannot fit inside its bar sits OUTSIDE it, to the
 * right. The row clips it; it never wraps.
 */
export function labelFitsInsideBar(label: string, barWidthPx: number): boolean {
  return barWidthPx >= estimateLabelWidthPx(label) + LABEL_INSET_PX;
}

function fadeClassFor(geometry: TimelineBarGeometry): string | undefined {
  // openEnded (nothing bounds the end) and clampedEnd (a real end outruns the
  // window) are distinct causes with the same affordance: the bar runs on.
  const fadeRight = geometry.openEnded || geometry.clampedEnd;
  if (geometry.clampedStart && fadeRight) return "timeline-bar-fade-lr";
  if (geometry.clampedStart) return "timeline-bar-fade-l";
  if (fadeRight) return "timeline-bar-fade-r";
  return undefined;
}

interface Props {
  project: TimelineRowProject;
  geometry: TimelineBarGeometry;
  /** The popover for this bar is open — selected treatment. */
  isOpen: boolean;
  onOpen: (projectId: string) => void;
  heightPx: number;
  /**
   * Pointer path to u4's drag session. Absent (SSR / tests) → the bar is a
   * plain click-to-popover button with no drag affordances. `mode` picks which
   * gesture the pointerdown starts: the body moves both dates, the edge handles
   * resize each end independently.
   */
  onBeginDrag?: (mode: DragMode, event: ReactPointerEvent<HTMLElement>) => void;
}

export const TimelineBar = forwardRef<HTMLButtonElement, Props>(function TimelineBar(
  { project, geometry, isOpen, onOpen, heightPx, onBeginDrag },
  ref
) {
  // The engine reports visible:false when a clamped window excludes the project
  // entirely; leftPx/widthPx are 0 and there is nothing to draw.
  if (!geometry.visible) return null;

  const fitsInside = labelFitsInsideBar(project.name, geometry.widthPx);
  // Corrupt bars are a 1-day stub over bad data; they never drag or resize, so
  // they get no handles and no move cursor (the hook also refuses them).
  const draggable = onBeginDrag != null && !geometry.corrupt;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(project.id)}
      onPointerDown={draggable ? (e) => onBeginDrag?.("move", e) : undefined}
      data-timeline-bar=""
      data-project-id={project.id}
      data-bar-left-px={geometry.leftPx}
      data-bar-width-px={geometry.widthPx}
      data-ghost={project.isGhost || undefined}
      data-open-ended={geometry.openEnded || undefined}
      data-corrupt={geometry.corrupt || undefined}
      aria-label={project.name}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      className={cn(
        "group absolute top-1/2 -translate-y-1/2 rounded-full",
        "cursor-pointer-always outline-none"
      )}
      style={{ left: geometry.leftPx, width: geometry.widthPx, height: heightPx }}
    >
      {/* Fill — masked for the terminus fades, so the label above stays crisp.
          The border is the only drag cue: it moves to accent while a touch
          long-press arms the drag, and to dull ink while dragging or hovering.
          Nothing here transitions left/width (§14). */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-full border border-transparent bg-[var(--sd-accent)]",
          "transition-colors duration-[160ms] ease-out group-hover:border-[var(--sd-ink-dull)]",
          "group-data-[dragging]:border-[var(--sd-ink-dull)] group-data-[drag-armed]:border-[var(--sd-accent)]",
          project.isGhost && "opacity-40",
          fadeClassFor(geometry)
        )}
      />

      {/* Edge resize handles — thin hit zones at each end, wider on coarse
          pointers. The left one moves the start; the right one moves the end
          (and converts an open-ended terminus to a real date). Each stops its
          pointerdown from also starting a body-move. */}
      {draggable && (
        <>
          <span
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              onBeginDrag?.("resize-start", e);
            }}
            className="absolute inset-y-0 left-0 z-[2] w-2 cursor-ew-resize [@media(pointer:coarse)]:w-3"
          />
          <span
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              onBeginDrag?.("resize-end", e);
            }}
            className="absolute inset-y-0 right-0 z-[2] w-2 cursor-ew-resize [@media(pointer:coarse)]:w-3"
          />
        </>
      )}

      {fitsInside ? (
        <span className="pointer-events-none relative z-[1] block truncate px-2 text-left font-medium text-meta text-[var(--sd-app)] leading-none">
          {project.name}
        </span>
      ) : (
        // Outside the bar, to the right. Still a child of the button so it stays
        // clickable and focusable with the bar; the lane clips the overflow.
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 left-full ml-1.5 -translate-y-1/2 whitespace-nowrap",
            "rounded-sm font-medium text-meta leading-none",
            isOpen
              ? "bg-[color-mix(in_oklch,var(--sd-accent)_18%,transparent)] px-1.5 py-0.5 text-[var(--sd-ink)]"
              : "text-[var(--sd-ink-dull)]",
            project.isGhost && !isOpen && "text-[var(--sd-ink-faint)]"
          )}
        >
          {project.name}
        </span>
      )}
    </button>
  );
});
