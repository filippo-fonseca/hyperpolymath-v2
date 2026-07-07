"use client";

/**
 * MeridianAudio.tsx — M-09 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The toll, from above. A single drei `<PositionalAudio>` node parented at the
 * ring's zenith (~[0, 8.5, 0], the fixed "now" marker height — same axis as the
 * plumb-line), so the T-15 reminder literally arrives FROM OVERHEAD: as you orbit
 * the dais, three.js pans/HRTFs the bell relative to the camera's `AudioListener`.
 * It plays exactly once per `worldEvents("meridian-toll")` (the scheduler in
 * `TollScheduler.tsx` guarantees one toll per event, ever).
 *
 * ── Reusing the world's ONE audio unlock + mute (do NOT create a second) ──────
 * Browsers refuse to start audio before a user gesture. The world already owns a
 * single gesture-unlock path in `audio/synth.ts` (`createChimeEngine()`'s
 * `installGestureUnlock()` arms the one `pointerdown`/`keydown` listener). We do
 * NOT install a second listener or a second AudioContext. Instead we reuse the
 * two shared flags that path exposes:
 *   • `isAudioUnlocked()` — true once that gesture has fired. `.play()` waits on
 *     THIS flag; before it, a toll is dropped silently (no queue, no stale burst
 *     — mirrors `synth.ts`' own pre-unlock drop).
 *   • `isMuted()` — the shared `localStorage['world:muted']` global mute. A muted
 *     world never tolls.
 * drei's `<PositionalAudio>` attaches its own `AudioListener` to the camera,
 * riding three.js's shared `THREE.AudioContext` — a DIFFERENT context from the
 * chimes' bespoke `AudioContext`, but gated by the SAME shared unlock flag. Since
 * a gesture has occurred (sticky user activation) by the time the flag is set,
 * we can safely `context.resume()` this listener's context at play-time.
 *
 * ── Lazy decode on first arm (§4 perf) ───────────────────────────────────────
 * drei's `<PositionalAudio>` fetch+decodes its `url` via a suspending `useLoader`
 * at MOUNT. To keep the toll's ~13 KB mp3 out of the boot path, we do NOT mount
 * the node until the FIRST toll arrives (`armed` flips then). The node mounts
 * inside a `<Suspense fallback={null}>`, decodes, and — via `onReady` — flushes
 * the pending first toll. Every later toll finds the node ready and plays at once.
 *
 * ── Reduced motion does NOT gate audio ───────────────────────────────────────
 * Per the Phase-1 precedent (`Chimes`/`synth.ts`), sound is not motion: the bell
 * still rings under `prefers-reduced-motion`. We never read the motion pref here.
 *
 * ── rAF discipline ───────────────────────────────────────────────────────────
 * Zero per-frame work: no `useFrame`, no `invalidate()`. Mounting the audio node
 * on the first toll costs a single R3F scene-graph frame (to render the — visually
 * empty — node); thereafter it never demands a frame. Positional panning updates
 * ride whatever frames the camera is already rendering while you orbit.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { PositionalAudio } from "@react-three/drei";
import type { PositionalAudio as ThreePositionalAudio } from "three";
import { worldEvents } from "../data/diffing";
import { isAudioUnlocked, isMuted } from "../audio/synth";

/** The M-04 toll asset (committed at this path; ≤40 KB CC0 brass bell). */
const TOLL_URL = "/world/sfx/ring-toll.mp3";
/** Zenith marker height — the ring centre (MeridianConfig.height) / plumb-line top. */
const ZENITH_Y = 8.5;
/** `PositionalAudio` reference distance (drei `distance` → `setRefDistance`). */
const REF_DISTANCE = 6;

/**
 * The suspending audio node. Isolated so its `useLoader` suspense (first-toll
 * decode) is caught by the local `<Suspense>` and never stalls the scene root.
 * Reports the underlying `THREE.PositionalAudio` upward via `onReady` once the
 * buffer is decoded and drei has wired it (child effects run before ours, so the
 * buffer is set by the time `onReady` fires).
 */
function TollAudioNode({
  onReady,
}: {
  onReady: (node: ThreePositionalAudio) => void;
}): ReactElement {
  const ref = useRef<ThreePositionalAudio | null>(null);
  useEffect(() => {
    if (ref.current) onReady(ref.current);
  }, [onReady]);
  return (
    <group position={[0, ZENITH_Y, 0]}>
      <PositionalAudio
        ref={ref}
        url={TOLL_URL}
        distance={REF_DISTANCE}
        loop={false}
      />
    </group>
  );
}

/**
 * The Meridian toll host. Renders `null` until the first toll, then the zenith
 * `PositionalAudio` node. The Conductor mounts it after `<Chimes/>` at the wave
 * boundary (inside the `<Canvas>`, so the listener rides the world camera).
 */
export function MeridianAudio(): ReactElement | null {
  const [armed, setArmed] = useState(false);
  const nodeRef = useRef<ThreePositionalAudio | null>(null);
  // A toll that arrived before the node finished decoding; flushed by `onReady`.
  const pendingRef = useRef(false);

  const playToll = useCallback((node: ThreePositionalAudio): void => {
    // Gate on the SAME shared flags the chimes honor — never a second path.
    if (isMuted()) return;
    if (!isAudioUnlocked()) return; // dropped silently before the gesture unlock
    // This listener's context (three's shared one) may still be suspended even
    // though a gesture occurred; a gesture DID happen, so resume() will succeed.
    const ctx = node.context;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    if (node.isPlaying) node.stop(); // restart cleanly if somehow mid-decay
    node.play();
  }, []);

  const onReady = useCallback(
    (node: ThreePositionalAudio): void => {
      nodeRef.current = node;
      if (pendingRef.current) {
        pendingRef.current = false;
        playToll(node);
      }
    },
    [playToll],
  );

  useEffect(() => {
    const off = worldEvents.on("meridian-toll", () => {
      const node = nodeRef.current;
      if (node !== null) {
        playToll(node); // node ready → toll now
      } else {
        // First toll: arm the (lazy) mount + decode, then flush via `onReady`.
        pendingRef.current = true;
        setArmed(true);
      }
    });
    return off;
  }, [playToll]);

  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      <TollAudioNode onReady={onReady} />
    </Suspense>
  );
}

export default MeridianAudio;
