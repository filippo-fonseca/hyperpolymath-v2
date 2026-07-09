"use client";

/**
 * StudioWindowSettings — the DOM pane that surfaces the multi-window registry.
 *
 * A quiet monitor-glyph affordance in the top-right corner (z-30, below the
 * focus overlay's z-40 scrim) that expands to a Nightwalnut glass card listing
 * every open Studio window: this one labelled "This window", each peer by its
 * label. Per row a position select (left · center · right) writes through
 * {@link setWindowPosition} — the leader-less last-write-wins channel converges
 * every window on it — and an "Open window" button spawns a same-origin sibling
 * via `window.open`, which self-registers on mount.
 *
 * Presentational + thin: all sync/liveness lives in the window-registry store;
 * this reads it through `useStudioWindows`/`useSelfWindow` and writes only the
 * self position. The registry lifecycle (`startWindowRegistry`) is owned by
 * StudioLoader, not here, so the pane can mount/unmount freely.
 */

import { Monitor, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import {
  setWindowPosition,
  useSelfWindow,
  useStudioWindows,
} from "@/lib/studio/state/window-registry";
import type { StudioWindowPosition } from "@/lib/studio/sync/broadcast";

const FONT_SERIF = "var(--font-eb-garamond, Georgia, serif)";

const POSITIONS: readonly StudioWindowPosition[] = ["left", "center", "right"];

/** Open a same-origin sibling window; it self-registers on mount. */
function openSiblingWindow(): void {
  window.open(window.location.href, "_blank", "noopener");
}

export function StudioWindowSettings(): React.ReactElement {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);

  const windows = useStudioWindows();
  const self = useSelfWindow();

  if (!open) {
    return (
      <div className="pointer-events-none absolute right-6 top-6 z-30">
        <button
          type="button"
          data-studio-window-settings="trigger"
          aria-label="Studio windows"
          onClick={() => setOpen(true)}
          className="cursor-pointer-always pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 text-[#8FA8C7] shadow-[0_16px_48px_rgba(0,0,0,0.5)] transition-colors duration-100 hover:text-[#F2E9D8]"
        >
          <Monitor size={17} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      data-studio-window-settings="panel"
      className="pointer-events-auto absolute right-6 top-6 z-30 flex w-[min(320px,86vw)] flex-col overflow-hidden rounded-2xl border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
      style={{
        boxShadow:
          "0 24px 80px rgba(0,0,0,0.6), inset 0 0 32px rgba(201,162,39,0.06)",
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      transition={
        reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }
      }
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[color:rgba(201,162,39,0.18)] px-4 py-3">
        <h2
          className="flex items-center gap-2 text-[17px] font-semibold text-[#F2E9D8]"
          style={{ fontFamily: FONT_SERIF }}
        >
          <Monitor size={16} strokeWidth={1.75} aria-hidden />
          Windows
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="cursor-pointer-always -mr-1 flex h-7 w-7 items-center justify-center rounded-full text-[#8FA8C7] transition-colors duration-100 hover:bg-white/5 hover:text-[#F2E9D8]"
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      <ul className="flex flex-col gap-2 px-4 py-3">
        {windows.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[color:rgba(201,162,39,0.14)] px-3 py-2"
          >
            <span
              className="min-w-0 truncate text-[14px] text-[#F2E9D8]"
              style={{ fontFamily: FONT_SERIF }}
            >
              {w.isSelf ? "This window" : w.label}
            </span>
            {w.isSelf ? (
              <select
                aria-label="This window position"
                value={self.position}
                onChange={(e) =>
                  setWindowPosition(
                    self.id,
                    e.target.value as StudioWindowPosition,
                  )
                }
                className="cursor-pointer-always rounded-md border border-[color:rgba(201,162,39,0.28)] bg-[#0E0B08] px-2 py-1 text-[13px] text-[#F2E9D8] outline-none"
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <span className="shrink-0 text-[13px] capitalize text-[#8FA8C7]">
                {w.position}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-[color:rgba(201,162,39,0.18)] px-4 py-3">
        <button
          type="button"
          onClick={openSiblingWindow}
          className="cursor-pointer-always w-full rounded-full bg-[#C9A227] px-4 py-1.5 text-sm font-medium text-[#120E0B] transition-colors duration-100 hover:bg-[#E8C46B]"
        >
          Open window
        </button>
      </div>
    </motion.div>
  );
}

export default StudioWindowSettings;
