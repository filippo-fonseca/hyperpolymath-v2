import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HandControlOnboarding } from "@/components/studio/onboarding/HandControlOnboarding";
import { HAND_CONTROL_PREF_KEY } from "@/components/studio/onboarding/useHandControl";
import { TRACKING_TOGGLE_COPY } from "@/components/studio/controls/TrackingToggle";
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

/** A camera-free fake that captures its sink so tests can emit `halt`. */
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

const toggle = () => screen.getByRole("switch", { name: TRACKING_TOGGLE_COPY.label });

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

describe("TrackingToggle (persistent kill switch)", () => {
  it("is visible and off on first visit without constructing a driver", () => {
    renderOnboarding();

    const el = toggle();
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-checked", "false");
    expect(el).toHaveAttribute("data-tracking-on", "false");
    expect(screen.getByText(TRACKING_TOGGLE_COPY.off)).toBeInTheDocument();
    // Merely rendering the toggle must not touch the camera.
    expect(createDriver).not.toHaveBeenCalled();
  });

  it("stays visible and off when the stored preference is 'off'", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "off");
    renderOnboarding();

    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(createDriver).not.toHaveBeenCalled();
  });

  it("turns tracking on by click — builds a driver and persists 'on'", () => {
    renderOnboarding();

    fireEvent.click(toggle());

    expect(createDriver).toHaveBeenCalledTimes(1);
    expect(fakes[0].started).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("on");
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(TRACKING_TOGGLE_COPY.on)).toBeInTheDocument();
  });

  it("turns tracking off by click — stops the driver and clears hand-status", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "on");
    renderOnboarding();
    expect(toggle()).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle());

    expect(fakes[0].stopped).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(getHandStatus()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("reflects an open-palm halt by flipping to off", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "on");
    renderOnboarding();
    const driver = fakes[0];
    expect(toggle()).toHaveAttribute("aria-checked", "true");

    emitHalt(driver);

    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(driver.stopped).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
  });

  it("re-enables after a halt with a fresh driver (clean restart)", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "on");
    renderOnboarding();
    const first = fakes[0];

    emitHalt(first);
    expect(first.stopped).toBe(true);
    expect(toggle()).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle()); // turn back on

    expect(createDriver).toHaveBeenCalledTimes(2);
    const second = fakes[1];
    expect(second).not.toBe(first);
    expect(second.started).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("on");
    expect(getHandStatus()).toEqual({ state: "running", handVisible: true });
  });
});
