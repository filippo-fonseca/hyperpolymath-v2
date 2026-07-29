import { useEffect, useState } from "react";
import { ArrowUp, Check, TriangleAlert, X } from "lucide-react";

import { isCapturing, isVisible } from "./machine";
import { pillAnchor } from "./corner";
import { useWindowDrag } from "./use-window-drag";
import { Waveform } from "./Waveform";
import type {
  FlowPillCorner,
  FlowPillState,
  FlowPillStatus,
  LevelSource,
} from "./types";

/**
 * FlowPill.tsx — everything the user sees.
 *
 * The pill's entire vocabulary is three sentences: I am listening, I heard you,
 * I sent it. There is no reply bubble, no transcript preview of what JARVIS
 * said, and no audio. The response is visible only in the web conversation, and
 * this file must never import anything from the HUD path that would drag TTS in
 * behind it.
 *
 * The exit animation is why the component keeps its own `leaving` state instead
 * of just rendering on `isVisible`. The machine goes to `idle` the instant the
 * fade is scheduled to end, and unmounting on that would make the pill vanish
 * rather than fade.
 */

const EXIT_MS = 220;

interface Props {
  state: FlowPillState;
  /** u2's RMS stream, already normalised to 0..1. */
  levels: LevelSource;
  /** Discard and send nothing. Wired to Cancel and to Escape. */
  onCancel: () => void;
  /** End the utterance and send it. Wired to Done. */
  onDone: () => void;
  /** Where the window is parked, which decides the pill's anchor edge. */
  corner?: FlowPillCorner;
}

/** The one line of copy each status is allowed. Short, and honest. */
function statusCopy(state: FlowPillState): string {
  switch (state.status) {
    case "transcribing":
      return "Transcribing";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "error":
      return state.error ?? "Something went wrong";
    default:
      return "";
  }
}

function tone(status: FlowPillStatus): "pending" | "done" | "error" {
  if (status === "sent") return "done";
  if (status === "error") return "error";
  return "pending";
}

export function FlowPill({ state, levels, onCancel, onDone, corner }: Props) {
  const drag = useWindowDrag(corner);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(() => isVisible(state));
  const visible = isVisible(state);

  useEffect(() => {
    if (visible) {
      setLeaving(false);
      setMounted(true);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setLeaving(false);
      setMounted(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible, mounted]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    // NOTE for the controller unit: this only fires when the overlay window has
    // keyboard focus, and the overlay is deliberately non-activating so that
    // showing it never steals focus from the app the user is dictating next to.
    // Escape therefore has to *also* arrive from the global key path. This
    // listener is the local half, and it is what makes Escape work in the
    // browser and in dev.
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, onCancel]);

  if (!mounted) return null;

  const capturing = isCapturing(state);
  const copy = statusCopy(state);
  const showControls = capturing || state.status === "transcribing" || state.status === "sending";

  return (
    <div className="flowpill-stage" data-anchor={pillAnchor(drag.corner)}>
      <div
        className={`flowpill ${leaving ? "flowpill-exit" : "flowpill-enter"}`}
        data-status={state.status}
        data-dragging={drag.dragging ? "true" : "false"}
        onPointerDown={drag.onPointerDown}
      >
        {/* The mode chip is an affordance, not a status: it tells the user
            which gesture ends the utterance. Once the microphone is closed
            there is no gesture left to make, so it goes rather than lingering
            as decoration next to "Transcribing". */}
        {capturing && state.mode ? (
          <div className="flowpill-mode">
            <span
              className="flowpill-dot"
              data-mode={state.mode}
              aria-hidden="true"
            />
            <span className="flowpill-label">
              {state.mode === "locked" ? "Locked" : "Hold"}
            </span>
          </div>
        ) : null}

        {capturing ? (
          <Waveform source={levels} active={state.status === "listening"} />
        ) : (
          <div
            className="flowpill-status"
            data-tone={tone(state.status)}
            role="status"
            aria-live="polite"
          >
            <span className="flowpill-status-icon" aria-hidden="true">
              {state.status === "sent" ? <Check size={14} strokeWidth={2.2} /> : null}
              {state.status === "error" ? (
                <TriangleAlert size={14} strokeWidth={2.2} />
              ) : null}
              {state.status === "transcribing" || state.status === "sending" ? (
                <span className="flowpill-ellipsis">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
            </span>
            <span>{copy}</span>
          </div>
        )}

        {showControls ? (
          <div className="flowpill-controls">
            <button
              type="button"
              className="flowpill-button"
              data-role="cancel"
              title="Cancel (Esc)"
              aria-label="Cancel dictation"
              onClick={onCancel}
            >
              <X size={16} strokeWidth={2} />
            </button>
            {capturing ? (
              <button
                type="button"
                className="flowpill-button"
                data-role="done"
                title="Send to JARVIS"
                aria-label="Send to JARVIS"
                onClick={onDone}
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
