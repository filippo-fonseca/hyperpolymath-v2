"use client";

import { getDailyPagesForCurrentUser } from "@/app/actions/pages";
import type { DailyPageRef } from "@/lib/db/queries/pages";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo } from "react";

/**
 * App-wide accessor for today's Daily Page. Shares the same TanStack Query key
 * (`["daily-pages", userId]`) the Wiki home seeds from SSR, so the pinned tab,
 * the auto-open, and the Wiki calendar all read one cache. Off the Wiki route
 * the query fetches lazily on first mount; on it, it's already hydrated.
 */
export function useTodayDailyPage(userId: string): {
  todayIso: string;
  today: DailyPageRef | undefined;
  isReady: boolean;
} {
  const { data: dailyPages = [], isSuccess } = useQuery<DailyPageRef[]>({
    queryKey: ["daily-pages", userId],
    queryFn: () => getDailyPagesForCurrentUser(),
  });

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const today = useMemo(
    () => dailyPages.find((d) => d.dailyDate === todayIso),
    [dailyPages, todayIso],
  );

  return { todayIso, today, isReady: isSuccess };
}
