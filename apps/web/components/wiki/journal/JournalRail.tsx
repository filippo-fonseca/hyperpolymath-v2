"use client";

import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { Rail } from "@/components/ui/explorer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  JournalCardStagger,
  JournalTodayCard,
  JournalTrailCard,
} from "@/components/wiki/journal/JournalCards";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import { dailyDayClickAction } from "@/lib/pages/daily-page";
import { format, subDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import "./journal-rail.css";

/** localStorage key for the rail's persisted collapse state. */
const RAIL_COLLAPSE_KEY = "wiki:journal-rail";

/** Read the persisted collapse state; defaults to expanded. */
function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_COLLAPSE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // localStorage disabled — collapse still works this session, just not persisted.
  }
}

export interface JournalRailProps {
  /** Full page rows so cards can render live previews via `PagePreviewThumb`. */
  allPages: Pick<
    PageWithProjects,
    "id" | "title" | "content" | "contentJson" | "coverImageUrl" | "dailyDate"
  >[];
  dailyPages: DailyPageRef[];
  /** Route to an existing daily page. Never called with a missing id. */
  onOpenPage: (pageId: string) => void;
  /** Ensure-and-open a daily page for the given date (creates if missing). */
  onCreateForDate: (isoDate: string) => Promise<void> | void;
  /** Which date's action is currently in flight, if any. */
  openingDate: string | null;
  /** Number of previous days (excluding today) to show in the trail. */
  trailDays?: number;
  className?: string;
}

/**
 * Daily journal rail on the same compact Spacedrive surface ladder as Explorer.
 * Garamond survives only inside the cards as editorial date typography.
 */
export function JournalRail({
  allPages,
  dailyPages,
  onOpenPage,
  onCreateForDate,
  openingDate,
  trailDays = 7,
  className,
}: JournalRailProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  // Collapse is persisted in localStorage["wiki:journal-rail"]. We start
  // expanded to avoid an SSR/CSR mismatch, then reconcile once on mount.
  const [collapsed, setCollapsed] = useState(false);
  const [collapseHydrated, setCollapseHydrated] = useState(false);
  useEffect(() => {
    setCollapsed(readCollapsed());
    setCollapseHydrated(true);
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }

  const prefersReducedMotion = useReducedMotion();

  const dailyByDate = useMemo(
    () => new Map(dailyPages.map((d) => [d.dailyDate, d] as const)),
    [dailyPages]
  );
  const pageById = useMemo(() => new Map(allPages.map((p) => [p.id, p] as const)), [allPages]);
  const markedDays = useMemo(() => new Set(dailyPages.map((d) => d.dailyDate)), [dailyPages]);

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const trail: string[] = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i <= trailDays; i++) {
      out.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
    }
    return out;
  }, [trailDays]);

  const todayRef = dailyByDate.get(todayIso);
  const todayPage = todayRef ? (pageById.get(todayRef.id) ?? null) : null;

  function handleActivate(iso: string) {
    const ref = dailyByDate.get(iso);
    const action = dailyDayClickAction(iso, ref?.id);
    if (action.kind === "route") onOpenPage(action.pageId);
    else void onCreateForDate(iso);
  }

  function handleCalendarSelect(iso: string) {
    setSelectedDate(iso);
    const ref = dailyByDate.get(iso);
    if (ref) {
      setCalendarOpen(false);
      onOpenPage(ref.id);
    } else {
      // Empty past date — mirror existing dailyDayClickAction semantics: offer
      // creation. We close the popover after firing so the rail regains focus.
      setCalendarOpen(false);
      void onCreateForDate(iso);
    }
  }

  return (
    <Rail
      label="Daily journal"
      className={className}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      hydrated={collapseHydrated}
      bodyId="journal-rail-body"
      icon={
        <CalendarDays
          size={13}
          strokeWidth={1.5}
          className="flex-shrink-0 text-[var(--sd-ink-dull)]"
        />
      }
      title="Journal"
      count={dailyPages.length > 0 ? dailyPages.length : undefined}
      headerAccessory={
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 cursor-pointer items-center gap-2 rounded-lg bg-[var(--sd-box)] px-3 text-meta text-[var(--ink)] transition-colors duration-[160ms] ease-out hover:bg-[var(--sd-hover)]"
              aria-label="Open calendar"
            >
              <CalendarDays size={12} strokeWidth={1.5} />
              <span>Earlier</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="journal-calendar-popover w-[320px] p-3"
            sideOffset={6}
          >
            <JournalCalendar
              selectedDate={selectedDate}
              markedDates={markedDays}
              onSelectDate={handleCalendarSelect}
              ariaLabel="Daily Pages calendar"
            />
          </PopoverContent>
        </Popover>
      }
    >
      {/* The rail body: today card + horizontal trail. Snap alignment on the
          scroll container so trail cards align cleanly when the user
          swipes/scrolls. First-mount only: 180ms staggered fade/slide-in per
          card. */}
      <div className="custom-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {[
          { iso: todayIso, isToday: true, ref: todayRef, page: todayPage },
          ...trail.map((iso) => {
            const ref = dailyByDate.get(iso);
            return {
              iso,
              isToday: false,
              ref,
              page: ref ? (pageById.get(ref.id) ?? null) : null,
            };
          }),
        ].map((entry, i) => (
          <JournalCardStagger key={entry.iso} index={i} disabled={prefersReducedMotion === true}>
            {entry.isToday ? (
              <JournalTodayCard
                iso={entry.iso}
                page={entry.page ?? null}
                exists={!!entry.ref}
                loading={openingDate === entry.iso}
                onActivate={() => handleActivate(entry.iso)}
              />
            ) : (
              <JournalTrailCard
                iso={entry.iso}
                page={entry.page ?? null}
                exists={!!entry.ref}
                loading={openingDate === entry.iso}
                onActivate={() => handleActivate(entry.iso)}
              />
            )}
          </JournalCardStagger>
        ))}
      </div>
    </Rail>
  );
}
