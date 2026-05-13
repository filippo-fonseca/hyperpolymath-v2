"use client";

/**
 * `EventDetailPanel` — 560px right-side Sheet for create/edit of gcal events.
 *
 * Phase 4 Plan 04-03 — READ-ONLY display. Save / mutate / dirty-state-guard
 * land in Plan 04-04. The panel exists in this plan so the click-empty-slot
 * and click-existing-event interactions have UI feedback; the Save button is
 * disabled with a tooltip pointing at the next plan.
 *
 * Mirrors the shadcn Sheet pattern from CaptureDetailPanel + TaskDetailPanel
 * (560px width, `side="right"`, custom close button in header). Phase 2 set
 * the convention; staying consistent across surfaces keeps the muscle memory
 * intact.
 *
 * Recurring-event badge (Pitfall 4):
 *   - When `event.recurringEventId !== null`, render a small amber note so
 *     the user understands edits will hit a single instance, not the series.
 *     "Edit the series" requires opening in Google Calendar (link provided
 *     via `event.htmlLink`).
 *
 * State shape:
 *   - "closed"  → Sheet hidden.
 *   - "create"  → Sheet visible, form pre-filled with the dragged slot.
 *   - "edit"    → Sheet visible, form pre-filled from the clicked event.
 *
 * Form inputs are uncontrolled (no react-hook-form yet — Plan 04-04 will
 * wire it for the save path). Values render directly from props so the
 * panel is a pure read view in this plan.
 */

import { format } from "date-fns";
import { X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GcalEvent } from "./CalendarGrid";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

export type PanelState =
  | { mode: "closed" }
  | { mode: "create"; start: Date; end: Date; allDay: boolean }
  | { mode: "edit"; event: GcalEvent };

interface Props {
  state: PanelState;
  onClose: () => void;
  calendars: GcalCalendarMeta[];
  userTimezone: string;
  defaultCalendarId?: string | null;
}

/**
 * Format a Date as the value an `<input type="datetime-local">` expects:
 * `"YYYY-MM-DDTHH:mm"`. We can't use `Date.toISOString()` directly because
 * that's UTC; we want the user's tz wall-clock. The Date passed in is
 * already a TZDate from CalendarClient's mapper, so date-fns' `format`
 * reads the local-tz components correctly.
 */
function toDateTimeLocalValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function EventDetailPanel({
  state,
  onClose,
  calendars,
  userTimezone,
  defaultCalendarId,
}: Props) {
  const open = state.mode !== "closed";

  // Derive initial values for the form. In edit mode read from the event;
  // in create mode read from the dragged slot. Both branches end up with
  // strings the inputs can render.
  let title = "";
  let calendarId =
    defaultCalendarId ??
    calendars.find((c) => c.primary)?.id ??
    calendars[0]?.id ??
    "";
  let startStr = "";
  let endStr = "";
  let description = "";
  let recurringEventId: string | null = null;
  let htmlLink: string | null = null;

  if (state.mode === "edit") {
    title = state.event.title;
    calendarId = state.event.calendarId;
    startStr = toDateTimeLocalValue(state.event.start);
    endStr = toDateTimeLocalValue(state.event.end);
    description = state.event.description ?? "";
    recurringEventId = state.event.recurringEventId;
    htmlLink = state.event.htmlLink || null;
  } else if (state.mode === "create") {
    startStr = toDateTimeLocalValue(state.start);
    endStr = toDateTimeLocalValue(state.end);
  }

  const headerLabel =
    state.mode === "edit" ? "Event" : state.mode === "create" ? "New event" : "";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 flex flex-col"
        showCloseButton={false}
      >
        {open && (
          <>
            <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <SheetTitle className="font-serif text-[20px] font-semibold leading-tight text-foreground p-0 m-0">
                    {headerLabel}
                  </SheetTitle>
                  <p className="font-sans text-[13px] text-muted-foreground">
                    Timezone: {userTimezone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close detail panel"
                  className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0 mt-1"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto flex flex-col gap-5 px-6 py-5">
              {/* Pitfall 4 — recurring-event instance badge */}
              {recurringEventId && (
                <div className="text-xs text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-2 rounded">
                  Recurring event — edits will apply to this instance only
                  (full-series edit lands in a later phase).{" "}
                  {htmlLink && (
                    <a
                      href={htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Open in Google Calendar
                    </a>
                  )}
                  .
                </div>
              )}

              <section className="flex flex-col gap-2">
                <Label htmlFor="event-title" className="font-sans text-[13px]">
                  Title
                </Label>
                <Input
                  id="event-title"
                  defaultValue={title}
                  placeholder="Event title"
                  disabled
                  readOnly
                  className="font-serif"
                />
              </section>

              <section className="flex flex-col gap-2">
                <Label htmlFor="event-calendar" className="font-sans text-[13px]">
                  Calendar
                </Label>
                <Select value={calendarId} disabled>
                  <SelectTrigger id="event-calendar">
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
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-start" className="font-sans text-[13px]">
                    Start
                  </Label>
                  <Input
                    id="event-start"
                    type="datetime-local"
                    defaultValue={startStr}
                    disabled
                    readOnly
                    className="font-sans"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-end" className="font-sans text-[13px]">
                    End
                  </Label>
                  <Input
                    id="event-end"
                    type="datetime-local"
                    defaultValue={endStr}
                    disabled
                    readOnly
                    className="font-sans"
                  />
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <Label
                  htmlFor="event-description"
                  className="font-sans text-[13px]"
                >
                  Description
                </Label>
                <Textarea
                  id="event-description"
                  defaultValue={description}
                  rows={4}
                  placeholder="Add details (optional)"
                  disabled
                  readOnly
                  className="font-serif"
                />
              </section>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <span className="font-sans text-[13px] text-muted-foreground">
                Read-only preview
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-sans text-[13px]"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          type="button"
                          size="sm"
                          className="font-sans text-[13px]"
                          disabled
                        >
                          Save
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Coming in Plan 04-04</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
