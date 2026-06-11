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
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--edge)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
          aria-label="Calendar visibility filter"
        >
          <span className="flex items-center gap-1.5">
            {/* Stacked dots preview — only show colors of visible calendars
                (max 4 before the +N pill) so the trigger telegraphs current
                state at a glance. */}
            <span className="flex -space-x-1">
              {calendars
                .filter((c) => visibleSet.has(c.id))
                .slice(0, 4)
                .map((c) => (
                  <span
                    key={c.id}
                    className="h-2 w-2 rounded-full ring-1 ring-[var(--surface)]"
                    style={{ backgroundColor: c.backgroundColor }}
                    aria-hidden
                  />
                ))}
            </span>
            {triggerLabel}
          </span>
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={
          // Glassy pill matching /settings PROFILE pill: translucent surface +
          // backdrop-blur + inset cyan glow + soft outer halo + thin
          // cyan-tinged border on hover.
          "w-64 p-1.5 rounded-xl backdrop-blur-md " +
          "bg-[color-mix(in_oklch,var(--surface-raised)_82%,transparent)] " +
          "border border-[color-mix(in_oklch,var(--edge)_55%,transparent)] " +
          "shadow-[inset_0_1px_0_color-mix(in_oklch,white_12%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_10%,transparent),inset_0_0_24px_color-mix(in_oklch,var(--hud-cyan)_6%,transparent),0_10px_32px_color-mix(in_oklch,var(--ink)_22%,transparent),0_2px_6px_color-mix(in_oklch,var(--ink)_10%,transparent)] " +
          "hover:border-[color-mix(in_oklch,var(--hud-cyan)_45%,transparent)] " +
          "hover:shadow-[inset_0_1px_0_color-mix(in_oklch,white_16%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_12%,transparent),inset_0_0_32px_color-mix(in_oklch,var(--hud-cyan)_12%,transparent),0_14px_40px_color-mix(in_oklch,var(--ink)_30%,transparent),0_2px_8px_color-mix(in_oklch,var(--ink)_14%,transparent)] " +
          "transition-[border-color,box-shadow,background-color] duration-200 ease-out"
        }
      >
        <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
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
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 font-sans text-[13px] cursor-pointer-always",
                    "transition-colors duration-150 ease-out",
                    "hover:bg-[var(--surface)]",
                    active ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    aria-hidden
                    style={{ backgroundColor: c.backgroundColor }}
                  />
                  <span className="flex-1 text-left truncate">{c.summary}</span>
                  {active ? (
                    <Check size={12} strokeWidth={2} className="text-[var(--ink-muted)] flex-shrink-0" />
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
