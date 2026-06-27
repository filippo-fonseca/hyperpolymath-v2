"use client";

import { cn } from "@/lib/utils";

interface Props {
  name: string;
  isNew?: boolean;
  onClick?: () => void;
  asButton?: boolean;
}

/**
 * `@person` chip — amber sibling of HashtagChip (UI-SPEC §5i / §9g). Mirrors the
 * `.person-chip-inline` editor register so a linked person reads distinct from a
 * sage `#tag`. `asButton={false}` for purely visual chips inside content bodies.
 */
export function PersonChip({ name, isNew, onClick, asButton = true }: Props) {
  const className = cn(
    "inline-flex items-center font-mono text-xs font-normal rounded-sm px-2 py-0.5",
    "transition-colors duration-100 ease-out",
    isNew
      ? "bg-[color:color-mix(in_oklch,var(--ink-amber)_22%,transparent)] text-[var(--ink-amber)] italic"
      : "bg-[color:color-mix(in_oklch,var(--ink-amber)_18%,transparent)] text-[var(--ink)]",
    asButton &&
      "hover:bg-[color:color-mix(in_oklch,var(--ink-amber)_28%,transparent)] cursor-pointer-always",
  );

  const content = (
    <>
      @{name}
      {isNew ? <span className="italic ml-1">(new)</span> : null}
    </>
  );

  if (!asButton) {
    return <span className={className}>{content}</span>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
