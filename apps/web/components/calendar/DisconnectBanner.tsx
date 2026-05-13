"use client";

/**
 * `DisconnectBanner` — top-of-page banner shown on /calendar when the user's
 * Google Calendar token is revoked or never connected.
 *
 * Phase 4 Plan 04-03 (D-04).
 *
 * "Calendar that silently stops syncing" is the failure mode the user
 * explicitly wants to avoid. Loud + non-dismissible. The Reconnect CTA is
 * a plain `<a>` (not a router push) because /api/gcal/auth is a Route
 * Handler that 302s to Google's consent screen — client-side nav would
 * try to render its body as a page.
 *
 * Variants:
 *   - "revoked"       — user previously connected; refresh failed with
 *                       invalid_grant (Pitfall 6).
 *   - "not_connected" — user never connected, or just disconnected. Less
 *                       jarring copy.
 */

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  variant: "revoked" | "not_connected";
}

export function DisconnectBanner({ variant }: Props) {
  const copy =
    variant === "revoked"
      ? "Google Calendar disconnected — your token was revoked."
      : "Google Calendar isn't connected.";
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-100">
      <AlertCircle size={16} />
      <span className="text-sm flex-1 font-sans">{copy}</span>
      <Button asChild size="sm" variant="outline">
        <a href="/api/gcal/auth">Reconnect</a>
      </Button>
    </div>
  );
}
