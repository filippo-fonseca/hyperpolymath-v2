import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";

import { mountOrb } from "@/hud/orb";
import { studioBridge } from "@studio/bridge";
import { moveWidget, resizeWidget } from "@studio/state/widget-windows";
import type { WidgetContentProps } from "@studio/windows/catalog";
import { getOrbTargetGeometry } from "./orb-geometry";

const CYAN = "#2fa8ff";
const CYAN_HIGH = "#3bd6ff";

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const particles = [
  { cx: 31, cy: 17, r: 0.7, delay: 0 },
  { cx: 78, cy: 29, r: 0.5, delay: 1.4 },
  { cx: 19, cy: 68, r: 0.55, delay: 2.8 },
  { cx: 70, cy: 80, r: 0.65, delay: 0.8 },
  { cx: 88, cy: 58, r: 0.45, delay: 3.5 },
] as const;

function subscribeToJarvisState(onStoreChange: () => void): () => void {
  return studioBridge.on("jarvisState", onStoreChange);
}

function useJarvisState() {
  return useSyncExternalStore(
    subscribeToJarvisState,
    studioBridge.getJarvisState,
    studioBridge.getJarvisState,
  );
}

export default function OrbWidget({ id }: WidgetContentProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const manualDrag = useRef(false);
  const dragStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  // MAJOR-4 — track the drag session's detach fn so it survives unmount and
  // any superseded pointerId session. If a new drag starts while one is live
  // (state churn, pointer stolen, etc.), we detach the old listeners first.
  const dragDetach = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();
  const state = useJarvisState();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountOrb(canvas, {
      getState: studioBridge.getJarvisState,
      getMicLevel: () => 0.42,
      getSpeakingLevel: () => 0.55,
    });
  }, []);

  // MAJOR-4 — guarantee the pointer listeners come off on unmount even if
  // the pointerup / pointercancel that would normally clear them never
  // fires (component tears down mid-drag).
  useEffect(() => {
    return () => {
      dragDetach.current?.();
      dragDetach.current = null;
      dragStart.current = null;
    };
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const windowElement = canvasRef.current?.closest("[data-widget-window]");
      const stage = windowElement?.parentElement?.getBoundingClientRect();
      if (!stage?.width || !stage.height) return;

      if (state === "idle") {
        manualDrag.current = false;
        const target = getOrbTargetGeometry(stage, false);
        resizeWidget(id, target.w, target.h);
        moveWidget(id, target.x, target.y);
        return;
      }

      if (manualDrag.current) return;
      const target = getOrbTargetGeometry(stage, true);
      resizeWidget(id, target.w, target.h);
      moveWidget(id, target.x, target.y);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, state]);

  const beginManualDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (state === "idle" || event.button !== 0) return;
    // If an earlier drag session's listeners never got their pointerup (e.g.
    // pointer capture was stolen by another target), detach them before
    // opening a new session — otherwise the old listener set leaks and both
    // sessions race on dragStart.
    dragDetach.current?.();

    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      const start = dragStart.current;
      if (
        start?.pointerId === moveEvent.pointerId &&
        Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) >= 4
      ) {
        manualDrag.current = true;
      }
    };
    const detach = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      // Only clear the ref if it still points at THIS session — a fresh
      // beginManualDrag may have replaced it already.
      if (dragDetach.current === detach) dragDetach.current = null;
    };
    const onEnd = (endEvent: globalThis.PointerEvent): void => {
      if (dragStart.current?.pointerId !== endEvent.pointerId) return;
      dragStart.current = null;
      detach();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    dragDetach.current = detach;
  };

  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isSpeaking = state === "speaking";
  const ornamentScale = isListening ? 0.91 : 1;
  const ornamentOpacity = isListening ? 1 : isThinking ? 0.92 : 0.78;

  return (
    <div
      data-orb-widget
      role="img"
      aria-label="JARVIS voice state orb"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
      onPointerDown={beginManualDrag}
    >
      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          maxWidth: "100%",
          aspectRatio: "1",
          margin: "auto",
          filter: `drop-shadow(0 0 ${isListening ? 26 : 18}px color-mix(in srgb, ${CYAN_HIGH} ${isListening ? 48 : 32}%, transparent))`,
        }}
        animate={
          reduced
            ? { scale: ornamentScale, opacity: ornamentOpacity }
            : isSpeaking
              ? {
                  scale: [ornamentScale, ornamentScale * 1.035, ornamentScale],
                  opacity: [ornamentOpacity, 1, ornamentOpacity],
                }
              : { scale: ornamentScale, opacity: ornamentOpacity }
        }
        transition={
          isSpeaking && !reduced
            ? { duration: 1.15, ease: "easeInOut", repeat: Infinity }
            : { duration: reduced ? 0 : 0.35, ease: "easeOut" }
        }
      >
        <div
          style={{
            position: "absolute",
            inset: "9%",
            borderRadius: "50%",
            background: `radial-gradient(circle, color-mix(in srgb, ${CYAN_HIGH} 12%, transparent), transparent 67%)`,
            filter: "blur(10px)",
          }}
        />

        <motion.svg
          viewBox="0 0 100 100"
          style={fillStyle}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{
            duration: isThinking ? 8 : isListening ? 19 : 34,
            ease: "linear",
            repeat: Infinity,
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={CYAN}
            strokeOpacity="0.32"
            strokeWidth="0.55"
            strokeDasharray="21 9 3 14"
          />
          <circle
            cx="50"
            cy="50"
            r="39"
            fill="none"
            stroke={CYAN_HIGH}
            strokeOpacity="0.38"
            strokeWidth="0.4"
            strokeDasharray="2 11 28 15"
          />
        </motion.svg>

        <motion.svg
          viewBox="0 0 100 100"
          style={fillStyle}
          animate={reduced ? undefined : { rotate: -360 }}
          transition={{
            duration: isThinking ? 12 : isListening ? 25 : 49,
            ease: "linear",
            repeat: Infinity,
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="none"
            stroke={CYAN_HIGH}
            strokeOpacity="0.48"
            strokeWidth="0.7"
            strokeDasharray="36 18 7 22"
          />
          <path
            d="M 16 50 A 34 34 0 0 1 26 25"
            fill="none"
            stroke={CYAN_HIGH}
            strokeLinecap="round"
            strokeOpacity="0.82"
            strokeWidth="1.15"
          />
          <path
            d="M 84 50 A 34 34 0 0 1 74 75"
            fill="none"
            stroke={CYAN}
            strokeLinecap="round"
            strokeOpacity="0.66"
            strokeWidth="0.8"
          />
        </motion.svg>

        <svg viewBox="0 0 100 100" style={fillStyle}>
          {particles.map((particle) => (
            <motion.circle
              key={`${particle.cx}:${particle.cy}`}
              cx={particle.cx}
              cy={particle.cy}
              r={particle.r}
              fill={CYAN_HIGH}
              initial={{ opacity: 0.18 }}
              animate={
                reduced
                  ? { opacity: 0.25 }
                  : { opacity: [0.12, 0.55, 0.12], y: [0, -2.5, 0] }
              }
              transition={{
                duration: 5.5,
                delay: particle.delay,
                ease: "easeInOut",
                repeat: reduced ? 0 : Infinity,
              }}
            />
          ))}
        </svg>

        <canvas ref={canvasRef} aria-hidden="true" style={fillStyle} />
      </motion.div>
    </div>
  );
}
