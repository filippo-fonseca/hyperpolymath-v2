"use client";

import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import { dailyDayClickAction, dailyPageTitle } from "@/lib/pages/daily-page";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays } from "date-fns";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

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
 * Wave-3 Journal rail. The editorial "reading room" that sits above the flat
 * Explorer: today's Daily Page as a large glass card with a live preview, then a
 * horizontal trail of the previous ~7 days, then an "earlier" affordance that
 * opens the full calendar in a popover. Glass + Garamond dates are appropriate
 * here per SPEC Doctrine-3 in deliberate contrast to the flat Explorer below.
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
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const dailyByDate = useMemo(
    () => new Map(dailyPages.map((d) => [d.dailyDate, d] as const)),
    [dailyPages],
  );
  const pageById = useMemo(
    () => new Map(allPages.map((p) => [p.id, p] as const)),
    [allPages],
  );
  const markedDays = useMemo(
    () => new Set(dailyPages.map((d) => d.dailyDate)),
    [dailyPages],
  );

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const trail: string[] = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i <= trailDays; i++) {
      out.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
    }
    return out;
  }, [trailDays]);

  const todayRef = dailyByDate.get(todayIso);
  const todayPage = todayRef ? pageById.get(todayRef.id) ?? null : null;

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
    <section
      aria-label="Daily journal"
      className={cn("flex flex-col gap-3", className)}
    >
      {/* Section header — reuses the Explorer-section visual weight. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays
            size={13}
            strokeWidth={1.5}
            className="flex-shrink-0 text-[var(--ink-muted)]"
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Journal
          </span>
          {dailyPages.length > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
              {dailyPages.length}
            </span>
          )}
        </div>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[var(--edge)] px-2.5 py-1 font-serif text-[12px] text-[var(--ink)] transition-colors duration-150 ease-out hover:bg-[var(--surface)]"
              aria-label="Open calendar"
            >
              <CalendarDays size={12} strokeWidth={1.5} />
              <span>Earlier</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[320px] p-3"
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
      </div>

      {/* The rail: today card + horizontal trail. Snap alignment on the scroll
          container so trail cards align cleanly when the user swipes/scrolls. */}
      <div
        className={cn(
          "custom-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2",
        )}
      >
        <JournalTodayCard
          iso={todayIso}
          page={todayPage}
          exists={!!todayRef}
          loading={openingDate === todayIso}
          onActivate={() => handleActivate(todayIso)}
        />
        {trail.map((iso) => {
          const ref = dailyByDate.get(iso);
          const page = ref ? pageById.get(ref.id) ?? null : null;
          return (
            <JournalTrailCard
              key={iso}
              iso={iso}
              page={page}
              exists={!!ref}
              loading={openingDate === iso}
              onActivate={() => handleActivate(iso)}
            />
          );
        })}
      </div>
    </section>
  );
}

interface JournalTodayCardProps {
  iso: string;
  page:
    | Pick<
        PageWithProjects,
        "id" | "title" | "content" | "contentJson" | "coverImageUrl"
      >
    | null;
  exists: boolean;
  loading: boolean;
  onActivate: () => void;
}

function JournalTodayCard({
  iso,
  page,
  exists,
  loading,
  onActivate,
}: JournalTodayCardProps) {
  const dayLabel = format(parseISO(iso), "EEEE, MMMM d");
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={loading}
      className={cn(
        "glass-tile group relative flex w-[320px] flex-shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-md p-3 text-left transition-shadow duration-150 ease-out disabled:cursor-progress",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)]",
      )}
      aria-label={`${exists ? "Open" : "Create"} today's daily page`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--hud-cyan)]">
            Today
          </span>
          <span className="truncate font-serif text-[16px] leading-tight text-[var(--ink)]">
            {dayLabel}
          </span>
        </div>
        <span
          aria-hidden
          className={cn(
            "mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full",
            exists ? "bg-[var(--hud-cyan)]" : "bg-[var(--ink-muted)]/40",
          )}
        />
      </div>
      {exists && page ? (
        <PagePreviewThumb
          page={{
            title: page.title,
            content: page.content,
            contentJson: page.contentJson,
            coverImageUrl: page.coverImageUrl,
          }}
          size="card"
          className="!rounded-md"
        />
      ) : (
        <EmptyDayPreview loading={loading} label={loading ? "Creating…" : "Create today's page"} />
      )}
    </button>
  );
}

interface JournalTrailCardProps {
  iso: string;
  page:
    | Pick<
        PageWithProjects,
        "id" | "title" | "content" | "contentJson" | "coverImageUrl"
      >
    | null;
  exists: boolean;
  loading: boolean;
  onActivate: () => void;
}

function JournalTrailCard({
  iso,
  page,
  exists,
  loading,
  onActivate,
}: JournalTrailCardProps) {
  const short = format(parseISO(iso), "EEE, MMM d");
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={loading}
      title={dailyPageTitle(iso)}
      className={cn(
        "group relative flex w-[176px] flex-shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-md border border-[var(--sd-line,var(--edge))] bg-[var(--sd-box,var(--surface))] p-2 text-left transition-colors duration-150 ease-out hover:border-[var(--hud-cyan)]/40 disabled:cursor-progress",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)]",
        exists ? undefined : "opacity-70",
      )}
      aria-label={`${exists ? "Open" : "Create"} daily page for ${dailyPageTitle(iso)}`}
    >
      {exists && page ? (
        <PagePreviewThumb
          page={{
            title: page.title,
            content: page.content,
            contentJson: page.contentJson,
            coverImageUrl: page.coverImageUrl,
          }}
          size="card"
          className="!rounded-sm"
        />
      ) : (
        <EmptyDayPreview loading={loading} />
      )}
      <div className="mt-2 flex items-center justify-between gap-1.5">
        <span className="truncate font-serif text-[12px] text-[var(--ink)]">
          {short}
        </span>
        {loading ? (
          <Loader2
            size={11}
            strokeWidth={1.5}
            className="flex-shrink-0 animate-spin text-[var(--ink-muted)]"
          />
        ) : exists ? null : (
          <Plus
            size={11}
            strokeWidth={1.5}
            className="flex-shrink-0 text-[var(--ink-muted)]"
          />
        )}
      </div>
    </button>
  );
}

function EmptyDayPreview({
  loading,
  label,
}: {
  loading: boolean;
  label?: string;
}) {
  return (
    <div
      className="flex aspect-[16/10] w-full items-center justify-center rounded-t-[8px] border border-dashed border-[var(--sd-line,var(--edge))] bg-[var(--sd-dark-box,var(--surface))] text-[var(--ink-muted)]"
      aria-hidden={!label}
    >
      {loading ? (
        <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <Plus size={14} strokeWidth={1.5} />
          {label ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
              {label}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
