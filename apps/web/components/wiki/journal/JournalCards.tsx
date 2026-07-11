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
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut", delay: Math.min(index, 24) * 0.01 }}
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
        "group relative flex w-[300px] flex-shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-[8px] border border-[var(--sd-accent)] bg-[var(--sd-box)] p-3 text-left",
        "transition-colors duration-150 ease-out hover:bg-[var(--sd-hover)] disabled:cursor-progress",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
      )}
      aria-label={`${exists ? "Open" : "Create"} today's daily page`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-serif text-[16px] leading-tight text-[var(--ink)]">
          {format(parseISO(iso), "EEEE, MMMM d")}
        </span>
        <span className="rounded-full bg-[var(--sd-accent)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white">
          Today
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
          className="!rounded-[6px]"
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
        "group relative flex w-[120px] flex-shrink-0 snap-start cursor-pointer flex-col rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-2.5 text-left",
        "transition-colors duration-150 ease-out hover:bg-[var(--sd-hover)] disabled:cursor-progress",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        !exists && "text-[var(--sd-ink-faint)]"
      )}
      aria-label={`${exists ? "Open" : "Create"} daily page for ${dailyPageTitle(iso)}`}
    >
      <span className="font-serif text-[17px] leading-none text-[var(--ink)]">
        {format(parseISO(iso), "d MMM")}
      </span>
      <span className="mt-1 text-[0.65rem] uppercase tracking-wide text-[var(--sd-ink-faint)]">
        {format(parseISO(iso), "EEEE")}
      </span>
      <span className="mt-3 truncate text-[0.7rem] text-[var(--sd-ink-dull)]">{preview}</span>
      <span className="mt-auto flex h-4 items-end justify-end pt-1 text-[var(--sd-ink-faint)]">
        {loading ? <Loader2 size={11} className="animate-spin motion-reduce:animate-none" /> : null}
        {!loading && !exists ? <Plus size={11} /> : null}
      </span>
    </button>
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
    <div className="flex aspect-[16/10] w-full items-center justify-center rounded-[6px] border border-dashed border-[var(--sd-line)] bg-[var(--sd-darker-box)] text-[var(--sd-ink-faint)]">
      {loading ? (
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <span className="flex items-center gap-1.5 text-[0.78rem]">
          <Plus size={14} /> Create today&apos;s page
        </span>
      )}
    </div>
  );
}
