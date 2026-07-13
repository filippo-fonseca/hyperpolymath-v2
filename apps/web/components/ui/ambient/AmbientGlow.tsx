"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useTabHidden } from "./useTabHidden";

/**
 * AmbientGlow — the campaign's spacedrive.com / Raycast ambient flourish.
 *
 * Built on the foundations recipe (globals.css §4): `.sd-glow-wide` /
 * `.sd-glow-core` are flat low-alpha `--sd-accent` (cyan, D1b) blobs under a
 * giant GPU blur; `.sd-noise-overlay` is the feTurbulence de-band pass
 * (mix-blend overlay). This unit adds what foundations left to it: the two
 * intensity registers, the slow drift loop, and the motion-pause rules.
 *
 * Registers:
 *   - "whisper" (default): static, dampened. Mounted behind the app shell on
 *     every route.
 *   - "bold": the foundations opacities + a slow compositor drift (transform /
 *     scale only). Mounted behind the Life OS hero / stat strip.
 *
 * Both themes are first-class (D1c): the foundations utilities already run a
 * dampened light-theme alpha, and whisper dampens further, so text contrast
 * stays AA over warm parchment. All motion is disabled under
 * `prefers-reduced-motion` (CSS) and paused while the tab is hidden (JS).
 *
 * The whole layer is `pointer-events-none` + `aria-hidden`. It defaults to a
 * fixed full-viewport layer behind content via a negative z-index (the mount
 * must establish a stacking context, e.g. `isolate`). Pass `className` to scope
 * it to a section (`absolute inset-0` inside a `relative` parent); tailwind-merge
 * lets your className win.
 */

type Intensity = "whisper" | "bold";
type Anchor = "center" | "top" | "hero";

interface Props {
  intensity?: Intensity;
  anchor?: Anchor;
  className?: string;
}

/** Per-anchor blob geometry. Centering via negative margins keeps `transform`
 *  free for the drift animation. Sizes are viewport-relative so the field
 *  scales with the screen; the container's overflow-hidden clips the bleed. */
function blobGeometry(anchor: Anchor): { wide: CSSProperties; core: CSSProperties } {
  switch (anchor) {
    case "top":
      return {
        wide: {
          left: "50%",
          top: "2%",
          width: "72vw",
          height: "46vh",
          marginLeft: "-36vw",
          marginTop: "-23vh",
        },
        core: {
          left: "47%",
          top: "-2%",
          width: "34vw",
          height: "32vh",
          marginLeft: "-17vw",
          marginTop: "-16vh",
        },
      };
    case "hero":
      return {
        wide: {
          left: "44%",
          top: "12%",
          width: "66vw",
          height: "48vh",
          marginLeft: "-33vw",
          marginTop: "-24vh",
        },
        core: {
          left: "33%",
          top: "6%",
          width: "30vw",
          height: "30vh",
          marginLeft: "-15vw",
          marginTop: "-15vh",
        },
      };
    default:
      return {
        wide: {
          left: "50%",
          top: "46%",
          width: "68vw",
          height: "52vh",
          marginLeft: "-34vw",
          marginTop: "-26vh",
        },
        core: {
          left: "43%",
          top: "40%",
          width: "34vw",
          height: "34vh",
          marginLeft: "-17vw",
          marginTop: "-17vh",
        },
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
        className
      )}
    >
      <style>{AMBIENT_CSS}</style>
      <div className="sd-ambient__blob sd-glow-wide" style={wide} />
      <div className="sd-ambient__blob sd-glow-core" style={core} />
      <div className="sd-noise-overlay" />
    </div>
  );
}

/* Component-scoped CSS — purely additive over the foundations recipe. It never
 * redefines the glow/noise look (foundations owns that); it only tunes the
 * whisper register, drives the drift loop, and honours the motion rules.
 * Duplicate injection across instances is idempotent. */
const AMBIENT_CSS = `
/* Blobs are absolutely placed by this unit; foundations only styles their look. */
.sd-ambient__blob { position: absolute; transform: translate3d(0, 0, 0); }

/* Whisper: dampen the foundations opacities to a quiet background hum. */
.sd-ambient[data-intensity="whisper"] .sd-glow-wide { opacity: 0.05; }
.sd-ambient[data-intensity="whisper"] .sd-glow-core { opacity: 0.04; }
.sd-ambient[data-intensity="whisper"] .sd-noise-overlay { opacity: 0.06; }
:where(.dark) .sd-ambient[data-intensity="whisper"] .sd-glow-wide { opacity: 0.07; }
:where(.dark) .sd-ambient[data-intensity="whisper"] .sd-glow-core { opacity: 0.05; }
:where(.dark) .sd-ambient[data-intensity="whisper"] .sd-noise-overlay { opacity: 0.12; }

/* Drift — bold only, compositor transform/scale on top of the blur. */
.sd-ambient[data-intensity="bold"] .sd-ambient__blob { will-change: transform; }
.sd-ambient[data-intensity="bold"] .sd-glow-wide { animation: sdAmbientDriftA 24s ease-in-out infinite; }
.sd-ambient[data-intensity="bold"] .sd-glow-core { animation: sdAmbientDriftB 31s ease-in-out infinite; }
.sd-ambient[data-paused="true"] .sd-ambient__blob { animation-play-state: paused; }

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
