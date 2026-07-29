import {
  ArrowUpRight,
  Bookmark,
  Cpu,
  Dna,
  FlaskConical,
  Gauge,
  Landmark,
  Megaphone,
  MessageSquareQuote,
  Rocket,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import {
  BRIEFING_SECTION_LABELS,
  type BriefingItemMeta,
  type BriefingSection,
} from "@/lib/briefing/types";
import { deriveMedia } from "@/lib/briefing/media";
import { VideoEmbed } from "@/components/briefing/VideoEmbed";
import { TweetEmbed } from "@/components/briefing/TweetEmbed";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * One glyph per section. Nouns only, so a reader can find "Benchmarks" by
 * shape before they read the word.
 */
const SECTION_ICONS: Record<BriefingSection, LucideIcon> = {
  top_story: Star,
  ai_research: FlaskConical,
  lab_announcements: Megaphone,
  model_launches: Rocket,
  upcoming_models: Sparkles,
  benchmarks: Gauge,
  semiconductors: Cpu,
  policy: Landmark,
  creators: MessageSquareQuote,
  bio: Dna,
  general: Bookmark,
};

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

/**
 * Small pill for a piece of item metadata. Pastel fill, saturated rim, ink
 * in the same family: `amber` is the butter tint (advisory — "Rumored"),
 * `accent` the sky tint (attribution), `default` a quiet neutral.
 */
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
        "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.06em]",
        variant !== "default" &&
          "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]",
        variant === "amber" && "tint-butter",
        variant === "accent" && "tint-sky",
        variant === "default" &&
          "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)]"
      )}
    >
      {children}
    </span>
  );
}

/** Renders the footer chip row for a single item from its meta. */
function ItemMeta({
  meta,
  sourceName,
  faviconUrl,
}: {
  meta: BriefingItemMeta | null;
  sourceName: string;
  faviconUrl?: string;
}) {
  const tags = meta?.tags ?? [];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {faviconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconUrl}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
          loading="lazy"
        />
      )}
      <span className="text-[11px] tracking-tight text-[var(--ink-muted)]">
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
  const media = item.url ? deriveMedia(item.url) : null;
  const titleNode = item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex items-start gap-1 font-serif font-medium text-[var(--ink)]",
        "transition-colors duration-[160ms] ease-out hover:text-[var(--tint-ink)]",
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
    <article
      className={cn(
        featured &&
          "border-l-[3px] border-[var(--tint-edge)] pl-4"
      )}
    >
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
      {media?.kind === "video" && media.youtubeEmbedUrl && media.youtubeThumb && (
        <VideoEmbed
          embedUrl={media.youtubeEmbedUrl}
          thumbUrl={media.youtubeThumb}
          title={item.title}
        />
      )}
      {media?.kind === "tweet" && media.tweetId && <TweetEmbed id={media.tweetId} />}
      <ItemMeta
        meta={item.meta}
        sourceName={item.sourceName}
        faviconUrl={media?.faviconUrl}
      />
    </article>
  );
}

/**
 * A raised white section card (jul-29 craft restyle — the ad-hoc backdrop
 * blur is gone; blur is reserved for shell chrome). The header pairs a small
 * tinted icon plate with the serif section title and a quiet count. Each
 * section keeps the same hue across renders because the tint is derived from
 * the section's label, and that hue is the only colour the section spends:
 * on the plate, on the featured item's left rule, and on link hover.
 *
 * The `top_story` section renders its items in a larger, featured treatment.
 */
export function BriefingSectionCard({ section, items }: Props) {
  const isTopStory = section === "top_story";
  const label = BRIEFING_SECTION_LABELS[section];
  const Icon = SECTION_ICONS[section];

  return (
    <section className={cn(tintFor(label), "craft-card rounded-2xl px-6 py-5")}>
      <header className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-bg)] text-[var(--tint-ink)]"
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
          {label}
        </h2>
        <span className="text-[11px] tabular-nums text-[var(--ink-faint)]">
          {String(items.length).padStart(2, "0")}
        </span>
      </header>
      <div className="divide-y divide-[var(--edge)]">
        {items.map((item, i) => (
          <div key={item.id} className={cn(i === 0 ? "pb-5" : "py-5", "last:pb-0")}>
            <BriefingItem item={item} featured={isTopStory} />
          </div>
        ))}
      </div>
    </section>
  );
}
