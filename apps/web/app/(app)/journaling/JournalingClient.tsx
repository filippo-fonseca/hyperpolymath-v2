"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getJournalEntry, getJournalEntries } from "@/app/actions/journal";
import type { JournalEntry } from "@/app/actions/journal";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { DayNavigator } from "@/components/journaling/DayNavigator";
import { JournalEntryEditor } from "@/components/journaling/JournalEntryEditor";
import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { PageIcon } from "@/components/ui/icons";
import { useState } from "react";

interface Props {
  initialDate: string;
  initialEntry: JournalEntry | null;
  initialHistory: JournalEntry[];
  userId: string;
}

/**
 * JournalingClient — client orchestrator for the /journaling route.
 *
 * Data plane:
 *   - Day query: ["journaling", userId, selectedDate] → single entry for the
 *     active day. Seeded with initialEntry from the server loader.
 *   - History query: ["journaling", userId] → last 90 entries for the feed.
 *     Seeded with initialHistory from the server loader.
 *
 * Realtime: useTableSubscription("journal_entries") invalidates the entire
 * ["journaling", userId] prefix on any change so both day and history queries
 * refresh automatically.
 *
 * Layout:
 *   - Desktop (md+): two-column. Editor takes the left 3/5, history the right 2/5.
 *   - Mobile: single column, editor above history feed.
 */
export function JournalingClient({
  initialDate,
  initialEntry,
  initialHistory,
  userId,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const queryClient = useQueryClient();

  // ── Realtime invalidation ──────────────────────────────────────────────────
  // Any postgres_changes event on journal_entries invalidates the whole
  // ["journaling", userId] prefix so both queries below refetch.
  useTableSubscription("journal_entries", userId);

  // ── Day query ──────────────────────────────────────────────────────────────
  const { data: dayResult } = useQuery({
    queryKey: ["journaling", userId, selectedDate],
    queryFn: () => getJournalEntry({ date: selectedDate }),
    initialData:
      selectedDate === initialDate
        ? { success: true as const, data: initialEntry }
        : undefined,
    staleTime: 30_000,
  });

  // ── History query ──────────────────────────────────────────────────────────
  const { data: historyResult } = useQuery({
    queryKey: ["journaling", userId],
    queryFn: () => getJournalEntries({ limit: 90 }),
    initialData: { success: true as const, data: initialHistory },
    staleTime: 30_000,
  });

  const activeEntry = dayResult?.success ? dayResult.data : null;
  const history = historyResult?.success ? historyResult.data : initialHistory;

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    // Prefetch the day entry when navigating so the editor shows instantly
    // on subsequent visits to the same date.
    void queryClient.prefetchQuery({
      queryKey: ["journaling", userId, date],
      queryFn: () => getJournalEntry({ date }),
    });
  }

  return (
    <main
      className="flex min-h-full flex-col gap-5 p-4 md:p-6"
      style={{ background: "var(--sd-app)" }}
    >
      {/* Page header — sd title row: dimensional icon + mono eyebrow + title. */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PageIcon size={34} kind="daily" title="Journal" />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
              Daily log
            </span>
            <h1 className="text-[22px] font-semibold leading-none tracking-[-0.01em] text-[var(--sd-ink)]">
              Journal<span className="text-[var(--sd-accent)]">.</span>
            </h1>
          </div>
        </div>
        <DayNavigator date={selectedDate} onChange={handleSelectDate} />
      </div>

      {/* Two-column on md+: editor left, calendar sidebar right */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_260px] md:gap-5 md:items-start">
        {/* key={selectedDate} remounts the editor on every date change so local
            textarea state never lingers from the previous day */}
        <JournalEntryEditor key={selectedDate} date={selectedDate} entry={activeEntry} />

        {/* Calendar sidebar — month/week/year views, sd-tokenized day cells */}
        <JournalCalendar
          selectedDate={selectedDate}
          entries={history}
          onSelectDate={handleSelectDate}
        />
      </div>
    </main>
  );
}
