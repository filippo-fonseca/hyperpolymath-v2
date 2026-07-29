"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * LifeOsSpaceBackdrop — the /lifeos-only space video layer (jul-28 D5).
 *
 * NASA ISS airglow timelapse (public domain, see the unit report for the
 * source URL), self-hosted under public/lifeos/. Mounted as the first child
 * of the lifeos <main>, which is `relative`: `absolute inset-0 -z-10` gives
 * true full-bleed of the route region below the top chrome without ever
 * bleeding under the rail or the dock, and the negative z-index inside the
 * stacking context `relative` creates cannot collide with the global fixed
 * AmbientGlow layer (risk register R10 — never switch this to `fixed`).
 *
 * Playback rules:
 *   - The <video> carries no autoPlay attribute. Playback starts from the
 *     effect below, so with prefers-reduced-motion the video is replaced by
 *     the static poster and can never begin playing, not even between first
 *     paint and hydration.
 *   - `preload="none"` + poster: the 8MB loop only downloads once this route
 *     actually asks it to play.
 *
 * Legibility: the video sits under a two-part scrim (one per theme, since a
 * scrim strength that lets stars through a dark canvas would drown a light
 * one). Text keeps reading against `--canvas`-mixed backgrounds; the widget
 * cards stay fully opaque on their own fills.
 */

const VIDEO_SRC = "/lifeos/space-loop.mp4";
const POSTER_SRC = "/lifeos/space-poster.jpg";

/** Scrim strength per theme: how much `--canvas` covers the footage. */
const SCRIM_LIGHT = "color-mix(in srgb, var(--canvas) 88%, transparent)";
const SCRIM_DARK = "color-mix(in srgb, var(--canvas) 72%, transparent)";

export function LifeOsSpaceBackdrop() {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduced) {
      video.pause();
      return;
    }
    // Autoplay can be denied (power saving, browser policy); the poster frame
    // is the designed fallback, so a rejection is not an error.
    video.play().catch(() => {});
  }, [reduced]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden"
    >
      {reduced ? (
        // Reduced motion: a static frame, no <video> element at all.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={POSTER_SRC} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={POSTER_SRC}
          src={VIDEO_SRC}
          className="h-full w-full object-cover"
        />
      )}

      {/* Scrim — keeps §2.3 contrast intent over the composited footage. */}
      <div className="absolute inset-0 dark:hidden" style={{ background: SCRIM_LIGHT }} />
      <div className="absolute inset-0 hidden dark:block" style={{ background: SCRIM_DARK }} />
    </div>
  );
}
