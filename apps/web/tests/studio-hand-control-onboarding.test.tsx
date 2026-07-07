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

/**
 * A fake driver mirroring the real one's {@link StudioInputDriver} contract, but
 * with NO camera / MediaPipe. The injected `createDriver` captures the driver's
 * `onStatusChange` so the test can drive every status transition by hand — the
 * real `HandTrackingDriver` (the only thing that touches `getUserMedia`) is never
 * constructed.
 */
class FakeHandDriver implements StudioInputDriver {
  readonly id = "hand";
  started = false;
  stopped = false;
  start(_sink: StudioInputSink, _env: StudioDriverEnv): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

let fakes: FakeHandDriver[];
let emitStatus: (status: HandDriverStatus) => void;
let createDriver: ReturnType<typeof vi.fn>;

function renderOnboarding() {
  return render(
    <StudioInputProvider drivers={[]}>
      <HandControlOnboarding createDriver={createDriver} />
    </StudioInputProvider>,
  );
}

/** Enable via the consent card and return the just-constructed fake driver. */
function enable(): FakeHandDriver {
  fireEvent.click(screen.getByRole("button", { name: "Enable hand control" }));
  return fakes[fakes.length - 1];
}

function emit(status: HandDriverStatus): void {
  act(() => {
    emitStatus(status);
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true, // prefers-reduced-motion → instant transitions
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
  fakes = [];
  createDriver = vi.fn(({ onStatusChange }: { onStatusChange: (s: HandDriverStatus) => void }) => {
    emitStatus = onStatusChange;
    const f = new FakeHandDriver();
    fakes.push(f);
    return f;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HandControlOnboarding", () => {
  // (a) No driver before consent.
  it("shows the consent card and constructs no driver before opt-in", () => {
    renderOnboarding();

    expect(
      screen.getByText(
        "Control the Studio with your hand — point to aim, pinch to open.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable hand control" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use mouse" })).toBeInTheDocument();
    expect(createDriver).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBeNull();
  });

  // (b) Consent registers a driver + persists the pref.
  it("registers a fresh driver and persists 'on' on consent", () => {
    renderOnboarding();
    const driver = enable();

    expect(createDriver).toHaveBeenCalledTimes(1);
    expect(driver.started).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("on");
    // Consent card is gone once enabled.
    expect(
      screen.queryByRole("button", { name: "Enable hand control" }),
    ).toBeNull();
  });

  // (c) Every status renders the right copy.
  it("maps each driver status to the right pill copy", () => {
    renderOnboarding();
    enable();

    emit({ state: "loading-model" });
    expect(screen.getByText("Loading hand tracking…")).toBeInTheDocument();

    emit({ state: "awaiting-permission" });
    expect(
      screen.getByText("Allow camera access to control with your hand"),
    ).toBeInTheDocument();

    emit({ state: "running", handVisible: false });
    expect(screen.getByText("Show me your hand ✋")).toBeInTheDocument();

    emit({ state: "running", handVisible: true });
    expect(screen.queryByText("Show me your hand ✋")).toBeNull();
    expect(screen.getByText("Hand control on")).toBeInTheDocument();
    // The pill keeps its off affordance the whole time.
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });

  // (d) Error recovery — retryable.
  it("offers Try again on permission-denied and swaps in a fresh driver", () => {
    renderOnboarding();
    const first = enable();

    emit({ state: "error", reason: "permission-denied" });
    expect(
      screen.getByText(
        "Camera access was denied. Allow it in your browser settings, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use mouse instead" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(first.stopped).toBe(true);
    expect(createDriver).toHaveBeenCalledTimes(2);
    expect(fakes[1].started).toBe(true);
    // Pref is unchanged — the user is still opted in.
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("on");
  });

  // (d) Error recovery — terminal (insecure context).
  it("offers only a mouse fallback on insecure-context, which turns off", () => {
    renderOnboarding();
    const driver = enable();

    emit({ state: "error", reason: "insecure-context" });
    expect(
      screen.getByText("Hand control needs a secure (HTTPS) connection."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use mouse instead" }));

    expect(driver.stopped).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    // Dormant: no onboarding chrome remains.
    expect(
      screen.queryByText("Hand control needs a secure (HTTPS) connection."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  // (d) no-camera is terminal-ish too (message + mouse fallback only).
  it("reports no-camera with only a mouse fallback", () => {
    renderOnboarding();
    enable();

    emit({ state: "error", reason: "no-camera" });
    expect(
      screen.getByText("No camera was found on this device."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Use mouse instead" }),
    ).toBeInTheDocument();
  });

  // (d) model-load-failed is retryable.
  it("offers Try again on model-load-failed", () => {
    renderOnboarding();
    enable();

    emit({ state: "error", reason: "model-load-failed" });
    expect(
      screen.getByText("Hand tracking couldn't load."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  // (e) Turning it off unregisters + persists off.
  it("turns hand control off from the pill", () => {
    renderOnboarding();
    const driver = enable();
    emit({ state: "running", handVisible: true });

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    expect(driver.stopped).toBe(true);
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  // Persisted opt-in: a stored "on" auto-registers on mount (no click).
  it("auto-registers when the stored preference is 'on'", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "on");
    renderOnboarding();

    expect(createDriver).toHaveBeenCalledTimes(1);
    expect(fakes[0].started).toBe(true);
    // No consent card — already opted in.
    expect(
      screen.queryByRole("button", { name: "Enable hand control" }),
    ).toBeNull();
  });

  // Persisted opt-out: a stored "off" stays fully dormant.
  it("stays dormant and builds no driver when the stored preference is 'off'", () => {
    window.localStorage.setItem(HAND_CONTROL_PREF_KEY, "off");
    renderOnboarding();

    expect(createDriver).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Enable hand control" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  // "Use mouse" on first visit persists off without ever building a driver.
  it("dismisses to mouse-only without constructing a driver", () => {
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: "Use mouse" }));

    expect(createDriver).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(HAND_CONTROL_PREF_KEY)).toBe("off");
    expect(
      screen.queryByRole("button", { name: "Enable hand control" }),
    ).toBeNull();
  });

  // Unmount teardown releases the driver (and thus the camera).
  it("stops the driver on unmount while enabled", () => {
    const { unmount } = renderOnboarding();
    const driver = enable();

    unmount();

    expect(driver.stopped).toBe(true);
  });
});
