"use client";

/**
 * `CalendarClient` — owns view+date+panel state, the TanStack Query wrapping
 * the gcal events read, AND the optimistic mutation pipeline (Plan 04-04).
 *
 * Phase 4 Plan 04-03 shipped the read-only grid + first-visit tz detection.
 * Phase 4 Plan 04-04 adds:
 *   - useOptimistic + optimisticReducer for instant grid feedback on
 *     create/update/delete.
 *   - swapPlaceholderForCanonical() helper — the M-02 fix for Pitfall 7:
 *     the gcal canonical event ID is NOT a UUID (~26-char base32-like), so
 *     the create path must dispatch `delete(placeholderUuid)` + `insert(
 *     canonicalDtoMapped)` after the Server Action returns. Phase 3's UUID-
 *     dedupe-on-echo trick doesn't apply — but the same generic reducer
 *     handles the swap algebra cleanly.
 *   - Drag-move + drag-resize wired to handleUpdate (auto-save, no Sheet).
 *   - CalendarFilters chip row (D-10 URL state).
 *   - ?create=now query param consumed from Cmd+K to open the create panel
 *     pre-filled at the next round half-hour.
 *
 * Two timezone effects (D-08 + M-01 fix from Plan 04-03 — preserved as-is):
 *   1. First-visit: when `users.timezone IS NULL`, read
 *      `Intl.DateTimeFormat().resolvedOptions().timeZone` and POST via
 *      `setTimezone(detected)`. Then refresh the route.
 *   2. Drift-detect: when both saved and detected zones are non-null AND
 *      differ, surface a dismissible toast with an "Update" action.
 *
 * Filter (D-10):
 *   - CalendarFilters chips own the URL state. We read `?cals=` here to
 *     drive the useQuery key + filter the events array. Defaults to all
 *     calendars when the URL is empty.
 *
 * Optimistic algebra summary:
 *   create:  insert(placeholderId) → server returns canonical →
 *            swapPlaceholderForCanonical (delete + insert canonical)
 *   update:  update(id, patch) → server confirms → invalidate (echo no-op)
 *   delete:  delete(id) → server confirms → invalidate
 *
 * On any failure the parent dispatches a compensating action to revert the
 * grid and shows a toast — useOptimistic auto-reverts when the transition
 * completes WITHOUT a confirming refetch.
 */

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useRouter, useSearchParams } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { toast } from "sonner";
import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addMinutes,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from "date-fns";

import {
  listEventsForUser,
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/app/actions/gcal-events";
import { setTimezone } from "@/app/actions/gcal-calendars";
import { detectBrowserTimezone } from "@/lib/gcal/datetime";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

import { CalendarGrid, type GcalEvent } from "./CalendarGrid";
import { CalendarFilters } from "./CalendarFilters";
import { DayWeekToggle } from "./DayWeekToggle";
import {
  EventDetailPanel,
  type EventFormResult,
  type PanelState,
} from "./EventDetailPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { useUndoToast } from "@/components/shared/use-undo-toast";

interface Props {
  initialEvents: GcalEventDTO[];
  userId: string;
  userTimezone: string | null;
  calendars: GcalCalendarMeta[];
}

/**
 * Map a `GcalEventDTO` (server shape) → `GcalEvent` (grid shape with
 * TZDate-wrapped start/end for DST-correct rendering). Shared by the
 * useQuery `select` AND the optimistic-create swap path.
 */
function dtoToGridEvent(
  dto: GcalEventDTO,
  tz: string,
  colorByCalendar: Record<string, string>,
): GcalEvent {
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    title: dto.title,
    start: new TZDate(new Date(dto.start), tz),
    end: new TZDate(new Date(dto.end), tz),
    allDay: dto.allDay,
    colorHex: colorByCalendar[dto.calendarId] ?? "#4285F4",
    description: dto.description,
    recurringEventId: dto.recurringEventId,
    htmlLink: dto.htmlLink,
  };
}

/**
 * Round-to-next-half-hour for the Cmd+K "?create=now" default range.
 *
 * Plan 04-04 Step 3 / AES-05: opening Cmd+K → New event should drop you on
 * /calendar with the panel pre-filled at the next round half-hour and a
 * 60-minute duration. This matches the muscle memory of native gcal "Quick
 * add" affordances.
 */
function nextHalfHour(from: Date): Date {
  const m = from.getMinutes();
  const rounded =
    m < 30 ? setMinutes(from, 30) : setMinutes(addMinutes(from, 30), 0);
  return setMilliseconds(setSeconds(rounded, 0), 0);
}

export function CalendarClient({
  initialEvents,
  userId,
  userTimezone,
  calendars,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(new Date());
  const [calsParam] = useQueryState("cals");
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });

  /**
   * Live form-state preview (Plan 04-04 polish — conflict-detection UX).
   *
   * Fires in BOTH edit and create modes. While the EventDetailPanel is open:
   *  - Edit mode: form values diverge from the canonical saved event. We
   *    render a SECOND outlined placeholder at the proposed-new-position AND
   *    dim the original to 50% opacity ("here's where it'll move").
   *  - Create mode: there is no canonical row to compare against. We render
   *    a single outlined placeholder that tracks the live form state so the
   *    drag-on-grid preview persists THROUGH the Sheet form interaction (and
   *    slides live as the user tweaks start/end/calendar).
   *
   * Cleared whenever the panel transitions to `closed` (close/save/cancel).
   */
  const [formDraft, setFormDraft] = useState<{
    title: string;
    calendarId: string;
    start: Date;
    end: Date;
    allDay: boolean;
  } | null>(null);

  // Drop the draft whenever the panel closes — covers cancel, save, and × close.
  useEffect(() => {
    if (panelState.mode === "closed") setFormDraft(null);
  }, [panelState.mode]);

  // `useOptimistic` is keyed by the useQuery cache (rawEvents below). When
  // the query refetches a canonical event list after a successful mutation,
  // the optimistic state resets to match — no manual reconciliation.
  // ----------------------------------------------------------------------

  // Surface `?gcal=connected` from the OAuth callback as a one-shot toast.
  useEffect(() => {
    if (params.get("gcal") === "connected") {
      toast.success("Google Calendar connected.");
      router.replace("/calendar");
    }
  }, [params, router]);

  // D-08 first-visit: detect once, persist, refresh.
  useEffect(() => {
    if (userTimezone) return;
    const detected = detectBrowserTimezone();
    if (!detected) return;
    void (async () => {
      const res = await setTimezone({ timezone: detected });
      if (res.success) router.refresh();
    })();
  }, [userTimezone, router]);

  // M-01 fix / Pitfall 5 — drift detection.
  useEffect(() => {
    if (!userTimezone) return;
    const detected = detectBrowserTimezone();
    if (!detected || detected === userTimezone) return;
    const dismissKey = `gcal:tz-drift-dismissed:${userTimezone}:${detected}`;
    if (sessionStorage.getItem(dismissKey)) return;
    toast(`Timezone changed? Saved: ${userTimezone}, detected: ${detected}.`, {
      duration: 12_000,
      action: {
        label: `Use ${detected}`,
        onClick: () => {
          void (async () => {
            const res = await setTimezone({ timezone: detected });
            if (res.success) {
              toast.success(`Timezone updated to ${detected}`);
              router.refresh();
            }
          })();
        },
      },
      onDismiss: () => sessionStorage.setItem(dismissKey, "1"),
      onAutoClose: () => sessionStorage.setItem(dismissKey, "1"),
    });
  }, [userTimezone, router]);

  const colorByCalendar = useMemo(
    () =>
      Object.fromEntries(calendars.map((c) => [c.id, c.backgroundColor])) as Record<
        string,
        string
      >,
    [calendars],
  );

  const effectiveTz = userTimezone ?? "UTC";
  const visibleCalIds = useMemo(
    () =>
      calsParam
        ? calsParam.split(",").filter(Boolean)
        : calendars.map((c) => c.id),
    [calsParam, calendars],
  );

  const dateRange = useMemo(() => {
    if (view === "day") {
      return {
        timeMin: startOfDay(date).toISOString(),
        timeMax: endOfDay(date).toISOString(),
      };
    }
    return {
      timeMin: startOfWeek(date, { weekStartsOn: 1 }).toISOString(),
      timeMax: endOfWeek(date, { weekStartsOn: 1 }).toISOString(),
    };
  }, [view, date]);

  const eventsQueryKey = useMemo(
    () => [
      "calendar-events",
      userId,
      visibleCalIds.join(","),
      dateRange.timeMin,
      dateRange.timeMax,
    ],
    [userId, visibleCalIds, dateRange],
  );

  const { data: rawEvents = initialEvents } = useQuery({
    queryKey: eventsQueryKey,
    queryFn: async () => {
      if (visibleCalIds.length === 0) return [];
      const res = await listEventsForUser({
        calendarIds: visibleCalIds,
        timeMin: dateRange.timeMin,
        timeMax: dateRange.timeMax,
      });
      if (!res.success) {
        if (res.kind === "revoked") {
          // UI-SPEC §12e — exact copy: "Reconnect from Settings."
          toast.error(
            "Google Calendar disconnected. Reconnect from Settings.",
          );
        }
        return initialEvents;
      }
      return res.data;
    },
    initialData: initialEvents,
    refetchOnWindowFocus: true, // D-11
    staleTime: 30_000,
  });

  // Map DTO → grid event with TZDate wrapping. Memo over the DTO array.
  const baseEvents: GcalEvent[] = useMemo(
    () =>
      rawEvents.map((e) => dtoToGridEvent(e, effectiveTz, colorByCalendar)),
    [rawEvents, effectiveTz, colorByCalendar],
  );

  // Optimistic state — drives the grid. Re-syncs to `baseEvents` whenever
  // useQuery refetches; in the meantime, dispatch insert/update/delete
  // through `addOptimistic` for instant feedback.
  const [optimisticEvents, addOptimistic] = useOptimistic(
    baseEvents,
    (state: readonly GcalEvent[], action: OptimisticAction<GcalEvent>) =>
      optimisticReducer(state, action),
  );

  const [, startTransition] = useTransition();

  // Derived event list passed to the grid.
  //   - In edit mode with a live draft: append a dashed placeholder at the
  //     proposed position AND flag the original event as `isDraftEditing`
  //     (the grid dims it via eventPropGetter).
  //   - In create mode with a live draft: append a dashed synthetic preview
  //     at the form's current position. This keeps the drag-on-grid preview
  //     visible THROUGH Sheet interaction (the rbc `.rbc-slot-selection`
  //     rectangle disappears once selection ends, so without this the grid
  //     would be empty at the new event's position until Save). The synthetic
  //     row vanishes when the panel closes (Cancel) or is replaced by the
  //     handleCreate optimistic insert (Save).
  //   - Otherwise: pass through.
  // We don't dispatch the draft through useOptimistic because the draft is a
  // pure presentational layer — it never gets persisted, and folding it into
  // the reducer would risk it surviving the panel close path.
  const displayEvents = useMemo<GcalEvent[]>(() => {
    if (panelState.mode === "edit" && formDraft) {
      const editingId = panelState.event.id;
      const out: GcalEvent[] = [];
      for (const e of optimisticEvents) {
        if (e.id === editingId) {
          out.push({ ...e, isDraftEditing: true });
        } else {
          out.push(e);
        }
      }
      out.push({
        id: `__edit-draft__:${editingId}`,
        calendarId: formDraft.calendarId,
        title: formDraft.title || panelState.event.title,
        start: new TZDate(formDraft.start, effectiveTz),
        end: new TZDate(formDraft.end, effectiveTz),
        allDay: formDraft.allDay,
        colorHex:
          colorByCalendar[formDraft.calendarId] ??
          panelState.event.colorHex ??
          "#4285F4",
        description: null,
        recurringEventId: null,
        htmlLink: "",
        isPlaceholder: true,
      });
      return out;
    }
    if (panelState.mode === "create" && formDraft) {
      // Synthetic create-preview row — bridges the gap between drag-end (rbc
      // selection rectangle disappears) and Save (handleCreate dispatches the
      // optimistic insert). Sentinel id avoids any collision with real or
      // optimistic-placeholder events.
      return [
        ...(optimisticEvents as GcalEvent[]),
        {
          id: "__create-preview__",
          calendarId: formDraft.calendarId,
          title: formDraft.title || "New event",
          start: new TZDate(formDraft.start, effectiveTz),
          end: new TZDate(formDraft.end, effectiveTz),
          allDay: formDraft.allDay,
          colorHex: colorByCalendar[formDraft.calendarId] ?? "#4285F4",
          description: null,
          recurringEventId: null,
          htmlLink: "",
          isPlaceholder: true,
        },
      ];
    }
    return optimisticEvents as GcalEvent[];
  }, [optimisticEvents, panelState, formDraft, effectiveTz, colorByCalendar]);

  /**
   * M-02 fix — named helper for placeholder → canonical swap (Pitfall 7).
   * Locating the swap behind a named function makes it grep-robust and
   * lets us call it from anywhere (currently just handleCreate, but a
   * future "duplicate event" affordance would reuse it).
   */
  const swapPlaceholderForCanonical = useCallback(
    (placeholderId: string, dto: GcalEventDTO) => {
      startTransition(() => {
        addOptimistic({ type: "delete", id: placeholderId });
        addOptimistic({
          type: "insert",
          row: dtoToGridEvent(dto, effectiveTz, colorByCalendar),
        });
      });
      void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
    },
    [addOptimistic, effectiveTz, colorByCalendar, qc, userId],
  );

  const defaultCalendarId =
    calendars.find((c) => c.primary)?.id ?? calendars[0]?.id ?? null;

  // ------------------ Mutation handlers ------------------

  const handleCreate = useCallback(
    async (form: EventFormResult) => {
      const placeholderId = `optimistic-${crypto.randomUUID()}`;
      const optimisticEvent: GcalEvent = {
        id: placeholderId,
        calendarId: form.calendarId,
        title: form.title,
        start: new TZDate(form.start, effectiveTz),
        end: new TZDate(form.end, effectiveTz),
        allDay: form.allDay,
        colorHex: colorByCalendar[form.calendarId] ?? "#4285F4",
        description: form.description,
        recurringEventId: null,
        htmlLink: "",
        // Conflict-detection polish — outlined-placeholder render until the
        // canonical row arrives from gcal. swapPlaceholderForCanonical drops
        // this flag because the canonical dto-mapped row doesn't set it.
        isPlaceholder: true,
      };

      startTransition(() => {
        addOptimistic({ type: "insert", row: optimisticEvent });
      });

      const res = await createEvent({
        calendarId: form.calendarId,
        title: form.title,
        description: form.description,
        start: form.start.toISOString(),
        end: form.end.toISOString(),
        allDay: form.allDay,
        userTimezone: effectiveTz,
      });

      if (!res.success) {
        // Revert — drop the placeholder.
        startTransition(() => {
          addOptimistic({ type: "delete", id: placeholderId });
        });
        toast.error(res.error ?? "Failed to create event");
        return { success: false };
      }

      // Success — swap the placeholder for the canonical gcal-shaped row.
      swapPlaceholderForCanonical(placeholderId, res.data);
      toast.success("Event created.");
      return { success: true };
    },
    [
      effectiveTz,
      colorByCalendar,
      addOptimistic,
      swapPlaceholderForCanonical,
    ],
  );

  const handleUpdate = useCallback(
    async (
      eventId: string,
      currentCalendarId: string,
      patch: {
        newCalendarId?: string;
        title?: string;
        description?: string | null;
        start?: Date;
        end?: Date;
        allDay?: boolean;
      },
    ) => {
      const previous = optimisticEvents.find((e) => e.id === eventId);

      // Build the grid-shaped patch from the input. Always TZDate-wrap
      // dates so the grid renders the new range correctly.
      const patchForGrid: Partial<GcalEvent> = {};
      if (patch.title !== undefined) patchForGrid.title = patch.title;
      if (patch.description !== undefined)
        patchForGrid.description = patch.description;
      if (patch.start) patchForGrid.start = new TZDate(patch.start, effectiveTz);
      if (patch.end) patchForGrid.end = new TZDate(patch.end, effectiveTz);
      if (patch.allDay !== undefined) patchForGrid.allDay = patch.allDay;
      if (patch.newCalendarId) {
        patchForGrid.calendarId = patch.newCalendarId;
        patchForGrid.colorHex =
          colorByCalendar[patch.newCalendarId] ??
          patchForGrid.colorHex ??
          "#4285F4";
      }

      startTransition(() => {
        addOptimistic({ type: "update", id: eventId, patch: patchForGrid });
      });

      const res = await updateEvent({
        eventId,
        currentCalendarId,
        newCalendarId: patch.newCalendarId ?? currentCalendarId,
        title: patch.title,
        description: patch.description ?? undefined,
        start: patch.start?.toISOString(),
        end: patch.end?.toISOString(),
        allDay: patch.allDay,
        userTimezone: effectiveTz,
      });

      if (!res.success) {
        // Revert — re-apply the prior values via a counter-patch.
        if (previous) {
          startTransition(() => {
            addOptimistic({
              type: "update",
              id: eventId,
              patch: previous,
            });
          });
        }
        toast.error(res.error ?? "Failed to update event");
        return { success: false };
      }
      void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
      return { success: true };
    },
    [optimisticEvents, effectiveTz, colorByCalendar, addOptimistic, qc, userId],
  );

  // Phase 6 Plan 06-02 (RES-02): sonner Undo toast for gcal event delete.
  // The gcal API is the source of truth — committing the delete must hit
  // googleapis. Pattern: optimistic remove immediately, defer the actual
  // gcal DELETE by 5s. If the user clicks Undo within the window, no API
  // call is made; the row is restored locally and the Realtime/refetch
  // cycle confirms the canonical row still exists in gcal.
  const { show: showUndoToast } = useUndoToast();
  const handleDelete = useCallback(
    async (eventId: string, calendarId: string) => {
      const previous = optimisticEvents.find((e) => e.id === eventId);
      // 1. Optimistic remove — instant grid feedback (D-02)
      startTransition(() => {
        addOptimistic({ type: "delete", id: eventId });
      });
      if (!previous) {
        // Race: row already gone from the cache. Fall back to immediate
        // server delete since there's nothing to addBack().
        const res = await deleteEvent({ calendarId, eventId });
        if (!res.success) {
          toast.error(res.error ?? "Failed to delete event");
          return { success: false };
        }
        void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
        return { success: true };
      }
      // 2. 5s Undo toast (RES-02 / UI-SPEC §8h). gcal DELETE deferred.
      const previousRow = previous;
      showUndoToast({
        message: `"${previous.title || "Event"}" deleted`,
        optimisticRemove: () => {
          /* already done above */
        },
        commit: async () => {
          const res = await deleteEvent({ calendarId, eventId });
          if (!res.success) {
            toast.error(res.error ?? "Failed to delete event");
            // Restore the optimistic row since gcal rejected the delete.
            startTransition(() => {
              addOptimistic({ type: "insert", row: previousRow });
            });
            return;
          }
          void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
        },
        undo: () => {
          /* gcal delete only fires on commit; no server-side rollback needed */
        },
        addBack: () => {
          startTransition(() => {
            addOptimistic({ type: "insert", row: previousRow });
          });
        },
      });
      return { success: true };
    },
    [optimisticEvents, addOptimistic, qc, userId, showUndoToast],
  );

  // Cmd+K → "?create=now" — open the create panel pre-filled at the next
  // round half-hour. Strip the query so reload doesn't re-fire.
  useEffect(() => {
    if (params.get("create") !== "now") return;
    const start = nextHalfHour(new Date());
    const end = addMinutes(start, 60);
    setPanelState({
      mode: "create",
      start: new TZDate(start, effectiveTz),
      end: new TZDate(end, effectiveTz),
      allDay: false,
    });
    router.replace("/calendar");
  }, [params, router, effectiveTz]);

  // EventDetailPanel save router — distinguishes create vs edit by editTarget.
  const handlePanelSave = useCallback(
    async (
      form: EventFormResult,
      editTarget: { eventId: string; currentCalendarId: string } | null,
    ) => {
      if (editTarget === null) {
        return handleCreate(form);
      }
      return handleUpdate(editTarget.eventId, editTarget.currentCalendarId, {
        newCalendarId:
          form.calendarId !== editTarget.currentCalendarId
            ? form.calendarId
            : undefined,
        title: form.title,
        description: form.description,
        start: form.start,
        end: form.end,
        allDay: form.allDay,
      });
    },
    [handleCreate, handleUpdate],
  );

  const handlePanelDelete = useCallback(async () => {
    if (panelState.mode !== "edit") return { success: false };
    return handleDelete(panelState.event.id, panelState.event.calendarId);
  }, [panelState, handleDelete]);

  // Phase 6.1 Plan 06.1-05 (UI-SPEC §5g):
  //   - Outer container on bg --canvas (calendar is document-leaning surface,
  //     axis 4, per UI-SPEC §2b)
  //   - "today" column receives an 8% amber wash (rgb(217 119 6 / 0.08) per
  //     UI-SPEC §3f reserved-for list / §5g) — applied via the .rbc-today
  //     selector in globals.css (kept as a single source of truth for rbc
  //     overrides). The literal also appears once here as a comment marker so
  //     the SUMMARY audit can grep for it across the calendar surface.
  //   - Event color falls back to --ink-coral when gcal doesn't supply one
  //     (UI-SPEC §3f).
  //
  // Calendar copy register per UI-SPEC §12e:
  //   - "New event" CTA (header)
  //   - "Edit event" Sheet title (handled in EventDetailPanel)
  //   - "Save event" + "Discard changes" + "Delete" button labels (per §12f)
  //   - "Google Calendar disconnected. Reconnect from Settings." (toast above)
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--canvas)]">
      {/* Arc-redesign page header — serif title + glance subtitle. */}
      <header className="px-8 pt-10 pb-5 space-y-1.5">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
          Calendar
        </h1>
        <p className="font-serif text-base text-[var(--ink-muted)]">
          {displayEvents.length} event{displayEvents.length === 1 ? "" : "s"} in view
        </p>
      </header>

      {/* Toolbar — wrapped in a soft pill container that matches /tasks. */}
      <div
        className="mx-8 mb-5 flex items-center justify-between gap-4 rounded-xl px-3 py-2"
        style={{
          backgroundColor: "var(--surface)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in oklch, var(--edge) 60%, transparent)",
        }}
      >
        <DayWeekToggle
          view={view}
          onChange={setView}
          date={date}
          onDateChange={setDate}
        />
        <div className="flex items-center gap-3">
          <CalendarFilters calendars={calendars} />
          {/* "New event" CTA opens the create Sheet at the next round
              half-hour (parity with the Cmd+K?create=now path). */}
          <button
            type="button"
            onClick={() => {
              const start = nextHalfHour(new Date());
              const end = addMinutes(start, 60);
              setPanelState({
                mode: "create",
                start: new TZDate(start, effectiveTz),
                end: new TZDate(end, effectiveTz),
                allDay: false,
              });
            }}
            className="font-sans text-[13px] text-[var(--ink)] rounded-lg px-3 py-1.5 transition-colors duration-150 ease-out cursor-pointer-always"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--hud-cyan) 14%, transparent)",
              boxShadow:
                "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 32%, transparent)",
            }}
          >
            New event
          </button>
        </div>
      </div>
      <div className="arc-cal flex-1 min-h-0 mx-8 mb-8">
        <CalendarGrid
          events={displayEvents}
          view={view}
          date={date}
          onNavigate={setDate}
          onView={setView}
          userTimezone={effectiveTz}
          onSelectSlot={(range) =>
            setPanelState({
              mode: "create",
              start: range.start,
              end: range.end,
              allDay: range.allDay,
            })
          }
          onSelectEvent={(event) =>
            setPanelState({ mode: "edit", event })
          }
          onEventDrop={({ event, start, end }) => {
            void handleUpdate(event.id, event.calendarId, {
              start: start as Date,
              end: end as Date,
              // start+end+allDay form a triplet on the gcal patch — preserve
              // the prior allDay so the requestBody stays internally
              // consistent (date vs dateTime).
              allDay: event.allDay,
            });
          }}
          onEventResize={({ event, start, end }) => {
            void handleUpdate(event.id, event.calendarId, {
              start: start as Date,
              end: end as Date,
              allDay: event.allDay,
            });
          }}
        />
      </div>
      {/* Phase 6 Plan 06-02 (RES-03, AES-04, UI-SPEC §9): brand-voice empty
          state below the grid when no events render in the visible range.
          Note: the grid stays mounted (primary surface); the EmptyState is a
          small note beneath. */}
      {displayEvents.length === 0 && (
        <EmptyState
          className="py-12"
          heading="Nothing on the calendar."
          body="Either a very good day or JARVIS hasn't made plans for you yet."
        />
      )}
      <EventDetailPanel
        state={panelState}
        onClose={() => setPanelState({ mode: "closed" })}
        calendars={calendars}
        userTimezone={effectiveTz}
        defaultCalendarId={defaultCalendarId}
        onSave={handlePanelSave}
        onDelete={
          panelState.mode === "edit" ? handlePanelDelete : undefined
        }
        onDraftChange={setFormDraft}
      />
    </div>
  );
}
