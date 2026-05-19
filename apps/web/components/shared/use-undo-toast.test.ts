import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock sonner — we capture the options passed to toast() and invoke
// action.onClick / onAutoClose / onDismiss in the test.
const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

import { useUndoToast } from './use-undo-toast';

describe('useUndoToast', () => {
  beforeEach(() => {
    toastMock.mockReset();
  });

  it('calls toast with 5s duration and an Undo action', () => {
    const { result } = renderHook(() => useUndoToast());
    const commit = vi.fn();
    const undo = vi.fn();
    const optimisticRemove = vi.fn();
    const addBack = vi.fn();

    act(() => {
      result.current.show({
        message: 'deleted',
        optimisticRemove,
        commit,
        undo,
        addBack,
      });
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = toastMock.mock.calls[0] as [string, { duration: number; action: { label: string; onClick: () => void } }];
    expect(msg).toBe('deleted');
    expect(opts.duration).toBe(5000);
    expect(opts.action.label).toBe('Undo');
  });

  it('clicking Undo calls undo() and addBack() and prevents commit on auto-close', () => {
    const { result } = renderHook(() => useUndoToast());
    const commit = vi.fn();
    const undo = vi.fn();
    const addBack = vi.fn();

    act(() => {
      result.current.show({
        message: 'x',
        optimisticRemove: vi.fn(),
        commit,
        undo,
        addBack,
      });
    });

    const opts = toastMock.mock.calls[0]![1] as { action: { onClick: () => void }; onAutoClose: () => void };
    // Simulate user clicking Undo
    opts.action.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(addBack).toHaveBeenCalledTimes(1);

    // Then auto-close fires — must NOT commit
    opts.onAutoClose();
    expect(commit).not.toHaveBeenCalled();
  });

  it('auto-close without undo click commits the action', () => {
    const { result } = renderHook(() => useUndoToast());
    const commit = vi.fn();
    const undo = vi.fn();

    act(() => {
      result.current.show({
        message: 'x',
        optimisticRemove: vi.fn(),
        commit,
        undo,
        addBack: vi.fn(),
      });
    });

    const opts = toastMock.mock.calls[0]![1] as { onAutoClose: () => void };
    opts.onAutoClose();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });
});
