"use client";

import { openDailyPage } from "@/app/actions/pages";
import type { DailyPageRef } from "@/lib/db/queries/pages";
import { shouldEnsureTodayDailyPage } from "@/lib/pages/daily-page";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useRef } from "react";

/**
 * Wave-3 (WIKI-DAILY-03): ensure today's Daily Page exists WITHOUT navigating.
 *
 * Mounted on the Wiki home so landing there guarantees the Journal rail has a
 * "today" row to render. Coordinates with `DailyAutoOpen` via the shared partial
 * unique index — if that hook already created + redirected, coming back to /wiki
 * finds today in the cache and this hook no-ops. If DailyAutoOpen was skipped
 * (e.g. user was on /onboarding then routed here), this hook creates the row
 * quietly and invalidates the daily-pages cache so the rail rerenders.
 *
 * Fires at most once per mount per calendar day.
 */
export function useEnsureTodayDailyPage(
  userId: string,
  dailyPages: DailyPageRef[],
  dailyFetched: boolean,
): void {
  const queryClient = useQueryClient();
  const firedForDate = useRef<string | null>(null);

  useEffect(() => {
    const todayIso = format(new Date(), "yyyy-MM-dd");
    const todayExists = dailyPages.some((d) => d.dailyDate === todayIso);
    const hasFiredForDate = firedForDate.current === todayIso;

    if (
      !shouldEnsureTodayDailyPage({ dailyFetched, todayExists, hasFiredForDate })
    ) {
      return;
    }

    firedForDate.current = todayIso;
    void (async () => {
      const r = await openDailyPage({ date: todayIso });
      if (r.success) {
        queryClient.invalidateQueries({ queryKey: ["daily-pages", userId] });
      } else {
        // Let the next mount retry: clear the fired flag if the write failed.
        firedForDate.current = null;
      }
    })();
  }, [userId, dailyPages, dailyFetched, queryClient]);
}
