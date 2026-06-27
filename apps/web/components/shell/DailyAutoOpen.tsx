"use client";

import { openDailyPage } from "@/app/actions/pages";
import { useTodayDailyPage } from "@/lib/pages/useTodayDailyPage";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * App-wide "ensure today's Daily Page" opener (issue #92, part 4).
 *
 * Mounted once in the AppShell so it runs on whatever route the user enters.
 * On each app load (a refresh remounts it), once the daily-page list is ready:
 * if today's Daily Page does NOT yet exist, it is created idempotently and the
 * user is navigated to it — from any route. Once today's page exists, a refresh
 * leaves the user wherever they are. Renders nothing.
 */
export function DailyAutoOpen({ userId }: { userId: string }) {
  const { todayIso, today, isReady } = useTodayDailyPage(userId);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !isReady) return;
    if (pathname.startsWith("/onboarding")) return;

    // Today's Daily Page already exists — the user "has one", so leave them be.
    if (today) {
      fired.current = true;
      return;
    }

    fired.current = true;
    void (async () => {
      const r = await openDailyPage({ date: todayIso });
      if (r.success) router.push(`/wiki/${r.data.id}`);
    })();
  }, [isReady, todayIso, today, pathname, router]);

  return null;
}
