/**
 * StudioHandReticle — the on-brand brass hand cursor for the Studio (desktop port).
 *
 * In hand mode there is no OS cursor over the stage, so this is the ONLY thing
 * telling the user where they're aiming. It renders a candlelit brass ring +
 * parchment dot that follows the shared input cursor at 60fps, snaps larger when
 * it hovers a hittable target, and fires one-shot pulses on expand / collapse /
 * swipe intents.
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
 * Palette is inlined (matches the overlay convention) so this DOM overlay drags
 * in no token module.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { useStudioCursor, useStudioHover, useStudioIntent } from "../input/react";
import type { StudioIntentType } from "../input/types";
import { useHandStatus } from "../input/hand-status";

// ── Brand palette (inlined; see header) ──────────────────────────────────────
const BRASS = "#C9A227";
const FLAME = "#E8C46B";
const PARCHMENT = "#F2E9D8";

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
  const ringBorder = ringActive ? FLAME : BRASS;
  const ringGlow = hovering
    ? `0 0 14px rgba(232,196,107,0.6), 0 0 32px rgba(201,162,39,0.28)`
    : `0 0 10px rgba(201,162,39,0.45), 0 0 24px rgba(201,162,39,0.18)`;
  const ringEase = reduced ? "0ms" : "140ms";

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
        zIndex: 35,
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
          transition: `transform ${ringEase} cubic-bezier(.2,.9,.3,1.2), border-color ${ringEase} ease, box-shadow ${ringEase} ease`,
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
            backgroundColor: hovering ? PARCHMENT : "rgba(242,233,216,0.85)",
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
    const gradient =
      type === "swipeLeft"
        ? "linear-gradient(to left, rgba(201,162,39,0), rgba(201,162,39,0.7))"
        : "linear-gradient(to right, rgba(201,162,39,0), rgba(201,162,39,0.7))";
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

  const isExpand = type === "expand";
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
        border: isExpand ? `1.5px solid ${FLAME}` : `1.5px solid rgba(201,162,39,0.7)`,
        transform: "translate(-50%, -50%)",
        animation: isExpand
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
