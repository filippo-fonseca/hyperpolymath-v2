"use client";

import { todayISO } from "@/lib/habits/dates";
import { useEffect, useState } from "react";

/**
 * The client's local date, kept honest across midnight.
 *
 * A focus listener alone is fine for a page you navigate to and fatal for a
 * dock widget that sits on screen for eighteen hours, so this hook also arms a
 * real timer that fires a few seconds past local midnight. The timer is
 * guarded: if it fires while the tab is hidden it re-arms without updating
 * (nothing is watching), and the `visibilitychange` listener performs the
 * missed sync the moment the tab wakes.
 *
 * Every habits query keys on this value, so a date change rolls every surface
 * over to the new day's cache entries at once.
 */
export function useLocalToday(): string {
  const [today, setToday] = useState<string>(() => todayISO());

  useEffect(() => {
    let timer: number | undefined;

    const sync = () => {
      setToday((prev) => {
        const now = todayISO();
        return prev === now ? prev : now;
      });
    };

    const arm = () => {
      const now = new Date();
      const next = new Date(now);
      // 5s past midnight, so a clock landing exactly on 00:00:00 cannot
      // compute "today" as the day it just left.
      next.setHours(24, 0, 5, 0);
      timer = window.setTimeout(() => {
        if (!document.hidden) sync();
        arm();
      }, next.getTime() - now.getTime());
    };

    const onVisible = () => {
      if (!document.hidden) sync();
    };

    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    arm();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
