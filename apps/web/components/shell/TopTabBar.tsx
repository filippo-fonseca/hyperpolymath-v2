"use client";

import { openDailyPage } from "@/app/actions/pages";
import { JarvisUnreadBadge } from "@/components/jarvis/JarvisUnreadBadge";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { useTodayDailyPage } from "@/lib/pages/useTodayDailyPage";
import { sfx } from "@/lib/ui/sfx";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Columns2, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { NavArrows } from "./NavArrows";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const STORAGE_KEY = "top-tab-last-route";
// Mirror of today's daily-page route, written here so GlobalHotkeys can route
// Ctrl+3 to it without re-querying.
const TODAY_ROUTE_KEY = "top-tab-today-route";

const ROUTE_META: Record<string, { label: string }> = {
  "/lifeos": { label: "LifeOS" },
  "/tasks": { label: "Tasks" },
  "/review": { label: "Review" },
  "/habits": { label: "Habits" },
  "/training": { label: "Training" },
  "/nutrition": { label: "Nutrition" },
  "/captures": { label: "Captures" },
  "/calendar": { label: "Calendar" },
  "/graph": { label: "Graph" },
  "/insights": { label: "Insights" },
  "/settings": { label: "Settings" },
  "/journaling": { label: "Journal" },
  "/areas": { label: "Areas" },
  "/people": { label: "People" },
};

function metaForPath(pathname: string): { label: string } {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  const segs = pathname.split("/").filter(Boolean);
  while (segs.length > 0) {
    const candidate = "/" + segs.join("/");
    if (ROUTE_META[candidate]) return ROUTE_META[candidate];
    segs.pop();
  }
  const first = pathname.split("/").filter(Boolean)[0] ?? "Page";
  return { label: first.charAt(0).toUpperCase() + first.slice(1) };
}

/**
 * TopTabBar — the Craft top bar (aug-04 craft-ui-v2; keeps the historical
 * filename and export).
 *
 * The full-width segmented tabs are gone: navigation lives in the sidebar,
 * which already lists every route. What remains is Craft's transparent bar on
 * the canvas above the sheet — no fill, no border, no shadow — with three
 * quiet zones:
 *
 *   left    NavArrows plus the current route title as breadcrumb text
 *   center  a craft-pill "Open anything…" field that opens the CommandMenu
 *   right   JARVIS console button (with the unread badge) and the
 *           split-screen toggle as small ghost icon buttons
 *
 * The localStorage bridges survive the restyle untouched, because
 * GlobalHotkeys still reads them: `top-tab-last-route` feeds Ctrl+1 (last
 * non-JARVIS route) and `top-tab-today-route` feeds Ctrl+3 (today's daily
 * page). Ctrl+2 → JARVIS needs no bridge. The split-screen mechanics are the
 * same as the tab era: enabling split from the console first pushes the main
 * route back to the last non-JARVIS route so the two panes never both render
 * the console.
 */
export function TopTabBar({ userId }: { userId: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { splitOn, setSplitOn } = useSplitScreen();
  const { today, todayIso } = useTodayDailyPage(userId);
  const queryClient = useQueryClient();
  const [openingToday, startOpeningToday] = useTransition();

  const [lastRoute, setLastRoute] = useState<string>(FALLBACK_LEFT_PATH);

  // Today's daily page keeps its dedicated shortcut (issue #92, part 3). Like
  // JARVIS, its route must not be remembered as the "last left route" or the
  // Ctrl+1 target and the Ctrl+3 target would collapse onto one another.
  const todayPath = today ? `/wiki/${today.id}` : null;
  const onToday = todayPath !== null && pathname === todayPath;

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setLastRoute(stored);
  }, []);

  useEffect(() => {
    if (pathname && pathname !== JARVIS_PATH && pathname !== todayPath) {
      setLastRoute(pathname);
      localStorage.setItem(STORAGE_KEY, pathname);
    }
  }, [pathname, todayPath]);

  // Expose today's route to GlobalHotkeys (Ctrl+3) via the same localStorage
  // bridge the last-route swap uses.
  useEffect(() => {
    try {
      if (todayPath) localStorage.setItem(TODAY_ROUTE_KEY, todayPath);
      else localStorage.removeItem(TODAY_ROUTE_KEY);
    } catch {
      // ignore
    }
  }, [todayPath]);

  const onJarvis = pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const title = onJarvis ? "JARVIS" : onToday ? "Today" : metaForPath(pathname).label;

  // Soft "pop" when the active feature actually changes — not on drill-in
  // navigations within a feature (e.g. /tasks → /tasks/123) or first mount.
  const tabKey = onJarvis ? "jarvis" : onToday ? "today" : metaForPath(pathname).label;
  const prevTabKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevTabKey.current !== null && prevTabKey.current !== tabKey) {
      sfx.play("viewToggle");
    }
    prevTabKey.current = tabKey;
  }, [tabKey]);

  if (pathname.startsWith("/onboarding")) return null;

  // Split-screen toggle that works from anywhere. The side panel only renders
  // when the main route is NOT JARVIS (otherwise two JARVIS consoles would
  // stack). So when enabling split from the console, push main to the last
  // non-JARVIS route — that becomes the left pane, JARVIS occupies the right
  // pane via the side panel.
  const onSplitToggle = () => {
    if (splitOn) {
      setSplitOn(false);
      return;
    }
    if (onJarvis) {
      router.push(lastRoute);
    }
    setSplitOn(true);
  };

  // The pill opens the existing CommandMenu the same way the global hotkey
  // does: CommandMenu holds nothing but a document-level Cmd+Shift+K listener
  // and its open flag, so a synthetic keydown IS the public API — no second
  // store, no duplicated state.
  // Today's page may not exist yet (the auto-open only fires on some routes),
  // so this is a button rather than a Link: it creates the page on demand via
  // the same idempotent action, then navigates. When the page already exists
  // the query cache has it and this is one click to a known route.
  const goToToday = () => {
    if (todayPath) {
      router.push(todayPath);
      return;
    }
    startOpeningToday(async () => {
      const res = await openDailyPage({ date: todayIso });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["daily-pages", userId] });
      router.push(`/wiki/${res.data.id}`);
    });
  };

  const openCommandMenu = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <div aria-label="Top bar" className="mb-1 flex h-11 w-full shrink-0 items-center gap-2 px-2">
      {/* Left — history arrows plus the current route as quiet breadcrumb
          text. Both side zones are flex-1 so the pill stays truly centered. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <NavArrows />
        <span className="truncate text-meta font-medium text-[var(--ink-muted)]">{title}</span>
      </div>

      {/* Center — the Craft cmd-K pill. A button dressed as a search field;
          clicking it opens the command palette. */}
      <button
        type="button"
        onClick={openCommandMenu}
        aria-label="Open anything (⌘⇧K)"
        className={cn(
          "craft-pill flex h-8 w-full min-w-0 max-w-[420px] shrink items-center gap-2 px-3.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
        )}
      >
        <Search size={13} strokeWidth={1.75} className="shrink-0 text-[var(--ink-faint)]" />
        <span className="min-w-0 flex-1 truncate text-meta text-[var(--ink-faint)]">
          Open anything…
        </span>
        <kbd
          className="pointer-events-none hidden shrink-0 text-micro text-[var(--ink-faint)] md:inline"
          aria-hidden
        >
          ⌘⇧K
        </kbd>
      </button>

      {/* Right — the bar's utilities as small ghost icon buttons. */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <button
          type="button"
          onClick={goToToday}
          disabled={openingToday}
          aria-label="Open today's daily page"
          title="Today's daily page (⌃3)"
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            "transition-colors duration-[160ms] ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
            openingToday && "opacity-50",
            onToday
              ? "bg-[color-mix(in_oklch,var(--sd-accent)_14%,transparent)] text-[var(--sd-accent)]"
              : "text-[var(--sd-ink-faint)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
          )}
        >
          <CalendarDays size={13} strokeWidth={1.75} />
        </button>

        <Link
          href={JARVIS_PATH}
          data-tour="top-tab-jarvis"
          aria-label="Open the JARVIS console"
          title="JARVIS console (⌃2)"
          className={cn(
            "flex h-7 shrink-0 items-center rounded-lg px-1.5",
            "text-[var(--sd-ink-faint)] transition-colors duration-[160ms] ease-out",
            "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
            onJarvis && "text-[var(--sd-ink)]"
          )}
        >
          <KiwiIcon size={15} aria-hidden="true" />
          <JarvisUnreadBadge />
        </Link>

        <div className="shrink-0" data-tour="top-split-toggle">
          <SplitToggle on={splitOn} onClick={onSplitToggle} />
        </div>
      </div>
    </div>
  );
}

function SplitToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "Exit split screen" : "Enter split screen"}
      title={on ? "Exit split screen" : "Split screen with JARVIS"}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg",
        "transition-colors duration-[160ms] ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        on
          ? "bg-[color-mix(in_oklch,var(--sd-accent)_14%,transparent)] text-[var(--sd-accent)]"
          : "text-[var(--sd-ink-faint)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
      )}
    >
      <Columns2 size={13} strokeWidth={1.75} />
    </button>
  );
}
