"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
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
 * Motion registers:
 *   - "soft" (default): presence-lamp bob for Life OS / chrome (~6s, small travel)
 *   - "bold": landing-hero presence — faster bounce, scale breathe, pulsing glow
 *
 * Disabled under `prefers-reduced-motion` and paused while the tab is hidden.
 * Decorative: `aria-hidden` + `pointer-events-none`.
 *
 * Layout is the caller's job. This renders an inline-block box of `size` x
 * `size`; position it via `className` on the wrapper.
 */

type Intensity = "soft" | "bold";

interface Props {
  /** Diameter in px. Reference range 120-180. Default 160. */
  size?: number;
  /** Motion energy. Soft for chrome; bold for the landing hero. */
  intensity?: Intensity;
  className?: string;
}

export function FocalOrb({
  size = 160,
  intensity = "soft",
  className,
}: Props) {
  const hidden = useTabHidden();

  const wrapperStyle: CSSProperties = { width: size, height: size };

  return (
    <div
      aria-hidden
      data-paused={hidden ? "true" : "false"}
      data-intensity={intensity}
      style={wrapperStyle}
      className={cn("sd-orb pointer-events-none relative", className)}
    >
      <style>{ORB_CSS}</style>
      <div className="sd-orb__bob">
        <span className="sd-orb__glow" />
        <span className="sd-orb__halo" />
        <span className="sd-orb__body" />
        <span className="sd-orb__spec" />
        {/* Kiwi brand mark, embedded in the glass above the specular layers.
            Near-white over cyan, a soft dark seat (not a glow) for legibility,
            scaled to the orb. Decorative: aria-hidden + pointer-events-none. */}
        <span className="sd-orb__kiwi" aria-hidden>
          <KiwiIcon
            size="46%"
            color="rgba(255, 255, 255, 0.94)"
            aria-hidden="true"
          />
        </span>
      </div>
    </div>
  );
}

const ORB_CSS = `
.sd-orb__bob {
  position: absolute;
  inset: 0;
  will-change: transform;
  transform-origin: 50% 55%;
}

/* Soft — quiet presence lamp (Life OS chrome). */
.sd-orb[data-intensity="soft"] .sd-orb__bob {
  animation: sdOrbBobSoft 6s ease-in-out infinite;
}
.sd-orb[data-intensity="soft"] .sd-orb__glow {
  animation: sdOrbGlowSoft 6s ease-in-out infinite;
}

/* Bold — landing hero: more travel, scale breathe, faster cadence. */
.sd-orb[data-intensity="bold"] .sd-orb__bob {
  animation: sdOrbBobBold 3.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}
.sd-orb[data-intensity="bold"] .sd-orb__glow {
  animation: sdOrbGlowBold 3.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}
.sd-orb[data-intensity="bold"] .sd-orb__halo {
  animation: sdOrbHaloBold 3.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}
.sd-orb[data-intensity="bold"] .sd-orb__body {
  animation: sdOrbBodyGlowBold 3.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}

.sd-orb[data-paused="true"] .sd-orb__bob,
.sd-orb[data-paused="true"] .sd-orb__glow,
.sd-orb[data-paused="true"] .sd-orb__halo,
.sd-orb[data-paused="true"] .sd-orb__body { animation-play-state: paused; }

/* Soft cyan under-glow, bleeding past the sphere. */
.sd-orb__glow {
  position: absolute;
  inset: -34%;
  border-radius: 9999px;
  background: radial-gradient(circle at 50% 55%, rgb(var(--hud-cyan-rgb) / 0.55), rgb(var(--hud-cyan-rgb) / 0) 68%);
  filter: blur(18px);
  will-change: transform, opacity;
}

/* Outer halo — bold only (soft keeps it invisible). Gives the "proper glow"
   bloom that reads on dark plates and phone OLED. */
.sd-orb__halo {
  position: absolute;
  inset: -55%;
  border-radius: 9999px;
  background: radial-gradient(circle at 50% 50%, rgb(var(--hud-cyan-rgb) / 0.38), rgb(var(--hud-cyan-rgb) / 0.1) 42%, transparent 72%);
  filter: blur(28px);
  opacity: 0;
  will-change: transform, opacity;
}
.sd-orb[data-intensity="soft"] .sd-orb__halo { display: none; }

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
  will-change: box-shadow;
}

/* Kiwi brand mark: centered in the sphere, above the specular sheen. The soft
   dark drop seats it in the glass without adding a glow ring. */
.sd-orb__kiwi {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.28));
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

@keyframes sdOrbBobSoft {
  0%, 100% { transform: translateY(-5px) scale(1); }
  50% { transform: translateY(5px) scale(1.03); }
}
@keyframes sdOrbGlowSoft {
  0%, 100% { opacity: 0.85; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.04); }
}

@keyframes sdOrbBobBold {
  0%, 100% { transform: translateY(-18px) scale(0.92); }
  50% { transform: translateY(14px) scale(1.12); }
}
@keyframes sdOrbGlowBold {
  0%, 100% { opacity: 0.7; transform: scale(0.88); }
  50% { opacity: 1; transform: scale(1.22); }
}
@keyframes sdOrbHaloBold {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 0.95; transform: scale(1.28); }
}
@keyframes sdOrbBodyGlowBold {
  0%, 100% {
    box-shadow:
      inset 0 2px 6px rgba(255, 255, 255, 0.5),
      inset 0 -16px 30px rgba(0, 0, 0, 0.5),
      inset 0 0 0 1px rgba(255, 255, 255, 0.16),
      0 16px 40px rgb(var(--hud-cyan-rgb) / 0.35),
      0 0 28px rgb(var(--hud-cyan-rgb) / 0.25),
      0 6px 18px rgba(0, 0, 0, 0.4);
  }
  50% {
    box-shadow:
      inset 0 2px 6px rgba(255, 255, 255, 0.55),
      inset 0 -16px 30px rgba(0, 0, 0, 0.45),
      inset 0 0 0 1px rgba(255, 255, 255, 0.22),
      0 28px 70px rgb(var(--hud-cyan-rgb) / 0.7),
      0 0 56px rgb(var(--hud-cyan-rgb) / 0.55),
      0 8px 22px rgba(0, 0, 0, 0.35);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sd-orb__bob,
  .sd-orb__glow,
  .sd-orb__halo,
  .sd-orb__body { animation: none !important; }
}
`;
