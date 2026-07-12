import { describe, expect, it } from "vitest";

import {
  createTapClickRecognizer,
  DEFAULT_TAP_CLICK,
  type TapClickSample,
} from "./tap-click-recognizer";
import type { StudioIntentInput } from "./types";

function run(
  samples: TapClickSample[],
  config?: Parameters<typeof createTapClickRecognizer>[1],
): StudioIntentInput[] {
  const events: StudioIntentInput[] = [];
  const rec = createTapClickRecognizer((i) => events.push(i), config);
  for (const s of samples) rec.push(s);
  return events;
}

/** A resting depth around 0; a "jab" dips well below the dip threshold. */
const REST = 0;
const JAB = -0.6; // below DEFAULT_TAP_CLICK.dipThreshold (0.35)

describe("tap-click recognizer", () => {
  it("fires a tap on a forward jab that returns (dip → recover)", () => {
    const events = run([
      { t: 0, depth: REST, engaged: true }, // seed baseline
      { t: 16, depth: JAB, engaged: true }, // dip → arm
      { t: 32, depth: REST, engaged: true }, // recover → fire
    ]);
    expect(events).toEqual([{ type: "tap" }]);
  });

  it("does not fire on the seed frame alone", () => {
    const events = run([{ t: 0, depth: REST, engaged: true }]);
    expect(events).toEqual([]);
  });

  it("does not fire on a sustained forward hold (a drag never returns)", () => {
    // Dip and STAY dipped: no recovery edge, so no click — the drag debounce.
    const events = run([
      { t: 0, depth: REST, engaged: true },
      { t: 16, depth: JAB, engaged: true },
      { t: 32, depth: JAB, engaged: true },
      { t: 48, depth: JAB, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("ignores a shallow wobble below the dip threshold", () => {
    const events = run([
      { t: 0, depth: REST, engaged: true },
      { t: 16, depth: -0.1, engaged: true }, // under the 0.35 dip threshold
      { t: 32, depth: REST, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("debounces a double-bounce within the refractory window into one tap", () => {
    // Two full jabs 100ms apart, under the 320ms refractory → only the first fires.
    const events = run([
      { t: 0, depth: REST, engaged: true },
      { t: 16, depth: JAB, engaged: true },
      { t: 32, depth: REST, engaged: true }, // fire #1
      { t: 48, depth: JAB, engaged: true },
      { t: 64, depth: REST, engaged: true }, // within refractory → suppressed
    ]);
    expect(events).toEqual([{ type: "tap" }]);
  });

  it("allows a second tap after the refractory window", () => {
    const events = run([
      { t: 0, depth: REST, engaged: true },
      { t: 16, depth: JAB, engaged: true },
      { t: 32, depth: REST, engaged: true }, // fire #1
      { t: 400, depth: JAB, engaged: true },
      { t: 416, depth: REST, engaged: true }, // past 320ms → fire #2
    ]);
    expect(events).toEqual([{ type: "tap" }, { type: "tap" }]);
  });

  it("does not fire while disengaged (not pointing)", () => {
    const events = run([
      { t: 0, depth: REST, engaged: false },
      { t: 16, depth: JAB, engaged: false },
      { t: 32, depth: REST, engaged: false },
    ]);
    expect(events).toEqual([]);
  });

  it("re-seeds the baseline after leaving and re-entering the pose", () => {
    // A jab that begins across a disengage gap must not fire on re-entry.
    const events = run([
      { t: 0, depth: REST, engaged: true },
      { t: 16, depth: JAB, engaged: false }, // pose left mid-jab → abandon
      { t: 32, depth: REST, engaged: true }, // re-seed
      { t: 48, depth: REST, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("reset() clears state silently (a tap is a one-shot, not a lifecycle)", () => {
    const events: StudioIntentInput[] = [];
    const rec = createTapClickRecognizer((i) => events.push(i));
    rec.push({ t: 0, depth: REST, engaged: true });
    rec.push({ t: 16, depth: JAB, engaged: true }); // armed mid-jab
    rec.reset();
    expect(events).toEqual([]);
  });

  it("exposes tuning defaults", () => {
    expect(DEFAULT_TAP_CLICK.dipThreshold).toBeGreaterThan(0);
    expect(DEFAULT_TAP_CLICK.refractoryMs).toBeGreaterThan(0);
  });
});
