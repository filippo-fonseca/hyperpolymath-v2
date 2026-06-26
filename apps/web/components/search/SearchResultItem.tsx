"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BreadcrumbCrumb, SearchEntry } from "@/lib/search";
import { HighlightedText } from "./HighlightedText";
import { TypeBadge } from "./TypeBadge";

interface Props {
  entry: SearchEntry;
  query: string;
  variant?: "full" | "compact";
  focused?: boolean;
  onSelect: (entry: SearchEntry) => void;
  /** Forwarded so the parent can scroll a focused item into view. */
  itemRef?: (el: HTMLButtonElement | null) => void;
  id?: string;
}

/**
 * Interactive ancestry trail. Each crumb that has an href renders as a small
 * button that navigates straight to that ancestor (area / project), so the
 * user can jump up the hierarchy without leaving search. Crumbs without an
 * href (no detail surface) render as plain, non-interactive text.
 *
 * Rendered as a sibling of the result button (never nested inside it) so we
 * don't put a <button> inside a <button>, which is invalid and breaks a11y.
 */
function Breadcrumb({
  crumbs,
  compact,
  onNavigate,
}: {
  crumbs: BreadcrumbCrumb[];
  compact?: boolean;
  onNavigate: (href: string) => void;
}) {
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label="Ancestry"
      className={cn(
        "flex min-w-0 items-center text-[var(--ink-muted)]",
        compact ? "text-[11px]" : "text-[12px]"
      )}
    >
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex min-w-0 items-center">
          {i > 0 && (
            <span aria-hidden className="px-1 opacity-50">
              /
            </span>
          )}
          {c.href ? (
            <button
              type="button"
              onClick={(e) => {
                // Don't let the click bubble to the parent result row.
                e.stopPropagation();
                if (c.href) onNavigate(c.href);
              }}
              className="truncate rounded-sm px-0.5 underline-offset-2 transition-colors duration-100 hover:text-[var(--hud-cyan)] hover:underline focus-visible:text-[var(--hud-cyan)] focus-visible:outline-none focus-visible:underline"
              title={`Go to ${c.label}`}
            >
              {c.label}
            </button>
          ) : (
            <span className="truncate px-0.5">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="text-[var(--ink-muted)]">
          #{t}
        </span>
      ))}
    </>
  );
}

export function SearchResultItem({
  entry,
  query,
  variant = "full",
  focused = false,
  onSelect,
  itemRef,
  id,
}: Props) {
  const router = useRouter();
  const compact = variant === "compact";
  const isCapture = entry.type === "capture";
  // Captures lead with their preview; everything else leads with its title.
  const primary = isCapture ? (entry.preview ?? entry.title) : entry.title;
  // Breadcrumb shows for hierarchical results (tasks/projects). Captures
  // already carry tags+date in the meta row, so no breadcrumb there.
  const showBreadcrumb = !isCapture && entry.crumbs.length > 0;

  return (
    <div
      className={cn(
        "group/result relative rounded-lg transition-colors duration-100",
        focused ? "bg-[var(--surface)]" : "hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]"
      )}
    >
      <button
        ref={itemRef}
        id={id}
        type="button"
        role="option"
        aria-selected={focused}
        onClick={() => onSelect(entry)}
        className={cn(
          "w-full rounded-lg text-left",
          compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
          // Leave room for the breadcrumb row that sits below.
          showBreadcrumb && (compact ? "pb-1" : "pb-1.5")
        )}
      >
        {/* Meta row: badge + type-specific meta. */}
        <div className={cn("flex items-center gap-2", compact ? "text-[10px]" : "text-[11px]")}>
          <TypeBadge type={entry.type} compact={compact} />
          {isCapture ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono">
              <span className="flex items-center gap-1.5 truncate">
                {entry.tags && <TagChips tags={entry.tags} />}
              </span>
              {entry.meta && (
                <span className="ml-auto shrink-0 text-[var(--ink-muted)]">{entry.meta}</span>
              )}
            </div>
          ) : (
            entry.meta && <span className="font-mono text-[var(--ink-muted)]">{entry.meta}</span>
          )}
        </div>

        {/* Primary line. */}
        <div
          className={cn(
            "mt-1 truncate font-medium text-[var(--ink)]",
            compact ? "text-[13px]" : "text-[15px]"
          )}
        >
          <HighlightedText text={primary} query={query} />
        </div>
      </button>

      {/* Interactive breadcrumb, rendered as a sibling of the result button so
          its ancestor links aren't nested inside another button. */}
      {showBreadcrumb && (
        <div className={cn("pb-2", compact ? "px-2.5" : "px-3")}>
          <Breadcrumb
            crumbs={entry.crumbs}
            compact={compact}
            onNavigate={(href) => router.push(href)}
          />
        </div>
      )}
    </div>
  );
}
