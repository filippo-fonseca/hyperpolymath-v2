"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useTabHidden } from "./useTabHidden";

/**
 * AmbientGlow — the campaign's spacedrive.com / Raycast ambient flourish.
 *
 * Technique (design constitution §C, Scout B): flat low-alpha accent blobs +
 * a giant GPU blur, de-banded with an SVG feTurbulence noise overlay
 * (mix-blend overlay). No radial-gradient orbs, no canvas. The whole layer is
 * `pointer-events-none` and `aria-hidden`, so it never costs an interaction or
 * a screen-reader stop.
 *
 * Two registers:
 *   - "whisper" (default): static, very low alpha. Mounted behind the app
 *     shell on every route.
 *   - "bold": brighter blobs + a slow compositor drift (transform/scale only).
 *     Mounted behind the Life OS hero / stat strip.
 *
 * Both themes are first-class (D1c): light mode gets roughly half the alpha so
 * text contrast stays AA over warm parchment. All motion is disabled under
 * `prefers-reduced-motion` (CSS) and paused while the tab is hidden (JS), so a
 * background tab never animates.
 *
 * Positioning: defaults to a fixed full-viewport layer sitting behind content
 * via a negative z-index (the mount point must establish a stacking context,
 * e.g. `isolate`). Pass `className` to scope it to a section (`absolute inset-0`
 * inside a `relative` parent) — tailwind-merge lets your className win.
 */

type Intensity = "whisper" | "bold";
type Anchor = "center" | "top" | "hero";

interface Props {
  intensity?: Intensity;
  anchor?: Anchor;
  className?: string;
}

/**
 * feTurbulence fractal noise, inlined as a data-URI so it needs no network
 * round-trip and no extra file. baseFrequency 1.8 / 5 octaves per Scout B.
 */
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='220'%20height='220'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='1.8'%20numOctaves='5'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E";

/** Per-anchor blob geometry. Centering via negative margins keeps `transform`
 *  free for the drift animation. Sizes are viewport-relative so the field
 *  scales with the screen; overflow-hidden clips the bleed. */
function blobGeometry(anchor: Anchor): { wide: CSSProperties; core: CSSProperties } {
  switch (anchor) {
    case "top":
      return {
        wide: { left: "50%", top: "2%", width: "72vw", height: "46vh", marginLeft: "-36vw", marginTop: "-23vh" },
        core: { left: "47%", top: "-2%", width: "34vw", height: "32vh", marginLeft: "-17vw", marginTop: "-16vh" },
      };
    case "hero":
      return {
        wide: { left: "44%", top: "12%", width: "66vw", height: "48vh", marginLeft: "-33vw", marginTop: "-24vh" },
        core: { left: "33%", top: "6%", width: "30vw", height: "30vh", marginLeft: "-15vw", marginTop: "-15vh" },
      };
    case "center":
    default:
      return {
        wide: { left: "50%", top: "46%", width: "68vw", height: "52vh", marginLeft: "-34vw", marginTop: "-26vh" },
        core: { left: "43%", top: "40%", width: "34vw", height: "34vh", marginLeft: "-17vw", marginTop: "-17vh" },
      };
  }
}

export function AmbientGlow({ intensity = "whisper", anchor = "center", className }: Props) {
  const hidden = useTabHidden();
  const { wide, core } = blobGeometry(anchor);

  return (
    <div
      aria-hidden
      data-intensity={intensity}
      data-paused={hidden ? "true" : "false"}
      className={cn(
        "sd-ambient pointer-events-none overflow-hidden fixed inset-0 -z-10",
        className,
      )}
    >
      <style>{AMBIENT_CSS}</style>
      <div className="sd-ambient__blob sd-ambient__wide" style={wide} />
      <div className="sd-ambient__blob sd-ambient__core" style={core} />
      <div className="sd-ambient__noise" />
    </div>
  );
}

/* Component-scoped CSS. Kept out of globals.css by design (the ambient layer is
 * self-contained). Duplicate injection across instances is idempotent.
 *
 * Alpha ladder: base values target the light theme (dampened, over parchment);
 * `.dark` overrides bump them up. Keying the brighter values off `.dark`
 * (rather than the light values off `:not(.dark)`) is robust to whether the
 * theme class lands on <html> or a wrapper. */
const AMBIENT_CSS = `
.sd-ambient {
  --amb-wide-a: 0.05;
  --amb-core-a: 0.035;
  --amb-noise-o: 0.05;
  --amb-wide-blur: 150px;
  --amb-core-blur: 80px;
}
.sd-ambient[data-intensity="bold"] {
  --amb-wide-a: 0.10;
  --amb-core-a: 0.075;
  --amb-noise-o: 0.14;
}
:where(.dark) .sd-ambient {
  --amb-wide-a: 0.07;
  --amb-core-a: 0.05;
  --amb-noise-o: 0.10;
}
:where(.dark) .sd-ambient[data-intensity="bold"] {
  --amb-wide-a: 0.20;
  --amb-core-a: 0.15;
  --amb-noise-o: 0.35;
}
.sd-ambient__blob {
  position: absolute;
  border-radius: 9999px;
  transform: translate3d(0, 0, 0);
}
.sd-ambient__wide {
  background: rgb(var(--hud-cyan-rgb) / var(--amb-wide-a));
  filter: blur(var(--amb-wide-blur));
}
.sd-ambient__core {
  background: rgb(var(--hud-cyan-rgb) / var(--amb-core-a));
  filter: blur(var(--amb-core-blur));
}
.sd-ambient__noise {
  position: absolute;
  inset: 0;
  background-image: url("${NOISE_DATA_URI}");
  background-repeat: repeat;
  background-size: 220px 220px;
  opacity: var(--amb-noise-o);
  mix-blend-mode: overlay;
}
.sd-ambient[data-intensity="bold"] .sd-ambient__blob {
  will-change: transform;
}
.sd-ambient[data-intensity="bold"] .sd-ambient__wide {
  animation: sdAmbientDriftA 24s ease-in-out infinite;
}
.sd-ambient[data-intensity="bold"] .sd-ambient__core {
  animation: sdAmbientDriftB 31s ease-in-out infinite;
}
.sd-ambient[data-paused="true"] .sd-ambient__blob {
  animation-play-state: paused;
}
@keyframes sdAmbientDriftA {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(4%, -3%, 0) scale(1.05); }
}
@keyframes sdAmbientDriftB {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-3%, 4%, 0) scale(1.04); }
}
@media (prefers-reduced-motion: reduce) {
  .sd-ambient__blob { animation: none !important; }
}
`;
