/**
 * The presentation vocabulary for Study Review. Issue #400.
 *
 * Every label the user reads lives here, so the board, the log sheet, the class
 * section and the widget can never describe the same concept differently. The
 * scheduler owns the numbers; this file owns the words.
 */

import type {
  StudyGrade,
  StudyMode,
  StudyTopicStatus,
  StudyWeight,
} from "@/lib/study/scheduler";

// ─── WEIGHT ────────────────────────────────────────────────────────────────

export const WEIGHT_ORDER: StudyWeight[] = [
  "skim",
  "familiar",
  "working",
  "fluent",
  "core",
];

export const WEIGHT_META: Record<
  StudyWeight,
  { label: string; hint: string; short: string }
> = {
  skim: { label: "Skim", short: "S", hint: "Peripheral. Recognize it, no more." },
  familiar: { label: "Familiar", short: "F", hint: "Know what it is and when it applies." },
  working: { label: "Working", short: "W", hint: "Can apply it with notes to hand." },
  fluent: { label: "Fluent", short: "Fl", hint: "Can do it cold, closed-book." },
  core: { label: "Core", short: "C", hint: "Must be automatic. High yield." },
};

// ─── GRADE ─────────────────────────────────────────────────────────────────

export const GRADE_ORDER: StudyGrade[] = ["blanked", "shaky", "solid", "fluent"];

// Literal hex, not theme vars. These four are a deliberate red → amber → green
// → blue ramp read as one set, and they sit under white text when selected; a
// theme token that resolves pale (as --sd-danger does) breaks the contrast and
// the set at once.
export const GRADE_META: Record<
  StudyGrade,
  { label: string; hint: string; hue: string }
> = {
  blanked: {
    label: "Blanked",
    hint: "Could not reproduce it.",
    hue: "#ef4444",
  },
  shaky: {
    label: "Shaky",
    hint: "Got there, but with hints or notes.",
    hue: "#f59e0b",
  },
  solid: {
    label: "Solid",
    hint: "Recalled it cold, with some friction.",
    hue: "#10b981",
  },
  fluent: {
    label: "Fluent",
    hint: "Fast and clean.",
    hue: "#0ea5e9",
  },
};

// ─── MODE ──────────────────────────────────────────────────────────────────

/**
 * Ordered by retrieval strength, strongest first, so the log sheet nudges
 * toward the modes that actually work without forbidding the ones that do not.
 */
export const MODE_ORDER: StudyMode[] = [
  "blank_recall",
  "problem_set",
  "derivation",
  "past_paper",
  "teach_back",
  "skim",
];

export const MODE_META: Record<
  StudyMode,
  { label: string; hint: string; icon: string; passive?: boolean }
> = {
  blank_recall: {
    label: "Blank page",
    hint: "Dumped everything you remember onto an empty page.",
    icon: "FileText",
  },
  problem_set: {
    label: "Problems",
    hint: "Worked problems on it.",
    icon: "Calculator",
  },
  derivation: {
    label: "Derivation",
    hint: "Derived it from first principles.",
    icon: "Sigma",
  },
  past_paper: {
    label: "Past paper",
    hint: "Timed, under exam conditions.",
    icon: "Timer",
  },
  teach_back: {
    label: "Taught it",
    hint: "Explained it out loud, unaided.",
    icon: "Speech",
  },
  skim: {
    label: "Reread",
    hint: "Passive review. Counts for half.",
    icon: "Eye",
    passive: true,
  },
};

// ─── STATUS ────────────────────────────────────────────────────────────────

export const STATUS_META: Record<StudyTopicStatus, { label: string }> = {
  not_started: { label: "Not started" },
  learning: { label: "Learning" },
  consolidating: { label: "Consolidating" },
  exam_ready: { label: "Exam ready" },
  retired: { label: "Retired" },
};

export const ASSESSMENT_KIND_LABEL: Record<string, string> = {
  quiz: "Quiz",
  pset: "Problem set",
  midterm: "Midterm",
  final: "Final",
  exam: "Exam",
  project: "Project",
};

// ─── FORMATTING ────────────────────────────────────────────────────────────

/** Retention as a whole percent. */
export function pct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

/**
 * Human gap to a date, in the fewest words that stay unambiguous.
 * Positive is future, negative is past.
 */
export function relativeDays(days: number): string {
  const n = Math.round(days);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return n < 14 ? `in ${n} days` : `in ${Math.round(n / 7)} weeks`;
  const a = Math.abs(n);
  return a < 14 ? `${a} days ago` : `${Math.round(a / 7)} weeks ago`;
}

/** "3 days" / "2 weeks" — a bare duration, no preposition. */
export function bareDays(days: number): string {
  const n = Math.max(0, Math.round(days));
  if (n === 0) return "today";
  if (n === 1) return "1 day";
  if (n < 14) return `${n} days`;
  return `${Math.round(n / 7)} weeks`;
}

/**
 * How a topic's urgency reads at a glance. Thresholds are on the priority
 * score from the scheduler, where > 0 means it has fallen below its bar.
 */
export function urgencyBand(priority: number): "fresh" | "due" | "faded" | "cold" {
  if (priority <= 0) return "fresh";
  if (priority < 0.25) return "due";
  if (priority < 0.7) return "faded";
  return "cold";
}

export const URGENCY_META: Record<
  ReturnType<typeof urgencyBand>,
  { label: string; color: string }
> = {
  fresh: { label: "Fresh", color: "var(--ink-faint)" },
  due: { label: "Due", color: "#f59e0b" },
  faded: { label: "Fading", color: "#f97316" },
  cold: { label: "Cold", color: "#ef4444" },
};
