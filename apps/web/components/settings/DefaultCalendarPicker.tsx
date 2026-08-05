"use client";

/**
 * `DefaultCalendarPicker` — Settings dropdown for users.gcal_default_calendar_id.
 *
 * Phase 4 Plan 04-04 (SET-04, D-09).
 *
 * Drives:
 *   - EventDetailPanel's calendar select in create mode (defaults to this id).
 *   - Phase 5 Kiwi: which calendar `create_event` lands in by default.
 *
 * UX:
 *   - shadcn Select with one option per gcal calendar; each option has a
 *     color dot matching the gcal calendar color (D-03 visual continuity).
 *   - Selecting a new value triggers `setDefaultCalendar` in a useTransition;
 *     toast on success + `router.refresh()` to re-fetch the Server Component
 *     with the new value.
 *
 * Why a Server Action + router.refresh (vs optimistic state):
 *   - The Settings page is force-dynamic; the canonical state lives on the
 *     server. Refresh after the action settles ensures the value displayed
 *     matches what hands off to the rest of the app.
 *
 * Edge:
 *   - First-connect auto-default to the primary calendar happens in the
 *     OAuth callback (Plan 04-02 m-01 fix). So this row should always have
 *     a non-null `currentDefault` once a user is connected. We still
 *     handle the null case defensively — picks the primary calendar, or
 *     the first one if no primary marker.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setDefaultCalendar } from "@/app/actions/gcal-settings";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

interface Props {
  calendars: GcalCalendarMeta[];
  currentDefault: string | null;
}

export function DefaultCalendarPicker({ calendars, currentDefault }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const effective =
    currentDefault ??
    calendars.find((c) => c.primary)?.id ??
    calendars[0]?.id ??
    "";

  const handleChange = (id: string) => {
    if (id === effective) return;
    startTransition(async () => {
      const res = await setDefaultCalendar({ calendarId: id });
      if (res.success) {
        toast.success("Default calendar updated.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update default calendar.");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="text-meta font-medium">Default calendar</div>
        <div className="text-xs text-muted-foreground">
          New events from Kiwi and the Cmd+K composer post here by default.
        </div>
      </div>
      <Select value={effective} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select a calendar" />
        </SelectTrigger>
        <SelectContent>
          {calendars.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: c.backgroundColor }}
                />
                {c.summary}
                {c.primary && (
                  <span className="text-micro text-muted-foreground">
                    (primary)
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
