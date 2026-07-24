"use client";

/**
 * Calendar cleanup — select overdue events and/or events in a date range,
 * then archive them (delete from Google Calendar; gcal is source of truth).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, subDays } from "date-fns";
import { Archive, Check, X } from "lucide-react";
import { toast } from "sonner";

import { bulkArchiveEvents, listEventsForUser } from "@/app/actions/gcal-events";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  calendarIds: string[];
  onArchived?: () => void;
}

function eventKey(e: Pick<GcalEventDTO, "calendarId" | "id">): string {
  return `${e.calendarId}::${e.id}`;
}

function eventStartMs(e: GcalEventDTO): number {
  if (e.allDay) return new Date(`${e.start.slice(0, 10)}T00:00:00`).getTime();
  return new Date(e.start).getTime();
}

export function CalendarCleanupPanel({
  open,
  onOpenChange,
  userId,
  calendarIds,
  onArchived,
}: Props) {
  const today = startOfDay(new Date());
  const [rangeFrom, setRangeFrom] = useState(() => format(subDays(today, 30), "yyyy-MM-dd"));
  const [rangeTo, setRangeTo] = useState(() => format(today, "yyyy-MM-dd"));
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setConfirm(false);
    }
  }, [open]);

  const timeMin = useMemo(() => `${rangeFrom}T00:00:00.000Z`, [rangeFrom]);
  const timeMax = useMemo(() => `${rangeTo}T23:59:59.999Z`, [rangeTo]);

  const { data: events = [], isFetching, refetch } = useQuery({
    queryKey: ["calendar-cleanup", userId, calendarIds.join(","), timeMin, timeMax],
    enabled: open && calendarIds.length > 0,
    queryFn: async () => {
      const res = await listEventsForUser({
        calendarIds,
        timeMin,
        timeMax,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to load events");
        return [] as GcalEventDTO[];
      }
      return res.data;
    },
    staleTime: 15_000,
  });

  const nowMs = Date.now();
  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        const endMs = e.allDay
          ? new Date(`${(e.end ?? e.start).slice(0, 10)}T23:59:59`).getTime()
          : new Date(e.end || e.start).getTime();
        if (onlyOverdue && endMs >= nowMs) return false;
        return true;
      })
      .sort((a, z) => eventStartMs(a) - eventStartMs(z));
  }, [events, onlyOverdue, nowMs]);

  const allKeys = useMemo(() => filtered.map(eventKey), [filtered]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(allKeys));
  }, [allSelected, allKeys]);

  const archiveSelected = useCallback(() => {
    const items = filtered
      .filter((e) => selected.has(eventKey(e)))
      .map((e) => ({ calendarId: e.calendarId, eventId: e.id }));
    if (items.length === 0) return;
    startTransition(async () => {
      const res = await bulkArchiveEvents({ items });
      if (!res.success) {
        toast.error(res.error ?? "Archive failed");
        return;
      }
      toast.success(
        `Archived ${res.data.archived} event${res.data.archived === 1 ? "" : "s"} from Google Calendar.`,
      );
      setSelected(new Set());
      setConfirm(false);
      await refetch();
      onArchived?.();
    });
  }, [filtered, selected, refetch, onArchived]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--sd-line)]">
          <DialogTitle className="font-sans text-[16px] flex items-center gap-2">
            <Archive size={16} strokeWidth={1.75} />
            Archive calendar events
          </DialogTitle>
          <DialogDescription className="font-sans text-[13px] text-[var(--sd-ink-muted)]">
            Select overdue events or everything in a date range, then remove them
            from Google Calendar. This cannot be undone from here.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 flex flex-wrap items-end gap-3 border-b border-[var(--sd-line)]">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
              From
            </span>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-8 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-2 font-sans text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
              To
            </span>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-8 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-2 font-sans text-[13px]"
            />
          </label>
          <button
            type="button"
            aria-pressed={onlyOverdue}
            onClick={() => setOnlyOverdue((v) => !v)}
            className={cn(
              "h-8 rounded-[6px] border px-2.5 font-mono text-[11px] uppercase tracking-[0.06em] cursor-pointer-always",
              onlyOverdue
                ? "border-[var(--ink-coral)] text-[var(--ink-coral)]"
                : "border-[var(--sd-line)] text-[var(--sd-ink-muted)]",
            )}
          >
            Overdue only
          </button>
          <button
            type="button"
            onClick={selectAll}
            disabled={filtered.length === 0}
            className="ml-auto h-8 rounded-[6px] border border-[var(--sd-line)] px-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-muted)] cursor-pointer-always disabled:opacity-40"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {isFetching && filtered.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--sd-ink-faint)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--sd-ink-faint)]">
              No events match this range.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((e) => {
                const key = eventKey(e);
                const checked = selected.has(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-[6px] border px-2.5 py-2 text-left cursor-pointer-always",
                        "transition-colors duration-[120ms]",
                        checked
                          ? "border-[var(--sd-accent)] bg-[color-mix(in_oklch,var(--sd-accent)_10%,transparent)]"
                          : "border-[var(--sd-line)] hover:border-[var(--sd-accent)]/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 items-center justify-center rounded border",
                          checked
                            ? "border-[var(--sd-accent)] bg-[var(--sd-accent)] text-[var(--sd-bg)]"
                            : "border-[var(--sd-line)]",
                        )}
                      >
                        {checked ? <Check size={10} strokeWidth={2.5} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-sans text-[13px] text-[var(--sd-ink)] truncate">
                          {e.title || "(untitled)"}
                        </span>
                        <span className="block font-mono text-[10px] text-[var(--sd-ink-faint)]">
                          {e.allDay
                            ? e.start.slice(0, 10)
                            : format(new Date(e.start), "MMM d · h:mm a")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-[var(--sd-line)] flex-row items-center justify-between sm:justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <X size={14} className="mr-1" />
              Close
            </Button>
            {confirm ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirm(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={archiveSelected}
                  disabled={pending || selected.size === 0}
                  className="bg-[var(--ink-coral)] text-white hover:opacity-90"
                >
                  Confirm archive
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => setConfirm(true)}
                disabled={selected.size === 0 || pending}
              >
                <Archive size={14} className="mr-1" />
                Archive selected
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
