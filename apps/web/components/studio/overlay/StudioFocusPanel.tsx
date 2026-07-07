"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface Props {
  /** Panel title, rendered in EB Garamond. */
  title: string;
  /** Collapse the overlay (close button + programmatic). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * StudioFocusPanel — the crisp DOM frame that holds an expanded widget.
 *
 * A centered Nightwalnut glass card that "comes forward" out of the ambient 3D
 * cloud: opacity + scale + a small upward drift on a soft spring (reversed on
 * exit; `AnimatePresence` in {@link StudioFocusOverlay} owns the unmount). The
 * card stops click propagation so interior clicks never reach the window-level
 * mouse driver (which would otherwise emit an `expand` intent on every click).
 *
 * Presentational only: the intent→store wiring, scrim, and open/closed state
 * all live in the overlay root.
 */
export function StudioFocusPanel({ title, onClose, children }: Props): React.ReactElement {
  const reduced = useReducedMotion();

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="studio-focus-panel"
      // Interior clicks must not bubble to the window-level mouse driver, which
      // emits `expand` on every click (and would re-fire against whatever DOM
      // hover target sits under the cursor).
      onClick={(e) => e.stopPropagation()}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 320, damping: 30 }
      }
      className="relative z-50 flex max-h-[82vh] w-[min(860px,92vw)] flex-col overflow-hidden rounded-2xl border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
      style={{
        // Faint brass inset glow — echoes the 3D world's candlelit chrome.
        boxShadow:
          "0 24px 80px rgba(0,0,0,0.6), inset 0 0 32px rgba(201,162,39,0.06)",
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[color:rgba(201,162,39,0.18)] px-6 py-4">
        <h2
          className="text-[22px] font-semibold text-[#F2E9D8]"
          style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer-always -mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[#8FA8C7] transition-colors duration-100 hover:bg-white/5 hover:text-[#F2E9D8]"
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
    </motion.div>
  );
}

export default StudioFocusPanel;
