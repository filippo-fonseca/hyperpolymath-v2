// apps/desktop/src/hud/ack-strip.ts
// The acknowledge strip: one auto-fading mono line under the status word that
// echoes the FIRST CLAUSE of each JARVIS utterance ("Right away, sir" —
// Stark-HUD acknowledgement register). Purely presentational: it subscribes
// to the same SSE response events main.ts already paints the transcript from
// and owns no state beyond a per-turn text buffer. Fades in on response
// start, locks once the first clause boundary streams past, fades out ~4s
// after the response ends. The fade is part of the locked motion budget.

import {
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
} from "@/physical-extender/sse-client";

/** How long the clause lingers after the response finishes streaming. */
const FADE_OUT_DELAY_MS = 4_000;
/** Hard cap when no clause boundary shows up (rambling first sentence). */
const MAX_CLAUSE_CHARS = 60;

/**
 * First clause of the buffered utterance: everything up to the first `.`,
 * `,` or ` — ` boundary, hard-capped at ~60 chars. `locked: false` means the
 * buffer may still grow (keep streaming into it).
 */
function extractFirstClause(buf: string): { text: string; locked: boolean } {
  const boundaries = [buf.indexOf("."), buf.indexOf(","), buf.search(/\s—\s/)].filter(
    (i) => i > 0,
  );
  const cut = boundaries.length > 0 ? Math.min(...boundaries) : -1;
  if (cut > 0 && cut <= MAX_CLAUSE_CHARS) {
    return { text: buf.slice(0, cut).trim(), locked: true };
  }
  if (buf.length > MAX_CLAUSE_CHARS) {
    return { text: `${buf.slice(0, MAX_CLAUSE_CHARS).trimEnd()}…`, locked: true };
  }
  return { text: buf.trim(), locked: false };
}

let started = false;

/** Wire the strip to the SSE response stream. Called once from boot(). */
export function startAckStrip(): void {
  if (started) return;
  started = true;

  const el = document.getElementById("ack-strip");
  if (!el) return;

  let buf = "";
  let locked = false;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFadeTimer = (): void => {
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  };

  onJarvisResponseStart(() => {
    clearFadeTimer();
    buf = "";
    locked = false;
    el.textContent = "";
    el.classList.add("visible");
  });

  onJarvisResponseChunk(({ delta }) => {
    if (locked) return;
    buf += delta;
    const clause = extractFirstClause(buf);
    el.textContent = clause.text;
    locked = clause.locked;
  });

  onJarvisResponseEnd(() => {
    // Whatever streamed is the clause (short replies may never hit a
    // boundary). Linger, then fade; a new response start cancels the fade.
    clearFadeTimer();
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      el.classList.remove("visible");
    }, FADE_OUT_DELAY_MS);
  });
}
