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
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5g + §3f + §12e + §12f):
 *
 * Diplomatic banner chrome — bg --surface + 3px --ink-coral LEFT edge
 * (UI-SPEC §3f reserved-for list: coral for "error/destructive UI signal").
 * Serif body copy (the banner is reading to the user — document register),
 * mono CTA label (the action is chrome — calls into OAuth). Copy per
 * UI-SPEC §12e — exact strings "Google Calendar disconnected. Reconnect
 * from Settings." for revoked, "Google Calendar isn't connected." for
 * never-connected. CTA label "Connect Google Calendar" per §12f.
 *
 * Variants:
 *   - "revoked"       — user previously connected; refresh failed with
 *                       invalid_grant (Pitfall 6).
 *   - "not_connected" — user never connected, or just disconnected. Less
 *                       jarring copy.
 */

import { AlertCircle } from "lucide-react";

interface Props {
  variant: "revoked" | "not_connected";
}

export function DisconnectBanner({ variant }: Props) {
  // UI-SPEC §12e — exact copy. The revoked branch tells the user where to
  // reconnect (Settings), bridging the failure mode to the resolution path.
  const copy =
    variant === "revoked"
      ? "Google Calendar disconnected. Reconnect from Settings."
      : "Google Calendar isn't connected.";
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-[var(--sd-box)] border-b border-[var(--sd-line)]"
      style={{ borderLeft: "3px solid var(--ink-coral)" }}
      role="alert"
    >
      <AlertCircle
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-[var(--ink-coral)]"
        aria-hidden="true"
      />
      <span className="text-[13px] flex-1 text-[var(--sd-ink)]">
        {copy}
      </span>
      {/* UI-SPEC §12f — "Connect Google Calendar" CTA. Mono chrome register
          per UI-SPEC §5l toast Undo-button precedent (banner is diplomatic). */}
      <a
        href="/api/gcal/auth"
        className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink)] border border-[var(--sd-line)] rounded-[6px] px-2 py-1 hover:bg-[var(--sd-hover)] transition-colors duration-150 ease-out cursor-pointer-always"
      >
        Connect Google Calendar
      </a>
    </div>
  );
}
