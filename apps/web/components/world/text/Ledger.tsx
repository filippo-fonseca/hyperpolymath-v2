"use client";

/**
 * Ledger.tsx — U-11 · The Studiolo · labels-ledger
 *
 * A quiet, camera-anchored strip at bottom-center that reads the day at a glance:
 * tasks due today · overdue · unfiled captures. Italic EB Garamond, subtle,
 * always in the corner of the eye like a desk blotter's marginalia.
 *
 * ── Camera anchoring (screen-fixed HUD) ─────────────────────────────────────
 * The strip is a group that LIVES IN THE SCENE (so it is guaranteed to render —
 * a child of the camera would only render if the camera itself were in the scene
 * graph, which under R3F it may not be) whose transform is COPIED from the camera
 * each demanded frame. The single `<Text>` sits at a fixed camera-local offset
 * (bottom-center, ~1.6 m ahead for a 55° fov), so it stays pinned to the lower
 * edge and always faces the viewer. The copies are allocation-free and run ONLY
 * on frames the world already demanded (camera glides), so the idle world still
 * sleeps (PLAN §7.5). It renders on top (depthTest off) like a true HUD element.
 *
 * ── SDF discipline (§7.8) ───────────────────────────────────────────────────
 *   - Exactly ONE `<Text>` for the whole ledger; italic uses the single
 *     EB_GARAMOND_ITALIC atlas (the font file is already italic, so we do NOT
 *     also set `fontStyle="italic"` — that would synthetically double-slant it).
 *   - The line is recomputed via `useMemo` on WorldData identity (Realtime
 *     cadence), NEVER per frame; a data change kicks one `invalidate()`.
 *   - Tone-mapped parchment fill (no emissive) stays below Bloom's threshold, so
 *     the ledger reads as ink, not glow (SDF text in bloom smears — see
 *     WorldLabels for the full rationale).
 *
 * NOTE (Phase 2): the "next event" segment from the VISION strip lands with the
 * Meridian Ring, when Google Calendar data enters WorldData. Calendar is not in
 * the MVP (PLAN §9), so the line is composed from the three live counts the
 * world already holds; `composeLedgerLine` extends cleanly when events arrive.
 */

import { useEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";

import { classifyTask } from "../data/mappings";
import { useWorldData, type WorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";
import { EB_GARAMOND_ITALIC, preloadWorldFonts } from "./fonts";

// Camera-local placement: centered, dropped toward the lower edge, ~1.6 m ahead.
// At fov 55° / z = 1.6 the vertical half-extent is ~0.83, so y = −0.62 sits low
// in frame without clipping the very bottom.
const LEDGER_LOCAL: [number, number, number] = [0, -0.62, -1.6];
const LEDGER_FONT = 0.05;
const LEDGER_OPACITY = 0.7; // subtle — marginalia, not a headline
const SDF_GLYPH_SIZE = 64;
const LEDGER_SEPARATOR = "  \u00B7  "; // middle dot with breathing room

/**
 * Compose the ledger line from the live world data. Pure + cheap (O(#tasks));
 * called through `useMemo` on data identity, so it runs at Realtime cadence, not
 * per frame. Overdue is shown only when present (an empty desk stays calm).
 */
export function composeLedgerLine(d: WorldData): string {
  let dueToday = 0;
  let overdue = 0;
  for (const t of d.tasks) {
    const s = classifyTask(t, d.todayYmd);
    if (s === "today") dueToday++;
    else if (s === "overdue") overdue++;
  }
  const unfiled = d.captures.length;

  if (dueToday === 0 && overdue === 0 && unfiled === 0) {
    return "The desk is clear.";
  }

  const parts: string[] = [`${dueToday} due today`];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  parts.push(`${unfiled} unfiled`);
  return parts.join(LEDGER_SEPARATOR);
}

export function Ledger(): JSX.Element {
  const data = useWorldData();
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    preloadWorldFonts();
  }, []);

  const line = useMemo(() => composeLedgerLine(data), [data]);

  // A data change is the only thing that alters the strip; kick one frame so the
  // new line paints under demand mode.
  useEffect(() => {
    invalidate();
  }, [line, invalidate]);

  // Seat the strip in front of the camera before the first paint.
  useEffect(() => {
    const g = groupRef.current;
    if (g) {
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);
    }
  }, [camera]);

  // Track the camera on every demanded frame (allocation-free copies). No-op work
  // when idle because `useFrame` bodies only run on frames already demanded.
  useFrame(() => {
    const g = groupRef.current;
    if (g === null) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={groupRef}>
      <Text
        position={LEDGER_LOCAL}
        font={EB_GARAMOND_ITALIC}
        fontSize={LEDGER_FONT}
        color={STUDIOLO.parchment}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.6}
        textAlign="center"
        letterSpacing={0.02}
        sdfGlyphSize={SDF_GLYPH_SIZE}
        fillOpacity={LEDGER_OPACITY}
        outlineWidth={0.004}
        outlineColor={STUDIOLO.deepVellum}
        outlineBlur={0.006}
        outlineOpacity={LEDGER_OPACITY}
        renderOrder={999}
        onSync={(troika) => {
          // Draw on top like a HUD: no depth test/write so scene geometry never
          // occludes the strip when the camera dollies in close.
          const mesh = troika as THREE.Mesh;
          const mat = mesh.material as THREE.Material | undefined;
          if (mat) {
            mat.depthTest = false;
            mat.depthWrite = false;
            mat.transparent = true;
          }
          mesh.renderOrder = 999;
        }}
      >
        {line}
      </Text>
    </group>
  );
}

export default Ledger;
