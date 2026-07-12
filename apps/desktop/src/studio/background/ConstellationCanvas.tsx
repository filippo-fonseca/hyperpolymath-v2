/**
 * ConstellationCanvas — the ambient graph background for the HUD stage.
 *
 * A single, cheap canvas2d layer beneath the dotted grid and rulers: ~32 nodes
 * drift slowly through normalized space, linked by distance-faded hairlines in a
 * low-opacity cyan (a few nodes borrow a NODE_PALETTE hue for quiet chromatic
 * life). It is atmosphere, not content — opacity stays low and nothing reacts to
 * the cursor.
 *
 * Frame budget is deliberately small so it never starves the voice/camera loops:
 * the rAF loop is throttled to ~30fps, paused entirely when the document is
 * hidden, and disabled outright when the background is toggled off. Under
 * `prefers-reduced-motion` (or the settings override) it paints ONE static frame
 * and stops. DPR-aware sizing tracks the element via ResizeObserver.
 */

import { useEffect, useRef } from "react";

import { HUD_COLORS, NODE_PALETTE } from "../tokens";
import {
  hydrateHudSettings,
  prefersReducedMotion,
  useHudSettings,
} from "../state/hud-settings";
import {
  createConstellation,
  nearbyLinks,
  stepConstellation,
  type ConstellationNode,
} from "./constellation";

/** ~30fps: one painted frame roughly every 33ms (slow drift hides the halved rate). */
const FRAME_INTERVAL_MS = 1000 / 30;

/** Whole-layer opacity — kept low so the graph reads as a scrim, not a subject. */
const LAYER_OPACITY = 0.5;

const LINK_COLOR = "34, 211, 238"; // HUD cyan, rgb channels (see globals --hud-cyan-rgb).

function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: ConstellationNode[],
  widthCss: number,
  heightCss: number,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, widthCss, heightCss);

  const aspect = heightCss === 0 ? 1 : widthCss / heightCss;
  const links = nearbyLinks(nodes, aspect);

  ctx.lineWidth = 1;
  for (const link of links) {
    const a = nodes[link.a];
    const b = nodes[link.b];
    if (!a || !b) continue;
    // Faint links, fading with distance; capped low so the mesh whispers.
    ctx.strokeStyle = `rgba(${LINK_COLOR}, ${(link.strength * 0.14).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x * widthCss, a.y * heightCss);
    ctx.lineTo(b.x * widthCss, b.y * heightCss);
    ctx.stroke();
  }

  for (const node of nodes) {
    const px = node.x * widthCss;
    const py = node.y * heightCss;
    const r = Math.max(0.8, node.radius * Math.min(widthCss, heightCss));
    if (node.palette >= 0) {
      ctx.fillStyle = NODE_PALETTE[node.palette % NODE_PALETTE.length] ?? `rgba(${LINK_COLOR}, 0.45)`;
      ctx.globalAlpha = 0.28;
    } else {
      ctx.fillStyle = `rgba(${LINK_COLOR}, 0.45)`;
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function ConstellationCanvas(): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { backgroundEnabled, motionMode } = useHudSettings();

  useEffect(() => {
    hydrateHudSettings();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !backgroundEnabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = createConstellation();
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let widthCss = canvas.clientWidth;
    let heightCss = canvas.clientHeight;

    const resize = (): void => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      widthCss = canvas.clientWidth;
      heightCss = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(widthCss * dpr));
      canvas.height = Math.max(1, Math.round(heightCss * dpr));
    };
    resize();

    const reduced = prefersReducedMotion(motionMode, systemPrefersReducedMotion());
    if (reduced) {
      // One static frame, no loop.
      draw(ctx, nodes, widthCss, heightCss, dpr);
      const ro = new ResizeObserver(() => {
        resize();
        draw(ctx, nodes, widthCss, heightCss, dpr);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = performance.now();
    let accumulator = 0;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const elapsed = now - last;
      if (elapsed < FRAME_INTERVAL_MS) return;
      last = now - (elapsed % FRAME_INTERVAL_MS);
      // Advance the sim by real elapsed seconds so drift speed is frame-independent.
      accumulator = Math.min(elapsed, 100) / 1000;
      stepConstellation(nodes, accumulator);
      draw(ctx, nodes, widthCss, heightCss, dpr);
    };

    const start = (): void => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = (): void => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [backgroundEnabled, motionMode]);

  if (!backgroundEnabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="studio-constellation"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        width: "100%",
        height: "100%",
        opacity: LAYER_OPACITY,
        pointerEvents: "none",
      }}
    />
  );
}
