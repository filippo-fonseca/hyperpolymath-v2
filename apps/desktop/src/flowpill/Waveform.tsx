import { useEffect, useRef } from "react";

import { SD_ACCENT } from "../studio/tokens";
import type { LevelSource } from "./types";

/**
 * Waveform.tsx — the live level meter shown while the pill is listening.
 *
 * Reads unit u2's normalised 0..1 RMS stream through a {@link LevelSource} and
 * draws it as a scrolling column of centre-mirrored bars. Nothing here touches
 * React state: levels arrive 30 to 60 times a second, and re-rendering the pill
 * at that rate to move a few pixels would be indefensible. The subscription
 * writes into a ring buffer and an animation frame paints it.
 *
 * The bars ease towards their target rather than snapping, so a burst of loud
 * frames reads as a swell instead of a strobe. That matters more than accuracy
 * here: this is a "the microphone is hearing you" reassurance, not a meter
 * anyone takes a measurement from.
 */

/** How many bars the history holds. Sized to fill ~200px at 2px + 2px. */
const BAR_COUNT = 48;
const BAR_WIDTH = 2;
const BAR_GAP = 2;
const MIN_BAR = 2;

/** Per-frame approach rate towards the incoming level. */
const ATTACK = 0.45;
/** Per-frame decay when nothing new arrives, so the trace settles rather than freezing. */
const DECAY = 0.06;

interface Props {
  source: LevelSource;
  /** False while armed, so the bars sit flat until audio is genuinely flowing. */
  active: boolean;
}

export function Waveform({ source, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const incomingRef = useRef(0);
  const activeRef = useRef(active);

  // Written in an effect rather than during render: the draw loop reads this
  // ref outside React's control, and a render-phase write can be discarded or
  // replayed under concurrent rendering.
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    // The only cross-boundary contract in this file: `onLevel` returns its own
    // unsubscribe, so a capture that outlives the pill cannot keep painting.
    return source.onLevel((level) => {
      incomingRef.current = level;
    });
  }, [source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // `roundRect` is WKWebView 16.4+, which every macOS this app targets has.
    // Checked once rather than trusted, because a missing method would throw on
    // every animation frame and take the whole overlay down with it.
    const rounded = typeof context.roundRect === "function";

    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = (): void => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (): void => {
      const history = historyRef.current;
      const target = activeRef.current ? incomingRef.current : 0;

      // Shift the ring one step left and admit the newest value at the right.
      history.copyWithin(0, 1);
      const previous = history[BAR_COUNT - 2] ?? 0;
      const next =
        target > previous
          ? previous + (target - previous) * ATTACK
          : Math.max(target, previous - DECAY);
      history[BAR_COUNT - 1] = next;

      context.clearRect(0, 0, width, height);

      const step = BAR_WIDTH + BAR_GAP;
      const visible = Math.max(1, Math.min(BAR_COUNT, Math.floor(width / step)));
      const centre = height / 2;
      const maxBar = height;

      for (let index = 0; index < visible; index += 1) {
        const level = history[BAR_COUNT - visible + index] ?? 0;
        const barHeight = Math.max(MIN_BAR, level * maxBar);
        const x = index * step;
        const y = centre - barHeight / 2;
        // Older frames fade towards the left, which gives the trace a
        // direction without needing a second colour.
        const age = index / Math.max(1, visible - 1);
        context.globalAlpha = 0.22 + age * 0.68;
        context.fillStyle = SD_ACCENT;
        if (rounded) {
          context.beginPath();
          context.roundRect(x, y, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
          context.fill();
        } else {
          context.fillRect(x, y, BAR_WIDTH, barHeight);
        }
      }
      context.globalAlpha = 1;
    };

    const tick = (): void => {
      draw();
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      // Still honest about hearing the user, just not animated: paint once and
      // let the level updates re-enter through the resize path only.
      draw();
    } else {
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="flowpill-wave" aria-hidden="true" />;
}
