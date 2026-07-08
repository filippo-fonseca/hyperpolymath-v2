import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HandControlOnboarding } from "@/components/studio/onboarding/HandControlOnboarding";
import { HAND_CONTROL_PREF_KEY } from "@/components/studio/onboarding/useHandControl";
import type { HandDriverStatus } from "@/lib/studio/input/drivers/hand";
import { StudioInputProvider } from "@/lib/studio/input/react";
import type {
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
} from "@/lib/studio/input/types";
import {
  __resetHandStatus,
  getHandStatus,
} from "@/lib/studio/state/hand-status";

/**
 * The open-palm halt intent (U0) must disable hand control through the SAME
 * `disable()` path as the pill's "Turn off": stop the driver, persist `"off"`,
 * and clear the shared hand-status store. This fake captures its `sink` in
 * `start()` so a test can emit `halt` exactly as the real interpreter would —
 * the intent then flows hub → useHandControl's subscriber synchronously.
 */
class FakeHandDriver implements StudioInputDriver {
  readonly id = "hand";
  started = false;
  stopped = false;
  sink: StudioInputSink | null = null;
  start(sink: StudioInputSink, _env: StudioDriverEnv): void {
    this.started = true;
    this.sink = sink;
  }
  stop(): void {
    this.stopped = true;
  }
}

let fakes: FakeHandDriver[];
let createDriver: ReturnType<typeof vi.fn>;

function renderOnboarding() {
  return render(
    <StudioInputProvider drivers={[]}>
      <HandControlOnboarding createDriver={createDriver} />
    </StudioInputProvider>,
  );
}

function enable(): FakeHandDriver {
  fireEvent.click(screen.getByRole("button", { name: "Enable hand control" }));
  return fakes[fakes.length - 1];
}

/** Emit a halt intent through the just-registered driver's captured sink. */
function emitHalt(driver: FakeHandDriver): void {
  act(() => {
    driver.sink?.emitIntent({ type: "halt" });
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  window.localStorage.clear();
  __resetHandStatus();
  fakes = [];
  createDriver = vi.fn(
    ({ onStatusChange }: { onStatusChange: (s: HandDriverStatus) => void }) => {
      const f = new FakeHandDriver();
      // Mirror the real driver: register() publishes via onStatusChange, so
      // wire a running status the moment start() is invoked by the bus.
      const original = f.start.bind(f);
      f.start = (sink, env) => {
        original(sink, env);
        onStatusChange({ state: "running", handVisible: true });
      };
      fakes.push(f);
      return f;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetHandStatus();
});

describe("open-palm halt disables hand control", () => {
  it("stops the driver, persists 'off', and clears hand-status on halt", () => {
    renderOnboarding();
    const driver = enable();
    expect(getHandStatus()).toEqual({ state: "running", handVisible: true });

    emitHalt(driver);

    expect(driver.stopped).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(getHandStatus()).toBeNull();
    // Onboarding chrome is gone — same end state as the pill's "Turn off".
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("is a no-op once tracking is already off (guarded by a live driver)", () => {
    // The hub sink is a shared singleton, so the captured sink keeps routing to
    // the hook's intent subscriber even after disable() unregisters the driver.
    // A second halt must therefore hit the `unregisterRef` guard and no-op.
    renderOnboarding();
    const driver = enable();
    emitHalt(driver); // first halt disables
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(createDriver).toHaveBeenCalledTimes(1);

    expect(() => emitHalt(driver)).not.toThrow(); // second halt: no live driver

    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(createDriver).toHaveBeenCalledTimes(1); // no driver rebuilt
    expect(getHandStatus()).toBeNull();
  });
});
