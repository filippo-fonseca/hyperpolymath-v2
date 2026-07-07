"use client";

/**
 * WorldPanel.tsx — W-03 · The Studiolo · The Bottega (Phase 3)
 *
 * THE KEYSTONE PRIMITIVE. Everything `TodayPanel` proved, generalized exactly
 * once (PHASE-3-PLAN §3.3, frozen at Wave-W1 close). Every bench widget renders
 * ITS content into this shell; the shell owns the skin, the brass-rail frame,
 * the LOD split, the honesty states, and the world-pick/summon plumbing. The
 * primitive itself touches NO data — widgets supply `children` + their wiring
 * (a widget reads `useWorldData()` in render, memoizes its derivations, and
 * writes through the 2D server actions + `queryClient.invalidateQueries`, never
 * per frame — the TodayPanel doctrine).
 *
 * ANCHORING (verbatim from TodayPanel's rationale): a panel is a FIXED
 * world-anchored `<group position rotation>` — NEVER camera-attached. A panel
 * that tracked the camera would need a per-frame transform write, breaking the
 * "zero per-frame work" contract and demand-mode idle. During a drag the RIG
 * (W-07), not the panel, animates the group transform; at rest it is static.
 *
 * LOD (§7.2 — the panel-LOD law):
 *   • `lod === "full"`     → mount ONE uikit `<Root>` (the TodayPanel skin
 *     verbatim) with a header, a brass rule, and a scrollable content region.
 *   • `lod === "placard"`  → do NOT mount the `<Root>`; float ONE SDF `<Text>`
 *     (EB Garamond, the title) in the frame. This is the draw-call answer.
 *   Switching LOD is a MOUNT change at interaction cadence — never per frame.
 *
 * FRAME (2-material rim-lift, no recompile): ONE shared-geometry brass-rail
 * mesh (top/bottom rails + four corner tabs) drawn with one of TWO module
 * singleton `makeHologramMaterial` instances — `frameIdle` and `frameFocused`
 * (a brighter fresnel rim that blooms). The `focused` prop SWAPS the material
 * at interaction cadence; both instances share `makeHologramMaterial`'s pinned
 * `customProgramCacheKey ("studiolo:sf@1")`, so the swap NEVER recompiles a
 * program and NEVER mutates a uniform per frame.
 *
 * HONESTY STATES (§2.8 — "the world never begs, never OAuths, never a blank
 * slab"): in full LOD, `status === "empty"` renders the quiet `emptyLine`
 * aside; `status === "disconnected"` renders the engraved `disconnectedLine`
 * nudge back to the Page. A placard stays frame + title (the LOD law wins).
 *
 * INTERACTION: uikit pointer events work as-is (the TodayPanel `<Button>`
 * precedent). `event.stopPropagation()` on the panel body/frame keeps panel
 * clicks from falling through to world picking (lanterns/boughs behind). A
 * placard click SUMMONS the widget — `focusStack.push({kind:"widget",widgetId})`
 * — so a distant placard flies to reading pose.
 *
 * TYPOGRAPHY: uikit's default font inside the `<Root>` (its documented limits
 * — no italic, MSDF glyph gaps — are inherited from TodayPanel: dimmed weight
 * carries the italic intent, bordered Containers replace exotic glyphs). SDF
 * EB Garamond for the placard title only (`text/fonts.ts`).
 *
 * PERF (§7.2): placard ≤4 draw calls (frame 1 + one SDF Text 1 = 2 here);
 * full panel ≤22 (uikit `<Root>` batches ≤21 + frame 1). Frame geometry is a
 * module singleton (~72 tris, well under the ≤8k bench-triangle budget); the
 * two materials are module singletons compiled ONCE. ZERO per-frame work: this
 * file has no `useFrame`, no ref mutation, no `invalidate()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANUAL STORY (visual verification — mount inside the `/world` R3F canvas):
 *
 *   const slot: BenchSlot = {                         // a hand-authored slot
 *     index: 0, widgetId: "tasks",
 *     position: [-1.85, 1.5, 1.5], rotation: [0, 0.42, 0],
 *     cameraPose: someVestibuleAdjacentPose,
 *   };
 *
 *   // 1) FULL, ready — header + rule + scrollable rows:
 *   <WorldPanel widgetId="tasks" title="Tasks" countChip="6 due"
 *               focused={false} lod="full" slot={slot}>
 *     <Text fontSize={13} color={STUDIOLO.parchment}>Finish the plan</Text>
 *   </WorldPanel>
 *
 *   // 2) FULL, focused — flip `focused` → the frame rim BLOOMS (material swap,
 *   //    verify no shader recompile in the R3F devtools program list):
 *   <WorldPanel ... focused lod="full" slot={slot}>{rows}</WorldPanel>
 *
 *   // 3) FULL, empty / disconnected — the §2.8 lines, never a blank slab:
 *   <WorldPanel ... status="empty"        emptyLine="The day is clear." ... />
 *   <WorldPanel ... status="disconnected"
 *               disconnectedLine="The agenda is dark. Connect Google Calendar on the Page." ... />
 *
 *   // 4) PLACARD — frame + SDF title only (2 draw calls); clicking summons:
 *   <WorldPanel widgetId="tasks" title="Tasks" focused={false}
 *               lod="placard" slot={slot}>{ignoredChildren}</WorldPanel>
 *
 * Side-by-side with TodayPanel, a full ready panel is visually identical modulo
 * the brass-rail frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type JSX, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Container, Root, Text } from "@react-three/uikit";
import { Text as SdfText } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { focusStack } from "../camera/useFocusStack";
import { makeHologramMaterial } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import { EB_GARAMOND_REGULAR } from "../text/fonts";
import type { BenchSlot, WidgetId } from "./widgetTypes";

// ── The frozen contract (§3.3) ───────────────────────────────────────────────

/**
 * Pointer-handler bag for the drag affordance, supplied by `useWidgetDrag`
 * (W-07) and spread onto the frame mesh. DEFINED HERE deliberately: W-07 is a
 * later wave and imports this from the primitive (a downhill dependency, fine).
 * Handlers are R3F `ThreeEvent`s so W-07 can read `event.point` / `event.ray`
 * for the drag ray without any adapter; `undefined` = the panel is not
 * draggable yet.
 */
export interface DragHandleProps {
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void;
}

export interface WorldPanelProps {
  widgetId: WidgetId;
  /** Header caption, EB-Garamond-adjacent uikit bold. */
  title: string;
  /** Optional right-aligned brass chip ("6 due"). */
  countChip?: string;
  /** Drives the honesty states (§2.8). Defaults to "ready". */
  status?: "ready" | "empty" | "disconnected";
  /** The quiet aside shown when `status === "empty"`. */
  emptyLine?: string;
  /** The engraved nudge shown when `status === "disconnected"`. */
  disconnectedLine?: string;
  /** From the rig; drives the frame rim lift (§7.2). */
  focused: boolean;
  /** From the rig; `"placard"` = frame + SDF title only. */
  lod: "full" | "placard";
  /** Position/rotation from the layout solver (§3.4). */
  slot: BenchSlot;
  /** From `useWidgetDrag` (W-07); undefined = not draggable yet. */
  dragHandleProps?: DragHandleProps;
  /** uikit Container/Text/Button content ONLY. */
  children: ReactNode;
}

/** Every widget caps its rows at this and renders an "and N more" footer. */
export const PANEL_ROW_CAP = 12;

/** uikit/R3F pointer events both expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

// ── The brass-rail frame — ONE shared geometry singleton ─────────────────────
//
// Built ONCE at import (lifetime = the world island), never rebuilt, never
// constructed in a component or `useFrame`. Sizing matches the `<Root>` body so
// the rails frame it. Top + bottom rails span the full width; four corner tabs
// turn the rails into brackets. 6 boxes × 12 tris = 72 tris — a rounding error
// against the ≤8k bench-triangle budget (§7.2).

const PANEL_W = 1.6; // matches Root sizeX (the TodayPanel skin)
const PANEL_H = 1.1; // matches Root sizeY
const RAIL_T = 0.028; // rail cross-section (the brass bar thickness)
const RAIL_Z = 0.02; // rail depth in z
const TAB_LEN = 0.16; // corner-tab length (the vertical bracket)
const FRAME_Z = -0.008; // seat the rails a hair behind the Root plane (no z-fight)

function buildFrameGeometry(): THREE.BufferGeometry {
  const halfW = PANEL_W / 2;
  const halfH = PANEL_H / 2;
  const parts: THREE.BufferGeometry[] = [];

  const topRail = new THREE.BoxGeometry(PANEL_W, RAIL_T, RAIL_Z);
  topRail.translate(0, halfH, 0);
  const botRail = new THREE.BoxGeometry(PANEL_W, RAIL_T, RAIL_Z);
  botRail.translate(0, -halfH, 0);
  parts.push(topRail, botRail);

  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const tab = new THREE.BoxGeometry(RAIL_T, TAB_LEN, RAIL_Z);
      tab.translate(sx * halfW, sy * (halfH - TAB_LEN / 2), 0);
      parts.push(tab);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (merged === null) {
    // mergeGeometries returns null only on an attribute mismatch — impossible
    // for uniform BoxGeometry; the guard keeps the type non-null for the mesh.
    throw new Error("[WorldPanel] frame geometry merge failed");
  }
  merged.computeBoundingSphere();
  return merged;
}

const FRAME_GEOMETRY: THREE.BufferGeometry = buildFrameGeometry();

// ── The TWO frame materials (idle / focused) — module singletons ─────────────
//
// Same tint + rim color; only the rim HDR intensity differs. `frameIdle` reads
// as a quiet brass rail; `frameFocused` lifts the fresnel rim past the Bloom
// threshold so a focused panel's frame BLOOMS. Both are produced by
// `makeHologramMaterial`, which pins `customProgramCacheKey` to "studiolo:sf@1"
// — so three compiles the fresnel program ONCE and swapping idle↔focused reuses
// it (no recompile, no per-frame uniform write). Intensities are aesthetic and
// tunable; only the ordering (focused > idle > "blooms") is load-bearing.

const FRAME_RIM_IDLE = 1.5;
const FRAME_RIM_FOCUSED = 4.5;
const FRAME_OPACITY = 0.2; // a touch more body than a lantern; still holographic

const frameIdle = makeHologramMaterial({
  tint: STUDIOLO.brass,
  rimColor: STUDIOLO.candleflame,
  opacity: FRAME_OPACITY,
  rimIntensity: FRAME_RIM_IDLE,
});
const frameFocused = makeHologramMaterial({
  tint: STUDIOLO.brass,
  rimColor: STUDIOLO.candleflame,
  opacity: FRAME_OPACITY,
  rimIntensity: FRAME_RIM_FOCUSED,
});

// ── Placard SDF title ────────────────────────────────────────────────────────
const PLACARD_FONT = 0.14; // world metres; fits the 1.6 m-wide placard
const SDF_GLYPH_SIZE = 64; // §7.2 SDF ceiling
const PLACARD_Z = 0.02; // float the title just in front of the frame plane

export function WorldPanel(props: WorldPanelProps): JSX.Element {
  const {
    widgetId,
    title,
    countChip,
    status = "ready",
    emptyLine,
    disconnectedLine,
    focused,
    lod,
    slot,
    dragHandleProps,
    children,
  } = props;

  // Interaction cadence only — chosen at render from the `focused` prop.
  const frameMaterial = focused ? frameFocused : frameIdle;

  // Clicking a placard SUMMONS its widget (flies to reading pose). Clicking a
  // full panel's frame merely swallows the event so it doesn't fall through to
  // world picking behind the panel.
  const summon: PanelClick = (e) => {
    e.stopPropagation();
    // The widget FocusLevel (`{kind:"widget"; widgetId}`) is W-01's focusStack
    // amendment (PLAN §3.2), landed on-branch. The rig's focus→pose effect
    // (W-06) flies the camera to `slot.cameraPose` in response.
    focusStack.push({ kind: "widget", widgetId });
  };
  const swallow: PanelClick = (e) => {
    e.stopPropagation();
  };

  return (
    <group
      position={slot.position}
      rotation={slot.rotation}
      name={`world-panel-${widgetId}`}
    >
      {/* The brass-rail frame: ONE shared-geometry mesh, one of TWO material
          singletons chosen by `focused`. Drag handlers (W-07) spread onto it —
          you grab the rail to move the panel. */}
      <mesh
        geometry={FRAME_GEOMETRY}
        material={frameMaterial}
        position={[0, 0, FRAME_Z]}
        {...dragHandleProps}
        onClick={lod === "placard" ? summon : swallow}
      />

      {lod === "placard" ? (
        // Placard LOD: frame + ONE SDF title, nothing else (the §7.2 answer).
        <SdfText
          position={[0, 0, PLACARD_Z]}
          font={EB_GARAMOND_REGULAR}
          fontSize={PLACARD_FONT}
          color={STUDIOLO.parchment}
          anchorX="center"
          anchorY="middle"
          maxWidth={PANEL_W - 0.24}
          textAlign="center"
          sdfGlyphSize={SDF_GLYPH_SIZE}
          fillOpacity={0.92}
          outlineWidth={0.006}
          outlineColor={STUDIOLO.deepVellum}
          outlineOpacity={0.6}
          onClick={summon}
        >
          {title}
        </SdfText>
      ) : (
        // Full LOD: the TodayPanel skin verbatim — deep-vellum translucent slab,
        // brass border, header row + brass rule + a content region.
        <Root
          sizeX={PANEL_W}
          sizeY={PANEL_H}
          flexDirection="column"
          padding={24}
          gap={10}
          borderRadius={16}
          backgroundColor={STUDIOLO.deepVellum}
          // uikit exposes a single per-element `opacity` (no separate
          // background/border opacity in the typed API), so the whole slab reads
          // translucent — exactly the holographic intent (TodayPanel comment).
          opacity={0.7}
          borderWidth={1}
          borderColor={STUDIOLO.brass}
          // Swallow body clicks so they don't fall through to world picking.
          onClick={swallow as PanelClick}
        >
          {/* Header — a serif-weight caption + optional brass count chip. */}
          <Container
            flexDirection="row"
            alignItems="flex-end"
            justifyContent="space-between"
          >
            <Text fontSize={16} fontWeight="bold" color={STUDIOLO.parchment}>
              {title}
            </Text>
            {countChip !== undefined ? (
              <Text
                fontSize={10}
                letterSpacing={1}
                color={STUDIOLO.brass}
                opacity={0.85}
              >
                {countChip}
              </Text>
            ) : null}
          </Container>
          <Container height={1} backgroundColor={STUDIOLO.brass} opacity={0.3} />

          {status === "disconnected" ? (
            // Honest darkness (§2.8): one engraved nudge back to the Page — the
            // world never OAuths. Never a blank slab.
            <Container
              flexGrow={1}
              justifyContent="center"
              alignItems="flex-start"
            >
              <Text fontSize={13} color={STUDIOLO.parchment} opacity={0.68}>
                {disconnectedLine ?? "This panel is dark."}
              </Text>
            </Container>
          ) : status === "empty" ? (
            // Quiet aside (§2.8). uikit has no italic on the default font, so —
            // as in TodayPanel — a dimmed weight carries the journal-italic feel.
            <Container
              flexGrow={1}
              justifyContent="center"
              alignItems="flex-start"
            >
              <Text fontSize={13} color={STUDIOLO.parchment} opacity={0.6}>
                {emptyLine ?? "Nothing here yet."}
              </Text>
            </Container>
          ) : (
            // The scrollable content region — widgets fill this (rows capped at
            // PANEL_ROW_CAP with an "and N more" footer, per widget).
            <Container
              overflow="scroll"
              flexGrow={1}
              flexDirection="column"
              gap={2}
            >
              {children}
            </Container>
          )}
        </Root>
      )}
    </group>
  );
}

export default WorldPanel;
