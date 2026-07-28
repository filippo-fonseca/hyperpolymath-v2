/**
 * dev-harness.ts — drive the pill into a given state from the URL, for
 * headless verification.
 *
 * The pill is normally invoked by a global Option-key tap that no browser and
 * no screenshot runner can produce. Without this, the only way to look at the
 * `sending` state would be to hold a key down and hope the timing lands, which
 * is not a verification method. `?flowpill=listening&mode=locked` parks it
 * there and holds it.
 *
 * DEV ONLY, and it is gated twice: the entry point checks `import.meta.env.DEV`
 * before importing this module at all, and the query parameter has to be
 * present. It is not reachable from a production build.
 */

import { createFlowPillStore, type FlowPillStore } from "./store";
import type { FlowPillEvent, FlowPillMode, FlowPillStatus } from "./types";

const TRANSCRIPT = "remind me to email the lab about the bench booking";

/** The shortest event path into each status. */
const PATHS: Record<FlowPillStatus, FlowPillEvent[]> = {
  idle: [],
  armed: [],
  listening: [{ type: "capture-started" }],
  transcribing: [{ type: "capture-started" }, { type: "end" }],
  sending: [
    { type: "capture-started" },
    { type: "end" },
    { type: "transcript", text: TRANSCRIPT },
  ],
  sent: [
    { type: "capture-started" },
    { type: "end" },
    { type: "transcript", text: TRANSCRIPT },
    { type: "sent" },
  ],
  error: [{ type: "fail", reason: "Microphone blocked" }],
};

function isStatus(value: string): value is FlowPillStatus {
  return value in PATHS;
}

export interface Harness {
  store: FlowPillStore;
  status: FlowPillStatus;
  mode: FlowPillMode;
  /** Feed a synthetic level so the waveform has something to draw. */
  start(push: (level: number) => void): () => void;
}

/**
 * Returns null when the query parameter is absent, which is the normal case.
 * The store it builds has its fade timers stubbed out, so `sent` and `error`
 * hold still long enough to be photographed.
 */
export function readHarness(search: string): Harness | null {
  const params = new URLSearchParams(search);
  const requested = params.get("flowpill");
  if (!requested) return null;
  const status = isStatus(requested) ? requested : "listening";
  const mode: FlowPillMode = params.get("mode") === "locked" ? "locked" : "hold";

  const store = createFlowPillStore({
    setTimeout: () => null,
    clearTimeout: () => undefined,
  });

  if (status !== "idle") {
    store.dispatch({ type: "invoke", mode });
    for (const event of PATHS[status]) store.dispatch(event);
  }

  return {
    store,
    status,
    mode,
    start(push) {
      if (status !== "listening") return () => undefined;
      // A slow sine rather than random noise: a screenshot of noise looks like
      // a bug, and a repeatable shape makes two screenshots comparable.
      let frame = 0;
      const timer = setInterval(() => {
        frame += 1;
        push(0.5 + 0.42 * Math.sin(frame / 4));
      }, 24);
      return () => clearInterval(timer);
    },
  };
}
