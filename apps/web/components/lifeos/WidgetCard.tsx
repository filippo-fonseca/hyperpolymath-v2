"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Route the card's "margin click" navigates to. */
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
 * Hover (group/card):
 *   - Border lifts to --edge-hud, then to --hud-cyan when also focused
 *   - Soft neumorphic glassy tile shadow (paired raised + recessed direction,
 *     inset white highlight at the top) — harmonised with /settings tiles
 *   - Subtle 1px lift
 *
 * Reduced-motion users: no lift — only the border-color/shadow transitions
 * run (which is below the threshold for vestibular triggers).
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <div
      className={cn(
        "group/card relative h-full",
        "rounded-xl border border-[color-mix(in_oklch,var(--edge)_70%,transparent)] bg-[var(--surface)]",
        "shadow-[6px_6px_18px_color-mix(in_oklch,var(--ink)_8%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)]",
        "transition-[border-color,transform,box-shadow,background-color] duration-200 ease-out",
        "hover:border-[var(--edge-hud)]",
        "hover:-translate-y-[1px] motion-reduce:hover:translate-y-0",
        "hover:shadow-[8px_8px_22px_color-mix(in_oklch,var(--ink)_12%,transparent),-5px_-5px_16px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)]",
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
