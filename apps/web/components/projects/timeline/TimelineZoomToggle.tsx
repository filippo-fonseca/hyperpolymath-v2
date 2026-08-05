"use client";

/**
 * `TimelineZoomToggle` — Weeks / Months / Quarters segmented control + Today.
 *
 * Hand-rolled against the `SEGMENTS` grammar of
 * `components/calendar/DayWeekToggle.tsx` rather than reaching for
 * `components/ui/explorer/ViewToggle.tsx`: ViewToggle is hard-typed
 * "grid" | "list" and generifying it would drag the wiki explorer's type
 * surface into this unit. DayWeekToggle is the calendar's own answer to this
 * exact problem, and reusing its rhythm preserves muscle memory across the two
 * date surfaces.
 *
 * Keyboard support: native <button>s; Tab + Enter work.
 */

import type { TimelineZoom } from "@/lib/projects/timeline";

const SEGMENTS: { value: TimelineZoom; label: string }[] = [
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "quarters", label: "Quarters" },
];

interface Props {
  zoom: TimelineZoom;
  onZoomChange: (zoom: TimelineZoom) => void;
  onToday: () => void;
  /** Today sits outside the rendered window — the button would be a no-op. */
  todayDisabled?: boolean;
}

export function TimelineZoomToggle({ zoom, onZoomChange, onToday, todayDisabled = false }: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* Zoom segments join the craft chip row. */}
      <div className="flex items-center gap-1.5">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            type="button"
            onClick={() => onZoomChange(seg.value)}
            className="craft-chip cursor-pointer-always"
            aria-pressed={zoom === seg.value}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="craft-chip cursor-pointer-always disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onToday}
        disabled={todayDisabled}
        title={todayDisabled ? "Today is outside the current range" : undefined}
      >
        Today
      </button>
    </div>
  );
}
