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
  const lines = previewLines(page, exists);
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
        //
        // aug-07: widened from 132px and the preview grew from one clamped
        // line to a real excerpt. The old card was mostly empty space under
        // two words, which made a week of entries unskimmable — the whole
        // point of a trail.
        "craft-card craft-card-hover group relative flex w-[176px] flex-shrink-0 snap-start cursor-pointer flex-col rounded-xl p-2.5 text-left",
        "disabled:cursor-progress"
      )}
      aria-label={`${exists ? "Open" : "Create"} daily page for ${dailyPageTitle(iso)}`}
    >
      <JournalDayTile iso={iso} />
      {/* Block-per-line rather than one run-on string, so a heading still reads
          as a heading and a bullet still reads as a bullet. The container
          clips: `overflow-hidden` on a flex-1 box beats a line-clamp here
          because the excerpt is several elements, not one paragraph. */}
      <div
        className={cn(
          "mt-2 flex min-h-[72px] flex-1 flex-col gap-1 overflow-hidden text-micro leading-snug",
          exists ? "text-[var(--sd-ink-dull)]" : "text-[var(--sd-ink-faint)]"
        )}
      >
        {lines.map((line, i) => (
          <span
            // Positional by design: these are excerpt lines, not entities.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed excerpt slice
            key={i}
            className={cn(
              "block break-words",
              // Only the first line may run long; the rest are single-line so
              // the card shows breadth of the day rather than one paragraph.
              i === 0 ? "line-clamp-2" : "truncate",
              line.emphasis && "font-medium text-[var(--sd-ink)]"
            )}
          >
            {line.prefix ? (
              <span className="mr-1 text-[var(--sd-ink-faint)]">{line.prefix}</span>
            ) : null}
            {line.text}
          </span>
        ))}
      </div>
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

type PreviewLine = { text: string; prefix?: string; emphasis?: boolean };

/**
 * Up to five excerpt lines for a trail card, each carrying the shape of the
 * block it came from (a bullet keeps its dot, a to-do keeps its box, a heading
 * gets weight). Empty and structural blocks are dropped, since a divider or a
 * blank paragraph spends a line of a very small card saying nothing.
 */
function previewLines(page: JournalPage, exists: boolean): PreviewLine[] {
  if (!page) return [{ text: exists ? "Daily entry" : "No entry yet" }];

  const { blocks } = extractPreviewModel(page.contentJson, page.content, {
    maxBlocks: 12,
    maxChars: 480,
  });

  const lines: PreviewLine[] = [];
  for (const b of blocks) {
    if (lines.length >= 5) break;
    switch (b.kind) {
      case "heading":
        if (b.text.trim()) lines.push({ text: b.text, emphasis: true });
        break;
      case "todo":
        if (b.text.trim()) lines.push({ text: b.text, prefix: b.checked ? "☑" : "☐" });
        break;
      case "bullet":
        if (b.text.trim()) lines.push({ text: b.text, prefix: "•" });
        break;
      case "numbered":
        if (b.text.trim()) lines.push({ text: b.text, prefix: "›" });
        break;
      case "quote":
        if (b.text.trim()) lines.push({ text: b.text, prefix: "❝" });
        break;
      case "code":
        if (b.text.trim()) lines.push({ text: b.text, prefix: "‹›" });
        break;
      case "paragraph":
        if (b.text.trim()) lines.push({ text: b.text });
        break;
      case "image":
        lines.push({ text: b.caption?.trim() || "Image", prefix: "🖼" });
        break;
      case "table-hint":
        lines.push({ text: `Table · ${b.rows}×${b.cols}` });
        break;
      default:
        // divider and anything new: nothing worth a line on a card this size.
        break;
    }
  }

  if (lines.length > 0) return lines;
  return [{ text: page.title || (exists ? "Empty entry" : "No entry yet") }];
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
