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
 * Phase 6.1 Plan 06.1-05 / jul-29 craft restyle:
 *
 * The banner is a rose plate — pastel fill, a saturated 3px rose left edge,
 * in-family rose ink. Rose is the craft register's alarm hue, so this reads
 * as "something is wrong" without shouting in raw coral. The Reconnect CTA
 * is a raised white plate so it separates cleanly from the tinted field.
 * Copy per UI-SPEC §12e — exact strings "Google Calendar disconnected.
 * Reconnect from Settings." for revoked, "Google Calendar isn't connected."
 * for never-connected. CTA label "Connect Google Calendar" per §12f.
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
      className="tint-rose flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--tint-edge)_38%,transparent)] bg-[var(--tint-bg)] px-6 py-3"
      style={{ borderLeft: "3px solid var(--tint-edge)" }}
      role="alert"
    >
      <AlertCircle
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-[var(--tint-ink)]"
        aria-hidden="true"
      />
      <span className="flex-1 text-body text-[var(--tint-ink)]">{copy}</span>
      {/* UI-SPEC §12f — "Connect Google Calendar" CTA, on a raised white
          plate so the action reads as a control, not part of the wash. */}
      <a
        href="/api/gcal/auth"
        className="cursor-pointer-always rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-1.5 text-meta font-medium text-[var(--ink)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]"
      >
        Connect Google Calendar
      </a>
    </div>
  );
}
