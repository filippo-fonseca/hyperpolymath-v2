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
 * NOTE (Phase 2, M-11): the "next event" clause from the VISION strip lands via
 * Google Calendar events in WorldData's `calendar` slice (M-01, renamed from
 * `meridian` in Phase 3 W-01). `composeLedgerLine` appends a colloquial next-event
 * clause ("…Lecture at two.") when gcal is connected and an event still remains
 * today. The clause is composed by the PURE `composeNextEventClause`, so the
 * whole line stays a pure function of `(WorldData, nowMs)` and unit-testable.
 */

import { useEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import { TZDate } from "@date-fns/tz";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";

import { classifyTask } from "../data/mappings";
import {
  useWorldData,
  type CalendarData,
  type WorldData,
} from "../data/useWorldData";
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

// ── The next-event clause (M-11) ────────────────────────────────────────────
// The instrument's colloquial voice: "…Lecture at two." Old-style, spoken hours
// rather than a digital clock — the engraved register the ring speaks in.
// Twelve→"twelve", 14:00→"two", plus the classic past/to forms for the quarters
// and off-marks (":30" → "half past two", ":45" → "a quarter to three",
// ":10" → "ten past two", ":40" → "twenty to three"). All glyphs (a–z, hyphen,
// space) are already in `WORLD_GLYPH_SET`.

// Index by hour24 % 12: 0/12 → "twelve", 13 → "one", 14 → "two", …
const HOUR_WORDS = [
  "twelve",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
] as const;

const MINUTE_ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;
const MINUTE_TENS = ["", "", "twenty", "thirty", "forty", "fifty"] as const;

function hourWord(hour24: number): string {
  return HOUR_WORDS[((hour24 % 12) + 12) % 12]!;
}

/** Spell an integer minute 1–59 ("ten", "twenty-two", "forty-five"). */
function spellMinutes(n: number): string {
  if (n < 20) return MINUTE_ONES[n]!;
  const tens = MINUTE_TENS[Math.floor(n / 10)]!;
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${MINUTE_ONES[ones]!}`;
}

/**
 * A wall-clock instant → colloquial 12-hour phrase in the given IANA tz. Pure
 * (tz-correct via `TZDate`). Exported for the M-11 label unit + tests.
 */
export function colloquialTime(ms: number, tz: string): string {
  const d = new TZDate(ms, tz);
  const h = d.getHours();
  const m = d.getMinutes();
  if (m === 0) return hourWord(h);
  if (m === 15) return `a quarter past ${hourWord(h)}`;
  if (m === 30) return `half past ${hourWord(h)}`;
  if (m === 45) return `a quarter to ${hourWord(h + 1)}`;
  if (m < 30) return `${spellMinutes(m)} past ${hourWord(h)}`;
  return `${spellMinutes(60 - m)} to ${hourWord(h + 1)}`;
}

/** The tz-local civil day of `ms` as a stable `Y-M-D` comparison key. */
function civilDayKey(ms: number, tz: string): string {
  const d = new TZDate(ms, tz);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * The next-event clause, or `null` to omit it. PURE given `(calendar, nowMs)`.
 *
 * Omitted when gcal is not connected (`status !== "connected"`) or no timed
 * event remains today (the tz-local civil day of `nowMs`). All-day events carry
 * no colloquial hour, so they never source the clause. Picks the EARLIEST timed
 * event whose start is strictly after `nowMs` and falls on today.
 */
export function composeNextEventClause(
  calendar: CalendarData,
  nowMs: number,
): string | null {
  if (calendar.status !== "connected") return null;
  const tz = calendar.timezone;
  const todayKey = civilDayKey(nowMs, tz);

  let best: { startMs: number; title: string } | null = null;
  for (const ev of calendar.events) {
    if (ev.allDay) continue;
    const startMs = new Date(ev.start).getTime();
    if (Number.isNaN(startMs) || startMs <= nowMs) continue;
    if (civilDayKey(startMs, tz) !== todayKey) continue;
    if (best === null || startMs < best.startMs) {
      best = { startMs, title: ev.title };
    }
  }
  if (best === null) return null;

  const title = best.title.trim() || "An event";
  return `${title} at ${colloquialTime(best.startMs, tz)}.`;
}

/**
 * Compose the ledger line from the live world data. Pure given `(d, nowMs)` +
 * cheap (O(#tasks + #events)); called through `useMemo` on data identity, so it
 * runs at Realtime cadence, not per frame. Overdue is shown only when present
 * (an empty desk stays calm). The next-event clause (M-11) appends when gcal is
 * connected and an event still remains today — "3 unfiled · Lecture at two."
 */
export function composeLedgerLine(d: WorldData, nowMs: number = Date.now()): string {
  let dueToday = 0;
  let overdue = 0;
  for (const t of d.tasks) {
    const s = classifyTask(t, d.todayYmd);
    if (s === "today") dueToday++;
    else if (s === "overdue") overdue++;
  }
  const unfiled = d.captures.length;

  let base: string;
  if (dueToday === 0 && overdue === 0 && unfiled === 0) {
    base = "The desk is clear.";
  } else {
    const parts: string[] = [`${dueToday} due today`];
    if (overdue > 0) parts.push(`${overdue} overdue`);
    parts.push(`${unfiled} unfiled`);
    base = parts.join(LEDGER_SEPARATOR);
  }

  const clause = composeNextEventClause(d.calendar, nowMs);
  return clause === null ? base : `${base}${LEDGER_SEPARATOR}${clause}`;
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
