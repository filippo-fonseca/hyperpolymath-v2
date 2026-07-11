"use client";

/**
 * StudioAccents — floating lanterns, embers, and fireflies that give the
 * amphitheater spatial density. Cheap instanced-style individual meshes (counts
 * are tiny), demand-frame aware: they drift only inside an active window, then
 * freeze so idle rAF stays zero.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  EMBER_GEOMETRY,
  FIREFLY_GEOMETRY,
  LANTERN_GEOMETRY,
} from "../materials/sharedGeometries";
import { makeHologramMaterial } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import { DEFAULT_ARC_ZONES } from "../cloud/layout";
import { useStudioPerfTier } from "@/lib/studio/state/perf-tier";

const ACTIVE_MS = 7000;

interface AccentSpec {
  pos: [number, number, number];
  scale: number;
  phase: number;
  amp: number;
  speed: number;
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeRing(
  count: number,
  radius: number,
  y: number,
  zCenter: number,
  seed: number,
): AccentSpec[] {
  const out: AccentSpec[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2 + seed;
    const r = radius * (0.85 + hash01(seed + i * 3.1) * 0.3);
    out.push({
      pos: [
        Math.sin(t) * r,
        y + (hash01(seed + i * 7.7) - 0.5) * 0.6,
        zCenter - Math.cos(t) * r * 0.55,
      ],
      scale: 0.55 + hash01(seed + i * 11.3) * 0.7,
      phase: hash01(seed + i * 2.2) * Math.PI * 2,
      amp: 0.04 + hash01(seed + i * 5.5) * 0.06,
      speed: 0.4 + hash01(seed + i * 9.1) * 0.6,
    });
  }
  return out;
}

export function StudioAccents(): React.ReactElement {
  const perfTier = useStudioPerfTier();
  const invalidate = useThree((s) => s.invalidate);
  const activeUntilRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(0);

  const { pivot, nearRadius, farRadius } = DEFAULT_ARC_ZONES;

  const lanterns = useMemo(
    () => makeRing(6, farRadius * 0.92, 2.9, pivot[2], 1.1),
    [farRadius, pivot],
  );
  const embers = useMemo(
    () => makeRing(perfTier === "high" ? 20 : 14, nearRadius * 0.7, 0.35, pivot[2], 2.4),
    [nearRadius, pivot, perfTier],
  );
  const fireflies = useMemo(
    () => makeRing(perfTier === "high" ? 16 : 10, (nearRadius + farRadius) * 0.45, 1.8, pivot[2], 3.7),
    [nearRadius, farRadius, pivot, perfTier],
  );

  const lanternMat = useMemo(
    () =>
      makeHologramMaterial({
        tint: STUDIOLO.candleflame,
        opacity: 0.35,
        rimColor: STUDIOLO.brass,
        rimIntensity: 2.4,
        rimPower: 1.8,
        emissiveIntensity: 0.15,
      }),
    [],
  );
  const emberMat = useMemo(
    () =>
      makeHologramMaterial({
        tint: STUDIOLO.emberAlarm,
        opacity: 0.55,
        rimColor: STUDIOLO.candleflame,
        rimIntensity: 2.8,
        rimPower: 2.0,
        emissiveIntensity: 0.4,
      }),
    [],
  );
  const fireflyMat = useMemo(
    () =>
      makeHologramMaterial({
        tint: STUDIOLO.fireflyCyan,
        opacity: 0.7,
        rimColor: STUDIOLO.jarvisCyan,
        rimIntensity: 3.0,
        rimPower: 1.6,
        emissiveIntensity: 0.6,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      lanternMat.dispose();
      emberMat.dispose();
      fireflyMat.dispose();
    };
  }, [lanternMat, emberMat, fireflyMat]);

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
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [invalidate]);

  // Store base positions once so drift is relative, not cumulative.
  const bases = useMemo(() => {
    const all = [...lanterns, ...embers, ...fireflies];
    return all.map((a) => a.pos.slice() as [number, number, number]);
  }, [lanterns, embers, fireflies]);

  useFrame((_, dt) => {
    if (performance.now() >= activeUntilRef.current) return;
    tRef.current += dt;
    const t = tRef.current;
    const g = groupRef.current;
    if (!g) return;

    let i = 0;
    const apply = (specs: AccentSpec[]) => {
      for (const s of specs) {
        const child = g.children[i];
        const base = bases[i];
        i += 1;
        if (!child || !base) continue;
        child.position.set(
          base[0],
          base[1] + Math.sin(t * s.speed + s.phase) * s.amp,
          base[2],
        );
        child.rotation.y = t * 0.15 * s.speed + s.phase;
      }
    };
    apply(lanterns);
    apply(embers);
    apply(fireflies);
    invalidate();
  });

  let childIndex = 0;
  const renderSpecs = (
    specs: AccentSpec[],
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    baseScale: number,
  ) =>
    specs.map((s, idx) => {
      const key = `${childIndex}-${idx}`;
      childIndex += 1;
      return (
        <mesh
          key={key}
          geometry={geometry}
          material={material}
          position={s.pos}
          scale={s.scale * baseScale}
          frustumCulled
        />
      );
    });

  return (
    <group ref={groupRef}>
      {renderSpecs(lanterns, LANTERN_GEOMETRY, lanternMat, 0.55)}
      {renderSpecs(embers, EMBER_GEOMETRY, emberMat, 1.4)}
      {renderSpecs(fireflies, FIREFLY_GEOMETRY, fireflyMat, 1.2)}
    </group>
  );
}

export default StudioAccents;
