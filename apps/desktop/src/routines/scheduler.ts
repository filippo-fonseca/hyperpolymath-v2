// apps/desktop/src/routines/scheduler.ts
// Pure-JS time-trigger clock. No Rust scheduler exists, so a coarse
// setInterval tick compares each time-routine's next-run instant against
// Date.now() and fires it when due. Reuses computeNextRunAt from jarvis-core
// (the SAME resolver the server uses to denormalize nextRunAt) so the desktop
// stays authoritative between the 5-min syncs and rolls to tomorrow locally.
//
// Missed-fire policy (Mac asleep / lid closed): a fire whose due time is more
// than MISS_GRACE_MS in the past is SKIPPED (advanced, not replayed) — waking
// at 3pm must not blurt out an 8am "good morning" briefing. Only fires within
// the grace window run.

import { computeNextRunAt } from "@hyperpolymath/jarvis-core/routines";
import type { Routine } from "@hyperpolymath/jarvis-core/routines";

import { fireRoutine } from "@/routines/registry";

// 30s is ample for HH:MM (minute-granularity) daily fires.
const TICK_MS = 30_000;
// Fire only if due within the last 5 minutes; older due times are stale.
const MISS_GRACE_MS = 5 * 60_000;

const DEVICE_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// routineId → next-run epoch ms (locally maintained; re-baselined by syncTime).
const nextRunAt = new Map<string, number>();
// The routines the scheduler currently tracks (needed to recompute on fire).
const tracked = new Map<string, Routine>();

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Replace the tracked time-routine set (called from the registry on every
 * refresh). Seeds each routine's next-run from the server-provided nextRunAt
 * (authoritative at sync), or recomputes locally as a fallback. Drops routines
 * no longer present.
 */
export function syncTimeRoutines(routines: Routine[]): void {
  const seen = new Set<string>();
  for (const routine of routines) {
    seen.add(routine.id);
    tracked.set(routine.id, routine);
    // Re-baseline from the server value on every sync; fall back to a local
    // recompute if the server didn't provide one.
    const serverIso = routine.nextRunAt;
    const ms = serverIso
      ? Date.parse(serverIso)
      : parseLocal(routine);
    if (Number.isFinite(ms)) nextRunAt.set(routine.id, ms);
    else nextRunAt.delete(routine.id);
  }
  // Forget routines that vanished (disabled / deleted / de-timed).
  for (const id of [...tracked.keys()]) {
    if (!seen.has(id)) {
      tracked.delete(id);
      nextRunAt.delete(id);
    }
  }
}

function parseLocal(routine: Routine, from?: Date): number {
  const iso = computeNextRunAt(routine.spec, DEVICE_TZ, from);
  return iso ? Date.parse(iso) : Number.NaN;
}

function tick(): void {
  const now = Date.now();
  for (const [id, due] of [...nextRunAt.entries()]) {
    if (due > now) continue; // not yet
    const routine = tracked.get(id);
    if (!routine) {
      nextRunAt.delete(id);
      continue;
    }
    // Advance to the next occurrence FIRST (from just past the due minute) so a
    // fire can't double-run in the same minute and a skipped stale fire still
    // rolls forward.
    const next = parseLocal(routine, new Date(due + 60_000));
    if (Number.isFinite(next)) nextRunAt.set(id, next);
    else nextRunAt.delete(id);

    if (now - due > MISS_GRACE_MS) {
      // eslint-disable-next-line no-console
      console.log(
        `[routines] time fire skipped (stale by ${Math.round((now - due) / 1000)}s) — ${id}`,
      );
      continue;
    }
    void fireRoutine(id, "time");
  }
}

/** Start the scheduler tick. Idempotent. */
export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  // eslint-disable-next-line no-console
  console.log(`[routines] scheduler started (tick ${TICK_MS}ms, tz ${DEVICE_TZ})`);
}

/** Stop the scheduler tick. */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
