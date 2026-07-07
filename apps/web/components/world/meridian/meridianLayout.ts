/**
 * meridianLayout.ts — M-02 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * All dial math and event→visual mapping as PURE functions, testable without
 * WebGL. This is the meridian sibling of `data/treeLayout.ts` and its discipline
 * is identical: ZERO runtime imports from `three` (only `import type`-free,
 * angle-and-number math), deterministic given its inputs, memoizable by the
 * provider on data identity.
 *
 * This file is the frozen §2.3 "meridian layout contract" — `MeridianConfig`,
 * `TabletSlot`, `TabletState`, `timeToAngle`, `ringRotationFor`,
 * `solveMeridianLayout`, `visibleSlots`, `classifyTablet`, `linkEventToProject`.
 * Wave-M2 units (M-05 ring rotation, M-06 tablets, M-08 poses, M-11 labels)
 * import these symbols; they freeze at Wave M1 close.
 *
 * THE DIAL MODEL (frozen semantics): the ring is a 24-hour dial; *now* sits at
 * zenith. An instant's dial angle is its WALL-CLOCK time-of-day in the user's
 * IANA timezone (0 = midnight, π = noon, 2π = next midnight) — computed via
 * `TZDate` so a DST-transition day (a 23h or 25h day) never misplaces an
 * afternoon event: 2pm is 14/24 of the dial whether or not the morning was
 * short. Scrubbing advances `scrubOffsetMs`, rolling a ~28h display window
 * (zenith ±14h) across the loaded slab; the dial orientation is a pure function
 * of `now + scrubOffset`, so days "flicker past" (same orientation, different
 * tablets) as the window rolls.
 */
import { TZDate } from "@date-fns/tz";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { resolveTabletTint } from "./meridianMappings";

// ── Frozen constants (exported for tests + consumers) ──────────────────────
export const TWO_PI = Math.PI * 2;
export const SECONDS_PER_DAY = 86_400;
export const MS_PER_DAY = 86_400_000;
/** Minimum tablet arc so a 5-minute standup is still touchable: 20 min of dial. */
export const MIN_TABLET_SPAN_RAD = ((20 * 60) / SECONDS_PER_DAY) * TWO_PI;
/** The rolling display window is zenith ±14h (~28h total). */
export const WINDOW_HALF_MS = 14 * 60 * 60 * 1000;
/** T-15: imminent threshold. */
export const IMMINENT_MS = 15 * 60 * 1000;
/** All-day bands visible at once are capped so the outer lip stays legible. */
export const ALLDAY_VISIBLE_CAP = 3;
/** Overlap fans out across at most this many radial lanes before merging. */
export const MAX_OVERLAP_LANES = 2;
/**
 * The world-space dial angle "now" is rotated to. The dial group's y-rotation
 * is `ZENITH_ANGLE − timeToAngle(now+scrub)`, so a tablet placed at its
 * `angleStart` lands at zenith exactly when it is "now". M-05 maps dial-angle 0
 * to the top of the ring, so the zenith angle is 0 by convention.
 */
export const ZENITH_ANGLE = 0;

// ── §2.3 frozen contract types ─────────────────────────────────────────────
export interface MeridianConfig {
  radius: number; // default 9 (m)
  height: number; // ring center y, default 8.5
  cantRad: number; // ecliptic tilt, default 28° in radians
  tabletCap: number; // 128
}

export interface TabletSlot {
  eventId: string;
  calendarId: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  angleStart: number; // radians on the 24h dial (0 = midnight, π = noon)
  angleSpan: number; // duration → arc length; min span clamp for visibility
  dayOffset: number; // integer days from "today" in user tz (…-1, 0, 1…)
  linkedAreaId: string | null; // via linkEventToProject (M-02 heuristic)
  linkedProjectId: string | null;
  colorHex: string; // resolved tint: area OKLCH → parchment (never calendar bg)
}

export type TabletState = "past" | "upcoming" | "imminent" | "current";

export const MERIDIAN_CONFIG_DEFAULTS: MeridianConfig = {
  radius: 9,
  height: 8.5,
  cantRad: (28 * Math.PI) / 180,
  tabletCap: 128,
};

// ── Small pure helpers ──────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Wall-clock seconds-into-day in `tz`, DST-correct (via TZDate getters). */
function secondsIntoDay(ms: number, tz: string): number {
  const d = new TZDate(ms, tz);
  return (
    d.getHours() * 3600 +
    d.getMinutes() * 60 +
    d.getSeconds() +
    d.getMilliseconds() / 1000
  );
}

/** The tz-local civil day of `ms`, as a UTC-noon anchor for stable day diffs. */
function civilDayAnchor(ms: number, tz: string): number {
  const d = new TZDate(ms, tz);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse a `YYYY-MM-DD` all-day boundary to its tz start-of-day epoch ms. */
function allDayStartMs(ymd: string, tz: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new TZDate(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0, tz).getTime();
}

// ── timeToAngle / ringRotationFor (§2.3) ────────────────────────────────────
/**
 * Seconds-into-day → dial angle. 0 = midnight, π = noon, approaches 2π at the
 * next midnight. DST-correct: computed from the wall-clock time-of-day in `tz`,
 * NOT from elapsed ms since local midnight — so on a 23h spring-forward day a
 * 2pm event still sits at 14/24 of the dial.
 */
export function timeToAngle(ms: number, tz: string): number {
  return (secondsIntoDay(ms, tz) / SECONDS_PER_DAY) * TWO_PI;
}

/**
 * The dial group's y-rotation such that `now + scrubOffset` sits at zenith.
 * `−timeToAngle(now + scrubOffset) + ZENITH_ANGLE` (§2.3 dial model). Scrubbing
 * advances `scrubOffsetMs`; the camera and tablets do not move — the window
 * rolls and the dial re-orients.
 */
export function ringRotationFor(
  nowMs: number,
  scrubOffsetMs: number,
  tz: string,
): number {
  return ZENITH_ANGLE - timeToAngle(nowMs + scrubOffsetMs, tz);
}

// ── The link heuristic (§1.3 / §3, Q1) ──────────────────────────────────────
// Conservative, wrong-safe. Normalize (lowercase, strip punctuation) both the
// event title and each project name; match whole words; course-code style
// tokens (e.g. "CPSC 426") match exactly; `isClass` projects take precedence;
// ambiguous (≥2 equally-strong hits in the chosen tier) → null.

/** Lowercase, split on any non-alphanumeric, drop empties. */
function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

/**
 * Extract course-code tokens (e.g. "cpsc426") from a token list. Two shapes:
 *   (a) an alpha token (2–4 letters) immediately followed by a numeric token
 *       (2–4 digits) — "CPSC 426" → ["cpsc","426"] → "cpsc426";
 *   (b) a single fused token matching /^[a-z]{2,4}\d{2,4}$/ — "CPSC426".
 */
function courseCodes(tokens: string[]): Set<string> {
  const codes = new Set<string>();
  const isAlpha = (t: string) => /^[a-z]{2,4}$/.test(t);
  const isNum = (t: string) => /^\d{2,4}$/.test(t);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const fused = /^([a-z]{2,4})(\d{2,4})$/.exec(t);
    if (fused) {
      codes.add(`${fused[1]}${fused[2]}`);
      continue;
    }
    const next = tokens[i + 1];
    if (isAlpha(t) && next !== undefined && isNum(next)) {
      codes.add(`${t}${next}`);
    }
  }
  return codes;
}

/** Does the project's normalized name appear as a contiguous whole-word run? */
function nameAppears(projTokens: string[], titleTokens: string[]): boolean {
  const n = projTokens.length;
  if (n === 0) return false;
  for (let i = 0; i + n <= titleTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (titleTokens[i + j] !== projTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

interface LinkCandidate {
  areaId: string;
  projectId: string;
  isClass: boolean;
  strength: number; // 2 = course-code hit, 1 = name hit
}

/**
 * Conservative title→project linker. Returns the linked `{ areaId, projectId }`
 * or `null`. Class projects win over non-class; within the winning tier, a
 * course-code hit beats a name hit; if ≥2 candidates tie at the top strength of
 * the winning tier, the match is ambiguous → `null` (parchment). Wrong tint is
 * worse than no tint.
 */
export function linkEventToProject(
  title: string,
  tree: SidebarArea[],
): { areaId: string; projectId: string } | null {
  const titleTokens = normalizeTokens(title);
  if (titleTokens.length === 0) return null;
  const titleCodes = courseCodes(titleTokens);

  const candidates: LinkCandidate[] = [];
  for (const area of tree) {
    if (area.archivedAt !== null) continue;
    for (const p of area.projects) {
      if (p.archivedAt !== null) continue;
      const projTokens = normalizeTokens(p.name);
      if (projTokens.length === 0) continue;

      const projCodes = courseCodes(projTokens);
      let codeHit = false;
      for (const c of projCodes) {
        if (titleCodes.has(c)) {
          codeHit = true;
          break;
        }
      }

      const strength = codeHit
        ? 2
        : nameAppears(projTokens, titleTokens)
          ? 1
          : 0;
      if (strength > 0) {
        candidates.push({
          areaId: area.id,
          projectId: p.id,
          isClass: p.isClass,
          strength,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Class precedence: pick the class tier if any class matched, else non-class.
  const classHits = candidates.filter((c) => c.isClass);
  const tier = classHits.length > 0 ? classHits : candidates;

  // Within the tier, keep only the strongest hits (code beats name).
  const maxStrength = Math.max(...tier.map((c) => c.strength));
  const top = tier.filter((c) => c.strength === maxStrength);

  if (top.length !== 1) return null; // 0 impossible here; ≥2 → ambiguous
  const winner = top[0]!;
  return { areaId: winner.areaId, projectId: winner.projectId };
}

// ── The solver (§2.3) ────────────────────────────────────────────────────────
/**
 * Project live gcal events onto the dial. Pure except for reading the current
 * civil day (there is no `nowMs` parameter in the frozen signature, so "today"
 * for `dayOffset` is derived from `Date.now()` in the user's tz — tests pin it
 * with `vi.setSystemTime`). Duration → arc with the 20-min min-span clamp;
 * all-day events span the full dial (rendered as outer-lip bands by M-06).
 */
export function solveMeridianLayout(
  events: GcalEventDTO[],
  tree: SidebarArea[],
  _calendars: GcalCalendarMeta[],
  tz: string,
  cfg?: Partial<MeridianConfig>,
): { slots: TabletSlot[]; byEvent: Map<string, TabletSlot> } {
  void cfg; // config affects geometry (M-05/M-06), not the pure slot math
  const todayAnchor = civilDayAnchor(Date.now(), tz);

  const slots: TabletSlot[] = [];
  const byEvent = new Map<string, TabletSlot>();

  for (const ev of events) {
    const startMs = ev.allDay
      ? allDayStartMs(ev.start, tz)
      : new Date(ev.start).getTime();
    const endMs = ev.allDay
      ? allDayStartMs(ev.end, tz)
      : new Date(ev.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

    const link = linkEventToProject(ev.title, tree);

    let angleStart: number;
    let angleSpan: number;
    if (ev.allDay) {
      angleStart = 0;
      angleSpan = TWO_PI; // full-width lip band
    } else {
      angleStart = timeToAngle(startMs, tz);
      const durationSpan = (Math.max(0, endMs - startMs) / MS_PER_DAY) * TWO_PI;
      angleSpan = clamp(durationSpan, MIN_TABLET_SPAN_RAD, TWO_PI);
    }

    const dayAnchor = civilDayAnchor(startMs, tz);
    const dayOffset = Math.round((dayAnchor - todayAnchor) / MS_PER_DAY);

    const slot: TabletSlot = {
      eventId: ev.id,
      calendarId: ev.calendarId,
      title: ev.title,
      startMs,
      endMs,
      allDay: ev.allDay,
      angleStart,
      angleSpan,
      dayOffset,
      linkedAreaId: link?.areaId ?? null,
      linkedProjectId: link?.projectId ?? null,
      colorHex: resolveTabletTint(link),
    };
    slots.push(slot);
    byEvent.set(slot.eventId, slot);
  }

  return { slots, byEvent };
}

// ── visibleSlots (§2.3) ──────────────────────────────────────────────────────
/**
 * The rolling ~28h display window (zenith ±14h) around the scrub center. A
 * timed slot is visible iff its [startMs, endMs] overlaps the window. All-day
 * bands whose civil day overlaps the window are included but capped at
 * `ALLDAY_VISIBLE_CAP`, keeping the three nearest to center. Absolute-ms
 * overlap makes day-boundary roll correct with no special-casing.
 */
export function visibleSlots(
  slots: TabletSlot[],
  centerMs: number,
  tz: string,
): TabletSlot[] {
  void tz; // window math is absolute-ms; tz already baked into slot bounds
  const lo = centerMs - WINDOW_HALF_MS;
  const hi = centerMs + WINDOW_HALF_MS;

  const timed: TabletSlot[] = [];
  const allDay: TabletSlot[] = [];
  for (const s of slots) {
    const overlaps = s.startMs < hi && s.endMs > lo;
    if (!overlaps) continue;
    (s.allDay ? allDay : timed).push(s);
  }

  if (allDay.length > ALLDAY_VISIBLE_CAP) {
    allDay.sort(
      (a, b) =>
        Math.abs(a.startMs - centerMs) - Math.abs(b.startMs - centerMs) ||
        (a.eventId < b.eventId ? -1 : 1),
    );
    allDay.length = ALLDAY_VISIBLE_CAP;
  }

  return [...timed, ...allDay];
}

// ── classifyTablet (§2.3) ────────────────────────────────────────────────────
/**
 * State from the tablet's time relative to now. Boundaries (frozen):
 *   past     = end ≤ now
 *   current  = start ≤ now < end
 *   imminent = 0 < start − now ≤ 15 min
 *   upcoming = otherwise (further out than T-15)
 * Order matters: past before current before imminent so the exact boundary
 * ticks (T-15, start, end) land on the intended side.
 */
export function classifyTablet(slot: TabletSlot, nowMs: number): TabletState {
  if (slot.endMs <= nowMs) return "past";
  if (slot.startMs <= nowMs) return "current"; // end > now guaranteed above
  const untilStart = slot.startMs - nowMs; // > 0 here
  if (untilStart <= IMMINENT_MS) return "imminent";
  return "upcoming";
}

// ── Overlap resolution (additive to the frozen §2.3 core) ───────────────────
// The frozen `TabletSlot` carries no lane/merge field, so the "overlap → radial
// lane offset (≤2 lanes), 3+ concurrent → merge-with-count" behavior is exposed
// as a SEPARATE pure helper M-06 consumes when building instance matrices — the
// frozen contract stays byte-for-byte. Timed slots only; all-day bands live on
// the outer lip and never share a lane with timed tablets.

export interface TabletPlacement {
  /** Representative slot (earliest start of the group; the visible face). */
  slot: TabletSlot;
  /** Radial lane 0..MAX_OVERLAP_LANES-1 (0 = base ring). */
  lane: number;
  /** 1 normally; N when a 3+-concurrent cluster merged into one stacked tablet. */
  mergedCount: number;
  /** Every eventId folded into this placement (length === mergedCount). */
  mergedEventIds: string[];
}

/** Two half-open intervals overlap. */
function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Assign radial lanes to overlapping timed tablets, merging dense clusters.
 *
 * Clusters = connected components over the overlap relation (sorted by start).
 * A cluster of ≤2 fans across lanes 0/1; a cluster of ≥3 collapses to ONE
 * stacked placement (representative = earliest start) carrying a `mergedCount`
 * badge (labels in M-11). Non-overlapping tablets are lone lane-0 placements.
 */
export function resolveOverlaps(slots: TabletSlot[]): TabletPlacement[] {
  const timed = slots
    .filter((s) => !s.allDay)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || (a.eventId < b.eventId ? -1 : 1));

  const placements: TabletPlacement[] = [];
  let i = 0;
  while (i < timed.length) {
    // Grow a connected cluster: extend while the next slot overlaps the running
    // cluster span (chained overlaps count as one cluster).
    const cluster: TabletSlot[] = [timed[i]!];
    let clusterEnd = timed[i]!.endMs;
    let j = i + 1;
    while (
      j < timed.length &&
      intervalsOverlap(
        timed[j]!.startMs,
        timed[j]!.endMs,
        cluster[0]!.startMs,
        clusterEnd,
      )
    ) {
      cluster.push(timed[j]!);
      clusterEnd = Math.max(clusterEnd, timed[j]!.endMs);
      j++;
    }

    if (cluster.length >= 3) {
      placements.push({
        slot: cluster[0]!,
        lane: 0,
        mergedCount: cluster.length,
        mergedEventIds: cluster.map((s) => s.eventId),
      });
    } else {
      cluster.forEach((s, lane) => {
        placements.push({
          slot: s,
          lane: Math.min(lane, MAX_OVERLAP_LANES - 1),
          mergedCount: 1,
          mergedEventIds: [s.eventId],
        });
      });
    }
    i = j;
  }

  return placements;
}
