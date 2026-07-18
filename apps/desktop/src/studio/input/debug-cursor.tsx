/**
 * StudioDebugCursor — a tiny DOM overlay for verifying input. Gated behind the
 * provider's `debug` prop or `?studioDebug=1`, it renders a fixed 12px ring that
 * follows the cursor, tints when a hover target is resolved, and flashes the last
 * intent name for 600ms.
 *
 * DOM-only, ~1 element. Costs nothing when not rendered.
 */

import { useEffect, useRef, useState } from "react";

import { SD_ACCENT, SD_FONT, SD_FUNCTIONAL } from "../tokens";
import { useStudioCursor, useStudioHover, useStudioIntent } from "./react";

export function StudioDebugCursor(): React.JSX.Element {
  const cursor = useStudioCursor();
  const hover = useStudioHover();

  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useStudioIntent((intent) => {
    setLastIntent(intent.type);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLastIntent(null), 600);
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const size = 12;
  // Sage when a hover target resolves, accent idle. It was #4ade80 / #38bdf8 —
  // two off-ladder hexes. Dev-only, but the sd inks read the same at a glance
  // and cost nothing.
  const color = hover ? SD_FUNCTIONAL.sage : SD_ACCENT;

  return (
    <div
      aria-hidden
      // Test-observability seam: mirror the resolved hover target and last intent
      // here for verification. Zero behavior change; only present under `debug`.
      data-studio-cursor=""
      data-studio-hover={hover ?? ""}
      data-studio-intent={lastIntent ?? ""}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(${cursor.x - size / 2}px, ${cursor.y - size / 2}px, 0)`,
        width: size,
        height: size,
        borderRadius: "9999px",
        border: `2px solid ${color}`,
        boxShadow: `0 0 8px ${color}`,
        pointerEvents: "none",
        opacity: cursor.active ? 1 : 0,
        transition: "opacity 120ms ease, border-color 120ms ease",
        zIndex: 2147483647,
      }}
    >
      {lastIntent ? (
        <span
          style={{
            position: "absolute",
            left: size + 6,
            top: -2,
            whiteSpace: "nowrap",
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            lineHeight: 1,
            letterSpacing: "0.08em",
            color,
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
        >
          {lastIntent}
        </span>
      ) : null}
    </div>
  );
}
