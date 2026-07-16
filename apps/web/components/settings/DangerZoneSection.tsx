"use client";

import { useState, useTransition } from "react";

import { deleteAccountAction } from "@/app/(app)/settings/actions";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Irreversible account deletion. Two-step by design: the destructive control
 * stays hidden until the user opts in, then the final button is gated on
 * re-typing the exact account email. The server action re-validates the same
 * match, so this gate is a UX guard, not the security boundary.
 */
export function DangerZoneSection({ email }: { email: string }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches =
    confirmation.trim().length > 0 &&
    confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  function handleDelete() {
    if (!matches || pending) return;
    setError(null);
    startTransition(async () => {
      // On success the action redirects and this never resolves with a value.
      const result = await deleteAccountAction(confirmation);
      if (result && !result.success) setError(result.error);
    });
  }

  function reset() {
    setExpanded(false);
    setConfirmation("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-2xl font-semibold text-[var(--ink-coral)]">
          Delete account
        </h3>
        <p className="text-sm text-[var(--sd-ink-dull)]">
          Permanently erase your account and everything in it: tasks, captures, projects, notes,
          calendar connection, and all other data. This cannot be undone.
        </p>
      </div>

      {!expanded ? (
        <Button type="button" variant="destructive" size="sm" onClick={() => setExpanded(true)}>
          Delete account…
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[var(--ink-coral)]/40 bg-[var(--ink-coral)]/5 p-4">
          <div className="space-y-2">
            <label
              htmlFor="delete-account-confirm"
              className="block font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--sd-ink-dull)]"
            >
              Type <span className="text-[var(--sd-ink)] normal-case tracking-normal">{email}</span> to
              confirm
            </label>
            <Input
              id="delete-account-confirm"
              type="email"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={email}
              aria-invalid={confirmation.length > 0 && !matches}
              disabled={pending}
            />
          </div>

          {error ? <p className="text-sm text-[var(--ink-coral)]">{error}</p> : null}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!matches || pending}
              onClick={handleDelete}
            >
              {pending ? (
                <>
                  <Spinner size={14} label="Deleting account" />
                  Deleting…
                </>
              ) : (
 "Permanently delete account"
              )}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
