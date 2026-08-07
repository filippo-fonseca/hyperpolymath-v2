"use client";

import { setTimezone } from "@/app/actions/gcal-calendars";
import { useEffect } from "react";

/**
 * Keeps `users.timezone` equal to the device's IANA zone, from anywhere in the
 * app.
 *
 * Detection used to live on /calendar alone, so the stored zone was whatever
 * it happened to be the last time that one route was opened. Everything that
 * dates a row reads the stored value — the daily page, the wiki backup
 * filename, JARVIS's greeting, the context snapshot — which meant a user who
 * never opened /calendar ran the whole app on a null (UTC-assumed) timezone.
 *
 * Device wins by default: this is a single-user app, and the honest answer to
 * "which timezone am I in" is the one the laptop is reporting. The one thing
 * that outranks the device is an explicit choice in Settings, which stamps
 * `MANUAL_TZ_KEY` on that device; auto-sync then stands down there until the
 * user picks "Match detected" (which clears the stamp). The marker is
 * per-device on purpose — an override is a statement about the machine you set
 * it on, not about the account.
 *
 * Renders nothing.
 */

/** localStorage flag: this device has an explicit timezone choice. */
export const MANUAL_TZ_KEY = "settings:timezone-manual";

export function TimezoneSync({
  currentTimezone,
}: {
  currentTimezone: string | null;
}) {
  useEffect(() => {
    let detected: string | null = null;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return;
    }
    if (!detected || detected === currentTimezone) return;

    // A stored value the user chose by hand stays put. A null one never does:
    // an account with no timezone at all is a bug, not a preference.
    if (currentTimezone !== null) {
      try {
        if (localStorage.getItem(MANUAL_TZ_KEY)) return;
      } catch {
        // Private mode / storage disabled — fall through and adopt the device.
      }
    }

    void setTimezone({ timezone: detected });
  }, [currentTimezone]);

  return null;
}
