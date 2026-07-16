"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Route the card's "margin click" navigates to. */
  href: string;
  /** Accessible name for the overlay link (screen-readers only). */
  ariaLabel: string;
  /** Card body — compose with <WidgetBody> + <WidgetFooter>. */
  children: ReactNode;
  className?: string;
}

/**
 * WidgetCard — shared shell for /lifeos tiles (UI-CONTRACT §6 + §11).
 *
 * Chrome: `--sd-box` fill that must read *clearly raised* off `--sd-app`, 14px
 * radius, 1px hairline border, and a white inset top hairline. No backdrop blur,
 * no gradient, no glow, no shadow stack. Hover moves the border colour and
 * nothing else (150ms) — no scale, no lift.
 *
 * The white-alpha border/inset from §6 only reads as "light catching an edge" on
 * a dark canvas; in light theme it would erase the card outline entirely, so the
 * light scope falls back to the `--sd-line` hairline. Both themes therefore keep
 * a visible edge while dark hits the contract values exactly.
 *
 * Two-layer click model:
 *   - Layer 1 (z-0): a full-bleed <Link> covers the card and navigates on a
 *     click anywhere in the margins.
 *   - Layer 2 (z-10): content sits above it; interactive descendants re-enable
 *     pointer events so their own handlers win.
 *
 * Anatomy (§11): the body carries the 20px padding, and chips live in a
 * hairline-separated h-10 footer strip flush to the card edges — never floating
 * mid-card. Hence the padding lives on <WidgetBody>, not on this container.
 */
export function WidgetCard({ href, ariaLabel, children, className }: Props) {
  return (
    <div
      className={cn(
        "group/card relative flex h-full flex-col overflow-hidden rounded-[14px]",
        "border border-[var(--sd-line)] bg-[var(--sd-box)]",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]",
        "transition-colors duration-150",
        "hover:border-[color-mix(in_srgb,var(--sd-ink)_18%,var(--sd-line))] dark:hover:border-white/10",
        className,
      )}
    >
      {/* Margin click target — sits below content. */}
      <Link
        href={href}
        aria-label={ariaLabel}
        className="absolute inset-0 z-0 rounded-[14px] focus:outline-none"
      />

      {/* Content layer — interactive elements sit above the overlay.
          `min-h-0` closes the flex/grid min-height trap: without it this column
          (and the WidgetBody it wraps) refuses to shrink below its content, so a
          tall list can't hand overflow to its own `overflow-y-auto` and the body
          silently clips instead of scrolling inside the card. */}
      <div className="pointer-events-none relative z-10 flex h-full min-h-0 flex-col">
        <div className="contents [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto [&_label]:pointer-events-auto [&_select]:pointer-events-auto [&_[role=button]]:pointer-events-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The padded region of a card (§6: 20px). Grows to fill the tile. */
export function WidgetBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex min-h-0 flex-1 flex-col p-5", className)}>{children}</div>;
}

/**
 * §11 footer chip strip, verbatim geometry:
 * `flex h-10 flex-row items-center gap-1.5 border-t border-app-line px-2`.
 * Chips belong here, hairline-separated, not scattered through the body.
 */
export function WidgetFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 flex-row items-center gap-1.5 overflow-hidden border-t border-[var(--sd-line)] px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
