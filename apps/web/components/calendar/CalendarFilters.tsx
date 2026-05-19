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
          // Phase 6.1 Plan 06.1-05 (UI-SPEC §5g + §9 chip register):
          // Diplomatic-tier chip. Inactive renders with 1px --edge border at
          // --ink-muted; active picks up --ink-amber tint per UI-SPEC §3f
          // ("amber for active filter chips" carries from /tasks). Mono 11px
          // register matches the calendar-time-label family — these chips
          // are metadata chrome, not document body.
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
              "transition-colors duration-150 ease-out",
              active
                ? "border-[var(--edge)] text-[var(--ink)] bg-[var(--surface)]"
                : "border-[var(--edge)] text-[var(--ink-muted)] opacity-60 hover:opacity-100 hover:text-[var(--ink)]",
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
