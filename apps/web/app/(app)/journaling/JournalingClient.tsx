"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getJournalEntry, getJournalEntries } from "@/app/actions/journal";
import type { JournalEntry } from "@/app/actions/journal";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { DayNavigator } from "@/components/journaling/DayNavigator";
import { JournalEntryEditor } from "@/components/journaling/JournalEntryEditor";
import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { PageIcon } from "@/components/ui/icons";
import { useMemo, useState } from "react";

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
 * Layout (jul-29 craft restyle): the shared PageScaffold owns the measure, the
 * gutter and the header rhythm, so /journaling lines up with every other route.
 * Below it, a two-column band on md+ — the composer card on the left, the
 * calendar sidebar on the right — collapsing to a single column on mobile.
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

  // Written-days count for the meta row. Entries with no prose are rows the
  // export toggle created, so they do not count as "written".
  const writtenCount = useMemo(
    () => history.filter((e) => (e.mainResponse ?? "").trim().length > 0).length,
    [history]
  );

  return (
    <PageScaffold
      eyebrow="Daily log"
      icon={<PageIcon size={28} kind="daily" title="Journal" />}
      title="Journal"
      subtitle="One question a day, answered in your own words."
      meta={
        <PageScaffold.MetaRow>
          {[
            <span key="entries" className="tabular-nums">
              {writtenCount} {writtenCount === 1 ? "entry" : "entries"}
            </span>,
            <span key="window">Last 90 days</span>,
          ]}
        </PageScaffold.MetaRow>
      }
      actions={<DayNavigator date={selectedDate} onChange={handleSelectDate} />}
    >
      <PageScaffold.Section>
        {/* Two-column on md+: composer left, calendar sidebar right */}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_268px] md:items-start md:gap-5">
          {/* key={selectedDate} remounts the editor on every date change so local
              textarea state never lingers from the previous day */}
          <JournalEntryEditor key={selectedDate} date={selectedDate} entry={activeEntry} />

          {/* Calendar sidebar — month/week/year views, pastel written days */}
          <JournalCalendar
            selectedDate={selectedDate}
            entries={history}
            onSelectDate={handleSelectDate}
          />
        </div>
      </PageScaffold.Section>
    </PageScaffold>
  );
}
