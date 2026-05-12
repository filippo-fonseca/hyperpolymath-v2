/**
 * Typed errors surfaced by the gcal token + API layer.
 *
 * Why distinct error classes vs. error codes on a single class:
 *   - `instanceof` checks are the canonical TypeScript pattern Server Actions use
 *     to map to the ActionResult `kind` field ("revoked" | "not_connected" | ...).
 *   - Adding `readonly kind = "..."` as a discriminator preserves the type when
 *     the error is serialized across the network (e.g., logged + replayed in dev
 *     tooling), even when `instanceof` info is lost.
 *
 * Used by:
 *   - lib/gcal/token.ts (throws all three)
 *   - app/actions/gcal-events.ts + downstream (catches and maps to ActionResult)
 *   - components/calendar/DisconnectBanner.tsx (drives D-04 banner state via kind)
 */

export class GcalTokenRevokedError extends Error {
  readonly kind = "gcal_token_revoked" as const;
  constructor(message = "Google Calendar refresh token revoked") {
    super(message);
    this.name = "GcalTokenRevokedError";
  }
}

export class GcalNotConnectedError extends Error {
  readonly kind = "gcal_not_connected" as const;
  constructor(message = "Google Calendar not connected") {
    super(message);
    this.name = "GcalNotConnectedError";
  }
}

export class GcalTokenRefreshError extends Error {
  readonly kind = "gcal_token_refresh_error" as const;
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "GcalTokenRefreshError";
  }
}
