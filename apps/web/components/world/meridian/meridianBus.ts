/**
 * meridianBus.ts — M-02 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The frozen §2.3 `MeridianBus` interface + the exported `meridianBus` module
 * singleton, shaped exactly like the Phase-1 `cameraBus`/`fireflyBus` seams:
 * the SHAPE freezes here at Wave M1 close; the real implementation is REGISTERED
 * later by unit M-10 (`meridian/useRingScrub.ts`) via `__registerMeridianBusImpl`.
 *
 * Why a registration stub instead of the impl living here: Wave-M2 units must be
 * able to import `meridianBus` NOW (M-05 reads `getScrubOffsetMs()` every frame
 * to rotate the dial) even though the scrub hook that OWNS the offset/velocity
 * state doesn't exist until Wave M3. Until M-10 registers, the singleton is a
 * safe no-op: 0 offset, ignored velocity, already-resolved snap, and buffered
 * subscriptions that get wired through the moment the real impl arrives.
 *
 * ZERO `three` imports — this is a pure module-level singleton (no React state).
 * Frame consumers read the offset via the getter inside `useFrame`; `subscribe`
 * is for coarse listeners (e.g. M-11's date line re-composing on day change).
 */

// ── §2.3 frozen interface ────────────────────────────────────────────────────
export interface MeridianBus {
  getScrubOffsetMs(): number;
  addScrubVelocity(msPerSec: number): void; // wheel deltas feed this (M-10)
  snapToNow(ms?: number): Promise<void>; // decelerating return; Esc path
  subscribe(fn: (offsetMs: number) => void): () => void; // ring + tablets + labels re-pose
}

type OffsetListener = (offsetMs: number) => void;

// ── Registration seam ────────────────────────────────────────────────────────
// The live implementation, once M-10 mounts `useRingScrub`. `null` until then.
let impl: MeridianBus | null = null;

// Subscribers that arrived before the impl was registered. Wired through on
// registration so no listener is dropped across the Wave M2 → M3 boundary.
const pendingSubscribers = new Set<OffsetListener>();
// Live unsubscribe handles keyed by the caller's fn (impl-backed subscriptions).
const unsubByFn = new Map<OffsetListener, () => void>();

/**
 * Register the real MeridianBus implementation. Called EXACTLY ONCE by unit
 * M-10 (`meridian/useRingScrub.ts`) when the scrub hook mounts. Any listeners
 * that subscribed against the stub are re-subscribed to the live impl here, so
 * they begin receiving offset updates immediately. Returns an unregister fn
 * (used on hook unmount / HMR) that reverts to the safe no-op stub.
 */
export function __registerMeridianBusImpl(next: MeridianBus): () => void {
  impl = next;
  for (const fn of pendingSubscribers) {
    unsubByFn.set(fn, next.subscribe(fn));
  }
  pendingSubscribers.clear();
  return () => {
    if (impl !== next) return;
    // Detach every live subscription and re-buffer the callers so a future
    // re-registration (HMR / remount) re-wires them.
    for (const [fn, unsub] of unsubByFn) {
      unsub();
      pendingSubscribers.add(fn);
    }
    unsubByFn.clear();
    impl = null;
  };
}

// ── The exported singleton (facade over the registered impl) ────────────────
export const meridianBus: MeridianBus = {
  getScrubOffsetMs(): number {
    return impl !== null ? impl.getScrubOffsetMs() : 0;
  },

  addScrubVelocity(msPerSec: number): void {
    impl?.addScrubVelocity(msPerSec);
  },

  snapToNow(ms?: number): Promise<void> {
    return impl !== null ? impl.snapToNow(ms) : Promise.resolve();
  },

  subscribe(fn: OffsetListener): () => void {
    if (impl !== null) {
      unsubByFn.set(fn, impl.subscribe(fn));
    } else {
      pendingSubscribers.add(fn);
    }
    return () => {
      const live = unsubByFn.get(fn);
      if (live !== undefined) {
        live();
        unsubByFn.delete(fn);
      }
      pendingSubscribers.delete(fn);
    };
  },
};
