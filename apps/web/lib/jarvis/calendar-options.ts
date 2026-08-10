/**
 * Jarvis calendar routing — the writable-calendar list the model may choose
 * from when creating events.
 *
 * At turn time run-turn.ts calls `getCalendarOptionsForJarvis(userId)` and:
 *   1. injects the result into the system prompt as a USER CALENDARS block
 *      (via `buildCalendarListBlock`) so the model can route the event to
 *      the calendar whose name/description best matches it, and
 *   2. threads the ids into `ExecutionContext.allowedCalendarIds` so the
 *      executor accepts exactly the ids the model was shown — anything else
 *      falls back to the user's default calendar (see executor.createEvent).
 *
 * Design notes:
 *   - FAIL-OPEN: any error (gcal not connected, token revoked, network)
 *     returns []. An empty list emits no prompt block and no allowlist, so
 *     the turn behaves exactly as before this feature existed (model omits
 *     calendar_id → server default). Calendar routing must never block a turn.
 *   - Writable only: reader calendars are filtered out — we could not insert
 *     into them, so offering them to the model would only invite a fallback.
 *   - TTL cache: module-level Map keyed by userId (the permitted server-side
 *     cache form, mirroring state-snapshot-cache.ts). The gcal calendarList
 *     changes rarely; a 10-min TTL keeps the per-turn cost at zero for warm
 *     lambdas without letting a newly created calendar lag for long.
 *   - CACHE-SAFE placement: the block is injected AFTER the state-snapshot
 *     cache breakpoint (uncached tail of the system array), so a changed
 *     calendar list can never invalidate the cached prompt prefix.
 */

import { listCalendars } from "@/lib/gcal/calendars";
import { getValidGcalToken } from "@/lib/gcal/token";

export interface JarvisCalendarOption {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
}

const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  options: JarvisCalendarOption[];
  fetchedAt: number;
}

const optionsCache = new Map<string, CacheEntry>();

/** Test hook — clears the module-level TTL cache. */
export function _clearCalendarOptionsCache(): void {
  optionsCache.clear();
}

const WRITABLE_ROLES = new Set(["owner", "writer"]);

/**
 * The user's writable Google calendars (id, name, description, primary flag),
 * TTL-cached per user. Fail-open: [] on any error.
 */
export async function getCalendarOptionsForJarvis(userId: string): Promise<JarvisCalendarOption[]> {
  const cached = optionsCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.options;
  }
  try {
    const cal = await getValidGcalToken(userId);
    const all = await listCalendars(cal);
    const options: JarvisCalendarOption[] = all
      .filter((c) => WRITABLE_ROLES.has(c.accessRole))
      .map((c) => ({
        id: c.id,
        summary: c.summary,
        ...(c.description ? { description: c.description } : {}),
        primary: c.primary,
      }));
    optionsCache.set(userId, { options, fetchedAt: Date.now() });
    return options;
  } catch {
    // Not connected / revoked / network — calendar routing silently degrades
    // to the pre-feature behavior (server default calendar).
    return [];
  }
}

/**
 * Render the USER CALENDARS system-prompt block, or null when there is no
 * meaningful choice (zero or one writable calendar — the default handles it).
 *
 * Deterministic for a given input (sorted by name; no Date/random) so
 * back-to-back turns with an unchanged list produce byte-identical blocks.
 */
export function buildCalendarListBlock(options: JarvisCalendarOption[]): string | null {
  if (options.length <= 1) return null;
  const sorted = [...options].sort((a, b) => a.summary.localeCompare(b.summary));
  const lines = sorted.map((c) => {
    const notes: string[] = [];
    if (c.primary) notes.push("primary");
    if (c.description) notes.push(c.description.replace(/\s+/g, " ").trim());
    return `${c.id}\t${c.summary}${notes.length > 0 ? `\t${notes.join(" — ")}` : ""}`;
  });
  return `USER CALENDARS (id\tname\tnotes):\n${lines.join("\n")}\n\nWhen creating an event, set calendar_id to the id of the calendar whose name/purpose best matches the event (e.g. class sessions on a university calendar, workouts on a training calendar). If no calendar clearly fits, or you are unsure, OMIT calendar_id — the server files the event on the user's default calendar. Only ids from this list are valid; anything else is replaced with the default server-side.`;
}
