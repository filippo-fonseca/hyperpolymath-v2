"use client";

import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { dailyPageTitle } from "@/lib/pages/daily-page";
import { extractPreviewModel } from "@/lib/pages/preview";
import { tintFor } from "@/lib/tint";
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
        // jul-29 craft restyle: today's card is the butter plate of the rail.
        "tint-butter group relative flex w-[300px] flex-shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-xl border p-3 text-left",
        "border-[color-mix(in_srgb,var(--tint-edge)_55%,transparent)] bg-[var(--tint-bg)] shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--tint-edge)] hover:shadow-[var(--shadow-card-hover)] disabled:cursor-progress"
      )}
      aria-label={`${exists ? "Open" : "Create"} today's daily page`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-sans text-subtitle font-medium text-[var(--sd-ink)]">
          {format(parseISO(iso), "EEEE, MMMM d")}
        </span>
        <span className="rounded-full bg-[var(--sd-accent)] px-2 py-0.5 text-micro font-medium text-white">
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
        // jul-29 craft restyle: each past day keeps a stable pastel of its
        // own (hash of the ISO date), Craft's mixed-card rail feel. Days with
        // no entry stay quiet on the plain white plate.
        "group relative flex w-[120px] flex-shrink-0 snap-start cursor-pointer flex-col rounded-xl border p-3 text-left",
        "shadow-[var(--shadow-card)] transition-[border-color,box-shadow,background-color] duration-[160ms] ease-out",
        "hover:shadow-[var(--shadow-card-hover)] disabled:cursor-progress",
        exists
          ? cn(
              tintFor(iso),
              "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] hover:border-[var(--tint-edge)]"
            )
          : "border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink-faint)] hover:border-[var(--edge-strong)]"
      )}
      aria-label={`${exists ? "Open" : "Create"} daily page for ${dailyPageTitle(iso)}`}
    >
      <span className="font-sans text-subtitle font-medium leading-none text-[var(--sd-ink)]">
        {format(parseISO(iso), "d MMM")}
      </span>
      <span className="mt-1 text-micro text-[var(--sd-ink-faint)]">
        {format(parseISO(iso), "EEEE")}
      </span>
      <span className="mt-3 truncate text-micro text-[var(--sd-ink-dull)]">{preview}</span>
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
    <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed border-[var(--sd-line)] bg-[var(--sd-darker-box)] text-[var(--sd-ink-faint)]">
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
