"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
 * Chrome: the foundations `.sd-panel` entity-card grammar (constitution §A2/§B,
 * decisions D1/D7) — `--sd-box` surface, 1px `--sd-line` hairline, white inset
 * top hairline, 12px radius, no heavy shadow. Hover is a soft-landing on border
 * + background only (`--ease-soft-landing`, 200ms) toward the accent — no scale,
 * no lift, no glow halo. Both themes flip via the promoted `--sd-*` ladder.
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <div
      className={cn(
        "group/card sd-panel relative h-full",
        "transition-[border-color,background-color] duration-200 ease-[var(--ease-soft-landing)]",
        "hover:border-[color-mix(in_srgb,var(--sd-accent)_28%,var(--sd-line))]",
        "hover:bg-[var(--sd-hover)]",
        className,
      )}
    >
      {/* Margin click target — sits below content. */}
      <Link
        href={href}
        aria-label={ariaLabel}
        className="absolute inset-0 z-0 rounded-lg focus:outline-none"
      />

      {/* Content layer — interactive elements sit above the overlay. */}
      <div className="relative z-10 flex h-full flex-col p-5 pointer-events-none">
        <div className="contents [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto [&_label]:pointer-events-auto [&_select]:pointer-events-auto [&_[role=button]]:pointer-events-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
