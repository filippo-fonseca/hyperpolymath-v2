"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  date: Date | string;
  className?: string;
  /**
   * Optional title attribute for the rendered span — typically used to
   * show a full timestamp on hover (e.g., `format(d, "PPpp")`). If
   * omitted, no title is set.
   */
  title?: string;
}

/**
 * Hydration-safe relative time renderer.
 *
 * Why this exists: `formatDistanceToNow(d, { addSuffix: true })` is
 * wall-clock dependent. The string the server renders ("less than a
 * minute ago") and the string the client computes on hydration ("1
 * minute ago") can disagree by milliseconds, producing React hydration
 * mismatch warnings on any timestamp that's "fresh" enough.
 *
 * The fix:
 * - Initial render (SSR + first client paint) uses an absolute date —
 *   deterministic, no wall-clock divergence possible.
 * - After mount, swap in the relative label.
 * - Refresh every 30s so "X minutes ago" stays accurate while the page
 *   sits idle.
 * - `suppressHydrationWarning` belt-and-suspenders: the useState
 *   initializer already makes server + first-client-render identical,
 *   but the flag prevents any edge case from leaking through.
 *
 * Use everywhere `formatDistanceToNow` was previously called inline.
 */
export function RelativeTime({ date, className, title }: Props) {
  const d = typeof date === "string" ? new Date(date) : date;
  // Initial render uses absolute date — server and first-client paint agree.
  const [label, setLabel] = useState(() => format(d, "MMM d, yyyy"));

  useEffect(() => {
    const update = () => setLabel(formatDistanceToNow(d, { addSuffix: true }));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [d]);

  return (
    <span className={className} title={title} suppressHydrationWarning>
      {label}
    </span>
  );
}
