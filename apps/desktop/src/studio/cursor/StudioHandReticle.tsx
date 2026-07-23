/**
 * StudioHandReticle — the on-brand brass hand cursor for the Studio (desktop port).
 *
 * In hand mode there is no OS cursor over the stage, so this is the ONLY thing
 * telling the user where they're aiming. It renders an accent ring + bright ink
 * dot that follows the shared input cursor at 60fps, snaps larger when it hovers
 * a hittable target, and fires one-shot pulses on expand / collapse / swipe
 * intents.
 *
 * Visibility gate (the key design decision): the reticle shows its visuals only
 * while the hand driver is running AND the cursor is active —
 *   `visible = handStatus.state === "running" && cursor.active`.
 * The component always mounts (hooks stay unconditional) and gates via opacity.
 *
 * Perf: the outer wrapper's `translate3d` is the ONLY thing on the 60fps hot
 * path and is never transitioned (a transition here would rubber-band the
 * cursor). All easing lives on the inner ring / one-shot pulse child.
 *
 * Palette: one accent, from the sd ladder. It used to be candlelit brass
 * (#C9A227 / #E8C46B / #F2E9D8) — a whole second hue living on the one element
 * that sits over every surface in the app, which is the last place a second hue
 * belongs (§2). Rest reads --sd-accent, a hover snap brightens to the faint
 * step, and the aim dot is bright ink.
 *
 * The halo stays. §16 bans glow rings on content surfaces, and this is not one:
 * it is the cursor, and it has to stay legible over a widget, over the drawer's
 * glass, and over the near-black canvas alike. It is retinted, not removed.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { useStudioCursor, useStudioHover, useStudioIntent } from "../input/react";
import type { StudioIntentType } from "../input/types";
import { useHandStatus } from "../input/hand-status";
import { SD_ACCENT, SD_ACCENT_FAINT, SD_DURATION, SD_INK } from "../tokens";

/** Rest / hover ring inks, and the precise aim dot. */
const RING_REST = SD_ACCENT;
const RING_LIVE = SD_ACCENT_FAINT;
const AIM_DOT = SD_INK.base;

/** The accent at an alpha, safe for oklch (rgba() cannot take an oklch value). */
const accentAlpha = (percent: number): string =>
  `color-mix(in srgb, ${SD_ACCENT} ${percent}%, transparent)`;

// ── Geometry ─────────────────────────────────────────────────────────────────
const RING = 18; // px diameter of the aim ring
const DOT = 3; // px diameter of the precise center dot

/** How long a one-shot feedback pulse stays asserted before it clears. */
const FEEDBACK_MS = 450;

type Feedback = { type: StudioIntentType; key: number };

function flickDir(type: StudioIntentType): "left" | "right" | "" {
  if (type === "swipeLeft") return "left";
  if (type === "swipeRight") return "right";
  return "";
}

export function StudioHandReticle(): React.JSX.Element {
  const cursor = useStudioCursor();
  const hoverTarget = useStudioHover();
  const handStatus = useHandStatus();
  const reduced = useReducedMotion() ?? false;

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const keyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-shot pulse: a new intent replaces the old (key bump re-mounts the pulse
  // child so its CSS animation restarts), cleared after FEEDBACK_MS.
  useStudioIntent((intent) => {
    keyRef.current += 1;
    setFeedback({ type: intent.type, key: keyRef.current });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const running = handStatus.state === "running";
  const visible = running && cursor.active;
  const hovering = hoverTarget !== null;

  const dir = feedback ? flickDir(feedback.type) : "";

  // Inner-ring appearance. Hover = magnetic snap (scale up + candleflame). Under
  // reduced motion a feedback pulse becomes a color-only flash on this ring.
  const ringActive = hovering || (reduced && feedback !== null);
  const ringScale = hovering ? 1.35 : 1;
  const ringBorder = ringActive ? RING_LIVE : RING_REST;
  const ringGlow = hovering
    ? `0 0 14px ${accentAlpha(60)}, 0 0 32px ${accentAlpha(28)}`
    : `0 0 10px ${accentAlpha(45)}, 0 0 24px ${accentAlpha(18)}`;
  const ringEase = reduced ? "0ms" : `${SD_DURATION.micro}ms`;

  return (
    <div
      aria-hidden
      data-studio-reticle=""
      data-reticle-visible={visible ? "true" : "false"}
      data-reticle-hover={hovering ? "true" : "false"}
      data-reticle-feedback={feedback?.type ?? ""}
      data-reticle-flick-dir={dir}
      data-reticle-reduced={reduced ? "true" : "false"}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        // Hot path: positional transform only, NEVER transitioned.
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
        width: 0,
        height: 0,
        pointerEvents: "none",
        // Above EVERYTHING it aims at: widget layer (z20), drawer (z40), and the
        // confirm-gesture panel (z50). In hand mode the reticle is the only thing
        // telling the user where they're pointing, so it must never be occluded —
        // it was z35 (behind the z40 drawer), which read as "the cursor vanishes
        // over the drawer". pointer-events stay none, so raising it can't eat clicks.
        zIndex: 60,
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms ease",
      }}
    >
      <StyleBlock />

      {/* Inner ring — hover snap + reduced-motion color flash live here. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: RING,
          height: RING,
          borderRadius: "9999px",
          border: `1.5px solid ${ringBorder}`,
          boxShadow: ringGlow,
          transform: `translate(-50%, -50%) scale(${ringScale})`,
          // The snap was a spring (overshoot 1.2). §14 reserves overshoot for
          // success and confirm moments, so it settles on ease-out-quart. The
          // 1.35 magnetic snap itself is behaviour — it is how the reticle says
          // "this is hittable" — and stays.
          transition: `transform ${ringEase} cubic-bezier(0.25, 1, 0.5, 1), border-color ${ringEase} ease, box-shadow ${ringEase} ease`,
        }}
      >
        {/* Precise aim dot. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: DOT,
            height: DOT,
            borderRadius: "9999px",
            transform: "translate(-50%, -50%)",
            backgroundColor: hovering
              ? AIM_DOT
              : `color-mix(in srgb, ${AIM_DOT} 85%, transparent)`,
            transition: `background-color ${ringEase} ease`,
          }}
        />
      </div>

      {/* One-shot pulse child — remounted per intent via key. Animated only when
          motion is allowed; reduced motion uses the inner-ring color flash. */}
      {!reduced && feedback ? <Pulse key={feedback.key} type={feedback.type} /> : null}
    </div>
  );
}

/** The keyed, fire-and-forget feedback pulse. */
function Pulse({ type }: { type: StudioIntentType }): React.JSX.Element {
  if (type === "swipeLeft" || type === "swipeRight") {
    const x = type === "swipeLeft" ? "-14px" : "14px";
    const gradient = `linear-gradient(to ${
      type === "swipeLeft" ? "left" : "right"
    }, ${accentAlpha(0)}, ${accentAlpha(70)})`;
    return (
      <span
        aria-hidden
        style={
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: 22,
            height: 3,
            borderRadius: 2,
            background: gradient,
            transform: "translate(-50%, -50%)",
            animation: "studio-reticle-flick 300ms ease-out forwards",
            pointerEvents: "none",
            "--flick-x": x,
          } as React.CSSProperties
        }
      />
    );
  }

  // `tap` (primary click) and `expand` (pinch-bloom) both bloom the ring outward
  // so every click is visibly confirmed at the reticle. `confirmApprove` reuses
  // the same pop (a positive flourish); `confirmCancel` uses the inward collapse.
  const isPop = type === "expand" || type === "tap" || type === "confirmApprove";
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: RING,
        height: RING,
        borderRadius: "9999px",
        border: `1.5px solid ${isPop ? RING_LIVE : accentAlpha(70)}`,
        transform: "translate(-50%, -50%)",
        animation: isPop
          ? "studio-reticle-expand 380ms ease-out forwards"
          : "studio-reticle-collapse 320ms ease-in forwards",
        pointerEvents: "none",
      }}
    />
  );
}

/** Component-scoped keyframes — no global CSS edits. */
function StyleBlock(): React.JSX.Element {
  return (
    <style>{`
@keyframes studio-reticle-expand {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
}
@keyframes studio-reticle-collapse {
  0% { transform: translate(-50%, -50%) scale(1.8); opacity: 0.7; }
  100% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
}
@keyframes studio-reticle-flick {
  0% { transform: translate(-50%, -50%); opacity: 0.6; }
  35% { transform: translate(calc(-50% + var(--flick-x)), -50%); opacity: 0.5; }
  100% { transform: translate(calc(-50% + (var(--flick-x) * 1.6)), -50%); opacity: 0; }
}
`}</style>
  );
}

export default StudioHandReticle;
