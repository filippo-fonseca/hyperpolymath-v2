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
 * Chrome: the Spacedrive entity-card panel (constitution §A2/§B, decisions
 * D1/D7). A near-opaque surface fill, a 1px --edge hairline border, a 0.5px
 * white inset top hairline for the dimensional gloss, and a quiet ≤10% drop.
 * 12px radius. Hover is a soft-landing on border + background only (200ms
 * cubic-bezier(0.23,1,0.32,1)) — no scale, no lift, no glow halo. Both themes
 * flip automatically via the token ladder.
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <div
      className={cn(
        "group/card relative h-full rounded-xl border border-[var(--edge)]",
        "bg-[color-mix(in_oklch,var(--surface-raised)_82%,transparent)]",
        "transition-[border-color,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:border-[color-mix(in_oklch,var(--hud-cyan)_28%,var(--edge))]",
        "hover:bg-[color-mix(in_oklch,var(--surface-raised)_92%,transparent)]",
        className,
      )}
      style={{
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.10), 0 1px 3px color-mix(in oklch, var(--ink) 8%, transparent)",
      }}
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
