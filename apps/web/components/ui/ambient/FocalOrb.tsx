"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useTabHidden } from "./useTabHidden";

/**
 * FocalOrb — the single glossy hero orb (spacedrive.com register, D5).
 *
 * Pure CSS/SVG, no canvas: a glossy cyan sphere built from layered radial
 * gradients (bright specular sheen top-left, `--sd-accent` body, deep base),
 * a thin rim light and inner floor shadow for volume, and a soft cyan
 * under-glow. Colours come from the `--sd-accent` family (cyan, D1b) so the
 * orb retints with the theme. At most one per screen region (constitution §C).
 *
 * Motion: a slow bob (translateY +/-4px, 8s), disabled under
 * `prefers-reduced-motion` and paused while the tab is hidden. The orb is
 * decorative: `aria-hidden` + `pointer-events-none`.
 *
 * Layout is the caller's job (the Life OS unit anchors it behind/above the
 * stat strip). This renders an inline-block box of `size` x `size`; position
 * it via `className` on the wrapper.
 */

interface Props {
  /** Diameter in px. Reference range 120-180. Default 160. */
  size?: number;
  className?: string;
}

export function FocalOrb({ size = 160, className }: Props) {
  const hidden = useTabHidden();

  const wrapperStyle: CSSProperties = { width: size, height: size };

  return (
    <div
      aria-hidden
      data-paused={hidden ? "true" : "false"}
      style={wrapperStyle}
      className={cn("sd-orb pointer-events-none relative", className)}
    >
      <style>{ORB_CSS}</style>
      <div className="sd-orb__bob">
        <span className="sd-orb__glow" />
        <span className="sd-orb__body" />
        <span className="sd-orb__spec" />
      </div>
    </div>
  );
}

const ORB_CSS = `
.sd-orb__bob {
  position: absolute;
  inset: 0;
  will-change: transform;
  animation: sdOrbBob 8s ease-in-out infinite;
}
.sd-orb[data-paused="true"] .sd-orb__bob { animation-play-state: paused; }

/* Soft cyan under-glow, bleeding past the sphere. */
.sd-orb__glow {
  position: absolute;
  inset: -34%;
  border-radius: 9999px;
  background: radial-gradient(circle at 50% 55%, rgb(var(--hud-cyan-rgb) / 0.5), rgb(var(--hud-cyan-rgb) / 0) 68%);
  filter: blur(18px);
}

/* The glossy sphere: broad top-left sheen over a cyan body that deepens to a
   dark base, with a thin rim, an inner floor shadow, and the under-lit glow. */
.sd-orb__body {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    radial-gradient(circle at 32% 27%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0) 22%),
    radial-gradient(circle at 50% 44%,
      color-mix(in oklch, var(--sd-accent-faint) 78%, white) 0%,
      var(--sd-accent) 36%,
      var(--sd-accent-deep) 72%,
      color-mix(in oklch, var(--sd-accent-deep) 55%, black) 100%);
  box-shadow:
    inset 0 2px 6px rgba(255, 255, 255, 0.5),
    inset 0 -16px 30px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    0 20px 55px rgb(var(--hud-cyan-rgb) / 0.45),
    0 6px 18px rgba(0, 0, 0, 0.4);
}

/* Crisp specular hotspot, offset top-left. */
.sd-orb__spec {
  position: absolute;
  left: 20%;
  top: 16%;
  width: 30%;
  height: 22%;
  border-radius: 9999px;
  background: radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 70%);
  filter: blur(2px);
}

@keyframes sdOrbBob {
  0%, 100% { transform: translateY(-4px); }
  50% { transform: translateY(4px); }
}
@media (prefers-reduced-motion: reduce) {
  .sd-orb__bob { animation: none !important; }
}
`;
