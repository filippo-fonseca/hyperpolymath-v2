"use client";

import { DeckPanel } from "@/components/spacedrive";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  /** Route the card's "margin click"navigates to. */
  href: string;
  /** Accessible name for the overlay link (screen-readers only). */
  ariaLabel: string;
  /** Card body — interactive children must be wrapped in CardSurface. */
  children: ReactNode;
  className?: string;
}

/**
 * WidgetCard — shared shell for /lifeos tiles.
 *
 * Two-layer click model:
 *   - Layer 1 (z-0): a full-bleed <Link> overlay covers the entire card and
 *     navigates to `href` when the user clicks anywhere in the *margins*.
 *   - Layer 2 (z-10): the card's content, wrapped in <WidgetCardContent>,
 *     sits above the overlay so its buttons/links capture clicks directly.
 *
 * Recipe: a flat tonal surface with a margin-click route. Interactive content
 * remains above the route target so buttons and links retain native semantics.
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <DeckPanel tone="panel" className={cn("group/card relative h-full min-w-0", className)}>
      {/* Margin click target — sits below content. */}
      <Link
        href={href}
        aria-label={ariaLabel}
        className="absolute inset-0 z-0 rounded-[0.5rem] outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      />

      {/* Content layer — interactive elements sit above the overlay. */}
      <div className="relative z-10 flex h-full min-w-0 flex-col p-4 pointer-events-none sm:p-5">
        <div className="contents [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto [&_label]:pointer-events-auto [&_select]:pointer-events-auto [&_[role=button]]:pointer-events-auto">
          {children}
        </div>
      </div>
    </DeckPanel>
  );
}
