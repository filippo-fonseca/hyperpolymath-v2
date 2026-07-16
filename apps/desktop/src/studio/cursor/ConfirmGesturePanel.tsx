/**
 * ConfirmGesturePanel — the on-screen affordance for the send confirm gate.
 *
 * While a `send_message` is held awaiting a yes/no, this bottom-center panel
 * appears: "Awaiting confirmation" with the two gesture answers (👍 approve · 👎
 * cancel) and a subtle pulse, so a hand user KNOWS a thumbs-up/down is expected
 * (voice yes/no still works simultaneously — the gate accepts whichever lands
 * first). On resolution it plays a brief tick (sent) or cross (cancelled)
 * flourish, then dismisses. A silent TTL expiry just fades out.
 *
 * State is driven entirely by the confirm gate's own emitters
 * (`onConfirmPendingChange` + `onConfirmResolved`) — this component never touches
 * gate logic, and the gesture→gate wiring lives in pointer-synth. Rendered from
 * HandTrackingLayer so it sits inside the studio stage overlay without touching
 * the widget layer.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import {
  onConfirmPendingChange,
  onConfirmResolved,
  type ConfirmResolution,
} from "@/actions/confirm-gate";

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
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 84,
            transform: "translateX(-50%)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 18px",
            borderRadius: 14,
            border: `1px solid ${
              resolved?.resolution === "cancelled"
                ? STUDIO_COLORS.danger
                : STUDIO_COLORS.accent
            }`,
            background: "color-mix(in srgb, #0A0E1A 88%, transparent)",
            backdropFilter: "blur(10px)",
            boxShadow: `0 18px 46px ${STUDIO_COLORS.shadow}, 0 0 0 1px color-mix(in srgb, ${STUDIO_COLORS.accent} 24%, transparent)`,
            fontFamily: STUDIO_MONO,
            color: STUDIO_COLORS.text,
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
      <motion.span
        aria-hidden
        animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={reduced ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 8,
          height: 8,
          borderRadius: "9999px",
          background: STUDIO_COLORS.accent,
          boxShadow: `0 0 10px ${STUDIO_COLORS.accent}`,
        }}
      />
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: STUDIO_COLORS.muted,
        }}
      >
        Awaiting confirmation
      </span>
      <span aria-hidden style={{ color: STUDIO_COLORS.rule }}>·</span>
      <Answer emoji="👍" label="approve" color={STUDIO_COLORS.accent} />
      <Answer emoji="👎" label="cancel" color={STUDIO_COLORS.danger} />
    </>
  );
}

function Answer({
  emoji,
  label,
  color,
}: {
  emoji: string;
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color }}>{label}</span>
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
  const color = sent ? STUDIO_COLORS.accent : STUDIO_COLORS.danger;
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
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color }}>
        {sent ? "Sent" : "Cancelled"}
      </span>
    </>
  );
}

export default ConfirmGesturePanel;
