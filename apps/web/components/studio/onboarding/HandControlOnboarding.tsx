"use client";

/**
 * HandControlOnboarding — the on-brand consent + status chrome that makes the
 * Studio genuinely hand-controlled.
 *
 * Behaviour lives in {@link useHandControl}; this component is presentational:
 * it maps `(pref, status)` to one of a consent card, a compact status pill, or
 * an error card with recovery. Hand control is ADDITIVE — the mouse driver keeps
 * running throughout, so "Use mouse" / "Turn off" simply revert to mouse-only.
 *
 * Layering (D5): rendered at `z-30` inside the stage — above the Canvas, below
 * the focus overlay's `z-40` scrim, so an expanded panel always covers this.
 *
 * Camera gate: the driver is built only inside `useHandControl`'s register path,
 * which never runs before an explicit "Enable hand control" click (or a stored
 * opt-in). No `getUserMedia` can fire from a fresh, un-consented visit.
 */

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { TrackingToggle } from "@/components/studio/controls/TrackingToggle";
import type { HandDriverStatus } from "@/lib/studio/input/drivers/hand";
import {
  type CreateDriver,
  defaultCreateDriver,
  useHandControl,
} from "./useHandControl";

// Copy strings — single source of truth; asserted verbatim in the test suite.
const COPY = {
  consentTagline: "Control the Studio with your hand — point to aim, pinch to open.",
  enable: "Enable hand control",
  useMouse: "Use mouse",
  loading: "Loading hand tracking…",
  awaiting: "Allow camera access to control with your hand",
  showHand: "Show me your hand ✋",
  handOn: "Hand control on",
  turnOff: "Turn off",
  useMouseInstead: "Use mouse instead",
  tryAgain: "Try again",
  errInsecure: "Hand control needs a secure (HTTPS) connection.",
  errNoCamera: "No camera was found on this device.",
  errPermissionDenied:
    "Camera access was denied. Allow it in your browser settings, then try again.",
  errModelLoadFailed: "Hand tracking couldn't load.",
} as const;

const FONT_SERIF = "var(--font-eb-garamond, Georgia, serif)";

// ── Shared chrome ──────────────────────────────────────────────────────────

const CARD_CLASS =
  "pointer-events-auto flex max-w-[360px] flex-col gap-3 rounded-2xl border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.6)]";

const PILL_CLASS =
  "pointer-events-auto flex items-center gap-2.5 rounded-full border border-[color:rgba(201,162,39,0.28)] bg-[#120E0B]/95 px-3.5 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]";

function BrassButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer-always rounded-full bg-[#C9A227] px-4 py-1.5 text-sm font-medium text-[#120E0B] transition-colors duration-100 hover:bg-[#E8C46B]"
    >
      {children}
    </button>
  );
}

function QuietButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer-always rounded-full px-3 py-1.5 text-sm text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
    >
      {children}
    </button>
  );
}

// ── Views ──────────────────────────────────────────────────────────────────

function ConsentCard({
  reduced,
  onEnable,
  onDismiss,
}: {
  reduced: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <Frame reduced={reduced} placement="center">
      <div className={CARD_CLASS}>
        <p
          className="text-[15px] leading-snug text-[#F2E9D8]"
          style={{ fontFamily: FONT_SERIF }}
        >
          {COPY.consentTagline}
        </p>
        <div className="flex items-center justify-end gap-1">
          <QuietButton onClick={onDismiss}>{COPY.useMouse}</QuietButton>
          <BrassButton onClick={onEnable}>{COPY.enable}</BrassButton>
        </div>
      </div>
    </Frame>
  );
}

function ErrorCard({
  reduced,
  message,
  retryable,
  onRetry,
  onDisable,
}: {
  reduced: boolean;
  message: string;
  retryable: boolean;
  onRetry: () => void;
  onDisable: () => void;
}): React.ReactElement {
  return (
    <Frame reduced={reduced} placement="center">
      <div className={CARD_CLASS}>
        <p
          className="text-[15px] leading-snug text-[#F2E9D8]"
          style={{ fontFamily: FONT_SERIF }}
        >
          {message}
        </p>
        <div className="flex items-center justify-end gap-1">
          <QuietButton onClick={onDisable}>{COPY.useMouseInstead}</QuietButton>
          {retryable ? (
            <BrassButton onClick={onRetry}>{COPY.tryAgain}</BrassButton>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

function StatusPill({
  reduced,
  status,
  onDisable,
}: {
  reduced: boolean;
  status: HandDriverStatus | null;
  onDisable: () => void;
}): React.ReactElement {
  let body: React.ReactNode = null;

  if (status?.state === "loading-model") {
    body = (
      <span className="flex items-center gap-1.5 text-sm text-[#F2E9D8]">
        <Loader2 className="animate-spin" size={14} aria-hidden />
        {COPY.loading}
      </span>
    );
  } else if (status?.state === "awaiting-permission") {
    body = <span className="text-sm text-[#F2E9D8]">{COPY.awaiting}</span>;
  } else if (status?.state === "running" && !status.handVisible) {
    body = <span className="text-sm text-[#F2E9D8]">{COPY.showHand}</span>;
  } else if (status?.state === "running" && status.handVisible) {
    // Quiet "driving" indicator — the user is now controlling with their hand.
    body = (
      <span className="flex items-center gap-2 text-sm text-[#8FA8C7]">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[#4FA487]"
          aria-hidden
        />
        {COPY.handOn}
      </span>
    );
  }
  // `idle` / null → no status text (transient), pill still offers "Turn off".

  return (
    <Frame reduced={reduced} placement="corner">
      <div className={PILL_CLASS} style={{ fontFamily: FONT_SERIF }}>
        {body}
        <button
          type="button"
          onClick={onDisable}
          className="cursor-pointer-always rounded-full px-2 py-0.5 text-xs text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
        >
          {COPY.turnOff}
        </button>
      </div>
    </Frame>
  );
}

function Frame({
  reduced,
  placement,
  children,
}: {
  reduced: boolean;
  placement: "center" | "corner";
  children: React.ReactNode;
}): React.ReactElement {
  // The persistent TrackingToggle owns the bottom-right corner (bottom-6 right-6),
  // so the status pill stacks just above it to avoid overlap while tracking is on.
  const position =
    placement === "center"
      ? "bottom-6 left-1/2 -translate-x-1/2"
      : "bottom-[4.25rem] right-6";
  return (
    <motion.div
      className={`pointer-events-none absolute z-30 ${position}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────

export interface HandControlOnboardingProps {
  /** Driver factory seam (tests inject a fake); defaults to the real driver. */
  createDriver?: CreateDriver;
}

export function HandControlOnboarding({
  createDriver = defaultCreateDriver,
}: HandControlOnboardingProps = {}): React.ReactElement | null {
  const reduced = useReducedMotion() ?? false;
  const { pref, status, enable, disable, retry, dismiss } =
    useHandControl(createDriver);

  // Pre-hydration → render nothing (avoid a wrong-state toggle flash before the
  // stored pref is known).
  if (pref === undefined) return null;

  // The persistent kill switch is ALWAYS present past hydration — even when the
  // rest of the onboarding chrome is dormant (opted-out) — so tracking can be
  // toggled back on at any time. Clicking it while off runs the same enable()
  // path as consent, so the camera gate is preserved.
  const toggle = (
    <TrackingToggle on={pref === "on"} onEnable={enable} onDisable={disable} />
  );

  // Dormant (opted-out) → just the toggle.
  if (pref === "off") return toggle;

  // First visit — no stored preference → consent card, driver NOT constructed.
  if (pref === null) {
    return (
      <>
        {toggle}
        <ConsentCard reduced={reduced} onEnable={enable} onDismiss={dismiss} />
      </>
    );
  }

  // pref === "on" — enabled. Errors render a recovery card; everything else a pill.
  if (status?.state === "error") {
    const retryable =
      status.reason === "permission-denied" ||
      status.reason === "model-load-failed";
    const message =
      status.reason === "insecure-context"
        ? COPY.errInsecure
        : status.reason === "no-camera"
          ? COPY.errNoCamera
          : status.reason === "permission-denied"
            ? COPY.errPermissionDenied
            : COPY.errModelLoadFailed;
    return (
      <>
        {toggle}
        <ErrorCard
          reduced={reduced}
          message={message}
          retryable={retryable}
          onRetry={retry}
          onDisable={disable}
        />
      </>
    );
  }

  return (
    <>
      {toggle}
      <StatusPill reduced={reduced} status={status} onDisable={disable} />
    </>
  );
}

export default HandControlOnboarding;
