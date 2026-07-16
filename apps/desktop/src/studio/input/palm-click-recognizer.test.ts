import { describe, expect, it } from "vitest";

import {
  createPalmClickRecognizer,
  DEFAULT_PALM_CLICK,
  type PalmClickSample,
} from "./palm-click-recognizer";
import type { StudioIntentInput } from "./types";

function run(
  samples: PalmClickSample[],
  config?: Parameters<typeof createPalmClickRecognizer>[1],
): StudioIntentInput[] {
  const events: StudioIntentInput[] = [];
  const rec = createPalmClickRecognizer((i) => events.push(i), config);
  for (const s of samples) rec.push(s);
  return events;
}

const AIM = { nx: 0.4, ny: 0.6 };

describe("palm-click recognizer", () => {
  it("fires a tap on a close→open round trip within the reopen window", () => {
    const events = run([
      { t: 0, closed: false, ...AIM, engaged: true },
      { t: 16, closed: true, ...AIM, engaged: true }, // close-START
      { t: 200, closed: false, ...AIM, engaged: true }, // reopen → fire
    ]);
    expect(events).toEqual([{ type: "tap" }]);
  });

  it("does not fire while merely idle (never closed)", () => {
    const events = run([
      { t: 0, closed: false, ...AIM, engaged: true },
      { t: 16, closed: false, ...AIM, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("does not fire while the fist is still held (no reopen yet)", () => {
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: true },
      { t: 16, closed: true, ...AIM, engaged: true },
      { t: 300, closed: true, ...AIM, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("cancels (no click) when the fist is held past cancelMs without reopening", () => {
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: true }, // close-START
      { t: DEFAULT_PALM_CLICK.cancelMs + 20, closed: true, ...AIM, engaged: true }, // cancelled
      { t: DEFAULT_PALM_CLICK.cancelMs + 40, closed: false, ...AIM, engaged: true }, // late reopen, already idle
    ]);
    expect(events).toEqual([]);
  });

  it("returns to idle after a cancel, so a fresh close→open can still click", () => {
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: true }, // close-START #1
      { t: DEFAULT_PALM_CLICK.cancelMs + 20, closed: true, ...AIM, engaged: true }, // cancelled
      { t: DEFAULT_PALM_CLICK.cancelMs + 40, closed: false, ...AIM, engaged: true }, // idle again
      { t: DEFAULT_PALM_CLICK.cancelMs + 60, closed: true, ...AIM, engaged: true }, // close-START #2
      { t: DEFAULT_PALM_CLICK.cancelMs + 120, closed: false, ...AIM, engaged: true }, // reopen → fire
    ]);
    expect(events).toEqual([{ type: "tap" }]);
  });

  it("does not fire a reopen that lands after reopenWindowMs (falls through to idle)", () => {
    // Closed at t=0; reopen arrives after the window but before cancelMs, so the
    // recognizer is still in "closing" (no cancel fired yet) but the reopen is
    // treated as a late/no-op — only a reopen inside the window clicks.
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: true },
      {
        t: DEFAULT_PALM_CLICK.reopenWindowMs + 20,
        closed: false,
        ...AIM,
        engaged: true,
      },
    ]);
    expect(events).toEqual([]);
  });

  it("cancels silently when engagement drops mid-close (pinch engages / hand lost)", () => {
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: true }, // close-START
      { t: 30, closed: true, ...AIM, engaged: false }, // pinch engaged / hand lost
      { t: 60, closed: false, ...AIM, engaged: true }, // would-be reopen — too late, cancelled
    ]);
    expect(events).toEqual([]);
  });

  it("freezes the aim point at close-START, not wherever the hand is on reopen", () => {
    const rec = createPalmClickRecognizer(() => undefined);
    rec.push({ t: 0, closed: false, nx: 0.1, ny: 0.1, engaged: true });
    rec.push({ t: 16, closed: true, nx: 0.4, ny: 0.6, engaged: true }); // close-START here
    expect(rec.framePoint()).toEqual({ nx: 0.4, ny: 0.6 });
    // Hand drifts while still closed — the frozen point must not follow it.
    rec.push({ t: 100, closed: true, nx: 0.9, ny: 0.9, engaged: true });
    expect(rec.framePoint()).toEqual({ nx: 0.4, ny: 0.6 });
  });

  it("exposes `state` as closing while a candidate is in flight, idle otherwise", () => {
    const rec = createPalmClickRecognizer(() => undefined);
    expect(rec.state).toBe("idle");
    rec.push({ t: 0, closed: true, ...AIM, engaged: true });
    expect(rec.state).toBe("closing");
    rec.push({ t: 100, closed: false, ...AIM, engaged: true });
    expect(rec.state).toBe("idle");
  });

  it("framePoint() is null while idle", () => {
    const rec = createPalmClickRecognizer(() => undefined);
    expect(rec.framePoint()).toBeNull();
    rec.push({ t: 0, closed: true, ...AIM, engaged: true });
    rec.push({ t: 100, closed: false, ...AIM, engaged: true }); // fires + resets
    expect(rec.framePoint()).toBeNull();
  });

  it("does not fire while disengaged throughout (not a candidate)", () => {
    const events = run([
      { t: 0, closed: true, ...AIM, engaged: false },
      { t: 16, closed: false, ...AIM, engaged: false },
    ]);
    expect(events).toEqual([]);
  });

  it("reset() clears state silently (a click is a one-shot, not a lifecycle)", () => {
    const events: StudioIntentInput[] = [];
    const rec = createPalmClickRecognizer((i) => events.push(i));
    rec.push({ t: 0, closed: true, ...AIM, engaged: true });
    rec.reset();
    expect(events).toEqual([]);
    expect(rec.state).toBe("idle");
    expect(rec.framePoint()).toBeNull();
  });

  it("exposes tuning defaults with reopenWindowMs strictly under cancelMs", () => {
    expect(DEFAULT_PALM_CLICK.reopenWindowMs).toBeGreaterThan(0);
    expect(DEFAULT_PALM_CLICK.cancelMs).toBeGreaterThan(DEFAULT_PALM_CLICK.reopenWindowMs);
    expect(DEFAULT_PALM_CLICK.maxEnterSpeed).toBeGreaterThan(0);
    expect(DEFAULT_PALM_CLICK.refractoryMs).toBeGreaterThan(0);
  });

  describe("velocity gate (flick guard)", () => {
    it("ignores a close that begins while the cursor is moving fast", () => {
      const fast = DEFAULT_PALM_CLICK.maxEnterSpeed + 1;
      const events = run([
        { t: 0, closed: false, ...AIM, engaged: true },
        { t: 16, closed: true, ...AIM, engaged: true, speed: fast }, // mid-flick close
        { t: 200, closed: false, ...AIM, engaged: true },
      ]);
      expect(events).toEqual([]); // never entered "closing"
    });

    it("fires a close that begins once the cursor has settled", () => {
      const slow = DEFAULT_PALM_CLICK.maxEnterSpeed - 0.5;
      const events = run([
        { t: 0, closed: false, ...AIM, engaged: true },
        { t: 16, closed: true, ...AIM, engaged: true, speed: slow }, // settled close
        { t: 200, closed: false, ...AIM, engaged: true },
      ]);
      expect(events).toEqual([{ type: "tap" }]);
    });

    it("treats an omitted speed as stationary (gate inert)", () => {
      const events = run([
        { t: 0, closed: false, ...AIM, engaged: true },
        { t: 16, closed: true, ...AIM, engaged: true }, // no speed field
        { t: 200, closed: false, ...AIM, engaged: true },
      ]);
      expect(events).toEqual([{ type: "tap" }]);
    });
  });

  describe("refractory", () => {
    it("suppresses a second close that starts inside the refractory window", () => {
      const refract = DEFAULT_PALM_CLICK.refractoryMs;
      const events = run([
        { t: 0, closed: false, ...AIM, engaged: true },
        { t: 16, closed: true, ...AIM, engaged: true }, // close #1
        { t: 100, closed: false, ...AIM, engaged: true }, // reopen → tap #1
        { t: 100 + refract - 20, closed: true, ...AIM, engaged: true }, // close #2 too soon
        { t: 100 + refract - 5, closed: false, ...AIM, engaged: true }, // reopen — ignored
      ]);
      expect(events).toEqual([{ type: "tap" }]); // only one
    });

    it("allows a second close once the refractory window has elapsed", () => {
      const refract = DEFAULT_PALM_CLICK.refractoryMs;
      const events = run([
        { t: 0, closed: false, ...AIM, engaged: true },
        { t: 16, closed: true, ...AIM, engaged: true }, // close #1
        { t: 100, closed: false, ...AIM, engaged: true }, // tap #1
        { t: 100 + refract + 20, closed: true, ...AIM, engaged: true }, // close #2 ok now
        { t: 100 + refract + 120, closed: false, ...AIM, engaged: true }, // tap #2
      ]);
      expect(events).toEqual([{ type: "tap" }, { type: "tap" }]);
    });
  });
});
