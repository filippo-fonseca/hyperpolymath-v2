"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useTabHidden } from "@/components/ui/ambient/useTabHidden";

/**
 * LifeOsNodeField — the /lifeos-only ambient node-graph canvas (aug-05).
 *
 * Replaces the space-loop video (LifeOsSpaceBackdrop): a 2D <canvas> of
 * slow-drifting dots joined by near-transparent edges when they wander close.
 * Mounted as the first child of the lifeos <main>, which is `relative isolate`:
 * `absolute inset-0 -z-10` gives true full-bleed of the route region below the
 * top chrome, and the isolation pins it above the stage sheet's opaque fill
 * without ever colliding with the global fixed AmbientGlow layer (risk
 * register R10 — never switch this to `fixed`).
 *
 * Register rules (craft):
 *   - Palette comes from the live CSS tokens, resolved at runtime: dots are
 *     `--ink-faint` with a ~1-in-6 minority tinted from the pastel families
 *     (sky / lavender / peach edge values); edges are ink at whisper alpha.
 *     A MutationObserver on <html>'s class attribute re-resolves everything
 *     when the theme flips, so both themes are first-class.
 *   - Total visual weight stays at-or-below what the old video+scrim read as.
 *     The old per-theme scrim divs are gone; instead a CSS mask quiets the
 *     top ~40% of the field so the hero text keeps its calm.
 *
 * Motion rules:
 *   - Pointer interaction is window-level (the layer itself is
 *     pointer-events-none) and gated on `pointer: fine`. The cursor position
 *     is lerped, and nearby nodes are gently *accelerated* toward it — dreamy
 *     drift, never a snap — with a speed ceiling so the field can't churn.
 *   - prefers-reduced-motion: one static frame (nodes + edges), no rAF loop,
 *     no pointer tracking. Theme/resize changes still repaint the frame.
 *   - The rAF loop pauses while the tab is hidden (useTabHidden), so a
 *     backgrounded tab never burns battery animating a decorative layer.
 */

interface FieldNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Dot radius in CSS px. */
  r: number;
  /** -1 = ink dot; otherwise an index into the pastel tint palette. */
  tint: number;
  /** Per-node base alpha, fixed at spawn for gentle variety. */
  alpha: number;
}

interface Palette {
  ink: string;
  tints: string[];
}

/** Max distance (CSS px) at which two nodes draw an edge. */
const LINK_DIST = 150;
/** Peak edge alpha (at zero distance) before cursor brightening. */
const EDGE_ALPHA = 0.28;
/** Radius of the cursor's gravitational neighborhood. */
const ATTRACT_DIST = 180;
/** Acceleration toward the cursor at full pull, px/s². */
const ATTRACT_ACCEL = 42;
/** Nodes drift at 4–11 px/s; attraction may push them up to this ceiling. */
const MAX_SPEED = 26;
/** Soft-wrap margin: nodes slide this far off-edge before re-entering. */
const WRAP_MARGIN = 24;
/** ~1 node per this many px², clamped — ≈62 nodes on a laptop viewport. */
const AREA_PER_NODE = 21_000;
const MIN_NODES = 22;
const MAX_NODES = 72;
/** Cursor smoothing rate (1/s). Lower = dreamier lag. */
const CURSOR_EASE = 3.5;

function resolvePalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) =>
    styles.getPropertyValue(token).trim() || fallback;
  return {
    ink: read("--ink-faint", "#98938f"),
    tints: [
      read("--tint-sky-edge", "#7aa7c7"),
      read("--tint-lavender-edge", "#a08fc7"),
      read("--tint-peach-edge", "#c79a7a"),
    ],
  };
}

export function LifeOsNodeField() {
  const reduced = useReducedMotion();
  const hidden = useTabHidden();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Persists across effect re-runs so tab switches / theme flips never
   *  re-scatter the field. */
  const nodesRef = useRef<FieldNode[]>([]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let palette = resolvePalette();
    let width = 0;
    let height = 0;
    let originX = 0;
    let originY = 0;
    let raf = 0;
    let last = performance.now();
    const nodes = nodesRef.current;

    // Smoothed cursor state. `presence` fades the whole interaction in/out so
    // pointer entry/exit never pops.
    const cursor = { tx: 0, ty: 0, sx: 0, sy: 0, seeded: false, presence: 0, target: 0 };

    const spawnNode = (): FieldNode => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7;
      const tinted = Math.random() < 1 / 6;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: tinted ? 2.2 + Math.random() * 1.1 : 1.5 + Math.random() * 1.0,
        tint: tinted ? Math.floor(Math.random() * 3) : -1,
        alpha: (tinted ? 0.68 : 0.52) + Math.random() * 0.22,
      };
    };

    const syncNodeCount = () => {
      const target = Math.max(
        MIN_NODES,
        Math.min(MAX_NODES, Math.round((width * height) / AREA_PER_NODE))
      );
      while (nodes.length < target) nodes.push(spawnNode());
      if (nodes.length > target) nodes.length = target;
      for (const n of nodes) {
        n.x = Math.min(Math.max(n.x, -WRAP_MARGIN), width + WRAP_MARGIN);
        n.y = Math.min(Math.max(n.y, -WRAP_MARGIN), height + WRAP_MARGIN);
      }
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);

      // Edges first, dots on top. O(n²) pair scan is fine at n ≤ 56.
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.ink;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx > LINK_DIST || dx < -LINK_DIST || dy > LINK_DIST || dy < -LINK_DIST) continue;
          const dist = Math.hypot(dx, dy);
          if (dist >= LINK_DIST) continue;
          const fade = 1 - dist / LINK_DIST;
          let alpha = fade * fade * EDGE_ALPHA;
          if (cursor.presence > 0.01) {
            // Edges whose midpoint sits in the cursor's neighborhood brighten
            // slightly — a soft halo, not a spotlight.
            const mx = (a.x + b.x) / 2 - cursor.sx;
            const my = (a.y + b.y) / 2 - cursor.sy;
            const md = Math.hypot(mx, my);
            if (md < ATTRACT_DIST) {
              alpha *= 1 + 0.6 * cursor.presence * (1 - md / ATTRACT_DIST);
            }
          }
          ctx.globalAlpha = Math.min(alpha, 0.42);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        ctx.globalAlpha = n.alpha;
        ctx.fillStyle = n.tint >= 0 ? palette.tints[n.tint] : palette.ink;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (dt: number) => {
      // Ease the cursor and its presence toward their targets (frame-rate
      // independent exponential lerp).
      const ease = 1 - Math.exp(-dt * CURSOR_EASE);
      cursor.presence += (cursor.target - cursor.presence) * ease;
      cursor.sx += (cursor.tx - cursor.sx) * ease;
      cursor.sy += (cursor.ty - cursor.sy) * ease;

      for (const n of nodes) {
        if (cursor.presence > 0.01) {
          const dx = cursor.sx - n.x;
          const dy = cursor.sy - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < ATTRACT_DIST && dist > 1) {
            const pull = (1 - dist / ATTRACT_DIST) * cursor.presence;
            n.vx += (dx / dist) * pull * ATTRACT_ACCEL * dt;
            n.vy += (dy / dist) * pull * ATTRACT_ACCEL * dt;
          }
        }

        // Relax any attraction-gained speed back toward the ceiling so the
        // field never churns; base drift is well below MAX_SPEED.
        const speed = Math.hypot(n.vx, n.vy);
        if (speed > MAX_SPEED) {
          const scale = (MAX_SPEED + (speed - MAX_SPEED) * Math.exp(-dt * 2)) / speed;
          n.vx *= scale;
          n.vy *= scale;
        }

        n.x += n.vx * dt;
        n.y += n.vy * dt;

        // Soft wrap: slide off one edge, re-enter from the opposite one.
        if (n.x < -WRAP_MARGIN) n.x = width + WRAP_MARGIN;
        else if (n.x > width + WRAP_MARGIN) n.x = -WRAP_MARGIN;
        if (n.y < -WRAP_MARGIN) n.y = height + WRAP_MARGIN;
        else if (n.y > height + WRAP_MARGIN) n.y = -WRAP_MARGIN;
      }
    };

    const size = () => {
      const rect = wrapper.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      originX = rect.left;
      originY = rect.top;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncNodeCount();
      if (reduced || hidden) paint();
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrapper);

    // Theme flip: re-resolve tokens and repaint (the loop repaints on its own;
    // the static/paused registers need an explicit pass).
    const mo = new MutationObserver(() => {
      palette = resolvePalette();
      if (reduced || hidden) paint();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let removePointer: (() => void) | undefined;
    if (!reduced && window.matchMedia("(pointer: fine)").matches) {
      const onMove = (event: PointerEvent) => {
        cursor.tx = event.clientX - originX;
        cursor.ty = event.clientY - originY;
        if (!cursor.seeded) {
          cursor.sx = cursor.tx;
          cursor.sy = cursor.ty;
          cursor.seeded = true;
        }
        cursor.target = 1;
      };
      const onLeave = () => {
        cursor.target = 0;
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerout", onLeave, { passive: true });
      window.addEventListener("blur", onLeave);
      removePointer = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerout", onLeave);
        window.removeEventListener("blur", onLeave);
      };
    }

    if (!reduced && !hidden) {
      const frame = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        step(dt);
        paint();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      removePointer?.();
    };
  }, [reduced, hidden]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
    >
      {/* The mask replaces the old video scrim: it quiets the field behind the
          hero (top of the route) and lets it open up under the glass tiles,
          which carry their own legibility. Theme-agnostic by construction. */}
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          maskImage: "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0) 38%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0) 38%)",
        }}
      />
    </div>
  );
}
