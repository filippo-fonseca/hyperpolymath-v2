import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock sonner — capture both toast() and toast.error() calls so we can assert
// success messages and the error toast's Retry action.
const toastMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastMock(...args), {
    error: (...args: unknown[]) => toastErrorMock(...args),
  }),
}));

import { usePendingAction } from "./use-pending-action";

describe("usePendingAction", () => {
  beforeEach(() => {
    toastMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("runs onMutate, awaits success, fires success toast + onSuccess, clears pending", async () => {
    const { result } = renderHook(() => usePendingAction());
    const onMutate = vi.fn();
    const onSuccess = vi.fn();
    const action = vi.fn().mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.run(action, { onMutate, onSuccess, success: "Done." });
    });

    expect(onMutate).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith("Done.");
    expect(result.current.pending).toBe(false);
  });

  it("rolls back via onError and shows an error toast with a Retry action on failure", async () => {
    const { result } = renderHook(() => usePendingAction());
    const onError = vi.fn();
    const action = vi.fn().mockResolvedValue({ success: false, error: "Nope." });

    await act(async () => {
      await result.current.run(action, { onError });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = toastErrorMock.mock.calls[0] as [
      string,
      { action?: { label: string; onClick: () => void } },
    ];
    expect(msg).toBe("Nope.");
    expect(opts.action?.label).toBe("Retry");
    expect(result.current.pending).toBe(false);
  });

  it("guards against double-submit — a second call while in flight is a no-op", async () => {
    const { result } = renderHook(() => usePendingAction());
    let resolve: (v: { success: true }) => void = () => {};
    const action = vi.fn().mockImplementation(
      () =>
        new Promise<{ success: true }>((r) => {
          resolve = r;
        })
    );

    await act(async () => {
      // Fire two calls back-to-back; the first is still pending.
      const first = result.current.run(action);
      const second = result.current.run(action);
      resolve({ success: true });
      await Promise.all([first, second]);
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("rolls back and surfaces the error toast when the action throws", async () => {
    const { result } = renderHook(() => usePendingAction());
    const onError = vi.fn();
    const action = vi.fn().mockRejectedValue(new Error("Boom."));

    await act(async () => {
      await result.current.run(action, { onError });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });
});
