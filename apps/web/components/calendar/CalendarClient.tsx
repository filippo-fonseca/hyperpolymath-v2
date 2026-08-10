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
 *      differ, surface a dismissible toast with an "Update"action.
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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

import { Plus } from "lucide-react";

import { CalendarGrid, type GcalEvent } from "./CalendarGrid";
import { CalendarFilters } from "./CalendarFilters";
import { CalendarIcon } from "./CalendarIcon";
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
    attendees: dto.attendees,
    hangoutLink: dto.hangoutLink,
  };
}

/**
 * Round-to-next-half-hour for the Cmd+K "?create=now"default range.
 *
 * Plan 04-04 Step 3 / AES-05: opening Cmd+K → New event should drop you on
 * /calendar with the panel pre-filled at the next round half-hour and a
 * 60-minute duration. This matches the muscle memory of native gcal "Quick
 * add"affordances.
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
  const [view, setView] = useState<"day" | "3day" | "week">("week");
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

  // (Main-overflow lock removed — the /calendar route's page wrapper now uses
  // h-[100dvh] + overflow-hidden directly, mirroring the JARVIS console
  // pattern. With a definite viewport-sized outer container, the internal
  // flex/grid chain resolves naturally and the body's overflow-y-auto
  // engages without any imperative DOM manipulation.)

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
    if (view === "3day") {
      const start = startOfDay(date);
      const end = endOfDay(addMinutes(start, 60 * 24 * 3 - 1));
      return { timeMin: start.toISOString(), timeMax: end.toISOString() };
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

  // Optimistic state — drives the grid (RT-06 self-reconciling). Pending
  // insert/update/delete ops persist until the gcal query refetches and
  // catches up, so a just-created event can't flash out before the canonical
  // row arrives. Dispatch via `addOptimistic`; roll back with `revert`.
  const [optimisticEvents, addOptimistic] = useOptimisticList<GcalEvent>(baseEvents);

  const [, startTransition] = useTransition();

  // Long-lived optimistic-delete set. Held in plain useState (NOT useOptimistic)
  // so a deleted event stays hidden for the FULL 5s undo window — wrapping the
  // delete in a synchronous startTransition settled instantly and let the row
  // reappear ~immediately, then vanish ~5s later on the deferred gcal commit.
  // gcal is the source of truth (CLAUDE.md): TanStack Query invalidate/refetch
  // is the only cache surface — so commit drops the id only AFTER invalidate.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const dropPending = useCallback((...ids: string[]) => {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  // In-flight UPDATE ids (issue #25). Tracked so (a) the grid chip can render a
  // busy spinner + dimmed opacity while a reschedule/edit round-trips, and
  // (b) a second drag/resize on the SAME event is dropped while its first
  // write is still pending (re-entrancy guard for the auto-save drag paths,
  // which don't pass through the EventDetailPanel's usePendingAction guard).
  const [busyUpdateIds, setBusyUpdateIds] = useState<Set<string>>(new Set());
  const markBusy = useCallback((id: string) => {
    setBusyUpdateIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const clearBusy = useCallback((id: string) => {
    setBusyUpdateIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  // Synchronous guard for the auto-save drag/resize paths — state flips are
  // async, so a fast second drag could slip through before `busyUpdateIds`
  // updates. The ref blocks it the instant the first write starts.
  const inFlightUpdateRef = useRef<Set<string>>(new Set());

  // Issue #16 deferred-delete durability. The 5s Undo toast defers the gcal
  // DELETE to the toast's onAutoClose/onDismiss lifecycle. If the user
  // refreshes or navigates away within that window the toast is torn down
  // WITHOUT firing those callbacks, so the delete never hits gcal and the
  // event reappears on reload. We keep each not-yet-committed delete's gcal
  // call in a ref keyed by eventId, and flush any survivors synchronously on
  // unmount + pagehide so the delete actually persists.
  const pendingCommitsRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const flushPendingDeletes = useCallback(() => {
    const commits = pendingCommitsRef.current;
    if (commits.size === 0) return;
    for (const commit of commits.values()) void commit();
    commits.clear();
  }, []);

  useEffect(() => {
    const onPageHide = () => flushPendingDeletes();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      // Component unmount (client-side navigation away from /calendar) also
      // tears down the toast, so flush so the in-flight delete still commits.
      flushPendingDeletes();
    };
  }, [flushPendingDeletes]);

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
    // Drop optimistically-deleted events for the full undo window before any
    // draft/preview overlay is composed on top, and flag any event whose
    // backend write is still in flight so the grid renders a busy spinner.
    const visible = (optimisticEvents as GcalEvent[])
      .filter((e) => !pendingDeleteIds.has(e.id))
      .map((e) =>
        busyUpdateIds.has(e.id) ? { ...e, isBusy: true } : e,
      );
    if (panelState.mode === "edit" && formDraft) {
      const editingId = panelState.event.id;
      const out: GcalEvent[] = [];
      for (const e of visible) {
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
        attendees: [],
        hangoutLink: null,
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
        ...visible,
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
          attendees: [],
          hangoutLink: null,
          isPlaceholder: true,
        },
      ];
    }
    return visible;
  }, [optimisticEvents, panelState, formDraft, effectiveTz, colorByCalendar, pendingDeleteIds, busyUpdateIds]);

  /**
   * M-02 fix — named helper for placeholder → canonical swap (Pitfall 7).
   * Locating the swap behind a named function makes it grep-robust and
   * lets us call it from anywhere (currently just handleCreate, but a
   * future "duplicate event"affordance would reuse it).
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
        // Optimistic guests — bare rows until the canonical DTO (with gcal's
        // resolved displayName/RSVP state) swaps in.
        attendees: (form.attendees ?? []).map((email) => ({
          email,
          displayName: null,
          responseStatus: null,
          organizer: false,
          self: false,
        })),
        hangoutLink: null,
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
        attendees: form.attendees,
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
        /** Full desired guest list — undefined leaves attendees untouched. */
        attendees?: string[];
      },
    ) => {
      // Re-entrancy guard for the auto-save drag/resize paths: if a write for
      // this event is already in flight, drop the duplicate rather than racing
      // two patches against gcal. (The panel-edit path has its own guard via
      // usePendingAction, but it harmlessly short-circuits here too.)
      if (inFlightUpdateRef.current.has(eventId)) {
        return { success: false };
      }
      inFlightUpdateRef.current.add(eventId);
      markBusy(eventId);

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
        attendees: patch.attendees,
      });

      if (!res.success) {
        // RT-06 rollback — drop the optimistic patch; the grid falls back to
        // the canonical (unchanged) event.
        startTransition(() => {
          addOptimistic({ type: "revert", id: eventId });
        });
        toast.error(res.error ?? "Failed to update event", {
          action: {
            label: "Retry",
            onClick: () => {
              void handleUpdateRef.current?.(eventId, currentCalendarId, patch);
            },
          },
        });
        inFlightUpdateRef.current.delete(eventId);
        clearBusy(eventId);
        return { success: false };
      }
      void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
      inFlightUpdateRef.current.delete(eventId);
      clearBusy(eventId);
      return { success: true };
    },
    [effectiveTz, colorByCalendar, addOptimistic, qc, userId, markBusy, clearBusy],
  );

  // Stable ref to handleUpdate so the failure toast's Retry can re-invoke the
  // latest closure without making the toast capture a stale one.
  const handleUpdateRef = useRef<typeof handleUpdate | null>(null);
  handleUpdateRef.current = handleUpdate;

  // Phase 6 Plan 06-02 (RES-02): sonner Undo toast for gcal event delete.
  // The gcal API is the source of truth — committing the delete must hit
  // googleapis. Pattern: optimistic remove immediately, defer the actual
  // gcal DELETE by 5s. If the user clicks Undo within the window, no API
  // call is made; the row is restored locally and the Realtime/refetch
  // cycle confirms the canonical row still exists in gcal.
  const { show: showUndoToast } = useUndoToast();
  const handleDelete = useCallback(
    async (eventId: string, calendarId: string) => {
      // Capture the row BEFORE hiding it so the toast title is available and
      // addBack is a clean drop-from-set.
      const previous = optimisticEvents.find((e) => e.id === eventId);
      // 1. Optimistic remove via the long-lived set — the event stays hidden
      //    for the full 5s window (D-02), even on the race path below.
      setPendingDeleteIds((prev) => new Set(prev).add(eventId));
      if (!previous) {
        // Race: row already gone from the cache. Fall back to immediate
        // server delete since there's nothing to addBack().
        const res = await deleteEvent({ calendarId, eventId });
        if (!res.success) {
          toast.error(res.error ?? "Failed to delete event");
          dropPending(eventId);
          return { success: false };
        }
        void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
        dropPending(eventId);
        return { success: true };
      }
      // The actual gcal DELETE. Registered in pendingCommitsRef so that if the
      // page unloads or /calendar unmounts before the toast resolves, the
      // unmount/pagehide flush still fires it (issue #16). Guarded against a
      // double-fire (toast onAutoClose + flush racing) so we never DELETE twice.
      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        pendingCommitsRef.current.delete(eventId);
        const res = await deleteEvent({ calendarId, eventId });
        if (!res.success) {
          toast.error(res.error ?? "Failed to delete event");
          // Restore the event since gcal rejected the delete.
          dropPending(eventId);
          return;
        }
        void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
        dropPending(eventId);
      };
      pendingCommitsRef.current.set(eventId, commit);

      // 2. 5s Undo toast (RES-02 / UI-SPEC §8h). gcal DELETE deferred.
      showUndoToast({
        message: `"${previous.title || "Event"}"deleted`,
        optimisticRemove: () => {
          /* already done above via the set */
        },
        commit,
        undo: () => {
          // Cancel the deferred gcal delete — drop it from the registry so the
          // unmount/pagehide flush won't fire it after the user undid.
          committed = true;
          pendingCommitsRef.current.delete(eventId);
        },
        addBack: () => dropPending(eventId),
      });
      return { success: true };
    },
    [optimisticEvents, qc, userId, showUndoToast, dropPending],
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
        attendees: form.attendees,
      });
    },
    [handleCreate, handleUpdate],
  );

  const handlePanelDelete = useCallback(async () => {
    if (panelState.mode !== "edit") return { success: false };
    return handleDelete(panelState.event.id, panelState.event.calendarId);
  }, [panelState, handleDelete]);

  // jul-29 craft restyle:
  //   - Outer container sits on the canvas; the grid is the one large raised
  //     panel (craft-card at the panel radius, in CalendarGrid).
  //   - Event blocks are pastel plates tinted per calendar source; today's
  //     column carries only a whisper of butter wash.
  //   - The toolbar controls follow the shared idioms: a segmented view
  //     toggle, a raised filter pill, and a sage plate for "New event".
  //
  // Calendar copy register per UI-SPEC §12e:
  //   - "New event" CTA (header)
  //   - "Edit event" Sheet title (handled in EventDetailPanel)
  //   - "Save event" + "Discard changes" + "Delete"button labels (per §12f)
  //   - "Google Calendar disconnected. Reconnect from Settings." (toast above)
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--canvas)]">
      {/* Title row — the dimensional CalendarIcon as the feature glyph, the
          route title, and a quiet metadata line for the in-view count. */}
      <header className="px-8 pt-10 pb-5">
        <div className="flex items-center gap-3">
          <CalendarIcon size={34} aria-hidden />
          <div className="flex flex-col gap-1">
            <h1 className="text-display font-semibold leading-none text-[var(--ink)]">
              Calendar<span className="text-[var(--tint-sky-edge)]">.</span>
            </h1>
            <p className="text-micro tabular-nums text-[var(--ink-faint)]">
              {displayEvents.length} event{displayEvents.length === 1 ? "" : "s"} in view
            </p>
          </div>
        </div>
      </header>

      {/* Toolbar — sits directly on the canvas (no plate); the view toggle,
          filter pill and New event plate each carry their own craft chrome. */}
      <div className="mx-8 mb-5 flex items-center justify-between gap-4">
        <DayWeekToggle
          view={view}
          onChange={setView}
          date={date}
          onDateChange={setDate}
        />
        <div className="flex items-center gap-3">
          <CalendarFilters calendars={calendars} />
          {/* "New event" CTA opens the create Sheet at the next round
              half-hour (parity with the Cmd+K ?create=now path). A sage
              plate: pastel fill, saturated rim, in-family ink. */}
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
            className="tint-sage inline-flex h-8 cursor-pointer-always items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] px-3 text-meta font-medium text-[var(--tint-ink)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--tint-edge)] hover:shadow-[var(--shadow-card-hover)]"
          >
            <Plus size={15} strokeWidth={2} aria-hidden />
            New event
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 mx-8 mb-8">
        <CalendarGrid
          events={displayEvents}
          view={view}
          date={date}
          onNavigate={setDate}
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
