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
 *   - Subtle cyan gradient shadow (radial, low alpha) plus a 1px lift
 *   - Pseudo-element top border accent fades in cyan
 *
 * Reduced-motion users: no lift, no shadow expansion — only the border color
 * transition runs (which is below the threshold for vestibular triggers).
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <div
      className={cn(
        "group/card relative h-full",
        "rounded-xl border border-[var(--edge)] bg-[var(--surface)]",
        "transition-[border-color,transform,box-shadow,background-color] duration-200 ease-out",
        "hover:border-[var(--edge-hud)]",
        "hover:-translate-y-[1px] motion-reduce:hover:translate-y-0",
        "hover:shadow-[0_8px_24px_-16px_rgb(0_0_0_/_0.18),0_2px_6px_-3px_rgb(0_0_0_/_0.06)]",
        "motion-reduce:hover:shadow-none",
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
