"use client";

/**
 * DustMotes.tsx — U-08 · The Studiolo · atmosphere-post
 *
 * ONE THREE.Points of ~600 motes drifting through the chamber — a single draw
 * call, no per-mote React nodes. The point of dust is atmosphere, not motion,
 * so its animation obeys the §7 idle policy strictly:
 *
 *   - `frameloop="demand"` means nothing renders unless a frame is demanded.
 *   - The drift runs ONLY inside a rolling "active window" (4 s after any
 *     interaction, matching the MVP breath rule in §6/U-06). While the window
 *     is open the frame loop keeps `invalidate()`-ing itself so the motes move;
 *     when it closes we return early WITHOUT demanding another frame, so the
 *     world truly sleeps and the dust freezes mid-air (cheap and intended).
 *   - Zero allocation per frame: base positions, phases, and speeds are
 *     preallocated once; `useFrame` only mutates the existing position buffer.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STUDIOLO } from "../materials/tokens";

const COUNT = 600;
// The volume the motes inhabit: a wide, low slab over the vestibule floor.
const SPREAD_XZ = 12; // ± meters in X/Z
const FLOOR_Y = 0.2;
const CEILING_Y = 4.2;
const BAND_H = CEILING_Y - FLOOR_Y;
// How long the drift keeps running after an interaction (ms).
const ACTIVE_MS = 7000;
// Gentle sway amplitude (meters) and rise speed range (m/s).
const SWAY = 0.06;
const RISE_MIN = 0.02;
const RISE_MAX = 0.08;

export function DustMotes(): React.ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const pointsRef = useRef<THREE.Points>(null);
  const activeUntilRef = useRef(0);

  // Preallocated, deterministic-ish layout (hash-free; visual only, so a plain
  // PRNG is fine — dust identity doesn't need to match anything).
  const { geometry, material, base, phase, rise } = useMemo(() => {
    const base = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const rise = new Float32Array(COUNT);
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const bi = i * 3;
      const x = (Math.random() - 0.5) * SPREAD_XZ;
      const y = FLOOR_Y + Math.random() * BAND_H;
      const z = (Math.random() - 0.5) * SPREAD_XZ;
      base[bi] = x;
      base[bi + 1] = y;
      base[bi + 2] = z;
      positions[bi] = x;
      positions[bi + 1] = y;
      positions[bi + 2] = z;
      phase[i] = Math.random() * Math.PI * 2;
      rise[i] = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(STUDIOLO.moonlace),
      size: 0.02,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
      // Tone-mapped (default): stays in [0,1], so dust never trips Bloom.
    });
    return { geometry, material, base, phase, rise };
  }, []);

  // Dispose the singletons when the island unmounts.
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Open the active window on any interaction (and once on mount for the boot
  // moment); each wake demands a frame so the drift loop can start.
  useEffect(() => {
    const wake = () => {
      activeUntilRef.current = performance.now() + ACTIVE_MS;
      invalidate();
    };
    wake();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("pointermove", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [invalidate]);

  useFrame((state) => {
    // Outside the active window: let the world sleep (do NOT re-invalidate).
    if (performance.now() > activeUntilRef.current) return;

    const points = pointsRef.current;
    if (points === null) return;
    const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < COUNT; i++) {
      const bi = i * 3;
      const ph = phase[i]!;
      // Slow rise with wraparound inside the band.
      const y = FLOOR_Y + ((base[bi + 1]! - FLOOR_Y + t * rise[i]!) % BAND_H);
      arr[bi] = base[bi]! + Math.sin(t * 0.2 + ph) * SWAY;
      arr[bi + 1] = y;
      arr[bi + 2] = base[bi + 2]! + Math.cos(t * 0.15 + ph) * SWAY;
    }
    attr.needsUpdate = true;

    // Keep the demand loop alive for the rest of the window.
    invalidate();
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default DustMotes;
