"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Generic explorer toolbar chrome: the h-12 top-bar shell — quiet, transparent,
 * separated from the canvas by a single bottom hairline (aug-04 craft-ui-v2;
 * the Spacedrive translucent fill + blur is retired — chrome recedes, content
 * carries the elevation). Purely presentational and data-agnostic; it lays out
 * three optional clusters (`left`, `center`, `right`) in reading order, or
 * arbitrary `children` when a consumer needs full control of the row.
 *
 * The chrome recipe (height, border) is owned here so every restyle surface
 * renders an identical bar; consumers supply only content.
 */
export function Toolbar({
  left,
  center,
  right,
  children,
  className,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-3 border-b border-[var(--edge)] px-4 font-sans text-meta text-[var(--sd-ink)]",
        className
      )}
    >
      {children ?? (
        <>
          {left}
          {center}
          {right}
        </>
      )}
    </div>
  );
}
