"use client";

import { openDailyPage } from "@/app/actions/pages";
import { useTodayDailyPage } from "@/lib/pages/useTodayDailyPage";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "hp:daily-auto-opened";

// Routes that read as "I just opened the app" — the only surfaces we navigate
// away from on the day's first open. A deep-link into a specific working route
// (e.g. /tasks, /calendar) is left alone; today's page is still created
// silently so the pinned tab and calendar dot appear.
const ENTRY_PATHS = new Set<string>(["/today", "/lifeos", "/wiki"]);

/**
 * App-wide "first open of a new day" daily-page opener (issue #92, part 4).
 *
 * Mounted once in the AppShell so it runs on whatever route the user enters.
 * Once per calendar day (localStorage-gated, survives refreshes) it ensures
 * today's Daily Page exists — creating it idempotently if needed — then, only
 * from an entry surface, navigates to it so the morning lands in the journal.
 * Renders nothing.
 */
export function DailyAutoOpen({ userId }: { userId: string }) {
  const { todayIso, today, isReady } = useTodayDailyPage(userId);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !isReady) return;
    if (pathname.startsWith("/onboarding")) return;

    let last: string | null = null;
    try {
      last = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private-mode / disabled storage: fall through and just don't persist.
    }
    if (last === todayIso) {
      fired.current = true;
      return;
    }

    fired.current = true;
    try {
      localStorage.setItem(STORAGE_KEY, todayIso);
    } catch {
      // ignore
    }

    void (async () => {
      let id = today?.id ?? null;
      if (!id) {
        const r = await openDailyPage({ date: todayIso });
        if (r.success) id = r.data.id;
      }
      if (id && ENTRY_PATHS.has(pathname)) router.push(`/wiki/${id}`);
    })();
  }, [isReady, todayIso, today, pathname, router]);

  return null;
}
