/**
 * HandTrackingLayer — the desktop hand-cursor surface, mounted at the widget
 * layer's hand seam.
 *
 * It owns the whole opt-in lifecycle: a keyboard shortcut (⌘/Ctrl+Shift+H) and a
 * small HUD affordance toggle hand tracking on/off (default OFF on boot). While
 * on AND the window is visible it registers a {@link HandTrackingDriver} into the
 * shared input hub — which loads the MediaPipe model, prompts for camera
 * permission, and streams gesture events — and renders the brass reticle plus the
 * pointer-synthesis consumer that turns pinches into widget drags and presses.
 *
 * Off (or window hidden) there is NO driver registered: no camera, no model, no
 * rAF loop — zero tracking cost. The provider/hub stay mounted but inert so the
 * React context identity never churns.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Hand } from "lucide-react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { StudioHandReticle } from "../cursor/StudioHandReticle";
import { ConfirmGesturePanel } from "../cursor/ConfirmGesturePanel";
import { StudioInputProvider, useStudioInput } from "./react";
import { useHandPointerSynthesis } from "./pointer-synth";
import { HandTrackingDriver, type HandDriverStatus } from "./drivers/hand";
import {
  setHandEnabled,
  setHandStatus,
  useHandTracking,
} from "./hand-status";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable === true;
}

function errorText(reason: Extract<HandDriverStatus, { state: "error" }>["reason"]): string {
  switch (reason) {
    case "permission-denied":
      return "Camera denied";
    case "no-camera":
      return "No camera";
    case "insecure-context":
      return "Camera unavailable";
    case "model-load-failed":
      return "Model failed";
    default:
      return "Error";
  }
}

function statusLabel(enabled: boolean, status: HandDriverStatus): string {
  if (!enabled) return "Hand cursor";
  switch (status.state) {
    case "loading-model":
      return "Loading model…";
    case "awaiting-permission":
      return "Allow camera…";
    case "running":
      return status.handVisible ? "Tracking" : "Show your hand";
    case "error":
      return errorText(status.reason);
    case "idle":
    default:
      return "Starting…";
  }
}

function HandTrackingInner(): React.JSX.Element {
  const bus = useStudioInput();
  const { enabled, status } = useHandTracking();
  const [pageVisible, setPageVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  useHandPointerSynthesis();

  // Suspend tracking when the window is hidden (no wasted camera/GPU in the tray).
  useEffect(() => {
    const onVisibility = (): void => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Register the hand driver only while toggled on AND visible. registerDriver
  // starts it (model load → camera prompt → rAF loop); the returned unregister
  // calls driver.stop(), releasing the camera (LED off) and clearing the loop.
  useEffect(() => {
    if (!enabled || !pageVisible) return;
    const driver = new HandTrackingDriver({ onStatusChange: setHandStatus });
    const unregister = bus.registerDriver(driver);
    return () => {
      unregister();
    };
  }, [enabled, pageVisible, bus]);

  // Keyboard shortcut: ⌘/Ctrl+Shift+H toggles hand tracking.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setHandEnabled(!enabled);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  const running = status.state === "running";
  const errored = status.state === "error";
  const active = enabled && !errored;

  const buttonStyle: CSSProperties = {
    position: "absolute",
    left: 12,
    bottom: 12,
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px",
    border: `1px solid ${active ? STUDIO_COLORS.accent : STUDIO_COLORS.rule}`,
    borderRadius: 8,
    color: active ? STUDIO_COLORS.accent : STUDIO_COLORS.muted,
    background: STUDIO_COLORS.surface,
    fontFamily: STUDIO_MONO,
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    pointerEvents: "auto",
  };

  return (
    <>
      <StudioHandReticle />
      {/* Send confirm-gate affordance: shows while a send is held awaiting a
          yes/no (thumbs-up/down OR voice), dismisses with a tick/cross flourish.
          Mounted here (not the widget layer) so it lives in the studio overlay
          without touching WidgetWindowLayer; visible regardless of hand mode. */}
      <ConfirmGesturePanel />
      <button
        type="button"
        aria-pressed={enabled}
        aria-label="Toggle hand tracking (Cmd+Shift+H)"
        title="Hand cursor · ⌘⇧H"
        onClick={() => setHandEnabled(!enabled)}
        style={buttonStyle}
      >
        <Hand
          size={13}
          aria-hidden
          style={{
            color: running ? STUDIO_COLORS.accent : "inherit",
            opacity: enabled && !running && !errored ? 0.7 : 1,
          }}
        />
        <span>{statusLabel(enabled, status)}</span>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: running
              ? STUDIO_COLORS.accent
              : errored
                ? STUDIO_COLORS.danger
                : enabled
                  ? STUDIO_COLORS.accent
                  : "transparent",
            border: enabled ? "none" : `1px solid ${STUDIO_COLORS.rule}`,
            boxShadow: running ? `0 0 8px ${STUDIO_COLORS.accent}` : "none",
          }}
        />
      </button>
    </>
  );
}

/**
 * Mounts the input provider anchored to the widget stage and renders the hand
 * surface. Safe to mount unconditionally: nothing touches the camera until the
 * toggle is turned on.
 */
export function HandTrackingLayer(): React.JSX.Element {
  const stageRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    stageRef.current = document.querySelector<HTMLElement>("[data-studio-stage]");
  }, []);

  return (
    <StudioInputProvider stageRef={stageRef}>
      <HandTrackingInner />
    </StudioInputProvider>
  );
}
