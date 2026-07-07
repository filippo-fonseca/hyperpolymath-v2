"use client";

/**
 * TollScheduler.tsx — M-09 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The T-15 moment, decided. A propless, render-null component that watches the
 * loaded gcal window (`useWorldData().meridian.events`) and, for the SINGLE
 * nearest upcoming timed event, arms exactly ONE `setTimeout` to fire 15 minutes
 * before it starts. When that timer fires it emits `worldEvents("meridian-toll")`
 * — the one signal both `MeridianAudio` (the toll from above) and the tablet
 * lean-down (M-06) listen for — then immediately re-arms for the FOLLOWING event.
 *
 * ── The contract (PHASE-2-PLAN §3 · M-09) ────────────────────────────────────
 *   • next event = the one with the smallest `startMs` where `startMs − now > 0`
 *     (an event that has NOT yet started), not already tolled this session.
 *   • toll time = `startMs − 15 min`. If we're already inside that window at
 *     arm-time (delay ≤ 0) — e.g. the world was opened at 1:50 for a 2:00 event,
 *     or a background tab's timer drifted — fire immediately, once.
 *   • dedupe = a session `Set<eventId>` (`firedRef`), persisted across refetches
 *     and re-arms, so any event tolls AT MOST ONCE, EVER (VISION §5: "never
 *     repeated, never nagging — one toll per event, period").
 *   • re-arm on `meridian.events` identity change (a Jarvis/2D-created event, a
 *     focus-refetch, the daily window roll): the effect below re-runs, clearing
 *     the old timer and recomputing against the fresh events.
 *   • `visibilitychange` → recompute: background tabs throttle/suspend timers, so
 *     when the tab returns to the foreground we re-arm; a toll whose T-15 elapsed
 *     while backgrounded (but whose event hasn't started) fires on return.
 *   • exactly ONE timeout armed at a time; cleared on unmount.
 *
 * ── Scope decisions ──────────────────────────────────────────────────────────
 *   • All-day events are excluded: they have no meaningful start instant, so
 *     "15 minutes before" is meaningless (it would toll at local-midnight−15m).
 *     Only timed events (`allDay === false`) are candidates.
 *   • Zero rAF impact: this is pure `setTimeout` + a `visibilitychange` listener.
 *     No `useFrame`, no `invalidate()`, no per-frame work — it never demands a
 *     frame and never touches the demand-mode render loop.
 *
 * Renders `null`; the Conductor mounts it after `<Chimes/>` at the wave boundary.
 */

import { useEffect } from "react";
import { useWorldData } from "../data/useWorldData";
import { worldEvents } from "../data/diffing";

/** 15 minutes, in milliseconds — the lead time before an event that the ring tolls. */
const T15_MS = 15 * 60 * 1000;

interface TollTarget {
  eventId: string;
  title: string;
  startIso: string;
  startMs: number;
}

/**
 * Session dedupe set (one toll per event, ever). Module-scoped so it survives
 * both StrictMode's dev mount→unmount→remount cycle and an SPA route away-and-
 * back to `/world` without re-tolling an event that already sounded. The world
 * is a single-user, `ssr:false` island, so a module Set is scoped exactly to
 * this page session (reset only by a full reload).
 */
const firedEventIds = new Set<string>();

/**
 * The T-15 toll scheduler. Reads only `meridian.events` (raw gcal DTOs) and the
 * module-singleton `worldEvents` emitter — no per-frame reads, no state.
 */
export function TollScheduler(): null {
  const { meridian } = useWorldData();
  const events = meridian.events;

  useEffect(() => {
    const fired = firedEventIds;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // Precompute the timed candidates once per events-identity change.
    const candidates: TollTarget[] = [];
    for (const e of events) {
      if (e.allDay) continue; // no start instant → nothing to toll before
      const startMs = Date.parse(e.start);
      if (!Number.isFinite(startMs)) continue;
      candidates.push({
        eventId: e.id,
        title: e.title,
        startIso: e.start,
        startMs,
      });
    }

    /** The nearest not-yet-fired event whose start is still in the future. */
    const computeNext = (now: number): TollTarget | null => {
      let best: TollTarget | null = null;
      for (const c of candidates) {
        if (fired.has(c.eventId)) continue;
        if (c.startMs <= now) continue; // already started (or starting now)
        if (best === null || c.startMs < best.startMs) best = c;
      }
      return best;
    };

    /** Fire one toll (dedup-guarded) and re-arm for the following event. */
    const fire = (target: TollTarget): void => {
      if (fired.has(target.eventId)) return;
      fired.add(target.eventId);
      worldEvents.emit("meridian-toll", {
        eventId: target.eventId,
        title: target.title,
        startIso: target.startIso,
      });
      arm(); // chain to the next upcoming event
    };

    /** Clear any armed timer, then arm exactly one for the nearest event. */
    const arm = (): void => {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      const now = Date.now();
      const target = computeNext(now);
      if (target === null) return; // nothing upcoming → sleep, no timer
      const delay = target.startMs - T15_MS - now;
      if (delay <= 0) {
        // Already inside the T-15 window (fresh mount mid-window, or drifted
        // background timer): fire now, once. Cascades to the next via `fire`.
        fire(target);
      } else {
        timeout = setTimeout(() => {
          timeout = null;
          fire(target);
        }, delay);
      }
    };

    arm();

    // Background tabs throttle timers; recompute when we return to foreground so
    // a toll whose T-15 passed while hidden still fires (if its event is future).
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") arm();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timeout !== null) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [events]);

  return null;
}

export default TollScheduler;
