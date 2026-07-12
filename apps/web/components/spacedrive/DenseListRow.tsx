"use client";

import { cn } from "@/lib/utils";
import type { KeyboardEvent, ReactNode } from "react";

export interface DenseListRowProps {
  /** Leading glyph / icon slot. */
  glyph?: ReactNode;
  title: ReactNode;
  /** Trailing meta slot (timestamp, count, badge). */
  meta?: ReactNode;
  selected?: boolean;
  onActivate?: () => void;
  className?: string;
}

/**
 * A 40px dense list row with a leading glyph, a truncating title, and a trailing
 * meta slot. When `onActivate` is supplied it becomes a keyboard-operable button
 * (Enter / Space). Selected rows fill with `--deck-selected` and carry a subtle
 * hairline inset; hover is `--deck-hover`.
 */
export function DenseListRow({
  glyph,
  title,
  meta,
  selected = false,
  onActivate,
  className,
  ...rest
}: DenseListRowProps & Record<string, unknown>) {
  const interactive = Boolean(onActivate);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onActivate) return;
    if (event.key === "Enter" || event.key === " ") {
      if (event.key === " ") event.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={onActivate}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-[0.375rem] px-2.5 font-[family-name:var(--font-sans)] text-[13px] text-[var(--deck-ink)]",
        interactive && "cursor-pointer",
        "transition-colors duration-[var(--dur-hover)] ease-out",
        interactive && "hover:bg-[var(--deck-hover)]",
        selected && "bg-[var(--deck-selected)] shadow-[inset_0_0_0_1px_var(--deck-line)]",
        interactive && "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
        className
      )}
      {...rest}
    >
      {glyph ? (
        <span className="flex shrink-0 items-center text-[var(--deck-ink-dull)]">{glyph}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta ? (
        <span className="flex shrink-0 items-center text-[12px] text-[var(--deck-ink-dull)]">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
