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
        // The register's field chrome: .craft-pill carries the raised fill,
        // the hairline, the card shadow and the :focus-within recipe, so this
        // component only owns geometry.
        "craft-pill flex items-center gap-2.5 px-3.5",
        className
      )}
    >
      <Search size={15} strokeWidth={1.75} className="shrink-0 text-[var(--ink-muted)]" />
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
          // 36px, body type, upright placeholder. It was a 48px serif
          // subtitle in italics, which read as a hero banner rather than a
          // field and sat two sizes above every other control in the app.
          "h-9 w-full bg-transparent outline-none",
          "text-body text-[var(--ink)]",
          "placeholder:text-[var(--ink-muted)]"
        )}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="shrink-0 rounded-md p-1 text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
});
