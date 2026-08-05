"use client";

import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { dailyPageTitle } from "@/lib/pages/daily-page";
import { extractPreviewModel } from "@/lib/pages/preview";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { motion } from "motion/react";

type JournalPage = Pick<
  PageWithProjects,
  "id" | "title" | "content" | "contentJson" | "coverImageUrl"
> | null;

export function JournalCardStagger({
  children,
  index,
  disabled,
}: {
  children: React.ReactNode;
  index: number;
  disabled: boolean;
}) {
  if (disabled) return <div className="contents">{children}</div>;
  // SDC-1 §2.7: enter is 220ms on --ease-out-quart, stagger min(i, 12) * 20ms.
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1], delay: Math.min(index, 12) * 0.02 }}
      className="flex"
    >
      {children}
    </motion.div>
  );
}

interface JournalCardProps {
  iso: string;
  page: JournalPage;
  exists: boolean;
  loading: boolean;
  onActivate: () => void;
}

export function JournalTodayCard({ iso, page, exists, loading, onActivate }: JournalCardProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={loading}
      className={cn(
        // aug-04 craft-ui-v2: white craft card; today reads through the
        // sky-tinted day tile ([data-today]), not an accent badge.
        "craft-card craft-card-hover group relative flex w-[300px] flex-shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-xl p-3 text-left",
        "disabled:cursor-progress"
      )}
      aria-label={`${exists ? "Open" : "Create"} today's daily page`}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <JournalDayTile iso={iso} today />
        <span className="min-w-0 truncate font-sans text-body font-medium text-[var(--ink)]">
          {format(parseISO(iso), "EEEE, MMMM d")}
        </span>
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
          className="!rounded-lg"
        />
      ) : (
        <EmptyToday loading={loading} />
      )}
    </button>
  );
}

export function JournalTrailCard({ iso, page, exists, loading, onActivate }: JournalCardProps) {
  const preview = previewLine(page, exists);
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={loading}
      title={dailyPageTitle(iso)}
      className={cn(
        // aug-04 craft-ui-v2: white craft cards; the day marker is a
        // .craft-day-tile (Craft's agenda grammar) and days without an entry
        // just read quieter through their preview line.
        "craft-card craft-card-hover group relative flex w-[132px] flex-shrink-0 snap-start cursor-pointer flex-col rounded-xl p-2.5 text-left",
        "disabled:cursor-progress"
      )}
      aria-label={`${exists ? "Open" : "Create"} daily page for ${dailyPageTitle(iso)}`}
    >
      <JournalDayTile iso={iso} />
      <span
        className={cn(
          "mt-2 line-clamp-2 text-micro",
          exists ? "text-[var(--sd-ink-dull)]" : "text-[var(--sd-ink-faint)]"
        )}
      >
        {preview}
      </span>
      <span className="mt-auto flex h-4 items-end justify-end pt-1 text-[var(--sd-ink-faint)]">
        {loading ? <Loader2 size={11} className="animate-spin motion-reduce:animate-none" /> : null}
        {!loading && !exists ? <Plus size={11} /> : null}
      </span>
    </button>
  );
}

/**
 * The agenda day marker (register v2 `.craft-day-tile`): date over weekday on a
 * canvas-gray tile; today swaps to the sky pastel via `[data-today]`.
 */
function JournalDayTile({ iso, today }: { iso: string; today?: boolean }) {
  const date = parseISO(iso);
  return (
    <span className="craft-day-tile shrink-0 self-start" data-today={today ? "true" : undefined}>
      <span className="font-sans text-subtitle font-semibold leading-none tabular-nums">
        {format(date, "d")}
      </span>
      <span className="font-sans text-micro leading-none">{format(date, "EEE")}</span>
    </span>
  );
}

function previewLine(page: JournalPage, exists: boolean): string {
  if (!page) return exists ? "Daily entry" : "No entry yet";
  const block = extractPreviewModel(page.contentJson, page.content, {
    maxBlocks: 1,
    maxChars: 72,
  }).blocks[0];
  return block && "text" in block && block.text ? block.text : page.title || "Daily entry";
}

function EmptyToday({ loading }: { loading: boolean }) {
  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed border-[var(--edge-strong)] bg-[var(--surface)] text-[var(--sd-ink-faint)]">
      {loading ? (
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <span className="flex items-center gap-2 text-meta">
          <Plus size={14} /> Create today&apos;s page
        </span>
      )}
    </div>
  );
}
