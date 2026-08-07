"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type EmojiCategory,
  type EmojiEntry,
  loadEmojiCategories,
  randomEmoji,
  searchEmoji,
} from "@/lib/emoji/data";
import { cn } from "@/lib/utils";
import { Dices, Loader2, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

/**
 * The app's one emoji picker: browse by category, search by name or keyword,
 * or just type/paste a character. Pages, projects, and areas all mount this,
 * so setting an icon is the same act everywhere instead of three different
 * bare text inputs that could not browse or search at all.
 *
 * The dataset loads lazily on first open (see `lib/emoji/data.ts`), so nothing
 * pays for a megabyte of emoji names until someone reaches for one.
 */

const RECENT_KEY = "emoji-picker:recent";
const RECENT_MAX = 18;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled: recents simply do not persist.
  }
}

/**
 * The picker body without a popover around it, for hosts that already own a
 * container (the project IconPicker embeds this as its Emoji tab).
 *
 * `onPicked` fires after a selection so a host that IS a popover can close.
 */
export function EmojiPickerPanel({
  value,
  onChange,
  onPicked,
  autoFocusSearch = true,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  onPicked?: () => void;
  autoFocusSearch?: boolean;
}) {
  const [categories, setCategories] = useState<EmojiCategory[] | null>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadEmojiCategories().then((c) => {
      if (alive) setCategories(c);
    });
    setRecent(readRecent());
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (autoFocusSearch) searchRef.current?.focus();
  }, [autoFocusSearch]);

  const pick = (emoji: string, close = true) => {
    onChange(emoji);
    pushRecent(emoji);
    setRecent(readRecent());
    if (close) onPicked?.();
  };

  const results = useMemo(
    () => (categories && query.trim() ? searchEmoji(categories, query) : null),
    [categories, query]
  );

  const commitTyped = () => {
    const picked = Array.from(typed.trim()).slice(0, 2).join("");
    if (picked) pick(picked);
  };

  return (
    <div className="flex flex-col">
      {/* Search, plus the two actions that need no grid at all. */}
      <div className="flex items-center gap-1.5 border-b border-[var(--edge)] px-2.5 py-2">
        <Search size={13} strokeWidth={1.75} className="shrink-0 text-[var(--ink-faint)]" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="min-w-0 flex-1 bg-transparent text-meta text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          type="button"
          onClick={() => pick(randomEmoji(value), false)}
          title="Random emoji"
          aria-label="Pick a random emoji"
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          <Dices size={13} strokeWidth={1.75} />
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              onPicked?.();
            }}
            title="Remove emoji"
            aria-label="Remove emoji"
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="max-h-[280px] overflow-y-auto p-2">
        {!categories ? (
          <div className="flex h-24 items-center justify-center text-[var(--ink-faint)]">
            <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
          </div>
        ) : results ? (
          results.length > 0 ? (
            <EmojiGrid emojis={results} value={value} onPick={pick} />
          ) : (
            <p className="px-1 py-6 text-center text-meta text-[var(--ink-faint)]">
              No emoji matches “{query.trim()}”.
            </p>
          )
        ) : (
          <>
            {recent.length > 0 ? (
              <Section label="Frequent">
                <EmojiGrid
                  emojis={recent.map((native) => ({ native, name: native, terms: [] }))}
                  value={value}
                  onPick={pick}
                />
              </Section>
            ) : null}
            {categories.map((cat) => (
              <Section key={cat.id} label={cat.label}>
                <EmojiGrid emojis={cat.emojis} value={value} onPick={pick} />
              </Section>
            ))}
          </>
        )}
      </div>

      {/* Typing still works, for the character the grid does not carry and for
          anyone who already knows exactly what they want. */}
      <div className="flex items-center gap-2 border-t border-[var(--edge)] px-2.5 py-2">
        <input
          type="text"
          value={typed}
          maxLength={8}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTyped();
          }}
          placeholder="…or type one and press Enter"
          className="min-w-0 flex-1 bg-transparent text-meta text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        {typed.trim() ? (
          <button
            type="button"
            onClick={commitTyped}
            className="shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-micro text-[var(--ink-muted)] transition-colors duration-[160ms] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            Set
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmojiPicker({
  value,
  onChange,
  trigger,
  align = "start",
  /**
   * Fill an empty value with a random emoji the moment the picker opens.
   *
   * For pages this is the point: clicking the default document glyph should
   * leave you holding a real icon, not a blank grid to shop through. The grid
   * still opens on top of the roll, so it is a starting point rather than a
   * decision made for you.
   */
  randomizeOnOpenWhenEmpty = false,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  /** Single focusable element; Radix forwards its props via `asChild`. */
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  randomizeOnOpenWhenEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // On the open transition only, so it cannot fight a pick made a moment
    // later or re-roll on every render while the popover is up.
    if (next && randomizeOnOpenWhenEmpty && !value) onChange(randomEmoji());
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[336px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPickerPanel value={value} onChange={onChange} onPicked={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="px-1 pb-1 pt-1.5 text-micro font-medium uppercase tracking-wide text-[var(--ink-faint)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function EmojiGrid({
  emojis,
  value,
  onPick,
}: {
  emojis: EmojiEntry[];
  value: string | null;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-0.5">
      {emojis.map((e, i) => (
        <button
          // Duplicates are possible across recents and categories, so the
          // index disambiguates within this one grid.
          key={`${e.native}-${i}`}
          type="button"
          onClick={() => onPick(e.native)}
          title={e.name}
          aria-label={e.name}
          className={cn(
            "inline-flex aspect-square cursor-pointer items-center justify-center rounded-md text-[17px] leading-none",
            "transition-colors duration-[120ms] hover:bg-[var(--hover)]",
            value === e.native && "bg-[color-mix(in_oklch,var(--accent)_16%,transparent)]"
          )}
        >
          {e.native}
        </button>
      ))}
    </div>
  );
}
