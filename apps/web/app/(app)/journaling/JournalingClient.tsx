"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getJournalEntry, getJournalEntries } from "@/app/actions/journal";
import type { JournalEntry } from "@/app/actions/journal";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { DayNavigator } from "@/components/journaling/DayNavigator";
import { JournalEntryEditor } from "@/components/journaling/JournalEntryEditor";
import { JournalHistoryFeed } from "@/components/journaling/JournalHistoryFeed";
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
    <main className="flex flex-col gap-4 p-4 md:p-6 min-h-full bg-[var(--canvas)]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-[22px] font-semibold text-[var(--ink)]">
          Journal
        </h1>
        <DayNavigator date={selectedDate} onChange={handleSelectDate} />
      </div>

      {/* Two-column on md+, single column on mobile */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[3fr_2fr] md:gap-6 md:items-start">
        {/* Left: editor */}
        <JournalEntryEditor date={selectedDate} entry={activeEntry} />

        {/* Right: history feed */}
        <JournalHistoryFeed
          entries={history}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </div>
    </main>
  );
}
