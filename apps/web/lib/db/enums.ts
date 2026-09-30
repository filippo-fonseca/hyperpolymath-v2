import { pgEnum } from "drizzle-orm/pg-core";

// PRESERVED LITERALS (HANDOFF.md §18 non-negotiables): "P∞" and "lesno"
// Postgres enums accept Unicode; the P∞ literal stores as-is.
export const priorityEnum = pgEnum("priority", ["P∞", "P1", "P2", "P3"]);

export const taskStatusEnum = pgEnum("task_status", [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
]);

export const semesterTermEnum = pgEnum("semester_term", ["fall", "spring", "summer"]);

// Issue #165 — Notion-style custom fields on wiki pages. A page_field_definition
// carries one of these types; select supports single- or multi-value ("tags")
// via the allow_multiple flag on the definition.
export const pageFieldTypeEnum = pgEnum("page_field_type", [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
]);

// Issue #165 — a field definition is either wiki-wide (applies to every page) or
// folder-scoped (defined on a top-level folder; cascades to all its descendant
// pages). Folder-scoped defs carry a folder_id.
export const pageFieldScopeEnum = pgEnum("page_field_scope", ["wiki", "folder"]);

// ─── STUDY REVIEW ──────────────────────────────────────────────────────────
// Topic-level active recall + spaced repetition. Migration 0045.
//
// Two dials are deliberately kept separate, because conflating them is the
// classic mistake in study trackers:
//
//   weight = how well this topic needs to be known. Set once, by the user.
//   grade  = how the recall actually went. Set per session.
//
// Weight drives the target retention the scheduler aims for; grade drives the
// stability update. See lib/study/scheduler.ts.

// Target mastery, ascending. Doubles as exam yield: a "core" topic is both the
// one you must know cold and the one worth the most marks. Each level maps to
// a target retention in lib/study/scheduler.ts (0.70 → 0.95).
export const studyWeightEnum = pgEnum("study_weight", [
  "skim", // peripheral, recognize only
  "familiar", // know what it is
  "working", // can apply with notes
  "fluent", // can do cold, closed-book
  "core", // must be automatic
]);

// How the retrieval attempt went. Four presets mirroring the FSRS rating scale
// but named for how engineering revision actually feels.
export const studyGradeEnum = pgEnum("study_grade", [
  "blanked", // could not reproduce it
  "shaky", // got there with hints or notes
  "solid", // recalled cold, some friction
  "fluent", // fast and clean
]);

// How the topic was reviewed. Ordered roughly by retrieval strength.
//
// `skim` is the odd one out: it is passive review, and the scheduler halves the
// stability GAIN for it. Rereading notes should not buy the same schedule
// extension as reproducing the material from an empty page. It stays loggable
// because pretending it never happens would just push it off the books.
export const studyModeEnum = pgEnum("study_mode", [
  "blank_recall", // brain-dump onto an empty page
  "derivation", // derive the result from first principles
  "problem_set", // work problems
  "past_paper", // timed, exam conditions
  "teach_back", // explain it out loud
  "skim", // passive reread — reduced credit
]);

export const studyTopicStatusEnum = pgEnum("study_topic_status", [
  "not_started",
  "learning",
  "consolidating",
  "exam_ready",
  "retired",
]);

// What you are revising FOR. Covers graded work generally, not just exams —
// a problem set is a legitimate thing to schedule topic review against.
export const studyAssessmentKindEnum = pgEnum("study_assessment_kind", [
  "quiz",
  "pset",
  "midterm",
  "final",
  "exam",
  "project",
]);

// Lifecycle of one topic-on-one-day entry in the drag-and-drop plan.
export const studyPlanStatusEnum = pgEnum("study_plan_status", [
  "planned",
  "done",
  "skipped",
]);
