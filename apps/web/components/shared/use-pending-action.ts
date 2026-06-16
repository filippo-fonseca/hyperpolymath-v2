"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Shared CRUD mutation wrapper (issue #25).
 *
 * Standardizes the loading/pending contract across backend CRUD on the web app
 * so every server-action call gets the same affordances:
 *   - a guarded in-flight flag (`pending`) for disabled+busy buttons, and a
 *     hard re-entrancy guard so a double-click can't fire the action twice;
 *   - optional optimistic apply (`onMutate`) before the call resolves;
 *   - rollback (`onError`) + error toast with a one-click Retry on rejection.
 *
 * Server actions in this codebase return the discriminated
 * `{ success: true; data } | { success: false; error }` shape — the hook keys
 * its success/failure branches off that `success` flag.
 *
 * Usage:
 *   const { run, pending } = usePendingAction();
 *   <Button disabled={pending} onClick={() =>
 *     run(() => deleteArea(id), {
 *       onMutate: () => addOptimistic({ type: "delete", id }),
 *       onError: () => addOptimistic({ type: "revert", id }),
 *       success: "Area deleted.",
 *     })
 *   }>
 */

type ActionResult = { success: true } | { success: false; error: string };

interface RunOptions {
  /** Applied optimistically before awaiting the action (instant UI feedback). */
  onMutate?: () => void;
  /** Rolls back the optimistic change when the action rejects. */
  onError?: () => void;
  /** Runs only on success (close dialog, navigate, refetch, etc.). */
  onSuccess?: () => void | Promise<void>;
  /** Toast shown on success. Omit for silent success (the UI is the feedback). */
  success?: string;
  /** Override the error toast copy. Defaults to the action's `error`. */
  errorMessage?: string;
  /** Show a Retry action in the error toast (re-runs the same call). On by default. */
  retry?: boolean;
}

export function usePendingAction() {
  const [pending, setPending] = useState(false);
  // Hard guard: state updates are async, so a fast double-click could slip a
  // second call through before `pending` flips. The ref blocks it synchronously.
  const inFlight = useRef(false);

  const run = useCallback(
    async <R extends ActionResult>(
      action: () => Promise<R>,
      options: RunOptions = {}
    ): Promise<R | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);

      const { onMutate, onError, onSuccess, success, errorMessage, retry = true } = options;

      onMutate?.();

      try {
        const result = await action();
        if (!result.success) {
          onError?.();
          toast.error(errorMessage ?? result.error, {
            ...(retry
              ? {
                  action: {
                    label: "Retry",
                    onClick: () => void run(action, options),
                  },
                }
              : {}),
          });
          return result;
        }
        if (success) toast(success);
        await onSuccess?.();
        return result;
      } catch (err) {
        onError?.();
        const message =
          errorMessage ?? (err instanceof Error ? err.message : "Something went wrong.");
        toast.error(message, {
          ...(retry
            ? {
                action: {
                  label: "Retry",
                  onClick: () => void run(action, options),
                },
              }
            : {}),
        });
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    []
  );

  return { run, pending };
}
