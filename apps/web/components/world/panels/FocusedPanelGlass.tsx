"use client";

/**
 * FocusedPanelGlass.tsx — W-12 · The Studiolo · The Bottega (Phase 3)
 *
 * THE ONE TRUE GLASS MOMENT. The panel you are actively working at earns
 * transmission: a single rounded-slab backplate stands ~2 cm behind the focused
 * panel's plane and refracts the Tree and room behind it, so the panel visibly
 * DEEPENS the instant you fly to reading pose. Everything else on the bench is
 * cheap uikit translucency + a shared fresnel frame (the §7.1 panel-material
 * law); true `heroGlass` (MeshTransmissionMaterial) is spent here exactly ONCE.
 *
 * ── The transmission-cap accounting (§7.1, verbatim) ─────────────────────────
 * `heroGlass` self-enforces a dev registry of ≤ HERO_GLASS_CAP (=3) LIVE mounted
 * MeshTransmissionMaterial instances. After Phase 3 the three sanctioned sites
 * are: the focused lantern (Lanterns.tsx), the Jarvis ribbon (JarvisRibbon.tsx),
 * and THIS focused-panel backplate — occupying the slot freed by the zenith
 * tablet's demolition. Each site renders AT MOST ONE hero mesh (a single
 * conditional element, never a list), so the ceiling is 3 sites × 1 = 3 = cap:
 * the registry can never reach a 4th and never throws. In practice fewer are
 * live — `focus.kind === "lantern"` and `focus.kind === "widget"` are mutually
 * exclusive focusStack levels, so Lanterns' hero and this backplate are never
 * both mounted; at most 2 (backplate/lantern + ribbon) are ever live at once.
 *
 * ── The swap-on-focus guard (mirrors Lanterns.tsx exactly) ───────────────────
 * We subscribe to `useFocusStack()` (useSyncExternalStore → re-renders at
 * INTERACTION cadence only, never per frame). When `focus.kind === "widget"` we
 * resolve `getBenchSlot(widgetId)` and mount ONE backplate; otherwise we release
 * it. Rapid focus swaps NEVER double-mount and NEVER leak the registry slot: the
 * backplate is a single element at a fixed tree position with a constant
 * `heroGlass({ tint })`, so a widget→widget swap merely re-positions the SAME
 * mesh (React never unmounts + remounts it) and the fade-out lingers on exactly
 * that one mesh before unmounting. When focus is not a widget we render null —
 * dropping the mesh, whose R3F unmount fires `heroGlass`'s registry cleanup and
 * frees the slot.
 *
 * ── The fade (§7.3 idle-rAF honesty) ─────────────────────────────────────────
 * heroGlass's props are frozen, so we fade by opting the slab's material into
 * alpha blending and damping its `opacity` in ONE `useFrame` (maath `easing.damp`
 * — the U-07 hover / U-11 label-fade convention). The loop calls `invalidate()`
 * ONLY while settling and unmounts the mesh once a fade-out reaches 0, so the
 * world sleeps again the moment the fade lands (zero per-frame work at rest).
 * Reduced motion (`useWorldPrefs()`) → an instant cut (no damp, no lingering).
 */

import { useEffect, useRef, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { easing } from "maath";
import { useFocusStack } from "../camera/useFocusStack";
import { getBenchSlot } from "./WidgetRig"; // W-07 owns the file; we only import.
import { heroGlass } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import { useWorldPrefs } from "../prefs/useWorldPrefs";
import type { BenchSlot } from "./widgetTypes";

// Panel plane dimensions — mirror WorldPanel's frozen `PANEL_W`/`PANEL_H` (§3.3;
// not exported, so re-stated here). The backplate is ~4% oversize so a hair of
// glass reads past the brass rail on every edge.
const PANEL_W = 1.6;
const PANEL_H = 1.1;
const OVERSIZE = 1.04;

const BACKPLATE_W = PANEL_W * OVERSIZE;
const BACKPLATE_H = PANEL_H * OVERSIZE;
// A shallow rounded slab: enough depth to give the transmission something to
// refract (the "deepening"), thin enough to sit behind the panel as a plate.
const BACKPLATE_DEPTH = 0.06;
const BACKPLATE_RADIUS = 0.025; // ≤ BACKPLATE_DEPTH / 2 (RoundedBox constraint)
// Seat the slab so its FRONT face sits ~2 cm behind the panel plane (z=0 local),
// clear of the brass frame at z=-0.008 (no z-fighting).
const BACKPLATE_Z = -0.02 - BACKPLATE_DEPTH / 2;

// maath `easing.damp` smoothTime: closes most of the gap in ~smoothTime, felt
// arrival ≈ 2× (CameraRig §1.3) → ~300 ms fade, per the W-12 spec.
const FADE_SMOOTH = 0.15;

/** The one hero backplate. Rendered by the Conductor inside WorldScene (W3 close). */
export function FocusedPanelGlass(): JSX.Element | null {
  const { current } = useFocusStack();
  const { reducedMotion } = useWorldPrefs();
  const invalidate = useThree((s) => s.invalidate);

  // Resolve the focused widget's slot at focus cadence only (never per frame,
  // never subscribed to the layout store — the backplate stands at the reading
  // pose, it does not chase a live drag).
  const targetSlot: BenchSlot | null =
    current.kind === "widget" ? getBenchSlot(current.widgetId) : null;

  // The slot whose backplate is currently MOUNTED. Lingers through the fade-out
  // so the single mesh (and its single registry slot) survives the ~300 ms damp
  // before it unmounts. Exactly ONE mesh is ever rendered.
  const [renderSlot, setRenderSlot] = useState<BenchSlot | null>(targetSlot);

  const meshRef = useRef<THREE.Mesh>(null);
  const opacityTarget = useRef<number>(targetSlot !== null ? 1 : 0);
  const mountedRef = useRef<boolean>(targetSlot !== null);
  const pendingFadeIn = useRef<boolean>(false);

  // Focus-cadence lifecycle: mount + fade in on a widget, fade out + release
  // otherwise. Mirrors Lanterns' single-conditional-mesh discipline.
  useEffect(() => {
    if (targetSlot !== null) {
      // Fresh mount (was released) → begin the fade from 0; a widget→widget swap
      // keeps the SAME mesh mounted and simply re-positions it (no re-fade).
      if (!mountedRef.current) pendingFadeIn.current = true;
      mountedRef.current = true;
      opacityTarget.current = 1;
      setRenderSlot(targetSlot);
      invalidate(); // kick one frame under demand mode; the damp self-sustains.
    } else {
      opacityTarget.current = 0;
      if (reducedMotion) {
        // Instant release: drop the mesh now → heroGlass registry frees the slot.
        mountedRef.current = false;
        setRenderSlot(null);
      } else {
        invalidate(); // let the useFrame fade out, then unmount on settle.
      }
    }
  }, [targetSlot, reducedMotion, invalidate]);

  // ONE useFrame: the opacity damp. Runs only on demanded frames; at rest the
  // world sleeps (§7.3). Self-invalidates while moving; unmounts on fade-out.
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    if (!mat) return;

    // heroGlass leaves `transparent` unset (opaque transmission). Opt the slab
    // into alpha blending ONCE so the opacity damp actually fades it; the
    // transmission still refracts the Tree/room behind it at full opacity.
    if (!mat.transparent) {
      mat.transparent = true;
      mat.needsUpdate = true;
    }

    if (pendingFadeIn.current) {
      pendingFadeIn.current = false;
      mat.opacity = reducedMotion ? 1 : 0;
    }

    if (reducedMotion) {
      mat.opacity = opacityTarget.current; // instant — no glide, no lingering.
      return;
    }

    const moving = easing.damp(
      mat,
      "opacity",
      opacityTarget.current,
      FADE_SMOOTH,
      delta,
    );
    if (moving) {
      invalidate(); // demand frames ONLY while settling; stop at rest.
    } else if (opacityTarget.current === 0) {
      // Fully faded out → unmount, releasing the heroGlass registry slot.
      mountedRef.current = false;
      setRenderSlot(null);
    }
  });

  if (renderSlot === null) return null;

  return (
    <group
      position={renderSlot.position}
      rotation={renderSlot.rotation}
      name="focused-panel-glass"
    >
      {/* The ONE hero backplate — a single rounded slab behind the panel plane.
          `heroGlass` self-enforces the ≤3 live-instance dev registry. */}
      <RoundedBox
        ref={meshRef}
        args={[BACKPLATE_W, BACKPLATE_H, BACKPLATE_DEPTH]}
        radius={BACKPLATE_RADIUS}
        smoothness={3}
        position={[0, 0, BACKPLATE_Z]}
      >
        {heroGlass({ tint: STUDIOLO.deepVellum })}
      </RoundedBox>
    </group>
  );
}

export default FocusedPanelGlass;
