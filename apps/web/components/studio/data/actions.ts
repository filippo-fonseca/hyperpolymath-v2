"use client";

/**
 * actions.ts — The Studio · action bundles
 *
 * Module-level, typed re-groupings of the EXISTING 2D server actions — no new
 * mutations. Because these bundles are module constants, they have stable
 * identities for free (no per-render allocation), so the per-widget hooks can
 * hand `actions` straight to memoized children.
 *
 * A studio write IS the 2D server action: the DB write broadcasts on the same
 * Realtime channel and the 2D pages (same keys) refetch. Agenda is the one
 * exception (no gcal Realtime channel), so its writes are wrapped in the hook to
 * invalidate the `["calendar-events", userId]` prefix on success.
 */
import {
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  advanceRecurringTask,
} from "@/app/actions/tasks";
import {
  createCapture,
  updateCapture,
  setCaptureFavorite,
  deleteCapture,
} from "@/app/actions/captures";
import { toggleHabitCompletion } from "@/app/actions/habits";
import { upsertJournalEntry } from "@/app/actions/journal";
import {
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
} from "@/app/actions/projects";
import {
  createArea,
  updateArea,
  archiveArea,
  unarchiveArea,
  deleteArea,
} from "@/app/actions/areas";
import {
  createPerson,
  updatePerson,
  deletePerson,
} from "@/app/actions/people";

export const studioTaskActions = {
  createTask, // ActionResult<{ id: string }> — accepts client UUID (RT-05)
  updateTask, // ActionResult<null>
  updateTaskStatus, // ActionResult<{ becameLesno: boolean }>
  deleteTask,
  advanceRecurringTask,
} as const;

export const studioCaptureActions = {
  createCapture,
  updateCapture,
  setCaptureFavorite,
  deleteCapture,
} as const;

export const studioHabitActions = {
  toggleHabitCompletion, // { habitId, completedDate, completed }
} as const;

export const studioJournalActions = {
  upsertJournalEntry, // { date, mainResponse?, notesSection?, noExport? }
} as const;

// Wave-5 ambient widgets. Read-only in the overlay today, but exported as the
// same module-const bundles so the `useStudio<Widget>()` contract matches the
// existing shape. All broadcast on their table's Realtime channel, so no
// invalidation wrappers are needed (agenda stays the only exception).
export const studioProjectActions = {
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
} as const;

export const studioAreaActions = {
  createArea,
  updateArea,
  archiveArea,
  unarchiveArea,
  deleteArea,
} as const;

export const studioPersonActions = {
  createPerson,
  updatePerson,
  deletePerson,
} as const;

export type StudioTaskActions = typeof studioTaskActions;
export type StudioCaptureActions = typeof studioCaptureActions;
export type StudioHabitActions = typeof studioHabitActions;
export type StudioJournalActions = typeof studioJournalActions;
export type StudioProjectActions = typeof studioProjectActions;
export type StudioAreaActions = typeof studioAreaActions;
export type StudioPersonActions = typeof studioPersonActions;
