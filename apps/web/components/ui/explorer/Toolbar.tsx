"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Generic explorer toolbar chrome: the h-12 top-bar shell with the Spacedrive
 * blur treatment (saturate/blur-18px), a bottom hairline, and a translucent
 * app-tinted fill. Purely presentational and data-agnostic; it lays out three
 * optional clusters (`left`, `center`, `right`) in reading order, or arbitrary
 * `children` when a consumer needs full control of the row.
 *
 * The chrome recipe (height, blur, border, fill) is owned here so every
 * restyle surface renders an identical bar; consumers supply only content.
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
        "flex h-12 items-center gap-3 border-b border-[var(--sd-sidebar-divider,var(--sd-line))] bg-[color-mix(in_srgb,var(--sd-app)_90%,transparent)] px-4 font-sans text-meta text-[var(--sd-ink)] backdrop-blur-[18px]",
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
