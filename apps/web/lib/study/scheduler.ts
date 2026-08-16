/**
 * The study scheduler: an exam-anchored forgetting curve, per topic.
 *
 * Issue #400. Pure functions, no I/O, no clock reads — every entry point takes
 * `now` explicitly so the whole module is deterministic under test.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 *
 * Each topic carries DSR state, the same shape FSRS uses for flashcards, applied
 * at topic granularity instead:
 *
 *   Difficulty (D)     1–10. How hard this material is FOR YOU. Learned from
 *                      your grades, never set by hand.
 *   Stability (S)      Days until retrievability decays to 90%. Grows with each
 *                      successful retrieval, collapses on a blank.
 *   Retrievability (R) Probability you can retrieve it right now. Derived from
 *                      S and elapsed time; never stored.
 *
 * Difficulty and *weight* are deliberately different things and both exist:
 * difficulty is how hard the topic is for you (measured), weight is how well you
 * need to know it (declared). A topic can be easy and critical, or brutal and
 * peripheral. Weight sets the target retention the scheduler aims for; difficulty
 * modulates how fast stability grows.
 *
 * ── WHY THIS IS NOT ANKI ───────────────────────────────────────────────────
 *
 * Anki holds you at a fixed retention indefinitely, because a language deck has
 * no finish line. Revision does: every topic needs to PEAK on one date and may
 * then be dropped. So two things differ here.
 *
 *   1. Intervals are clamped so a topic never falls due after its exam.
 *   2. Target retention RAMPS as the exam approaches (each weight's baseline →
 *      0.95 over the final fortnight), which naturally compresses reviews into a
 *      crescendo instead of leaving them evenly spread.
 *
 * The consequence worth stating plainly: a `core` topic you blank on three days
 * before a midterm comes back tomorrow, not in three weeks.
 *
 * ── WHY MODE MATTERS ───────────────────────────────────────────────────────
 *
 * Retrieval practice beats rereading, and the gap is not small. `skim` therefore
 * earns only half the stability GAIN of a real retrieval attempt. It stays
 * loggable because a tracker that punishes honest logging just gets lied to.
 */

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

/** Power-law decay exponent (FSRS-5). */
const DECAY = -0.5;

/**
 * Chosen so that R(S) = 0.9 exactly — i.e. stability is *defined* as the number
 * of days until retrievability hits 90%. (1 + 19/81)^-0.5 = 0.9.
 */
const FACTOR = 19 / 81;

/** Days before an assessment over which target retention ramps to its peak. */
const RAMP_DAYS = 14;

/** Target retention every topic is driven toward on exam day. */
const EXAM_PEAK_R = 0.95;

/** Never schedule a same-day repeat; the spacing effect needs a gap. */
const MIN_INTERVAL_DAYS = 1;

/** A school year. Past this, longer intervals are meaningless for coursework. */
const MAX_STABILITY_DAYS = 365;

/** Floor after a lapse: a blanked topic is worth another look tomorrow. */
const MIN_STABILITY_DAYS = 1;

/**
 * Post-lapse stability is computed on its own terms rather than as a fraction of
 * what came before, because a blank is evidence the old estimate was wrong.
 *
 * Scaling alone is far too gentle at the top end: a topic sitting at 40-day
 * stability would still land at 16 days after a total blank, which schedules the
 * next look a week out on material you just failed to produce. FSRS treats a
 * lapse with a separate formula for exactly this reason.
 *
 * The small savings term is not sentiment — relearning genuinely is faster than
 * learning, so having once known it well is worth a little. Just not much.
 */
const POST_LAPSE_BASE_DAYS = 2;
const POST_LAPSE_SAVINGS = 0.05;

const MS_PER_DAY = 86_400_000;

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type StudyWeight = 'skim' | 'familiar' | 'working' | 'fluent' | 'core';
export type StudyGrade = 'blanked' | 'shaky' | 'solid' | 'fluent';
export type StudyMode =
  | 'blank_recall'
  | 'derivation'
  | 'problem_set'
  | 'past_paper'
  | 'teach_back'
  | 'skim';
export type StudyTopicStatus =
  | 'not_started'
  | 'learning'
  | 'consolidating'
  | 'exam_ready'
  | 'retired';

/** The subset of a study_topics row the scheduler reads. */
export type TopicMemory = {
  weight: StudyWeight;
  difficulty: number;
  /** NULL until the first review: no trace yet, so nothing to decay. */
  stability: number | null;
  lastReviewedAt: Date | null;
  reps: number;
  lapses: number;
};

/** The subset of a study_topics row the scheduler writes. */
export type TopicSchedule = {
  difficulty: number;
  stability: number;
  lastReviewedAt: Date;
  nextDueAt: Date;
  reps: number;
  lapses: number;
  status: StudyTopicStatus;
};

// ─── WEIGHT → TARGET RETENTION ─────────────────────────────────────────────

/**
 * How well each weight level needs to be known, as a retention probability.
 *
 * These are the baselines the scheduler aims for when an exam is far off. As one
 * approaches, every level ramps toward EXAM_PEAK_R.
 */
export const TARGET_RETENTION: Record<StudyWeight, number> = {
  skim: 0.7, // peripheral, recognize only
  familiar: 0.78, // know what it is
  working: 0.85, // can apply with notes
  fluent: 0.9, // can do cold, closed-book
  core: 0.95, // must be automatic
};

/** How much a weight level inflates queue priority. */
const WEIGHT_PRIORITY: Record<StudyWeight, number> = {
  skim: 0.5,
  familiar: 0.75,
  working: 1.0,
  fluent: 1.35,
  core: 1.75,
};

// ─── CORE CURVE ────────────────────────────────────────────────────────────

/**
 * Probability of retrieving the topic after `elapsedDays` since the last review.
 *
 * R(t) = (1 + FACTOR · t / S) ^ DECAY
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  const t = Math.max(0, elapsedDays);
  return Math.pow(1 + (FACTOR * t) / stability, DECAY);
}

/**
 * Inverse of the above: how many days until retention falls to `targetR`.
 *
 * t = (S / FACTOR) · (targetR ^ (1/DECAY) − 1)
 */
export function intervalForRetention(stability: number, targetR: number): number {
  const r = clamp(targetR, 0.5, 0.999);
  return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** Current retrievability of a topic, or 0 if it has never been reviewed. */
export function currentRetrievability(topic: TopicMemory, now: Date): number {
  if (topic.stability == null || topic.lastReviewedAt == null) return 0;
  return retrievability(daysBetween(topic.lastReviewedAt, now), topic.stability);
}

// ─── EXAM ANCHORING ────────────────────────────────────────────────────────

/**
 * How close an assessment is, on a 0–1 scale, over the final RAMP_DAYS.
 *
 * 0 = further off than the ramp (or no assessment at all), 1 = today or past.
 */
export function examProximity(now: Date, assessmentDate: Date | null): number {
  if (!assessmentDate) return 0;
  const days = daysBetween(now, assessmentDate);
  if (days <= 0) return 1;
  if (days >= RAMP_DAYS) return 0;
  return (RAMP_DAYS - days) / RAMP_DAYS;
}

/**
 * The retention this topic should actually be held at right now: its weight's
 * baseline, ramped toward EXAM_PEAK_R as the assessment closes in.
 *
 * A `core` topic is already at the peak, so the ramp is a no-op for it. A `skim`
 * topic climbs from 0.70 to 0.95, which is the whole point — even the peripheral
 * material gets tightened up in exam week.
 */
export function effectiveTargetRetention(
  weight: StudyWeight,
  now: Date,
  assessmentDate: Date | null,
): number {
  const base = TARGET_RETENTION[weight];
  const proximity = examProximity(now, assessmentDate);
  return Math.max(base, base + (EXAM_PEAK_R - base) * proximity);
}

// ─── STABILITY UPDATE ──────────────────────────────────────────────────────

/** Seed stability, in days, from how the very first retrieval attempt went. */
const INITIAL_STABILITY: Record<StudyGrade, number> = {
  blanked: 1,
  shaky: 2,
  solid: 4,
  fluent: 7,
};

/**
 * Seed difficulty from that same first attempt.
 *
 * Note this reads the GRADE, not the weight: difficulty is how hard the material
 * turned out to be for you, which the first honest retrieval measures directly.
 * Weight never touches difficulty.
 */
const INITIAL_DIFFICULTY: Record<StudyGrade, number> = {
  blanked: 7.5,
  shaky: 6,
  solid: 5,
  fluent: 4,
};

/** How each grade moves difficulty. Success makes it easier, slowly. */
const DIFFICULTY_DELTA: Record<StudyGrade, number> = {
  blanked: 0.8,
  shaky: 0.3,
  solid: -0.1,
  fluent: -0.3,
};

/**
 * The multiplier applied to stability for a given grade at a given difficulty.
 *
 * Easier topics (low D) compound faster, which is what makes a well-known topic
 * drop out of the queue quickly instead of nagging. A blank collapses stability
 * rather than merely slowing its growth.
 */
function stabilityMultiplier(grade: StudyGrade, difficulty: number): number {
  switch (grade) {
    case 'blanked':
      // Unused: a lapse routes through postLapseStability instead.
      return 0.4;
    case 'shaky':
      return 1.2;
    case 'solid':
      return 1.6 + 0.1 * (10 - difficulty);
    case 'fluent':
      return 2.4 + 0.15 * (10 - difficulty);
  }
}

/**
 * Where stability lands after a blank. Soft-capped, so a topic you knew cold and
 * a topic you half-knew both come back into the short-interval regime, but the
 * former comes back a touch later.
 */
function postLapseStability(prior: number): number {
  return Math.min(prior * 0.4, POST_LAPSE_BASE_DAYS + prior * POST_LAPSE_SAVINGS);
}

/**
 * Passive review earns half the stability GAIN of an active retrieval.
 *
 * Applied to the gain, not the multiplier, so a failed skim still collapses
 * stability at full force. Rereading and then failing is not evidence of
 * anything except that you should have been recalling.
 */
function applyModePenalty(multiplier: number, mode: StudyMode): number {
  if (mode !== 'skim' || multiplier <= 1) return multiplier;
  return 1 + (multiplier - 1) * 0.5;
}

// ─── THE MAIN ENTRY POINT ──────────────────────────────────────────────────

export type ReviewInput = {
  grade: StudyGrade;
  mode: StudyMode;
  /** The nearest upcoming assessment covering this topic, if any. */
  assessmentDate?: Date | null;
  /** When the review happened. */
  now: Date;
};

/**
 * Advance a topic's memory state by one review, and say when it is next due.
 *
 * This is the only function that writes DSR state. `app/actions/study.ts` calls
 * it and persists the result in the same transaction as the review insert.
 */
export function reviewTopic(topic: TopicMemory, input: ReviewInput): TopicSchedule {
  const { grade, mode, now } = input;
  const assessmentDate = input.assessmentDate ?? null;
  const isFirst = topic.stability == null || topic.lastReviewedAt == null;

  let difficulty: number;
  let stability: number;

  if (isFirst) {
    difficulty = INITIAL_DIFFICULTY[grade];
    stability = INITIAL_STABILITY[grade];
    // A first look that is only a skim does not earn the full head start.
    if (mode === 'skim') stability = Math.max(MIN_STABILITY_DAYS, stability * 0.5);
  } else {
    difficulty = clamp(topic.difficulty + DIFFICULTY_DELTA[grade], 1, 10);
    if (grade === 'blanked') {
      // No mode penalty here: failing after a reread is no better than failing
      // after an honest recall attempt, so both collapse identically.
      stability = postLapseStability(topic.stability!);
    } else {
      const multiplier = applyModePenalty(stabilityMultiplier(grade, difficulty), mode);
      stability = topic.stability! * multiplier;
    }
  }

  stability = clamp(stability, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);

  const reps = topic.reps + 1;
  const lapses = topic.lapses + (grade === 'blanked' ? 1 : 0);

  return {
    difficulty,
    stability,
    lastReviewedAt: now,
    nextDueAt: nextDueDate(topic.weight, stability, now, assessmentDate),
    reps,
    lapses,
    status: deriveStatus(reps, stability, grade),
  };
}

/**
 * When a topic at this stability next falls below its target retention, clamped
 * so it can never come due after the exam it is being revised for.
 */
export function nextDueDate(
  weight: StudyWeight,
  stability: number,
  now: Date,
  assessmentDate: Date | null,
): Date {
  const targetR = effectiveTargetRetention(weight, now, assessmentDate);
  const rawInterval = intervalForRetention(stability, targetR);
  const interval = Math.max(MIN_INTERVAL_DAYS, rawInterval);

  let due = addDays(now, interval);

  // Never let a topic fall due after the exam that needs it. Reviewing on the
  // morning of is late but useful; reviewing the week after is neither.
  if (assessmentDate && due > assessmentDate && assessmentDate > now) {
    due = assessmentDate;
  }
  return due;
}

// ─── STATUS + READINESS ────────────────────────────────────────────────────

/**
 * The coarse ladder shown on the topic tree. Intentionally simple and derived
 * only from durable state, so it does not flicker as exam dates move around.
 *
 * `exam_ready` here means "the trace is durable", not "ready for a specific
 * exam" — for that, ask `projectedRetention` against the real date.
 */
export function deriveStatus(
  reps: number,
  stability: number,
  lastGrade: StudyGrade,
): StudyTopicStatus {
  if (reps === 0) return 'not_started';
  if (lastGrade === 'blanked') return 'learning';
  if (stability < 7) return 'learning';
  if (stability < 21) return 'consolidating';
  return 'exam_ready';
}

/**
 * What retention this topic is projected to have on a given date — the honest
 * answer to "will I know this on exam day?".
 */
export function projectedRetention(topic: TopicMemory, target: Date): number {
  if (topic.stability == null || topic.lastReviewedAt == null) return 0;
  return retrievability(daysBetween(topic.lastReviewedAt, target), topic.stability);
}

/** Whether the topic is projected to clear its own bar on the exam date. */
export function isExamReady(topic: TopicMemory, assessmentDate: Date): boolean {
  return projectedRetention(topic, assessmentDate) >= TARGET_RETENTION[topic.weight];
}

// ─── PRIORITY (the "Fading now" queue) ─────────────────────────────────────

/**
 * How badly this topic needs attention right now.
 *
 * > 0 means it has fallen below the retention it should be held at. Larger is
 * more urgent. <= 0 means it is still fresh, and the magnitude orders the fresh
 * ones sensibly behind everything that is actually due.
 *
 * Never-reviewed topics score their full target, which floors them near the top
 * without special-casing.
 */
export function priorityFor(
  topic: TopicMemory,
  now: Date,
  assessmentDate: Date | null,
): number {
  const targetR = effectiveTargetRetention(topic.weight, now, assessmentDate);
  const deficit = targetR - currentRetrievability(topic, now);
  if (deficit <= 0) return deficit;

  // An imminent exam doubles urgency, so exam-week topics outrank equally
  // faded material from a class that is not being examined yet.
  const proximityFactor = 1 + examProximity(now, assessmentDate);
  return WEIGHT_PRIORITY[topic.weight] * proximityFactor * deficit;
}

// ─── INTERLEAVING ──────────────────────────────────────────────────────────

export type DayAnalysis = {
  /** True when the day is dominated by one unit, i.e. blocked practice. */
  isBlocked: boolean;
  /** The parent whose topics dominate, when blocked. */
  dominantParentId: string | null;
  count: number;
};

/**
 * Flag a day that has become blocked practice.
 *
 * Interleaving beats blocking mainly because most exam errors are choosing the
 * WRONG METHOD rather than misapplying the right one, and you can only practise
 * that choice when consecutive problems differ (Rohrer's discriminative-contrast
 * account). A day of nothing but one unit never exercises the discrimination.
 *
 * Advisory only. The user drags; this just puts a quiet note on the column.
 */
export function analyzeDay(
  items: ReadonlyArray<{ parentId: string | null }>,
): DayAnalysis {
  const count = items.length;
  if (count < 3) return { isBlocked: false, dominantParentId: null, count };

  const tally = new Map<string, number>();
  for (const item of items) {
    if (item.parentId == null) continue;
    tally.set(item.parentId, (tally.get(item.parentId) ?? 0) + 1);
  }

  for (const [parentId, n] of tally) {
    if (n === count) return { isBlocked: true, dominantParentId: parentId, count };
  }
  return { isBlocked: false, dominantParentId: null, count };
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Fractional days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}
