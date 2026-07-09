"use client";

/**
 * ZoneMarkers — the amphitheater drop-zone outlines, shown only during a grab.
 *
 * While a card is held (`grabbedId !== null`) it renders one faint hologram
 * frame at every arc zone slot; the slot the card would drop into
 * (`nearestZone`) gets the bright highlight material. Idle it renders nothing
 * (returns `null`), so it costs zero draw calls and never wakes a frame.
 *
 * No `useFrame`: the only motion is mount/unmount on grab start/end and the
 * highlight flip as the nearest zone changes — both React re-renders, which R3F
 * turns into demanded frames. The manipulation controller already invalidates on
 * every grabMove, so the highlight tracks the hand under the demand-frame
 * doctrine without any idle rAF here.
 *
 * The frames are the same fresnel-rim hologram family as the tiles (grazing
 * edges emit > 1.0 → Bloom), so an empty slot reads as a glowing outline rather
 * than a second card. Two shared materials only (rest + highlight) keep it to
 * one extra program per state and dispose cleanly when the grab ends.
 */

import { useEffect, useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

import { CAMERA_HOME } from "@/lib/studio/camera/traversal";
import { useFrontRow } from "@/lib/studio/state/active-row";
import { useDndState, useZoneAssignment } from "@/lib/studio/state/zone-assignment";
import { makeHologramMaterial } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import { arcZoneSlots, DEFAULT_ARC_ZONES, TILE_H, TILE_W } from "./layout";

// Markers orient to the fixed camera (CAMERA_HOME), same as WidgetTile — sourced
// from the shared home so marker orientation never drifts from the tiles'.
const CAMERA_POS = new THREE.Vector3(...CAMERA_HOME);

// A hair larger than a tile so a marker frames the slot it belongs to rather
// than reading as a second card; equally thin. Derived from the shared TILE_*
// so the frame tracks any tile-size change.
const MARK_W = TILE_W + 0.12;
const MARK_H = TILE_H + 0.12;
const MARK_D = 0.05;
const MARK_RADIUS = 0.06;

export function ZoneMarkers(): React.ReactElement | null {
  const { grabbedId, nearestZone } = useDndState();
  const assignment = useZoneAssignment();
  const frontRow = useFrontRow();

  // Zone slots (position + camera-facing orientation) for THIS window's owned
  // count at the active front row. Derived from the live assignment length (not a
  // fixed 8) so the markers match the drop math under multi-window ownership, and
  // re-derived on a row swap so the outlines follow the tiles forward. Markers
  // mount only during a grab, so recomputing here is cheap.
  const slots = useMemo(() => {
    const raw = arcZoneSlots(assignment.length, DEFAULT_ARC_ZONES, frontRow);
    return raw.map((s) => {
      const toCamera = new THREE.Vector3()
        .subVectors(CAMERA_POS, new THREE.Vector3(...s.position))
        .normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        toCamera,
      );
      return { position: s.position, quaternion };
    });
  }, [assignment.length, frontRow]);

  // Two shared materials: a faint resting frame and the bright nearest-zone
  // highlight. Created once; disposed on unmount (grab end unmounts this tree).
  const [restMat, hotMat] = useMemo(() => {
    const rest = makeHologramMaterial({
      tint: STUDIOLO.parchment,
      opacity: 0.05,
      rimColor: STUDIOLO.jarvisCyan,
      rimIntensity: 1.6,
    });
    const hot = makeHologramMaterial({
      tint: STUDIOLO.jarvisCyan,
      opacity: 0.14,
      rimColor: STUDIOLO.jarvisCyan,
      rimIntensity: 3.2,
    });
    return [rest, hot] as const;
  }, []);

  useEffect(() => {
    return () => {
      restMat.dispose();
      hotMat.dispose();
    };
  }, [restMat, hotMat]);

  if (grabbedId === null) return null;

  return (
    <group>
      {slots.map((slot, i) => (
        <group key={i} position={slot.position} quaternion={slot.quaternion}>
          <RoundedBox
            args={[MARK_W, MARK_H, MARK_D]}
            radius={MARK_RADIUS}
            smoothness={4}
            material={i === nearestZone ? hotMat : restMat}
          />
        </group>
      ))}
    </group>
  );
}

export default ZoneMarkers;
