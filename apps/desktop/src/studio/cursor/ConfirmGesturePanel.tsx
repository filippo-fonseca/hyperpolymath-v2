/**
 * ConfirmGesturePanel — the on-screen affordance for the send confirm gate.
 *
 * While a `send_message` is held awaiting a yes/no, this bottom-center panel
 * appears: "Awaiting confirmation" with the two gesture answers and a subtle
 * pulse, so a hand user KNOWS a thumbs-up/down is expected. On resolution it
 * plays a brief tick (sent) or cross (cancelled) flourish, then dismisses. A
 * silent TTL expiry just fades out.
 *
 * THIS PANEL IS THE APP'S ONLY GESTURE TEACHER. Roughly a dozen gestures ship
 * (pinch, fist-drag, open-palm halt, four-finger scroll, swipe, …) and this is
 * the one surface that ever names one on screen — so the restyle deliberately
 * makes it teach MORE, not less:
 *   - Each answer now names the gesture ("Thumbs up") next to its outcome
 *     ("Approve"), instead of an emoji beside a bare lowercase verb that left
 *     the reader to infer the gesture from the glyph.
 *   - The voice path is stated. Voice yes/no has always worked here in parallel
 *     (the gate takes whichever answer lands first) and nothing said so, which
 *     made a whole modality undiscoverable.
 * Anything that trims this panel's copy is trimming the only gesture
 * documentation a user ever sees.
 *
 * State is driven entirely by the confirm gate's own emitters
 * (`onConfirmPendingChange` + `onConfirmResolved`) — this component never touches
 * gate logic, and the gesture→gate wiring lives in pointer-synth. Rendered from
 * HandTrackingLayer so it sits inside the studio stage overlay without touching
 * the widget layer.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  SD_ACCENT,
  SD_FONT,
  SD_FUNCTIONAL,
  SD_HAIRLINE,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "../tokens";
import {
  onConfirmPendingChange,
  onConfirmResolved,
  type ConfirmResolution,
} from "@/actions/confirm-gate";

/** Approve reads accent; cancel reads coral — the two §D6 functional inks. */
const APPROVE_INK = SD_ACCENT;
const CANCEL_INK = SD_FUNCTIONAL.coral;

/**
 * A §10 tone chip: the ink itself carries the text, tints the hairline to 30%,
 * and washes the box surface at 15%. Nothing here is a filled accent row.
 */
function toneChip(ink: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "4px 9px",
    borderRadius: SD_RADIUS.chip,
    border: `1px solid color-mix(in srgb, ${ink} 30%, ${SD_SURFACES.line})`,
    background: `color-mix(in srgb, ${ink} 15%, ${SD_SURFACES.box})`,
    color: ink,
  };
}

type PanelState =
  | { phase: "hidden" }
  | { phase: "pending" }
  | { phase: "resolved"; resolution: Extract<ConfirmResolution, "sent" | "cancelled"> };

/** How long the tick/cross flourish stays up before the panel dismisses. */
const RESOLVE_FLOURISH_MS = 900;

export function ConfirmGesturePanel(): React.JSX.Element {
  const [state, setState] = useState<PanelState>({ phase: "hidden" });
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    let flourishTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFlourish = (): void => {
      if (flourishTimer) {
        clearTimeout(flourishTimer);
        flourishTimer = null;
      }
    };

    const unPending = onConfirmPendingChange((isPending) => {
      if (isPending) {
        clearFlourish();
        setState({ phase: "pending" });
      }
      // A false here is handled by onConfirmResolved (which fires alongside it for
      // a real answer). A bare pending=false with no resolution shouldn't happen,
      // but guard: if we're still "pending" when it clears with no resolution
      // event, fall back to hidden on the next resolved tick.
    });

    const unResolved = onConfirmResolved((resolution) => {
      clearFlourish();
      if (resolution === "expired") {
        setState({ phase: "hidden" });
        return;
      }
      setState({ phase: "resolved", resolution });
      flourishTimer = setTimeout(() => {
        setState({ phase: "hidden" });
        flourishTimer = null;
      }, RESOLVE_FLOURISH_MS);
    });

    return () => {
      unPending();
      unResolved();
      clearFlourish();
    };
  }, []);

  const visible = state.phase !== "hidden";
  const resolved = state.phase === "resolved" ? state : null;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="confirm-gesture-panel"
          aria-live="polite"
          // The half-width shift is motion's, not CSS's. `transform:
          // translateX(-50%)` in `style` loses every frame motion animates `y` /
          // `scale`, because motion composes the whole transform itself — so a
          // panel documented as bottom-CENTER has actually been rendering with
          // its left edge on the centre line. Harmless while it was a short
          // strip; not once it carries two named gestures.
          initial={reduced ? { x: "-50%", opacity: 0 } : { x: "-50%", opacity: 0, y: 14, scale: 0.96 }}
          animate={reduced ? { x: "-50%", opacity: 1 } : { x: "-50%", opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { x: "-50%", opacity: 0 } : { x: "-50%", opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 84,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            // Panel grammar: 12px shell, --sd-line hairline, and the white inset
            // top hairline for lift. The border takes a tone only once the gate
            // has actually resolved; while pending it stays neutral and the
            // chips inside carry the meaning.
            borderRadius: SD_RADIUS.panel,
            border: `1px solid ${
              resolved
                ? resolved.resolution === "cancelled"
                  ? CANCEL_INK
                  : APPROVE_INK
                : SD_SURFACES.line
            }`,
            // Glass STAYS: this is chrome, per sealed D1.
            background: `color-mix(in srgb, ${SD_SURFACES.app} 88%, transparent)`,
            backdropFilter: "blur(10px)",
            // Was a 46px shade plus a full accent ring around the whole panel.
            // Accent rings are for focus, never decoration, so depth is the
            // inset hairline and a grounding shadow.
            boxShadow: `${SD_HAIRLINE.panel}, 0 12px 28px rgb(0 0 0 / 0.34)`,
            fontFamily: SD_FONT.sans,
            color: SD_INK.base,
            pointerEvents: "none",
          }}
        >
          {resolved ? (
            <ResolvedContent resolution={resolved.resolution} reduced={reduced} />
          ) : (
            <PendingContent reduced={reduced} />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PendingContent({ reduced }: { reduced: boolean }): React.JSX.Element {
  return (
    <>
      {/* Live status dot — a functional ink at 6-8px is the one shape §2 lets it
          take. The 10px halo it wore is gone; the pulse already reads as live. */}
      <motion.span
        aria-hidden
        animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={reduced ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 6,
          height: 6,
          flexShrink: 0,
          borderRadius: SD_RADIUS.full,
          background: APPROVE_INK,
        }}
      />

      <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Eyebrow: the mono register's actual job (§3) — 11px, uppercase, 0.1em.
            The voice clause rides here beside it, so the line reads as the one
            "how do I answer this" sentence. The gate has always taken a spoken
            yes/no in parallel with the gesture and nothing on screen said so,
            which left a whole modality undiscoverable. */}
        <span
          style={{
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: SD_INK.faint,
            whiteSpace: "nowrap",
          }}
        >
          Awaiting confirmation · or say “yes” / “no”
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Answer emoji="👍" gesture="Thumbs up" outcome="Approve" ink={APPROVE_INK} />
          <Answer emoji="👎" gesture="Thumbs down" outcome="Cancel" ink={CANCEL_INK} />
        </span>
      </span>
    </>
  );
}

/**
 * One answer, as a §10 tone chip. It names the GESTURE and then its outcome —
 * the emoji alone made the reader decode the glyph, and "approve" alone never
 * said what to do with their hand.
 */
function Answer({
  emoji,
  gesture,
  outcome,
  ink,
}: {
  emoji: string;
  gesture: string;
  outcome: string;
  ink: string;
}): React.JSX.Element {
  return (
    <span style={toneChip(ink)}>
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
        {emoji}
      </span>
      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.025em" }}>
        {gesture}
      </span>
      <span aria-hidden style={{ color: SD_SURFACES.frame }}>
        ·
      </span>
      <span style={{ fontSize: 11, letterSpacing: "0.025em", color: SD_INK.dull }}>
        {outcome}
      </span>
    </span>
  );
}

function ResolvedContent({
  resolution,
  reduced,
}: {
  resolution: "sent" | "cancelled";
  reduced: boolean;
}): React.JSX.Element {
  const sent = resolution === "sent";
  const color = sent ? APPROVE_INK : CANCEL_INK;
  return (
    <>
      <motion.span
        aria-hidden
        initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1.2] }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          fontSize: 14,
          color,
        }}
      >
        {sent ? "✓" : "✕"}
      </motion.span>
      <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em", color }}>
        {sent ? "Sent" : "Cancelled"}
      </span>
    </>
  );
}

export default ConfirmGesturePanel;
