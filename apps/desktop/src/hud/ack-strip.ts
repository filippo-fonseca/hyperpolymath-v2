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

// Module-level handle to the strip element + its fade timer, so the imperative
// flashAckStrip() can drive the SAME strip with the SAME opacity fade the SSE
// path uses. `streaming` guards the flash from clobbering a live response.
let stripEl: HTMLElement | null = null;
let sharedFadeTimer: ReturnType<typeof setTimeout> | null = null;
let streaming = false;

function clearSharedFadeTimer(): void {
  if (sharedFadeTimer) {
    clearTimeout(sharedFadeTimer);
    sharedFadeTimer = null;
  }
}

/** How long a flashed message lingers before it fades out. */
const FLASH_LINGER_MS = 4_000;

/**
 * Imperatively flash an arbitrary line through the acknowledge strip, reusing
 * the strip's own opacity fade (the only motion in its budget). Used for
 * feedback that has no SSE response behind it — e.g. an empty STT result
 * ("Didn't catch that, sir"). No-op while a real response is mid-stream so a
 * flash can never clobber a live utterance; empty-STT flashes only happen when
 * nothing is streaming, so this guard is sufficient.
 */
export function flashAckStrip(text: string, lingerMs = FLASH_LINGER_MS): void {
  if (streaming) return;
  const el = stripEl ?? document.getElementById("ack-strip");
  if (!el) return;
  clearSharedFadeTimer();
  el.textContent = text;
  el.classList.add("visible");
  sharedFadeTimer = setTimeout(() => {
    sharedFadeTimer = null;
    el.classList.remove("visible");
  }, lingerMs);
}

/** Wire the strip to the SSE response stream. Called once from boot(). */
export function startAckStrip(): void {
  if (started) return;
  started = true;

  const el = document.getElementById("ack-strip");
  if (!el) return;
  stripEl = el;

  let buf = "";
  let locked = false;

  onJarvisResponseStart(() => {
    streaming = true;
    clearSharedFadeTimer();
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
    streaming = false;
    clearSharedFadeTimer();
    sharedFadeTimer = setTimeout(() => {
      sharedFadeTimer = null;
      el.classList.remove("visible");
    }, FADE_OUT_DELAY_MS);
  });
}
