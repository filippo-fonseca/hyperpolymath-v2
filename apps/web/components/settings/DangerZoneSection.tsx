"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";

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
      <div className="space-y-2">
        {/* Same anatomy as every other settings header — small tinted plate,
            15px title — so the danger zone reads as part of the page rather
            than a warning banner bolted on. The coral is the accent, not the
            surface. */}
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--ink-coral)_12%,var(--surface-raised))] text-[var(--ink-coral)]">
            <TriangleAlert className="h-4 w-4" />
          </span>
          <h3 className="text-body font-semibold tracking-[-0.01em] text-[var(--ink-coral)]">
            Delete account
          </h3>
        </div>
        <p className="text-meta leading-[1.5] text-[var(--ink-muted)]">
          Permanently erase your account and everything in it: tasks, captures, projects, notes,
          calendar connection, and all other data. This cannot be undone.
        </p>
      </div>

      {!expanded ? (
        <Button type="button" variant="destructive" size="sm" onClick={() => setExpanded(true)}>
          Delete account…
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-[color-mix(in_oklch,var(--ink-coral)_30%,var(--edge))] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
          <div className="space-y-2">
            <label
              htmlFor="delete-account-confirm"
              className="block text-micro text-[var(--ink-faint)]"
            >
              Type <span className="text-[var(--ink)] normal-case tracking-normal">{email}</span> to
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

          {error ? <p className="text-meta text-[var(--ink-coral)]">{error}</p> : null}

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
