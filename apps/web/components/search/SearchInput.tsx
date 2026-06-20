"use client";

import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/** Full-width search field with leading icon + trailing clear affordance. */
export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  { value, onChange, onClear, onKeyDown, placeholder, autoFocus, className },
  ref
) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] px-4",
        "transition-[border-color,box-shadow] duration-150 ease-out",
        "focus-within:border-[var(--hud-cyan)]",
        "focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--hud-cyan)_10%,transparent)]",
        className
      )}
    >
      <Search size={18} strokeWidth={1.5} className="shrink-0 text-[var(--ink-muted)]" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          "h-12 w-full bg-transparent outline-none",
          "font-serif text-[16px] text-[var(--ink)]",
          "placeholder:text-[var(--ink-muted)] placeholder:italic"
        )}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="shrink-0 rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
});
