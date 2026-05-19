'use client';

import { toast } from 'sonner';
import { useCallback } from 'react';

/**
 * Phase 6 Plan 06-02: sonner Undo toast helper (RES-02, UI-SPEC §8h).
 *
 * For non-JARVIS CRUD where there's no dedicated receipt component to host
 * the undo countdown (delete task, archive area, delete capture, delete
 * project). JARVIS receipts continue to use the inline UndoButton +
 * useUndoCountdown pattern from JarvisReceipt.tsx — DO NOT replace that.
 *
 * Lifecycle:
 *   1. Caller optimistically removes the item from local state.
 *   2. Toast appears with 5s duration + "Undo" action button.
 *   3a. User clicks Undo within 5s → addBack() called, undo() called
 *       (which restores or cancels the server-side delete).
 *   3b. 5s elapses without click → onAutoClose fires → commit() called
 *       (which performs the server-side delete).
 *
 * sonner 2.0.7 action prop accepts `{ label: string; onClick: (event) => void }`.
 */
export function useUndoToast() {
  const show = useCallback(
    ({
      message,
      optimisticRemove: _optimisticRemove,
      commit,
      undo,
      addBack,
    }: {
      message: string;
      optimisticRemove: () => void;
      commit: () => void | Promise<void>;
      undo: () => void;
      addBack: () => void;
    }) => {
      // Caller already called optimisticRemove before invoking us; we still
      // accept the prop so the API is symmetric and the caller can keep the
      // pre-call exactly above this line. We do not re-call it here.
      let undone = false;

      toast(message, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true;
            addBack();
            undo();
          },
        },
        onAutoClose: () => {
          if (!undone) {
            void commit();
          }
        },
        onDismiss: () => {
          // User manually dismissed before 5s — treat as commit.
          if (!undone) {
            void commit();
          }
        },
      });
    },
    [],
  );

  return { show };
}
