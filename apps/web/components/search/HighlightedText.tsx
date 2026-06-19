"use client";

import { highlightSegments } from "@/lib/search";

interface Props {
  text: string;
  query: string;
  className?: string;
}

/**
 * Renders `text` with every case-insensitive occurrence of `query` wrapped in
 * <mark>. The <mark> styling lives in globals.css (amber tint) so it's
 * consistent across both search surfaces.
 */
export function HighlightedText({ text, query, className }: Props) {
  const segments = highlightSegments(text, query);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="search-mark">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}
