"use client";

/**
 * `CalendarFilters` — multi-calendar visibility chips above the grid.
 *
 * Phase 4 Plan 04-04 (D-10, CAL-06).
 *
 * URL state via nuqs `?cals=id1,id2`. Empty/missing URL param means "show
 * all calendars" — equivalent to the D-10 NULL persistent set semantics.
 * The Settings persistent checkbox list (VisibleCalendarsCheckboxList) is
 * the source of truth for the *default* — these chips override per-session.
 *
 * Why URL state (vs in-memory) — same logic as TaskFilters (Plan 02-03):
 *   - Bookmarkable, shareable, survives reload.
 *   - Two grids open at once (e.g., a calendar dashboard in a future phase)
 *     each keep their own selection.
 *   - No prop drilling from CalendarClient → chip + filter consumers.
 *
 * Toggle semantics — clicking a chip flips its inclusion in the visible set:
 *   - All visible → click chip → that calendar's events vanish.
 *   - Some hidden → click hidden chip → it reappears.
 *   - When every calendar would be visible after a toggle, clear the URL
 *     param entirely (empty = show all; keeps "future-calendars-also-visible"
 *     semantics consistent with the persistent set's NULL convention).
 */

import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

interface Props {
  calendars: GcalCalendarMeta[];
}

export function CalendarFilters({ calendars }: Props) {
  const [cals, setCals] = useQueryState("cals", { defaultValue: "" });

  // visibleSet = the set of calendars currently shown. Empty URL → all visible.
  const explicit = cals ? cals.split(",").filter(Boolean) : null;
  const visibleSet = new Set<string>(
    explicit ? explicit : calendars.map((c) => c.id),
  );

  const toggle = (id: string) => {
    const next = new Set(visibleSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === calendars.length) {
      // "Show all" — clear the URL so future-added calendars stay visible.
      void setCals("");
    } else {
      void setCals(Array.from(next).join(","));
    }
  };

  if (calendars.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5 items-center"
      role="group"
      aria-label="Calendar visibility filters"
    >
      {calendars.map((c) => {
        const active = visibleSet.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-colors font-sans",
              active
                ? "border-foreground/40 text-foreground"
                : "border-border opacity-50 hover:opacity-75 text-muted-foreground",
            )}
            title={`${active ? "Hide" : "Show"} ${c.summary}`}
          >
            <span
              className="h-2 w-2 rounded-full"
              aria-hidden
              style={{ backgroundColor: c.backgroundColor }}
            />
            <span>{c.summary}</span>
          </button>
        );
      })}
    </div>
  );
}
