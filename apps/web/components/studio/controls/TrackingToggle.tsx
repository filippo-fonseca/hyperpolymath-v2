"use client";

/**
 * TrackingToggle — the always-visible corner kill switch for hand/camera
 * tracking. Unlike the onboarding chrome (which comes and goes with the consent
 * flow), this control is persistent: it reflects the current tracking state and
 * lets the user turn tracking ON or OFF by click at any time.
 *
 * Presentational only. All lifecycle (webcam acquire/release, landmarker loop,
 * hand-status writes) lives in {@link useHandControl}; this maps `on` to copy +
 * an accessible switch and calls back up. `onEnable` builds a fresh driver (the
 * consent path, so the camera gate is untouched); `onDisable` stops + releases.
 *
 * Styling follows the studio's inlined-palette convention (do NOT import
 * materials/tokens.ts — it drags `three` into the DOM chunk): #120E0B glass,
 * brass border/accents, EB Garamond. Layered at z-30 in a pointer-events-none
 * frame so it never eats stage clicks except on the button itself.
 */

import { motion, useReducedMotion } from "motion/react";

// Copy — single source of truth; asserted verbatim in the test suite.
export const TRACKING_TOGGLE_COPY = {
  on: "Tracking on",
  off: "Tracking off",
  /** Accessible name — stable across states so the switch role stays findable. */
  label: "Hand tracking",
} as const;

const FONT_SERIF = "var(--font-eb-garamond, Georgia, serif)";

const PILL_CLASS =
  "pointer-events-auto flex items-center gap-2 rounded-full border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 px-3.5 py-1.5 text-sm shadow-[0_16px_48px_rgba(0,0,0,0.5)] transition-colors duration-100";

export interface TrackingToggleProps {
  /** True when hand tracking is enabled (pref === "on"). */
  on: boolean;
  /** Turn tracking on — builds + starts a fresh driver (consent path). */
  onEnable: () => void;
  /** Turn tracking off — stops the driver + releases the webcam. */
  onDisable: () => void;
}

export function TrackingToggle({
  on,
  onEnable,
  onDisable,
}: TrackingToggleProps): React.ReactElement {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      className="pointer-events-none absolute bottom-6 right-6 z-30"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2 }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={TRACKING_TOGGLE_COPY.label}
        data-tracking-toggle=""
        data-tracking-on={on ? "true" : "false"}
        onClick={on ? onDisable : onEnable}
        className={`cursor-pointer-always ${PILL_CLASS} text-[#8FA8C7] hover:text-[#F2E9D8]`}
        style={{ fontFamily: FONT_SERIF }}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${on ? "bg-[#4FA487]" : "bg-[#8FA8C7]"}`}
          aria-hidden
        />
        {on ? TRACKING_TOGGLE_COPY.on : TRACKING_TOGGLE_COPY.off}
      </button>
    </motion.div>
  );
}

export default TrackingToggle;
