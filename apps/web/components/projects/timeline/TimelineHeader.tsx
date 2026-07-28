"use client";

/**
 * `TimelineHeader` — the two sticky date tiers above the lanes.
 *
 * The tiers do NOT nest (u1 API DEVIATIONS #2): a month group cuts across week
 * columns, so each tier is positioned from its own `leftPx` / `widthPx` rather
 * than one being laid out inside the other. Both tile the window exactly.
 *
 *   major (headerGroupsForWindow) — weeks at "weeks", months at "months", quarters at "quarters"
 *   minor (columnsForWindow)      — the grid tier: days / weeks / months respectively
 *
 * Typography is the canonical date line (DESIGN-SYSTEM.md §66): mono 11px
 * text-micro mono, --ink-faint, tabular-nums on the numerals. The
 * current column takes the accent, mirroring CalendarGrid's isToday header.
 *
 * `sticky top-0` keeps the dates visible while the lanes scroll vertically.
 * There is no corner spacer because there is no label gutter: project names
 * ride with their bars (see TimelineBar's overflow rule), so the canvas starts
 * at the scroller's leading edge.
 */

import type { TimelineColumn } from "@/lib/projects/timeline";
import { cn } from "@/lib/utils";

export const TIMELINE_HEADER_HEIGHT_PX = 44;

interface Props {
  majorGroups: TimelineColumn[];
  minorColumns: TimelineColumn[];
  totalWidthPx: number;
}

export function TimelineHeader({ majorGroups, minorColumns, totalWidthPx }: Props) {
  return (
    <div
      className="sticky top-0 z-20 shrink-0 border-[var(--sd-line)] border-b bg-[var(--sd-box)]"
      style={{ width: totalWidthPx, height: TIMELINE_HEADER_HEIGHT_PX }}
      data-testid="timeline-header"
    >
      {/* Major tier */}
      <div className="relative h-[24px]" data-testid="timeline-header-major">
        {majorGroups.map((group) => (
          <div
            key={group.startISO}
            className={cn(
              "absolute top-0 bottom-0 flex items-center overflow-hidden whitespace-nowrap",
              "border-[var(--sd-line)] border-l px-1.5",
              "font-mono text-micro tabular-nums",
              "text-[var(--sd-ink-faint)]"
            )}
            style={{ left: group.leftPx, width: group.widthPx }}
            title={group.label}
          >
            {group.label}
          </div>
        ))}
      </div>

      {/* Minor tier — the grid tier, one cell per rendered column. */}
      <div
        className="relative h-[20px] border-[var(--sd-line)] border-t"
        data-testid="timeline-header-minor"
      >
        {minorColumns.map((column) => (
          <div
            key={column.startISO}
            className={cn(
              "absolute top-0 bottom-0 flex items-center overflow-hidden whitespace-nowrap",
              "border-[var(--sd-line)] border-l px-1.5",
              "font-mono text-micro tabular-nums",
              column.isCurrent ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink-faint)]"
            )}
            style={{ left: column.leftPx, width: column.widthPx }}
            data-current={column.isCurrent || undefined}
            title={column.label}
          >
            {column.label}
          </div>
        ))}
      </div>
    </div>
  );
}
