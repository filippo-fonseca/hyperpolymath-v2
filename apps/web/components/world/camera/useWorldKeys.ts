"use client";

/**
 * useWorldKeys.ts — U-07 · The Studiolo · camera-rig
 *
 * The world's SINGLE keyboard listener. Mounted exactly once, by `CameraRig`
 * (call `useWorldKeys()` inside it; the hook returns nothing).
 *
 * CAPTURE PHASE is deliberate: `GlobalHotkeys` listens in the bubble phase on
 * window (`GlobalHotkeys.tsx:126`), and U-13 must intercept Cmd+K on `/world`
 * BEFORE `GlobalHotkeys.focusJarvis()` runs. Registering the world listener in
 * capture phase now means U-13 later adds its Cmd+K branch to THIS handler
 * instead of racing a second listener.
 *
 * The handler's data (layout) lives in a REF so the listener registers exactly
 * once — re-subscribing on every layout change is the failure mode that
 * produces double-firing listeners (PLAN §6 U-07 "single keydown listener").
 */

import { useEffect, useRef } from "react";
import { useWorldData } from "../data/useWorldData";
import { focusStack } from "./useFocusStack";
import { bootDone } from "./CameraRig";
import { jarvisWorldBus } from "../jarvis/useJarvisWorld";

export function useWorldKeys(): void {
  const { layout } = useWorldData();

  // Keep layout reachable inside the stable handler without re-subscribing.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      // Boot gate: the world ignores ALL navigation until the Litany finishes
      // (or the 8s failsafe elapses). See CameraRig §3.4.
      if (!bootDone()) return;

      // U-13: Cmd/Ctrl+K — summon the ring. This capture-phase listener beats
      // GlobalHotkeys' bubble-phase focusJarvis (GlobalHotkeys.tsx:33-37,126);
      // GlobalJarvisDialog is route-guarded out on /world (GlobalJarvisDialog §5.2).
      // Placed BEFORE the typing guard so Cmd+K still lands while the ribbon's own
      // input is focused (idempotent summon → refocus), and before the modifier
      // bail below which would otherwise swallow it.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "k" || e.key === "K")
      ) {
        e.preventDefault(); // and the browser default (Firefox: Cmd+K = search)
        e.stopPropagation(); // kills the bubble-phase GlobalHotkeys handler
        jarvisWorldBus.summon();
        return;
      }

      // Typing guard — copied VERBATIM from GlobalHotkeys.tsx:89-98. Also solves
      // the future Esc-vs-Jarvis-ribbon conflict: when U-13's <Html> <input> has
      // focus, `e.target` is that INPUT and world keys stand down.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Modifier bail: never fight GlobalHotkeys' Ctrl+1/2/3 tab-swap, Cmd+[/],
      // or browser combos. Plain unmodified keys only (bare Shift is harmless).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        // Pop per stack semantics: tablet-focus → framed ring → vestibule. The
        // snapToNow-then-glide-home sequencing for leaving the ring lives in
        // CameraRig's focus effect (the sole camera authority), not here — this
        // handler only mutates the stack; the glide is CameraRig's to sequence.
        focusStack.pop(); // CameraRig's focus effect performs the glide
        return;
      }

      // C — reserved for the bench. The Meridian Ring's look-up ritual is gone;
      // W-06 re-points C to summon the Agenda panel
      // (focusStack.push({ kind: "widget", widgetId: "agenda" })). Until then
      // this is an inert no-op so the muscle memory never pushes a dead level.
      if (e.key === "c" || e.key === "C") {
        return; // W-06 re-points C to summon Agenda
      }

      // 1–9 → focus the Nth bough. `layout.boughs` is already in orderIndex order
      // (treeLayout.ts:182-186), so key `3` = the third area in the sidebar.
      if (e.key >= "1" && e.key <= "9") {
        const i = Number(e.key) - 1;
        const b = layoutRef.current.boughs[i];
        if (b) {
          e.preventDefault();
          focusStack.push({ kind: "bough", areaId: b.areaId });
        }
        // Out-of-range digits fall through untouched.
        return;
      }

      // Anything else: fall through, no preventDefault (U-17's any-key litany-skip
      // listens separately).
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
    };
  }, []);
}
