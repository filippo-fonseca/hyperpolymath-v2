/**
 * Pure helpers for the send-invitations-on-save flow.
 *
 * Google Calendar only emails guests when the caller opts in via the
 * `sendUpdates` query param on events.insert / events.patch. The editor
 * surfaces that choice ONLY when a save actually affects guests — this
 * module is the single definition of "affects guests":
 *   - creating an event that has guests
 *   - changing the guest list of an event
 *   - moving an event (time/date) that has guests
 *   - adding/removing Meet conferencing on an event that has guests
 *
 * Emails are compared case-insensitively as sets (order never matters).
 * Callers pass GUEST lists — the organizer's own row should be excluded,
 * since a solo event with only yourself attached has nobody to notify.
 */

function normalize(emails: readonly string[]): Set<string> {
  return new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Case-insensitive set equality over email lists. */
export function sameEmailSet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const setA = normalize(a);
  const setB = normalize(b);
  if (setA.size !== setB.size) return false;
  for (const e of setA) if (!setB.has(e)) return false;
  return true;
}

export interface EditAffectsGuestsArgs {
  mode: "create" | "edit";
  /** Guests before the edit (empty for create). Excludes the organizer. */
  prevGuests: readonly string[];
  /** Guests as the form will save them. Excludes the organizer. */
  nextGuests: readonly string[];
  /** Start/end/all-day changed relative to the saved event. */
  timeChanged: boolean;
  /** Meet conferencing is being added or removed by this save. */
  meetChanged: boolean;
}

/**
 * Whether this save warrants offering the "email guests" choice — i.e.
 * whether Google would have anyone to notify about anything new.
 */
export function editAffectsGuests(args: EditAffectsGuestsArgs): boolean {
  const { mode, prevGuests, nextGuests, timeChanged, meetChanged } = args;
  if (mode === "create") return normalize(nextGuests).size > 0;
  if (!sameEmailSet(prevGuests, nextGuests)) return true;
  // Unchanged guest list: only time or conferencing changes are newsworthy,
  // and only when there is at least one guest to tell.
  if (normalize(nextGuests).size === 0) return false;
  return timeChanged || meetChanged;
}
