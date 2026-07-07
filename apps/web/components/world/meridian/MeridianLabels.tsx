"use client";

/**
 * MeridianLabels.tsx — M-11 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The engraved VOICE of the instrument. Four kinds of SDF `<Text>` (troika),
 * mounted BESIDE `WorldLabels` (the Conductor mounts this at the Wave-M3 close);
 * this unit NEVER touches `MeridianRing` (M-05) or `EventTablets` (M-06).
 *
 *   1. EIGHT HOUR NUMERALS — every 3h on the 24-hour dial, old-style Garamond
 *      figures in Sepia Ink, slightly inset toward the engraved inner strip.
 *      Because this component mounts separately from `MeridianRing`, it
 *      REPLICATES the dial transform itself: the same canted outer frame
 *      (`[0, height, 0]`, `rotation.x = −cantRad`) and a dial group whose
 *      `rotation.y = ringRotationFor(Date.now(), meridianBus.getScrubOffsetMs(),
 *      tz)` — read fresh on every DEMANDED frame with the exact `lastRot`
 *      early-return guard M-05 uses, and NEVER calling `invalidate()`. So the
 *      numerals stay glued to the ticks with ZERO frame demand of their own
 *      (the world's minute clock is the only idle demand, exactly as the ring).
 *      They are `visible` only when `focus.kind === "ring"` OR the camera is
 *      pitched > ~35° up — culled via `visible` in `useFrame`, NEVER unmounted.
 *
 *   2. ONE DATE LINE — italic ("the instrument annotating itself"), fixed under
 *      the zenith pointer (in the canted frame, not the turning dial),
 *      recomposed from the SCRUB CENTER via `meridianBus.subscribe` and throttled
 *      to day-change (the troika `text` is mutated directly — never React state).
 *
 *   3. ONE ZENITH CAPTION — the current/imminent tablet (title · clock), fixed
 *      beneath the date line; recomputed on the same coarse cadence. M-12 REUSES
 *      this exact slot (no new <Text>) for the disconnected/expired nudge — "The
 *      ring is dark. (Re)connect Google Calendar on the Page." — when
 *      `meridian.status !== "connected"`.
 *
 *   4. ONE HOVER CAPTION — a camera-anchored HUD singleton driven by
 *      `tabletHoverBus` (M-06 publishes the hovered eventId; this unit renders
 *      the caption): title · time range · a small calendar-color dot, plus a
 *      "×N" badge when the hovered tablet is a merged stack. Cross-fades on hover
 *      change via a maath `easing.damp` that self-suspends once settled (the
 *      WorldLabels discipline).
 *
 * PERF (§4.2/§4.3): ≤11 live `<Text>` (8 numerals + date + zenith + hover);
 * `sdfGlyphSize ≤ 64`; numerals focus/pitch-culled; glyphs preloaded (the M-11
 * glyph audit in `text/fonts.ts` confirms digits + old-style figures + the "×"
 * badge). The dial re-pose and the caption refresh ride already-demanded frames;
 * only the transient hover cross-fade demands frames, and it self-suspends.
 */

import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import { TZDate } from "@date-fns/tz";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { easing } from "maath";

import { useWorldData } from "../data/useWorldData";
import { useFocusStack } from "../camera/useFocusStack";
import { meridianBus } from "./meridianBus";
import { tabletHoverBus } from "./meridianHover";
import {
  MERIDIAN_CONFIG_DEFAULTS,
  ringRotationFor,
  solveMeridianLayout,
  classifyTablet,
  resolveOverlaps,
  TWO_PI,
  type TabletSlot,
} from "./meridianLayout";
import { calendarDotColor } from "./meridianMappings";
import { RING_RADIUS } from "./meridianGeometries";
import { STUDIOLO } from "../materials/tokens";
import {
  EB_GARAMOND_ITALIC,
  EB_GARAMOND_REGULAR,
  preloadWorldFonts,
} from "../text/fonts";

// ── Numeral placement (engraved on the inner face, riding the dial) ──────────
// Every 3 hours on the 24-hour dial; midnight reads "24", noon "12". Each mark's
// dial angle mirrors M-05's tick math: angle = (h/24)·2π, position
// [r·sin a, 0, r·cos a] (dial-angle 0 → +z zenith), facing INWARD (rotation.y =
// a + π) so it reads from inside the ring — identical to the engraved strip.
const HOUR_MARKS = [3, 6, 9, 12, 15, 18, 21, 24] as const;
const NUMERAL_RADIUS = RING_RADIUS - 0.13; // a hair inside the strip
const NUMERAL_FONT = 0.34; // fits inside the 0.5 m band face
const NUMERAL_OPACITY = 0.9;

// ── Zenith annotations (fixed frame, under the pointer) ─────────────────────
const ZENITH_TEXT_RADIUS = RING_RADIUS - 0.45; // inside the numerals, toward the dais
const DATE_FONT = 0.4;
const ZENITH_CAPTION_FONT = 0.3;
const ZENITH_OPACITY = 0.85;

// ── Hover HUD (camera-anchored, like the Ledger) ────────────────────────────
const HOVER_LOCAL: [number, number, number] = [-0.62, 0.44, -1.6]; // upper-left of frame
const HOVER_FONT = 0.045;
const HOVER_OPACITY = 0.82;
const HOVER_DOT_LOCAL: [number, number, number] = [-0.7, 0.44, -1.6];
const HOVER_DOT_RADIUS = 0.012;
const FADE_SMOOTH = 0.12; // ~120 ms cross-fade (WorldLabels convention)

const SDF_GLYPH_SIZE = 64; // §4.3 ceiling
// Camera pitch cull: forward.y > sin(35°) ⇒ looking up past ~35°.
const SIN_PITCH_THRESHOLD = Math.sin((35 * Math.PI) / 180);
// Only re-derive the coarse date/zenith text from useFrame when the center has
// drifted this far (real time creeps a minute/frame idle; scrub is handled by
// the bus subscription). Keeps per-frame TZDate allocation off the hot path.
const REFRESH_DRIFT_MS = 20_000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** English ordinal for a day-of-month (1st, 2nd, 3rd, 4th, … 21st, …). */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Monday, July 6th" — the italic date line, tz-correct via TZDate. */
function formatDateLine(ms: number, tz: string): string {
  const d = new TZDate(ms, tz);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`;
}

/** Stable tz-local civil-day key so the date line only recomposes on day change. */
function civilDayKey(ms: number, tz: string): string {
  const d = new TZDate(ms, tz);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function clock12(ms: number, tz: string): { h: number; m: number; ap: string } {
  const d = new TZDate(ms, tz);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h, m: d.getMinutes(), ap: h24 < 12 ? "AM" : "PM" };
}

/** A short clock stamp: "2:00 PM". */
function formatClockShort(ms: number, tz: string): string {
  const { h, m, ap } = clock12(ms, tz);
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

/** A time range for the hover caption: "2:00–3:00 PM", or "All day". */
function formatClockRange(slot: TabletSlot, tz: string): string {
  if (slot.allDay) return "All day";
  const s = clock12(slot.startMs, tz);
  const e = clock12(slot.endMs, tz);
  const sStr = `${s.h}:${String(s.m).padStart(2, "0")}`;
  const eStr = `${e.h}:${String(e.m).padStart(2, "0")}`;
  // Meridiem once when it doesn't change across the range (the common case).
  if (s.ap === e.ap) return `${sStr}\u2013${eStr} ${e.ap}`;
  return `${sStr} ${s.ap}\u2013${eStr} ${e.ap}`;
}

/**
 * The mutable troika-`<Text>` surface. drei's `<Text>` ref is the troika Text
 * instance (typed `any` in drei); we only ever read/write these fields.
 */
interface TroikaText {
  text: string;
  fillOpacity: number;
  outlineOpacity: number;
  visible: boolean;
  sync(cb?: () => void): void;
}

/** Mutate a troika text only when it changed, re-syncing + demanding one frame. */
function setTroikaText(
  t: TroikaText | null,
  next: string,
  invalidate: () => void,
): void {
  if (t === null || t.text === next) return;
  t.text = next;
  t.sync(() => invalidate());
}

// Module scratch — no per-frame allocation.
const _camDir = new THREE.Vector3();

export function MeridianLabels(): JSX.Element {
  const { meridian } = useWorldData();
  const { current: focus } = useFocusStack();
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const cfg = MERIDIAN_CONFIG_DEFAULTS;
  const tz = meridian.timezone;

  // Warm the SDF atlas once (idempotent — troika caches by font+glyphs).
  useEffect(() => {
    preloadWorldFonts();
  }, []);

  // Slots for caption lookup (title / start / end / calendar). Tree is empty —
  // labels never need the area link (that is the glass tint's job, M-06/M-02);
  // we only read the plain time/title fields off each slot.
  const { slots, byEvent } = useMemo(
    () => solveMeridianLayout(meridian.events, [], meridian.calendars, tz),
    [meridian.events, meridian.calendars, tz],
  );

  // eventId → merged-stack count (>1), for the "×N" badge. From the pure
  // overlap resolver: the representative slot (earliest start) carries the count
  // and is the id M-06 publishes for the merged instance.
  const mergedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of resolveOverlaps(slots)) {
      if (p.mergedCount > 1) m.set(p.slot.eventId, p.mergedCount);
    }
    return m;
  }, [slots]);

  // ── Refs read by the frame loop / bus callbacks (never per-frame React state) ─
  const numeralsRef = useRef<THREE.Group>(null); // the dial group (rotates + culls)
  const lastRot = useRef(Number.NaN);
  const focusKindRef = useRef<string>(focus.kind);
  focusKindRef.current = focus.kind;

  // M-12: mirror the connection status into a ref so the coarse `refresh` (which
  // runs off the scrub bus / drift, not React deps) reads the live value. The
  // `meridian`-keyed effect below re-runs `refresh` when status flips, so the
  // nudge appears/clears within the shared connection-status poll (≤60 s).
  const statusRef = useRef(meridian.status);
  statusRef.current = meridian.status;

  const slotsRef = useRef<TabletSlot[]>(slots);
  slotsRef.current = slots;
  const byEventRef = useRef(byEvent);
  byEventRef.current = byEvent;
  const mergedRef = useRef(mergedCount);
  mergedRef.current = mergedCount;
  const calendarsRef = useRef(meridian.calendars);
  calendarsRef.current = meridian.calendars;
  const tzRef = useRef(tz);
  tzRef.current = tz;

  const dateRef = useRef<TroikaText | null>(null);
  const zenithRef = useRef<TroikaText | null>(null);
  const lastDateKey = useRef<string>("");
  const lastZenithText = useRef<string>("");
  const lastRefreshCenter = useRef<number>(Number.NEGATIVE_INFINITY);

  // Hover HUD surfaces.
  const hoverGroupRef = useRef<THREE.Group>(null);
  const hoverTextRef = useRef<TroikaText | null>(null);
  const hoverDotRef = useRef<THREE.Mesh>(null);
  const hoverDotMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hoverTarget = useRef(0); // 1 while a tablet is hovered, else 0

  // ── Coarse refresh: date line + zenith caption from a scrub center ──────────
  const refresh = useCallback(
    (centerMs: number) => {
      const zone = tzRef.current;

      const key = civilDayKey(centerMs, zone);
      if (key !== lastDateKey.current) {
        lastDateKey.current = key;
        setTroikaText(dateRef.current, formatDateLine(centerMs, zone), invalidate);
      }

      // M-12 honesty: over a disconnected/expired sky the ring is dark and
      // wordless of events — REUSE this zenith caption slot (no new <Text>) for
      // the single engraved nudge pointing back to the Page. "Connect" when
      // never linked, "Reconnect" when the grant lapsed (expired/revoked). The
      // world never initiates OAuth; `Cmd+\` to the Page stays the only path.
      const status = statusRef.current;
      if (status !== "connected") {
        const verb = status === "not_connected" ? "Connect" : "Reconnect";
        const nudge = `The ring is dark. ${verb} Google Calendar on the Page.`;
        if (nudge !== lastZenithText.current) {
          lastZenithText.current = nudge;
          setTroikaText(zenithRef.current, nudge, invalidate);
        }
        return;
      }

      // The current tablet (start ≤ center < end) wins the zenith; else the
      // soonest imminent one. `centerMs` acts as "now" so the caption tracks the
      // scrub, not just wall-clock.
      let current: TabletSlot | null = null;
      let imminent: TabletSlot | null = null;
      for (const s of slotsRef.current) {
        if (s.allDay) continue;
        const state = classifyTablet(s, centerMs);
        if (state === "current") {
          if (current === null || s.startMs > current.startMs) current = s;
        } else if (state === "imminent") {
          if (imminent === null || s.startMs < imminent.startMs) imminent = s;
        }
      }
      const chosen = current ?? imminent;
      let text = "";
      if (chosen !== null) {
        const title = chosen.title.trim() || "An event";
        text =
          chosen === current
            ? `${title} \u00B7 now`
            : `${title} \u00B7 ${formatClockShort(chosen.startMs, zone)}`;
      }
      if (text !== lastZenithText.current) {
        lastZenithText.current = text;
        setTroikaText(zenithRef.current, text, invalidate);
      }
    },
    [invalidate],
  );

  // ── Hover caption from tabletHoverBus (M-06 publishes, M-11 renders) ────────
  const updateHover = useCallback(
    (eventId: string | null) => {
      if (eventId === null) {
        hoverTarget.current = 0;
        invalidate();
        return;
      }
      const slot = byEventRef.current.get(eventId);
      if (slot === undefined) {
        hoverTarget.current = 0;
        invalidate();
        return;
      }
      const zone = tzRef.current;
      const title = slot.title.trim() || "An event";
      let cap = `${title}  \u00B7  ${formatClockRange(slot, zone)}`;
      const n = mergedRef.current.get(eventId);
      if (n !== undefined && n > 1) cap += `  \u00D7${n}`;
      setTroikaText(hoverTextRef.current, cap, invalidate);
      const mat = hoverDotMatRef.current;
      if (mat) mat.color.set(calendarDotColor(slot.calendarId, calendarsRef.current));
      hoverTarget.current = HOVER_OPACITY;
      invalidate();
    },
    [invalidate],
  );

  // Seed the date/zenith text and subscribe to the scrub bus for day flips.
  useEffect(() => {
    lastDateKey.current = ""; // force a recompose after remount / tz change
    lastZenithText.current = "";
    refresh(Date.now() + meridianBus.getScrubOffsetMs());
    const unsub = meridianBus.subscribe((offset) => {
      refresh(Date.now() + offset);
    });
    return unsub;
  }, [refresh]);

  // A new events snapshot can change the current/imminent tablet; recompose.
  useEffect(() => {
    refresh(Date.now() + meridianBus.getScrubOffsetMs());
    invalidate();
  }, [meridian, refresh, invalidate]);

  // Subscribe to hover changes; wire the current hover through on mount.
  useEffect(() => {
    updateHover(tabletHoverBus.get());
    return tabletHoverBus.subscribe(updateHover);
  }, [updateHover]);

  // Kick a frame when focus flips so the numeral cull applies immediately.
  useEffect(() => {
    invalidate();
  }, [focus, invalidate]);

  useFrame((_, delta) => {
    // 1. Ride the dial (same pure rotation as M-05; never demands a frame).
    const dial = numeralsRef.current;
    if (dial !== null) {
      const rot = ringRotationFor(Date.now(), meridianBus.getScrubOffsetMs(), tz);
      if (rot !== lastRot.current) {
        dial.rotation.y = rot;
        lastRot.current = rot;
      }
      // Numeral cull (never unmount): ring focus, or camera pitched up > ~35°.
      camera.getWorldDirection(_camDir);
      dial.visible =
        focusKindRef.current === "ring" || _camDir.y > SIN_PITCH_THRESHOLD;
    }

    // 2. Coarse date/zenith refresh — only when the center has drifted (real
    // time creeps; scrub is handled by the bus subscription above).
    const center = Date.now() + meridianBus.getScrubOffsetMs();
    if (Math.abs(center - lastRefreshCenter.current) > REFRESH_DRIFT_MS) {
      lastRefreshCenter.current = center;
      refresh(center);
    }

    // 3. Hover HUD: follow the camera + cross-fade (self-suspends once settled).
    const hg = hoverGroupRef.current;
    if (hg !== null) {
      hg.position.copy(camera.position);
      hg.quaternion.copy(camera.quaternion);
    }
    const ht = hoverTextRef.current;
    if (ht !== null) {
      const moving = easing.damp(ht, "fillOpacity", hoverTarget.current, FADE_SMOOTH, delta);
      ht.outlineOpacity = ht.fillOpacity;
      ht.visible = ht.fillOpacity > 0.01;
      const dot = hoverDotRef.current;
      if (dot !== null) dot.visible = ht.fillOpacity > 0.01;
      if (hoverDotMatRef.current !== null) {
        hoverDotMatRef.current.opacity = ht.fillOpacity;
      }
      if (moving) invalidate();
    }
  });

  return (
    <>
      {/* Numerals + zenith annotations share the ring's canted frame. */}
      <group
        name="meridian-labels"
        position={[0, cfg.height, 0]}
        rotation={[-cfg.cantRad, 0, 0]}
      >
        {/* The dial group — turns with real time, culled via `visible`. */}
        <group ref={numeralsRef} name="meridian-numerals">
          {HOUR_MARKS.map((h) => {
            const a = ((h % 24) / 24) * TWO_PI;
            return (
              <Text
                key={h}
                position={[
                  NUMERAL_RADIUS * Math.sin(a),
                  0,
                  NUMERAL_RADIUS * Math.cos(a),
                ]}
                rotation={[0, a + Math.PI, 0]}
                font={EB_GARAMOND_REGULAR}
                fontSize={NUMERAL_FONT}
                color={STUDIOLO.sepiaInk}
                anchorX="center"
                anchorY="middle"
                sdfGlyphSize={SDF_GLYPH_SIZE}
                fillOpacity={NUMERAL_OPACITY}
                outlineWidth={0.012}
                outlineColor={STUDIOLO.nightwalnut}
                outlineOpacity={0.4}
              >
                {String(h)}
              </Text>
            );
          })}
        </group>

        {/* Date line (italic) + zenith caption — fixed under the pointer. */}
        <Text
          ref={(o: TroikaText | null) => {
            dateRef.current = o;
          }}
          position={[0, 0.04, ZENITH_TEXT_RADIUS]}
          rotation={[0, Math.PI, 0]}
          font={EB_GARAMOND_ITALIC}
          fontSize={DATE_FONT}
          color={STUDIOLO.parchment}
          anchorX="center"
          anchorY="middle"
          maxWidth={5}
          textAlign="center"
          letterSpacing={0.01}
          sdfGlyphSize={SDF_GLYPH_SIZE}
          fillOpacity={ZENITH_OPACITY}
          outlineWidth={0.008}
          outlineColor={STUDIOLO.deepVellum}
          outlineOpacity={ZENITH_OPACITY}
        >
          {formatDateLine(Date.now(), tz)}
        </Text>
        <Text
          ref={(o: TroikaText | null) => {
            zenithRef.current = o;
          }}
          position={[0, -0.42, ZENITH_TEXT_RADIUS]}
          rotation={[0, Math.PI, 0]}
          font={EB_GARAMOND_REGULAR}
          fontSize={ZENITH_CAPTION_FONT}
          color={STUDIOLO.candleflame}
          anchorX="center"
          anchorY="middle"
          maxWidth={5}
          textAlign="center"
          sdfGlyphSize={SDF_GLYPH_SIZE}
          fillOpacity={ZENITH_OPACITY}
          outlineWidth={0.006}
          outlineColor={STUDIOLO.deepVellum}
          outlineOpacity={ZENITH_OPACITY}
        >
          {""}
        </Text>
      </group>

      {/* Hover caption — a camera-anchored HUD (mirrors the Ledger). */}
      <group ref={hoverGroupRef} name="meridian-hover-caption">
        <mesh
          ref={hoverDotRef}
          position={HOVER_DOT_LOCAL}
          renderOrder={999}
          visible={false}
        >
          <circleGeometry args={[HOVER_DOT_RADIUS, 16]} />
          <meshBasicMaterial
            ref={(m: THREE.MeshBasicMaterial | null) => {
              hoverDotMatRef.current = m;
            }}
            color="#4285F4"
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <Text
          ref={(o: TroikaText | null) => {
            if (o !== null && hoverTextRef.current === null) {
              o.fillOpacity = 0;
              o.outlineOpacity = 0;
              o.visible = false;
            }
            hoverTextRef.current = o;
          }}
          position={HOVER_LOCAL}
          font={EB_GARAMOND_REGULAR}
          fontSize={HOVER_FONT}
          color={STUDIOLO.parchment}
          anchorX="left"
          anchorY="middle"
          maxWidth={1.3}
          sdfGlyphSize={SDF_GLYPH_SIZE}
          fillOpacity={0}
          outlineWidth={0.003}
          outlineColor={STUDIOLO.deepVellum}
          outlineBlur={0.004}
          outlineOpacity={0}
          renderOrder={999}
          onSync={(troika) => {
            const mesh = troika as unknown as THREE.Mesh;
            const mat = mesh.material as THREE.Material | undefined;
            if (mat) {
              mat.depthTest = false;
              mat.depthWrite = false;
              mat.transparent = true;
            }
            mesh.renderOrder = 999;
          }}
        >
          {""}
        </Text>
      </group>
    </>
  );
}

export default MeridianLabels;
