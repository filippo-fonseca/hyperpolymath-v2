"use client";

/**
 * useStudioAudio — wires the studio's interaction events to synthesized HUD
 * cues. Mounted once, inside `StudioLoader`'s input-provider subtree (the hook
 * needs the input hub, so it is called from the `<StudioAudioFx/>` null
 * component this module also exports — never from `StudioLoader`'s own body,
 * which sits ABOVE the provider).
 *
 * Everything here is event-driven: intent/phase bus subscriptions, store
 * change-subscriptions, and a passive cross-window channel. No rAF, no polling,
 * no React state — zero re-render pressure, and the Canvas demand-frame is
 * untouched.
 *
 * Autoplay: the `AudioContext` is created/resumed on the first `pointerdown` /
 * `keydown` (one-shot listeners), satisfying browser autoplay policy. Before
 * that first gesture every cue is a silent no-op.
 */

import { useEffect, useRef } from "react";

import { useStudioIntent, useStudioPhase } from "../input/react";
import { getDndState, subscribeDndState } from "../state/zone-assignment";
import { subscribeFrontRow } from "../state/active-row";
import { getMuted, subscribeMuted } from "../state/audio-settings";
import { getSelfWindow } from "../state/window-registry";
import { createStudioSyncChannel } from "../sync/broadcast";
import { cueForEvent, playCue } from "./cues";
import { createStudioAudio, type StudioAudioEngine } from "./synth";

export function useStudioAudio(): void {
  // One engine for the component's lifetime. `createStudioAudio` is SSR-safe and
  // constructs no AudioContext until `resume()`, so creating it here is cheap.
  const engineRef = useRef<StudioAudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = createStudioAudio();
  const engine = engineRef.current;

  // Discrete intents → open / close / swipe / halt. The subscription hooks keep
  // the latest callback in a ref, so this inline closure is safe.
  useStudioIntent((intent) => {
    const cue = cueForEvent({ source: "intent", intent });
    if (cue) playCue(engine, cue);
  });

  // Continuous phases → grab (grabStart) / drop (grabEnd); moves make no sound.
  useStudioPhase((phase) => {
    const cue = cueForEvent({ source: "phase", phase });
    if (cue) playCue(engine, cue);
  });

  // Autoplay gesture gate: resume the context on the first pointer/key input.
  useEffect(() => {
    const resume = (): void => engine.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [engine]);

  // DnD nearest-zone change → a quiet tick, but only while a card is held and
  // only when the target zone actually changes to a different non-null zone.
  useEffect(() => {
    let prevZone: number | null = null;
    const unsub = subscribeDndState(() => {
      const { grabbedId, nearestZone } = getDndState();
      if (grabbedId !== null && nearestZone !== null && nearestZone !== prevZone) {
        playCue(engine, "zoneTick");
      }
      prevZone = nearestZone;
    });
    return unsub;
  }, [engine]);

  // Active-row swap → rowSwap. `subscribeFrontRow` only fires on a real flip, so
  // there is no initial-emit to skip.
  useEffect(() => {
    const unsub = subscribeFrontRow(() => playCue(engine, "rowSwap"));
    return unsub;
  }, [engine]);

  // Cross-window hand-off → handoff whoosh. A passive second sync channel: a
  // separate BroadcastChannel object DOES receive this window's own registry
  // posts, so the sender cues on its outgoing hand-off and the receiver on its
  // incoming one, with no change to the window registry.
  useEffect(() => {
    const channel = createStudioSyncChannel();
    const unsub = channel.subscribe((message) => {
      if (message.type !== "handoff") return;
      // Read self id at event time — the registry assigns it lazily client-side.
      // Only cue when this window is actually a party to the hand-off (sender or
      // receiver); an unresolved id ("") never matches, so a bystander window
      // stays silent for unrelated peer-to-peer hand-offs.
      const selfId = getSelfWindow().id;
      if (
        selfId &&
        (message.fromWindowId === selfId || message.toWindowId === selfId)
      ) {
        playCue(engine, "handoff");
      }
    });
    return () => {
      unsub();
      channel.close();
    };
  }, [engine]);

  // Mirror the mute store onto the engine — applied once on mount and on change.
  useEffect(() => {
    engine.setMuted(getMuted());
    const unsub = subscribeMuted(() => engine.setMuted(getMuted()));
    return unsub;
  }, [engine]);

  // Dispose the engine on unmount.
  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);
}

/**
 * `StudioAudioFx` — a render-nothing component that runs {@link useStudioAudio}.
 * Mounted by `StudioLoader` as a sibling of `StudioFocusOverlay`, inside the
 * input provider + stage. Zero DOM, zero re-render.
 */
export function StudioAudioFx(): null {
  useStudioAudio();
  return null;
}
