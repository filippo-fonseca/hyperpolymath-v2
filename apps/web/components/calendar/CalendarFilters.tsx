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
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      void setCals("");
    } else {
      void setCals(Array.from(next).join(","));
    }
  };

  if (calendars.length === 0) return null;

  const visibleCount = visibleSet.size;
  const total = calendars.length;
  const allVisible = visibleCount === total;
  const triggerLabel = allVisible
    ? "All calendars"
    : `${visibleCount} of ${total}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="craft-chip shrink-0 cursor-pointer-always"
          aria-label="Calendar visibility filter"
        >
          <span className="flex items-center gap-1.5">
            {/* Stacked dots preview — max 4 before the label. Each dot carries
                the calendar's deterministic craft tint, so the trigger reads
                as a legend for the plates on the grid. */}
            <span className="flex -space-x-1">
              {calendars
                .filter((c) => visibleSet.has(c.id))
                .slice(0, 4)
                .map((c) => (
                  <span
                    key={c.id}
                    className={cn(
                      tintFor(c.id),
                      "h-2.5 w-2.5 rounded-full bg-[var(--tint-edge)] ring-2 ring-[var(--surface-raised)]",
                    )}
                    aria-hidden
                  />
                ))}
            </span>
            {triggerLabel}
          </span>
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-[var(--radius-card)] p-1.5 text-[var(--ink)]"
      >
        <p className="px-2 pt-1 pb-1.5 text-micro text-[var(--ink-faint)]">
          Show calendars
        </p>
        <ul className="space-y-0.5">
          {calendars.map((c) => {
            const active = visibleSet.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={active}
                  className={cn(
                    tintFor(c.id),
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-meta cursor-pointer-always",
                    "transition-colors duration-[160ms] ease-out",
                    "hover:bg-[var(--hover)]",
                    active ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
                  )}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      active
                        ? "bg-[var(--tint-edge)]"
                        : "bg-[color-mix(in_srgb,var(--tint-edge)_28%,transparent)]",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-left">{c.summary}</span>
                  {active ? (
                    <Check
                      size={13}
                      strokeWidth={2.25}
                      className="shrink-0 text-[var(--tint-ink)]"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
