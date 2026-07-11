"use client";

import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  JournalCardStagger,
  JournalTodayCard,
  JournalTrailCard,
} from "@/components/wiki/journal/JournalCards";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import { dailyDayClickAction } from "@/lib/pages/daily-page";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
    <section aria-label="Daily journal" className={cn("flex flex-col gap-2", className)}>
      {/* Section header — reuses the Explorer-section visual weight. */}
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          collapsed && "h-8 rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-2"
        )}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-left hover:bg-[var(--sd-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
          aria-expanded={!collapsed}
          aria-controls="journal-rail-body"
        >
          <span className="flex-shrink-0 text-[var(--sd-ink-faint)]">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <CalendarDays
            size={13}
            strokeWidth={1.5}
            className="flex-shrink-0 text-[var(--sd-ink-dull)]"
          />
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sd-ink-dull)]">
            Journal
          </span>
          {dailyPages.length > 0 && (
            <span className="font-mono text-[0.65rem] tabular-nums text-[var(--sd-ink-faint)]">
              {dailyPages.length}
            </span>
          )}
        </button>
        {!collapsed ? (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-2.5 text-[0.78rem] text-[var(--ink)] transition-colors duration-150 ease-out hover:bg-[var(--sd-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
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
        ) : null}
      </div>

      {/* The rail: today card + horizontal trail. Snap alignment on the scroll
          container so trail cards align cleanly when the user swipes/scrolls.
          First-mount only: 180ms staggered fade/slide-in per card. */}
      <AnimatePresence initial={false}>
        {!collapsed && collapseHydrated && (
          <motion.div
            id="journal-rail-body"
            key="rail-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "custom-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
              )}
            >
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
                <JournalCardStagger
                  key={entry.iso}
                  index={i}
                  disabled={prefersReducedMotion === true}
                >
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
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
