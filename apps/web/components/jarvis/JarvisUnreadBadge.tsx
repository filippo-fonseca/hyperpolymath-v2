"use client";

import { ensureVisibilityListener, subscribeToUnread } from "@/lib/jarvis/unread-bus";
import { useEffect, useState } from "react";

/**
 * JarvisUnreadBadge (issue #149) — message-counter badge for the JARVIS tab.
 *
 * Subscribes to the unread-bus and renders a small cyan pill showing the count
 * of JARVIS replies that arrived while the user wasn't viewing the
 * conversation. Hidden entirely at zero. Counts above 9 collapse to "9+".
 *
 * Positioning is the caller's job — this returns an inline element meant to be
 * dropped next to the tab label. Pure presentation: all the "should we count"
 * logic lives in the bus.
 */
export function JarvisUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    ensureVisibilityListener();
    return subscribeToUnread(setCount);
  }, []);

  if (count <= 0) return null;

  const label = count > 9 ? "9+" : String(count);

  return (
    <span
      role="status"
      aria-label={`${count} unread JARVIS ${count === 1 ? "message" : "messages"}`}
      className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-medium leading-none tracking-[0.02em] tabular-nums"
      style={{
        color: "var(--canvas)",
        backgroundColor: "var(--hud-cyan)",
        boxShadow: "0 0 6px color-mix(in oklch, var(--hud-cyan) 60%, transparent)",
      }}
    >
      {label}
    </span>
  );
}
