"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCaptures } from "@/app/actions/captures";

interface Props {
  activeHashtagId: string | null;
  onResults: (ids: string[] | null) => void;
  /**
   * Issue #139 — surfaces the live (un-debounced) query text so the parent can
   * highlight matched substrings in the rendered capture cards. Fires on every
   * keystroke, independent of the debounced search request below; passes "" when
   * the field is empty so the parent can clear any active highlight immediately.
   */
  onQueryChange?: (query: string) => void;
}

/**
 * Persistent search bar in the Captures feed header (D-12).
 *
 * - Debounced 200ms on every keystroke
 * - Combines with active hashtag filter (passed via prop; piped to the action)
 * - Calls searchCaptures Server Action; passes resulting ID list (or null) up via onResults
 *   - null = "no search active, show full feed"
 *   - [] = "search active, no matches" (caller renders the empty state)
 */
export function CaptureSearch({ activeHashtagId, onResults, onQueryChange }: Props) {
  const [query, setQuery] = useState("");

  // Issue #139 — report the raw query upward immediately (not debounced) so the
  // highlight tracks each keystroke, even before the debounced search resolves.
  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  useEffect(() => {
    if (!query.trim()) {
      onResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const r = await searchCaptures({
        query,
        hashtagId: activeHashtagId ?? undefined,
      });
      if (r.success) onResults(r.data);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, activeHashtagId, onResults]);

  return (
    // The register's search field is a .craft-pill: raised fill, hairline,
    // card shadow, and the built-in :focus-within recipe. The Input inside
    // gives up its own chrome so the pill is the only box.
    <div className="craft-pill relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sd-ink-faint)] pointer-events-none"
      />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search captures…"
        className="rounded-full border-0 bg-transparent pl-9 pr-9 font-sans text-meta"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
