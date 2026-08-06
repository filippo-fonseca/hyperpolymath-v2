'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Tiny header affordance — when Strava is connected, render a "Disconnect"
 * text link in the panel header. POSTs to the disconnect route, which
 * removes the row from integration_tokens (best-effort deauthorizes on
 * Strava's side too). Calls router.refresh() to flip the panel back to its
 * disconnected state.
 */
export function StravaDisconnectButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm('Disconnect Strava? You can reconnect anytime.')) return;
    startTransition(async () => {
      const res = await fetch('/api/integrations/strava/disconnect', {
        method: 'POST',
      });
      if (!res.ok) {
        toast.error('Couldn’t disconnect Strava. Try again?');
        return;
      }
      toast.success('Strava disconnected.');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="cursor-pointer-always text-micro tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors disabled:opacity-40"
    >
      {pending ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
