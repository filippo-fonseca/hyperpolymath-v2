"use client";

/**
 * `EventDetailPanel` — 560px right-side Sheet for create/edit of gcal events.
 *
 * Phase 4 Plan 04-04 (CAL-04, CAL-05). Plan 04-03 shipped this as a read-only
 * preview; this version adds the full save/delete path:
 *   - react-hook-form + Zod resolver for form state + validation.
 *   - Cmd+Enter saves; Esc/click-outside/× close with dirty-state guard.
 *   - Delete button (edit mode only) gated by an AlertDialog confirm.
 *   - Recurring event badge (Pitfall 4) — instance-only edit semantics
 *     surfaced to the user with a link to the series in google.com/calendar.
 *
 * Mirrors `CaptureDetailPanel`'s shadcn Sheet pattern (560px, side="right",
 * custom close button in header, AlertDialog discard-confirm at z-[60] over
 * the Sheet's z-50). Phase 2 set the convention; staying consistent keeps
 * muscle memory.
 *
 * State machine:
 *   - "closed"  → Sheet hidden.
 *   - "create"  → Sheet visible, form pre-filled with the dragged slot.
 *                 onSave routes to handleCreate (CalendarClient parent).
 *   - "edit"    → Sheet visible, form pre-filled from the clicked event.
 *                 onSave routes to handleUpdate. onDelete bound to the
 *                 footer Delete button.
 *
 * Why react-hook-form here when CaptureDetailPanel uses plain useState:
 *   - The event form has more fields (title, calendar, start, end, allDay,
 *     description) AND start+end need cross-field validation (end > start).
 *   - rhf's `formState.isDirty` is the canonical dirty signal that
 *     CaptureDetailPanel mirrored manually. Using rhf here is simpler.
 *
 * datetime-local input handling:
 *   - `<input type="datetime-local">` expects "YYYY-MM-DDTHH:mm" in the
 *     browser's tz interpretation. Since CalendarClient passes TZDate-wrapped
 *     Date objects, date-fns' `format(d, "yyyy-MM-dd'T'HH:mm")` reads the
 *     local-tz components directly — DST-correct without manual offset math.
 *   - On save, we reconstruct a Date from the input value + apply the user
 *     timezone via TZDate so the ISO sent to gcal matches the user's intent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { toast } from "sonner";
import { X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { GcalEvent } from "./CalendarGrid";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

export type PanelState =
  | { mode: "closed" }
  | { mode: "create"; start: Date; end: Date; allDay: boolean }
  | { mode: "edit"; event: GcalEvent };

// Form values shape — strings for inputs, normalised to Dates on save.
const EventFormSchema = z
  .object({
    title: z.string().min(1, "Title required").max(1024),
    calendarId: z.string().min(1, "Select a calendar"),
    start: z.string().min(1, "Start required"),
    end: z.string().min(1, "End required"),
    allDay: z.boolean(),
    description: z.string().max(8192).optional(),
  })
  .refine((v) => v.end > v.start, {
    message: "End must be after start",
    path: ["end"],
  });

export type EventFormValues = z.infer<typeof EventFormSchema>;

// What the parent receives on save — normalised to Date instances so the
// caller doesn't have to re-parse the input strings.
export interface EventFormResult {
  title: string;
  calendarId: string;
  start: Date;
  end: Date;
  allDay: boolean;
  description: string | null;
}

interface Props {
  state: PanelState;
  onClose: () => void;
  calendars: GcalCalendarMeta[];
  userTimezone: string;
  defaultCalendarId?: string | null;
  /**
   * Save handler — receives the parsed form values + the existing event id
   * (for edit) or null (for create). Returns a promise so the panel can
   * await the round-trip before closing on success.
   */
  onSave: (
    values: EventFormResult,
    editTarget: { eventId: string; currentCalendarId: string } | null,
  ) => Promise<{ success: boolean }>;
  /** Edit-mode delete — undefined in create mode. */
  onDelete?: () => Promise<{ success: boolean }>;
  /**
   * Conflict-detection polish (Plan 04-04): in edit mode, the parent renders
   * a dashed "proposed-new-position" placeholder on the grid alongside the
   * dimmed original. We push live form values up via this callback so the
   * parent can keep the placeholder in sync with what the user is typing.
   *
   * Receives `null` when the panel isn't in edit mode (or when the live
   * form values match the saved event — i.e. nothing to preview).
   */
  onDraftChange?: (
    draft: {
      title: string;
      calendarId: string;
      start: Date;
      end: Date;
      allDay: boolean;
    } | null,
  ) => void;
}

function toDateTimeLocalValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Build a Date that has the *wall-clock* time entered by the user but
 * anchored to the user's IANA tz so when serialized to ISO it carries the
 * correct offset.
 *
 * Why not `new Date(dateTimeLocalString)`:
 *   - `<input type="datetime-local">` returns the wall-clock string with no
 *     zone info. Passing it to `new Date()` interprets it in the browser's
 *     local tz — which mostly matches `userTimezone` but DRIFTS if the user
 *     travels (Pitfall 5). TZDate anchors the wall-clock to the user's
 *     persisted zone explicitly.
 */
function dateTimeLocalToTZDate(value: string, tz: string): Date {
  // Parse the "YYYY-MM-DDTHH:mm" string into components, then build a TZDate
  // in the user's zone with those components.
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return new Date(value); // best-effort fallback
  const [, y, mo, d, h, mi, s] = m;
  // TZDate constructor: (year, month0-indexed, day, h, m, s, tz)
  return new TZDate(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
    tz,
  );
}

export function EventDetailPanel({
  state,
  onClose,
  calendars,
  userTimezone,
  defaultCalendarId,
  onSave,
  onDelete,
  onDraftChange,
}: Props) {
  const open = state.mode !== "closed";
  const [pendingDiscard, setPendingDiscard] = useState<
    "close" | "cancel" | null
  >(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Derive initial form values from panel state. Recomputed when state
  // identity changes (new event clicked or new slot dragged).
  const initialValues = useMemo<EventFormValues>(() => {
    const base: EventFormValues = {
      title: "",
      calendarId:
        defaultCalendarId ??
        calendars.find((c) => c.primary)?.id ??
        calendars[0]?.id ??
        "",
      start: "",
      end: "",
      allDay: false,
      description: "",
    };
    if (state.mode === "edit") {
      return {
        title: state.event.title,
        calendarId: state.event.calendarId,
        start: toDateTimeLocalValue(state.event.start),
        end: toDateTimeLocalValue(state.event.end),
        allDay: state.event.allDay,
        description: state.event.description ?? "",
      };
    }
    if (state.mode === "create") {
      return {
        ...base,
        start: toDateTimeLocalValue(state.start),
        end: toDateTimeLocalValue(state.end),
        allDay: state.allDay,
      };
    }
    return base;
  }, [state, calendars, defaultCalendarId]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty, errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: initialValues,
  });

  // Re-seed the form whenever the panel state's identity changes — new
  // event clicked, or new slot dragged. Without this, opening a second
  // event would keep the first event's values.
  // Track the last-seeded key so we don't loop on every render.
  const seededKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key =
      state.mode === "closed"
        ? "closed"
        : state.mode === "create"
          ? `create:${state.start.toISOString()}:${state.end.toISOString()}`
          : `edit:${state.event.id}`;
    if (seededKeyRef.current !== key) {
      reset(initialValues);
      seededKeyRef.current = key;
    }
  }, [state, initialValues, reset]);

  const recurringEventId =
    state.mode === "edit" ? state.event.recurringEventId : null;
  const htmlLink =
    state.mode === "edit" && state.event.htmlLink ? state.event.htmlLink : null;
  const headerLabel =
    state.mode === "edit" ? "Event" : state.mode === "create" ? "New event" : "";

  const onValidSubmit = useCallback(
    async (data: EventFormValues) => {
      setSubmitting(true);
      try {
        const result: EventFormResult = {
          title: data.title.trim(),
          calendarId: data.calendarId,
          start: dateTimeLocalToTZDate(data.start, userTimezone),
          end: dateTimeLocalToTZDate(data.end, userTimezone),
          allDay: data.allDay,
          description:
            data.description && data.description.trim()
              ? data.description.trim()
              : null,
        };
        const editTarget =
          state.mode === "edit"
            ? {
                eventId: state.event.id,
                currentCalendarId: state.event.calendarId,
              }
            : null;
        const res = await onSave(result, editTarget);
        if (res.success) {
          onClose();
        }
      } finally {
        setSubmitting(false);
      }
    },
    [state, userTimezone, onSave, onClose],
  );

  // Cmd+Enter to save (mirrors CaptureDetailPanel convention).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (isDirty || state.mode === "create") {
          void handleSubmit(onValidSubmit)();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isDirty, state.mode, handleSubmit, onValidSubmit]);

  // beforeunload guard — only when dirty AND open.
  useEffect(() => {
    if (!open || !isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, isDirty]);

  const handleSheetOpenChange = useCallback(
    (next: boolean) => {
      if (next) return; // opening is parent-controlled
      if (isDirty) {
        setPendingDiscard("close");
        return;
      }
      onClose();
    },
    [isDirty, onClose],
  );

  const handleCancelClick = useCallback(() => {
    if (isDirty) {
      setPendingDiscard("cancel");
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setPendingDiscard(null);
    reset(initialValues);
    onClose();
  }, [initialValues, reset, onClose]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!onDelete) return;
    setSubmitting(true);
    try {
      const res = await onDelete();
      if (res.success) {
        setShowDeleteConfirm(false);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }, [onDelete, onClose]);

  // Watch allDay to drive input type swap (date vs datetime-local). When
  // toggled on, strip the time portion of the start/end to a date string.
  const watchedAllDay = watch("allDay");

  /**
   * Edit-mode draft preview wiring (Plan 04-04 polish):
   * Subscribe to live form values via `watch(cb)` and push them up to the
   * parent so the grid can render a dashed "proposed-new-position" placeholder
   * while the user is editing. We only emit when:
   *   - we're in edit mode (create-mode placeholder is already covered by
   *     the optimistic-insert path in handleCreate);
   *   - the parsed values are valid Dates (skip while the user is mid-type
   *     and the datetime-local string is half-formed).
   * On unmount / mode change / panel close, the parent clears the draft via
   * its own `panelState.mode !== "edit"` effect.
   */
  useEffect(() => {
    if (!onDraftChange) return;
    if (state.mode !== "edit") {
      onDraftChange(null);
      return;
    }
    const sub = watch((value) => {
      if (!value.start || !value.end || !value.calendarId) return;
      const start = dateTimeLocalToTZDate(value.start, userTimezone);
      const end = dateTimeLocalToTZDate(value.end, userTimezone);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      if (end <= start) return; // Same guard as the Zod refine.
      onDraftChange({
        title: (value.title ?? "").trim() || "(untitled)",
        calendarId: value.calendarId,
        start,
        end,
        allDay: Boolean(value.allDay),
      });
    });
    return () => sub.unsubscribe();
  }, [state.mode, onDraftChange, watch, userTimezone]);

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[560px] p-0 flex flex-col"
          showCloseButton={false}
        >
          {open && (
            <form
              onSubmit={handleSubmit(onValidSubmit)}
              className="flex flex-col h-full"
            >
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
                    onClick={() => handleSheetOpenChange(false)}
                    aria-label="Close detail panel"
                    className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0 mt-1"
                  >
                    <X size={16} className="text-muted-foreground" />
                  </button>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto flex flex-col gap-5 px-6 py-5">
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
                  <Label
                    htmlFor="event-title"
                    className="font-sans text-[13px]"
                  >
                    Title
                  </Label>
                  <Input
                    id="event-title"
                    placeholder="Event title"
                    className="font-serif"
                    autoFocus={state.mode === "create"}
                    {...register("title")}
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <Label
                    htmlFor="event-calendar"
                    className="font-sans text-[13px]"
                  >
                    Calendar
                  </Label>
                  <Select
                    value={watch("calendarId")}
                    onValueChange={(v) =>
                      setValue("calendarId", v, { shouldDirty: true })
                    }
                  >
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

                <section className="flex items-center gap-2">
                  <input
                    id="event-all-day"
                    type="checkbox"
                    {...register("allDay")}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <Label
                    htmlFor="event-all-day"
                    className="font-sans text-[13px] cursor-pointer"
                  >
                    All-day
                  </Label>
                </section>

                <section className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="event-start"
                      className="font-sans text-[13px]"
                    >
                      Start
                    </Label>
                    <Input
                      id="event-start"
                      type={watchedAllDay ? "date" : "datetime-local"}
                      className="font-sans"
                      {...register("start")}
                    />
                    {errors.start && (
                      <p className="text-xs text-destructive">
                        {errors.start.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="event-end"
                      className="font-sans text-[13px]"
                    >
                      End
                    </Label>
                    <Input
                      id="event-end"
                      type={watchedAllDay ? "date" : "datetime-local"}
                      className="font-sans"
                      {...register("end")}
                    />
                    {errors.end && (
                      <p className="text-xs text-destructive">
                        {errors.end.message}
                      </p>
                    )}
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
                    rows={4}
                    placeholder="Add details (optional)"
                    className="font-serif"
                    {...register("description")}
                  />
                </section>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                {state.mode === "edit" && onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-sans text-[13px] text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={submitting}
                  >
                    Delete event
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isDirty
                        ? "font-sans text-[13px] text-muted-foreground"
                        : "font-sans text-[13px] text-muted-foreground opacity-0"
                    }
                    aria-hidden={!isDirty}
                  >
                    Cmd+Enter to save
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-sans text-[13px]"
                    onClick={handleCancelClick}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="font-sans text-[13px]"
                    disabled={
                      submitting || (state.mode === "edit" && !isDirty)
                    }
                  >
                    {submitting ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* Discard-unsaved-changes confirm — fires on close attempts while dirty. */}
      <AlertDialog
        open={pendingDiscard !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDiscard(null);
        }}
      >
        <AlertDialogContent className="font-serif">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[20px]">
              Discard changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-serif text-base">
              Your edits to this event will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-[13px]">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-sans text-[13px]"
              onClick={handleConfirmDiscard}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm. */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent className="font-serif">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[20px]">
              Delete this event?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-serif text-base">
              This removes the event from Google Calendar. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-[13px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-sans text-[13px]"
              onClick={() => {
                // We don't close the AlertDialog ourselves — handleDelete
                // calls onClose() on success which unmounts the whole sheet.
                void handleDeleteConfirmed();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper toast wiring (re-exported for parent CalendarClient to surface
// failure modes without re-implementing the optimistic-revert toasts).
export function notifyEventError(message: string) {
  toast.error(message);
}
