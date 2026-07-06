"use client";

/**
 * WorldLabels.tsx — U-11 · The Studiolo · labels-ledger
 *
 * Floating EB-Garamond captions for the geography: one caption per area (at the
 * bough crown, always legible) and one per project (at its lantern, smaller,
 * shown only when its area is in focus). Both are drei `<Text>` (troika SDF) so
 * the serifs stay crisp at any zoom.
 *
 * ── SDF-text discipline (PLAN §7.8) ─────────────────────────────────────────
 *   - ONE font URL per style: every caption uses EB_GARAMOND_REGULAR (the Ledger
 *     owns the italic). We never spawn a second regular-font troika atlas.
 *   - `preloadWorldFonts()` runs once on mount so the atlas is warm before the
 *     first glyph paints (no atlas-pop after boot).
 *   - `<Text>` count is BOUNDED and capped defensively: area labels ≤
 *     MAX_AREA_LABELS, project labels ≤ MAX_PROJECT_LABELS. LIVE (drawn) count is
 *     far smaller — area captions (≤ #areas) plus only the FOCUSED area's project
 *     captions; everything else is `visible = false` (culled, zero draw calls),
 *     never unmounted.
 *   - NO per-frame React state. Focus lives in the module `focusStack`
 *     (useSyncExternalStore, interaction cadence); the only per-frame work is the
 *     opacity damp below, and it self-suspends the moment it converges.
 *   - Billboarding uses drei `<Billboard follow lockX lockZ>` — yaw-only, so
 *     captions face the camera horizontally yet stay UPRIGHT (never tilt flat
 *     when the camera looks down from the canopy). The plan explicitly permits
 *     drei `<Billboard>` (§7.4) in lieu of hand-rolled quaternion math.
 *
 * ── Bloom decision (deliberate) ─────────────────────────────────────────────
 * Captions are tone-mapped fill (troika's default), NOT emissive, and their
 * parchment/area-hue colors tone-map to ≤1 luminance — so they sit BELOW PostFX
 * Bloom's `luminanceThreshold={1}` and never enter the composer. This is on
 * purpose: SDF glyphs pushed past the bloom threshold smear their edges into
 * mush. Legibility comes from a dark `outlineColor` halo (deepVellum) against the
 * night, not from glow. The tree's light veins do the blooming; the type stays
 * readable ink.
 *
 * Fade convention mirrors U-07's hover discipline: a maath `easing.damp` on the
 * troika `fillOpacity` property, run in ONE `useFrame`, that calls `invalidate()`
 * only while settling — so project captions cross-fade in/out on focus change
 * and the world sleeps again once they land.
 */

import { useEffect, useMemo, useRef, type JSX } from "react";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { easing } from "maath";

import { useWorldData } from "../data/useWorldData";
import { useFocusStack } from "../camera/useFocusStack";
import { oklchToThreeColor, STUDIOLO } from "../materials/tokens";
import { EB_GARAMOND_REGULAR, preloadWorldFonts } from "./fonts";

// ── Defensive caps (§7.8 — bound the troika instance count) ─────────────────
// A single-user world never approaches these; they exist so a pathological
// tree can never spawn a troika atlas storm.
const MAX_AREA_LABELS = 24;
const MAX_PROJECT_LABELS = 64;

// ── Type / placement knobs ──────────────────────────────────────────────────
const AREA_FONT = 0.14; // area caption size (world units)
const PROJECT_FONT = 0.085; // project caption — smaller, per PLAN §6
const AREA_LIFT = 0.28; // caption sits above the bough crown
const PROJECT_LIFT = 0.22; // caption sits above the lantern
const AREA_OPACITY = 0.92; // areas are always legible
const SDF_GLYPH_SIZE = 64; // capped at 64 (§7.8)
const FADE_SMOOTH = 0.12; // maath damp smoothTime → ~120 ms cross-fade
const OUTLINE_COLOR = STUDIOLO.deepVellum; // dark halo for legibility, not glow

/**
 * The mutable troika-`<Text>` surface the fade loop touches. drei's `<Text>` ref
 * is the troika Text instance (`any` in its typings); we only ever read/write
 * these three fields imperatively — never React state.
 */
interface FadeText {
  fillOpacity: number;
  outlineOpacity: number;
  visible: boolean;
}

interface AreaLabelDesc {
  areaId: string;
  name: string;
  position: Vector3Tuple;
  color: THREE.Color;
}

interface ProjectLabelDesc {
  projectId: string;
  areaId: string;
  name: string;
  position: Vector3Tuple;
  color: THREE.Color;
}

export function WorldLabels(): JSX.Element {
  const { layout } = useWorldData();
  const { current } = useFocusStack();
  const invalidate = useThree((s) => s.invalidate);

  // Warm the SDF atlas once (idempotent — troika caches by font+glyphs).
  useEffect(() => {
    preloadWorldFonts();
  }, []);

  // ── Label descriptors — recomputed only when the layout identity changes ──
  const areaLabels = useMemo<AreaLabelDesc[]>(
    () =>
      layout.boughs.slice(0, MAX_AREA_LABELS).map((b) => ({
        areaId: b.areaId,
        name: b.name,
        position: [b.end[0], b.end[1] + AREA_LIFT, b.end[2]] as Vector3Tuple,
        color: oklchToThreeColor(b.color),
      })),
    [layout],
  );

  const projectLabels = useMemo<ProjectLabelDesc[]>(() => {
    const out: ProjectLabelDesc[] = [];
    for (const b of layout.boughs) {
      for (const l of b.projects) {
        if (out.length >= MAX_PROJECT_LABELS) return out;
        out.push({
          projectId: l.projectId,
          areaId: l.areaId,
          name: l.name,
          position: [
            l.position[0],
            l.position[1] + PROJECT_LIFT,
            l.position[2],
          ],
          color: oklchToThreeColor(l.color),
        });
      }
    }
    return out;
  }, [layout]);

  // ── Focus gate: which area's project captions are shown ─────────────────────
  // vestibule → none; bough → that area; lantern → its parent area.
  const focusedAreaId = useMemo<string | null>(() => {
    if (current.kind === "bough") return current.areaId;
    if (current.kind === "lantern") {
      return layout.byProject.get(current.projectId)?.areaId ?? null;
    }
    return null;
  }, [current, layout]);

  // The frame loop reads focus through a ref (no per-frame React state); writing
  // a ref during render is a plain assignment, never a re-render trigger.
  const focusedAreaIdRef = useRef<string | null>(null);
  focusedAreaIdRef.current = focusedAreaId;

  // Kick a frame whenever the focus gate changes so the cross-fade starts under
  // demand mode; the useFrame below self-sustains until it converges.
  useEffect(() => {
    invalidate();
  }, [focusedAreaId, invalidate]);

  // Live troika surfaces for project captions, keyed by projectId.
  const projectTextRefs = useRef<Map<string, FadeText>>(new Map());

  useFrame((_, delta) => {
    const focused = focusedAreaIdRef.current;
    let moving = false;
    for (const p of projectLabels) {
      const t = projectTextRefs.current.get(p.projectId);
      if (t === undefined) continue;
      const target = p.areaId === focused ? 1 : 0;
      const m = easing.damp(t, "fillOpacity", target, FADE_SMOOTH, delta);
      t.outlineOpacity = t.fillOpacity;
      t.visible = t.fillOpacity > 0.01; // cull fully-faded captions (0 draw calls)
      if (m) moving = true;
    }
    if (moving) invalidate();
  });

  return (
    <group name="world-labels">
      {/* Area captions — always legible, one per active area. */}
      {areaLabels.map((a) => (
        <Billboard key={a.areaId} position={a.position} follow lockX lockZ>
          <Text
            font={EB_GARAMOND_REGULAR}
            fontSize={AREA_FONT}
            color={a.color}
            anchorX="center"
            anchorY="middle"
            maxWidth={2.4}
            textAlign="center"
            sdfGlyphSize={SDF_GLYPH_SIZE}
            fillOpacity={AREA_OPACITY}
            outlineWidth={0.006}
            outlineColor={OUTLINE_COLOR}
            outlineBlur={0.006}
            outlineOpacity={AREA_OPACITY}
          >
            {a.name}
          </Text>
        </Billboard>
      ))}

      {/* Project captions — mounted once, cross-faded by focus (never unmounted).
          Start hidden; the fade loop reveals the focused area's set. */}
      {projectLabels.map((p) => (
        <Billboard key={p.projectId} position={p.position} follow lockX lockZ>
          <Text
            ref={(o: FadeText | null) => {
              if (o) {
                if (!projectTextRefs.current.has(p.projectId)) {
                  o.fillOpacity = 0;
                  o.outlineOpacity = 0;
                  o.visible = false;
                }
                projectTextRefs.current.set(p.projectId, o);
              } else {
                projectTextRefs.current.delete(p.projectId);
              }
            }}
            font={EB_GARAMOND_REGULAR}
            fontSize={PROJECT_FONT}
            color={p.color}
            anchorX="center"
            anchorY="middle"
            maxWidth={1.4}
            textAlign="center"
            sdfGlyphSize={SDF_GLYPH_SIZE}
            fillOpacity={0}
            outlineWidth={0.004}
            outlineColor={OUTLINE_COLOR}
            outlineBlur={0.004}
            outlineOpacity={0}
          >
            {p.name}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

export default WorldLabels;
