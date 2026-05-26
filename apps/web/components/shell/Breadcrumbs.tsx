"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
  /** Optional emoji or short glyph rendered before the label. */
  glyph?: string;
}

interface Props {
  items: Crumb[];
  className?: string;
}

/**
 * Notion-style breadcrumb strip. Mono caps, hairline chevron separators,
 * trailing item is the current page (not a link, ink-strong color).
 *
 * Lives at the top of hierarchy pages (/areas, /areas/[id], /projects/[id])
 * so the user always sees where they are in the area → project tree. Renders
 * nothing when given an empty array, so it can be conditionally included
 * without an extra null check at the call site.
 */
export function Breadcrumbs({ items, className }: Props) {
  if (items.length === 0) return null;
  const last = items.length - 1;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {items.map((c, i) => {
          const isLast = i === last;
          const content = (
            <span className="inline-flex items-center gap-1">
              {c.glyph ? (
                <span aria-hidden="true" className="leading-none">
                  {c.glyph}
                </span>
              ) : null}
              <span className="truncate max-w-[260px]">{c.label}</span>
            </span>
          );
          return (
            <li key={i} className="inline-flex items-center gap-1.5">
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.08em]",
                    "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                    "transition-colors duration-150 ease-out cursor-pointer-always",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.08em]",
                    isLast ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
                  )}
                >
                  {content}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight
                  size={11}
                  className="text-[var(--ink-muted)]/60 shrink-0"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
