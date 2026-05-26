"use client";

import { useEffect, useRef } from "react";

/**
 * CursorSpotlight — a large soft cyan radial gradient that trails the
 * mouse around the landing. Adds ambient depth without interfering with
 * any text or interaction. Uses requestAnimationFrame + a lerp so the
 * glow trails smoothly instead of teleporting, and writes directly to
 * a ref's style.transform so it never triggers a React re-render.
 *
 * Discipline:
 *   - Only renders on devices with `pointer: fine` (mouse/trackpad).
 *     Touch devices skip entirely.
 *   - prefers-reduced-motion: pins the spotlight in the upper-third of
 *     the viewport at low opacity — visible ambient glow, no tracking.
 *   - pointer-events: none so it never blocks clicks.
 *   - position: fixed at top:0/left:0, transformed into place — keeps
 *     it cheap (GPU compositor layer via translate3d + will-change).
 *
 * Mount inside the landing root once. Sits at z-index 0 with main
 * content stacking above via its own positioning.
 */
export function CursorSpotlight() {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = spotlightRef.current;
    if (!el) return;

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer) {
      // Touch / coarse pointer — hide entirely.
      el.style.opacity = "0";
      return;
    }

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Center spotlight initially so SSR/no-mouse-yet state still looks alive.
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.35;
    let currentX = targetX;
    let currentY = targetY;

    // Spotlight is 900px square. We position by its top-left, so subtract
    // half the size to center on the cursor.
    const HALF = 450;

    function place(x: number, y: number) {
      if (!el) return;
      el.style.transform = `translate3d(${x - HALF}px, ${y - HALF}px, 0)`;
    }

    place(currentX, currentY);

    if (reduce) {
      // Static spotlight; no animation loop.
      return;
    }

    let frame = 0;

    function onMove(e: MouseEvent) {
      targetX = e.clientX;
      targetY = e.clientY;
    }

    function tick() {
      // Lerp toward target — 0.12 ≈ 8-frame trail, feels alive without lag.
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      place(currentX, currentY);
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={spotlightRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 900,
        height: 900,
        pointerEvents: "none",
        background:
          "radial-gradient(circle, color-mix(in oklch, var(--hud-cyan) 14%, transparent) 0%, color-mix(in oklch, var(--hud-cyan) 5%, transparent) 35%, transparent 65%)",
        filter: "blur(60px)",
        opacity: 0.55,
        zIndex: 0,
        willChange: "transform",
        mixBlendMode: "soft-light",
      }}
    />
  );
}
