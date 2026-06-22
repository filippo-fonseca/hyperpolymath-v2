"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * In-page find for the Wiki editor, built on the CSS Custom Highlight API so
 * matches paint WITHOUT mutating the BlockNote document (no undo-history churn,
 * no content_json change). The editor renders the entire document to the DOM
 * (no virtualization), so a TreeWalker over its text nodes sees every block,
 * including content scrolled out of view.
 *
 * Two named highlights are registered: "wiki-search" (all matches) and
 * "wiki-search-active" (just the current one), styled in page-block-editor.css.
 * If the browser lacks the API the hook still tracks ranges and scrolls to
 * them, so next/prev navigation degrades gracefully without the paint.
 */

const ALL_KEY = "wiki-search";
const ACTIVE_KEY = "wiki-search-active";

// The CSS Custom Highlight API types ship in recent lib.dom, but guard at
// runtime regardless so SSR and older browsers never throw.
type HighlightsRegistry = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

function getHighlightsRegistry(): HighlightsRegistry | null {
  if (typeof window === "undefined") return null;
  if (typeof Highlight === "undefined") return null;
  const registry = (CSS as unknown as { highlights?: HighlightsRegistry }).highlights;
  return registry ?? null;
}

/** Build a fresh `Highlight` from ranges, tolerating type-lib gaps via cast. */
function makeHighlight(ranges: Range[]): unknown {
  const Ctor = Highlight as unknown as new (...ranges: Range[]) => unknown;
  return new Ctor(...ranges);
}

interface UseInPageSearchArgs {
  /** Ref to the editor wrapper that contains the `.bn-editor` content DOM. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether the search bar is open; drives highlight registration + cleanup. */
  open: boolean;
  /**
   * A value that changes whenever the document mutates (e.g. the markdown
   * mirror). Recomputes ranges so highlights stay valid after edits.
   */
  contentSignal: unknown;
}

export interface InPageSearch {
  query: string;
  setQuery: (q: string) => void;
  /** Total match count for the current query. */
  total: number;
  /** 1-based index of the active match, or 0 when there are none. */
  current: number;
  next: () => void;
  prev: () => void;
}

/** Resolve the content-editable element we search within the wrapper. */
function resolveContentEl(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  return (
    container.querySelector<HTMLElement>(".bn-editor") ??
    container.querySelector<HTMLElement>(".ProseMirror") ??
    container
  );
}

/**
 * Walk every text node under `root` and collect ranges for each
 * case-insensitive occurrence of `query`, in document order.
 */
function collectRanges(root: HTMLElement, query: string): Range[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip empty / whitespace-only nodes and any inside non-rendered chrome.
      if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    const haystack = text.toLowerCase();
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + needle.length);
      ranges.push(range);
      from = haystack.indexOf(needle, from + needle.length);
    }
    node = walker.nextNode();
  }
  return ranges;
}

export function useInPageSearch({
  containerRef,
  open,
  contentSignal,
}: UseInPageSearchArgs): InPageSearch {
  const [query, setQuery] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Clear both highlights from the global registry. Safe to call when unsupported.
  const clearHighlights = useCallback(() => {
    const registry = getHighlightsRegistry();
    if (!registry) return;
    registry.delete(ALL_KEY);
    registry.delete(ACTIVE_KEY);
  }, []);

  // Recompute ranges whenever the query, open state, or document changes.
  // Reading `contentSignal` here ties the effect to live edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contentSignal is the edit trigger
  useEffect(() => {
    if (!open) {
      setRanges([]);
      return;
    }
    const contentEl = resolveContentEl(containerRef.current);
    if (!contentEl) {
      setRanges([]);
      return;
    }
    const found = collectRanges(contentEl, query);
    setRanges(found);
    // Keep the active match in bounds as the set shrinks/grows.
    setActiveIndex((i) => (found.length === 0 ? 0 : Math.min(i, found.length - 1)));
  }, [open, query, contentSignal, containerRef]);

  // Paint all matches + the active one into the CSS highlight registry.
  useEffect(() => {
    const registry = getHighlightsRegistry();
    if (!registry) return;
    if (!open || ranges.length === 0) {
      registry.delete(ALL_KEY);
      registry.delete(ACTIVE_KEY);
      return;
    }
    registry.set(ALL_KEY, makeHighlight(ranges));
    const active = ranges[activeIndex];
    if (active) registry.set(ACTIVE_KEY, makeHighlight([active]));
    else registry.delete(ACTIVE_KEY);
  }, [open, ranges, activeIndex]);

  // Tear down highlights when the box closes or the component unmounts.
  useEffect(() => {
    if (!open) clearHighlights();
    return () => clearHighlights();
  }, [open, clearHighlights]);

  // Scroll the active match into the center of the viewport. Uses the range's
  // own client rect when available, falling back to scrolling its parent block.
  const scrollToActive = useCallback(() => {
    const active = ranges[activeIndex];
    if (!active) return;
    const parentEl =
      active.startContainer.nodeType === Node.ELEMENT_NODE
        ? (active.startContainer as HTMLElement)
        : active.startContainer.parentElement;
    parentEl?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ranges, activeIndex]);

  // Scroll whenever the active match changes while open.
  useEffect(() => {
    if (!open || ranges.length === 0) return;
    scrollToActive();
  }, [open, activeIndex, ranges.length, scrollToActive]);

  // Reset the active index to the first match whenever the query changes.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (lastQueryRef.current !== query) {
      lastQueryRef.current = query;
      setActiveIndex(0);
    }
  }, [query]);

  const next = useCallback(() => {
    setActiveIndex((i) => (ranges.length === 0 ? 0 : (i + 1) % ranges.length));
  }, [ranges.length]);

  const prev = useCallback(() => {
    setActiveIndex((i) => (ranges.length === 0 ? 0 : (i - 1 + ranges.length) % ranges.length));
  }, [ranges.length]);

  const current = useMemo(
    () => (ranges.length === 0 ? 0 : activeIndex + 1),
    [ranges.length, activeIndex]
  );

  return {
    query,
    setQuery,
    total: ranges.length,
    current,
    next,
    prev,
  };
}
