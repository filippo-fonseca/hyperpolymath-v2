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

import { Button } from "@/components/ui/button";
import type { TimelineZoom } from "@/lib/projects/timeline";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center gap-1 rounded-lg border border-[var(--sd-line)] bg-[var(--sd-input)] p-0.5">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            type="button"
            onClick={() => onZoomChange(seg.value)}
            className={cn(
              "cursor-pointer-always rounded-sm px-2 py-0.5 font-sans text-micro font-medium",
              "transition-colors duration-[160ms] ease-out",

              zoom === seg.value
                ? "bg-[var(--sd-selected)] text-[var(--sd-ink)] ring-1 ring-inset ring-[var(--sd-line)]"
                : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
            )}
            aria-pressed={zoom === seg.value}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 font-sans text-micro font-medium"
        onClick={onToday}
        disabled={todayDisabled}
        title={todayDisabled ? "Today is outside the current range" : undefined}
      >
        Today
      </Button>
    </div>
  );
}
