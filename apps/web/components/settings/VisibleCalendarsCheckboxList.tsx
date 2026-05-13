"use client";

/**
 * `VisibleCalendarsCheckboxList` — Settings checkbox list for
 * users.gcal_visible_calendar_ids (D-10 persistent set).
 *
 * Phase 4 Plan 04-04.
 *
 * Semantics (matches gcal-settings.ts setVisibleCalendars):
 *   - NULL persistent set → all calendars visible by default (including
 *     calendars added later).
 *   - Explicit text[] → only those IDs are visible by default.
 *
 * UX:
 *   - One checkbox row per calendar with the gcal color dot.
 *   - When the user has every calendar checked, we send NULL to preserve
 *     the "future-calendars-also-visible" intent (not [id1, id2, ...]).
 *   - Debounced 500ms — clicking through several boxes batch-saves so the
 *     server isn't pelted on every flicker.
 *
 * Why a debounce instead of a Save button:
 *   - Matches the way persistent settings work elsewhere in the app
 *     (graduation year saves on Submit; tz override saves on change).
 *     A multi-row checkbox list with a Save button feels heavier than the
 *     pure "toggle and walk away" gesture. The 500ms debounce keeps the
 *     server load reasonable.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { setVisibleCalendars } from "@/app/actions/gcal-settings";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

interface Props {
  calendars: GcalCalendarMeta[];
  currentVisible: string[] | null;
}

export function VisibleCalendarsCheckboxList({
  calendars,
  currentVisible,
}: Props) {
  const router = useRouter();

  // Local state for the live UI; debounced commit fires later.
  // NULL persistent ↔ all-checked locally.
  const [visible, setVisible] = useState<Set<string>>(() => {
    if (currentVisible === null) {
      return new Set(calendars.map((c) => c.id));
    }
    return new Set(currentVisible);
  });

  // Track the canonical persisted value so we can compute "is this a change?"
  // Memoised as a string key to avoid array identity churn.
  const persistedKey = useMemo(
    () =>
      currentVisible === null
        ? "null"
        : [...currentVisible].sort().join(","),
    [currentVisible],
  );

  const localKey = useMemo(
    () =>
      visible.size === calendars.length
        ? "null"
        : [...visible].sort().join(","),
    [visible, calendars],
  );

  // Debounced save — fires 500ms after the last toggle.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (localKey === persistedKey) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        const payload =
          visible.size === calendars.length
            ? null
            : Array.from(visible);
        const res = await setVisibleCalendars({ calendarIds: payload });
        if (res.success) {
          toast.success("Calendar visibility updated.");
          router.refresh();
        } else {
          toast.error(res.error ?? "Failed to update visibility.");
        }
      })();
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [localKey, persistedKey, visible, calendars, router]);

  const toggle = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 py-4 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Visible calendars</div>
        <div className="text-xs text-muted-foreground">
          Calendars shown in the /calendar grid by default. The grid filter
          chips override this per session.
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {calendars.map((c) => {
          const checked = visible.has(c.id);
          const id = `vis-cal-${c.id}`;
          return (
            <li key={c.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => toggle(c.id)}
              />
              <label
                htmlFor={id}
                className="flex items-center gap-2 text-sm font-sans cursor-pointer"
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: c.backgroundColor }}
                />
                {c.summary}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
