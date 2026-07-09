import { ArrowUpRight } from "lucide-react";
import {
  BRIEFING_SECTION_LABELS,
  type BriefingItemMeta,
  type BriefingSection,
} from "@/lib/briefing/types";
import { cn } from "@/lib/utils";

/**
 * A curated briefing item as returned by GET /api/briefing (BriefingItemRow in
 * the API contract). Defined here so the UI compiles against the shape ahead of
 * the server helper landing.
 */
export interface BriefingItemRow {
  id: string;
  section: BriefingSection;
  title: string;
  summary: string;
  url: string | null;
  sourceName: string;
  score: number;
  orderIndex: number;
  meta: BriefingItemMeta | null;
}

interface Props {
  section: BriefingSection;
  items: BriefingItemRow[];
}

/** Small pill for a piece of item metadata. `accent` uses cyan sparingly. */
function MetaChip({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "amber" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.08em]",
        variant === "amber" &&
          "text-[var(--ink-amber)] [background:color-mix(in_oklch,var(--ink-amber)_10%,transparent)] [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--ink-amber)_28%,transparent)]",
        variant === "accent" &&
          "text-[var(--hud-cyan)] [background:color-mix(in_oklch,var(--hud-cyan)_8%,transparent)] [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_24%,transparent)]",
        variant === "default" &&
          "text-[var(--ink-muted)] [background:color-mix(in_oklch,var(--ink)_5%,transparent)] [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_10%,transparent)]"
      )}
    >
      {children}
    </span>
  );
}

/** Renders the footer chip row for a single item from its meta. */
function ItemMeta({ meta, sourceName }: { meta: BriefingItemMeta | null; sourceName: string }) {
  const tags = meta?.tags ?? [];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[11px] tracking-tight text-[var(--ink-muted)]">
        {sourceName}
      </span>
      {meta?.rumored && (
        <>
          <span className="text-[var(--edge)]">·</span>
          <MetaChip variant="amber">Rumored</MetaChip>
        </>
      )}
      {meta?.creator && <MetaChip variant="accent">{meta.creator}</MetaChip>}
      {meta?.benchmark && <MetaChip variant="default">{meta.benchmark}</MetaChip>}
      {tags.map((tag) => (
        <MetaChip key={tag} variant="default">
          {tag}
        </MetaChip>
      ))}
    </div>
  );
}

/** A single item row. `featured` gives the top story larger typography. */
function BriefingItem({ item, featured }: { item: BriefingItemRow; featured: boolean }) {
  const titleNode = item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex items-start gap-1 font-serif font-medium text-[var(--ink)] transition-colors",
        "hover:text-[var(--hud-cyan)]",
        featured ? "text-2xl leading-snug" : "text-lg leading-snug"
      )}
    >
      <span>{item.title}</span>
      <ArrowUpRight
        size={featured ? 18 : 15}
        strokeWidth={1.75}
        className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-70"
        aria-hidden="true"
      />
    </a>
  ) : (
    <span
      className={cn(
        "font-serif font-medium text-[var(--ink)]",
        featured ? "text-2xl leading-snug" : "text-lg leading-snug"
      )}
    >
      {item.title}
    </span>
  );

  return (
    <article className={cn(featured && "rounded-lg border-l-2 border-[var(--hud-cyan)] pl-4")}>
      {titleNode}
      {item.summary && (
        <p
          className={cn(
            "mt-1.5 font-serif leading-relaxed text-[var(--ink-muted)]",
            featured ? "text-[15px]" : "text-[14px]"
          )}
        >
          {item.summary}
        </p>
      )}
      <ItemMeta meta={item.meta} sourceName={item.sourceName} />
    </article>
  );
}

/**
 * A `.glass-tile` section card: a serif section header with a mono count badge,
 * then the stack of curated items. The `top_story` section renders its items in
 * a larger, featured treatment.
 */
export function BriefingSectionCard({ section, items }: Props) {
  const isTopStory = section === "top_story";

  return (
    <section className="glass-tile rounded-xl px-6 py-5">
      <header className="mb-4 flex items-baseline gap-2.5">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
          {BRIEFING_SECTION_LABELS[section]}
        </h2>
        <span className="font-mono text-[11px] text-[var(--ink-muted)]">
          {String(items.length).padStart(2, "0")}
        </span>
      </header>
      <div className="divide-y divide-[var(--edge)]">
        {items.map((item, i) => (
          <div key={item.id} className={cn(i === 0 ? "pb-4" : "py-4", "last:pb-0")}>
            <BriefingItem item={item} featured={isTopStory} />
          </div>
        ))}
      </div>
    </section>
  );
}
