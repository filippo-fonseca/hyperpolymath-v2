/**
 * agendaLogic.ts — W-01 · The Studiolo · Phase 3 (The Bottega)
 *
 * The Meridian Ring's SURVIVING pure logic, extracted to the Agenda widget's
 * home before the `meridian/` presentation is demolished (PHASE-3-PLAN §5.1).
 * These are the representation-agnostic pieces the flat Agenda panel (W-09)
 * reuses verbatim — the dial/ring math dies with the ring; the event grammar
 * lives on.
 *
 * Discipline (mirrors the old `meridianLayout.ts`): ZERO runtime imports from
 * `three` — angle/number/string math only, deterministic given its inputs,
 * memoizable by the consumer on data identity.
 *
 * Provenance: `classifyEvent` (was `classifyTablet`) + its state union
 * (`EventTiming`, was `TabletState`) and `IMMINENT_MS` come from
 * `meridian/meridianLayout.ts`; `linkEventToProject` and its private token
 * helpers come from the same file; `calendarDotColor` + `PARCHMENT_HEX` come
 * from `meridian/meridianMappings.ts`. Behaviour is byte-identical to the
 * originals — only the tablet-slot coupling is dropped (`classifyEvent` now
 * takes the minimal `{ startMs, endMs }` an Agenda row already carries).
 */
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

// ── Frozen constants ─────────────────────────────────────────────────────────
/** The neutral parchment glass/row tint (STUDIOLO.parchment) — never a calendar bg. */
export const PARCHMENT_HEX = "#F2E9D8";
/** T-15: imminent threshold (start is ≤ 15 min away). */
export const IMMINENT_MS = 15 * 60 * 1000;

// ── classifyEvent (was `classifyTablet`, §2.3) ──────────────────────────────
/**
 * An event's timing state relative to now. Boundaries (frozen, unchanged from
 * the meridian original):
 *   past     = end ≤ now
 *   current  = start ≤ now < end
 *   imminent = 0 < start − now ≤ 15 min
 *   upcoming = otherwise (further out than T-15)
 * Order matters: past before current before imminent so the exact boundary
 * ticks (T-15, start, end) land on the intended side. Representation-agnostic:
 * takes only the millisecond bounds an Agenda row already computes.
 */
export type EventTiming = "past" | "current" | "imminent" | "upcoming";

export function classifyEvent(
  event: { startMs: number; endMs: number },
  nowMs: number,
): EventTiming {
  if (event.endMs <= nowMs) return "past";
  if (event.startMs <= nowMs) return "current"; // end > now guaranteed above
  const untilStart = event.startMs - nowMs; // > 0 here
  if (untilStart <= IMMINENT_MS) return "imminent";
  return "upcoming";
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

// ── calendarDotColor (the calendar-source dot, §5) ──────────────────────────
/**
 * The calendar-source dot color for an Agenda row — the ONLY place Google's
 * saturated per-calendar color is allowed to surface (never on the row tint,
 * which stays area-hue-or-parchment). Keyed off the event's `calendarId`;
 * falls back to Google blue if the calendar row is missing.
 */
export function calendarDotColor(
  calendarId: string,
  calendars: GcalCalendarMeta[],
): string {
  const cal = calendars.find((c) => c.id === calendarId);
  return cal?.backgroundColor ?? "#4285F4";
}
