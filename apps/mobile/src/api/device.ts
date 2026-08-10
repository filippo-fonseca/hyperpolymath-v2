// Typed client for the paired-device CRUD API (/api/device/*) — tasks,
// habits, captures, projects, calendar. Bearer-auth via the shared core;
// mutation helpers return ids/booleans and the data layer reconciles the
// cache afterwards.
//
// v2 note: this supersedes src/lib/data.ts. Training is intentionally
// absent (out of MVP scope); the old client remains until legacy screens
// are deleted.

import { call } from "./http";

// ── Tasks ───────────────────────────────────────────────────────────────────

export type Priority = "P∞" | "P1" | "P2" | "P3";
export type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

export const PRIORITIES: Priority[] = ["P∞", "P1", "P2", "P3"];
export const STATUSES: TaskStatus[] = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
];

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  projects: { id: string; name: string }[];
}

export interface TaskCreateInput {
  title: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
  notes?: string | null;
  projectIds?: string[];
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
  notes?: string | null;
  projectIds?: string[];
}

export async function getTasks(): Promise<Task[] | null> {
  const data = await call<{ tasks: Task[] }>("/api/device/tasks");
  return data?.tasks ?? null;
}

export async function createTask(input: TaskCreateInput): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/tasks", {
    method: "POST",
    body: input,
  });
  return data?.id ?? null;
}

export async function updateTask(input: TaskUpdateInput): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/tasks", {
    method: "PATCH",
    body: input,
  });
  return data?.ok === true;
}

export async function deleteTask(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(
    `/api/device/tasks?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return data?.ok === true;
}

// ── Habits ──────────────────────────────────────────────────────────────────

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  /** Sun=0 … Sat=6, matching Date.getDay(). */
  daysOfWeek: boolean[];
  orderIndex: number;
}

export interface HabitCompletion {
  habitId: string;
  completedDate: string;
}

export interface HabitData {
  habits: Habit[];
  /** Completions within the requested window. */
  completions: HabitCompletion[];
}

export async function getHabits(
  start: string,
  end: string,
): Promise<HabitData | null> {
  return call<HabitData>(
    `/api/device/habits?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
}

export async function createHabit(input: {
  name: string;
  description?: string | null;
  icon?: string | null;
  daysOfWeek?: boolean[];
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/habits", {
    method: "POST",
    body: input,
  });
  return data?.id ?? null;
}

export async function updateHabit(input: {
  id: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  daysOfWeek?: boolean[];
  archived?: boolean;
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/habits", {
    method: "PATCH",
    body: input,
  });
  return data?.ok === true;
}

/** PUT toggle — the device API's only completion write (binary done/undone). */
export async function toggleHabit(input: {
  habitId: string;
  completedDate: string;
  completed: boolean;
}): Promise<boolean> {
  const data = await call<{ completed: boolean }>("/api/device/habits", {
    method: "PUT",
    body: input,
  });
  return data !== null;
}

export async function deleteHabit(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(
    `/api/device/habits?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return data?.ok === true;
}

// ── Captures ────────────────────────────────────────────────────────────────

export interface Capture {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdVia: string | null;
  sourceDevice: string | null;
  sourceInput: string | null;
  hashtags: { id: string; displayName: string; name: string }[];
  projects: { id: string; name: string }[];
}

export async function getCaptures(): Promise<Capture[] | null> {
  const data = await call<{ captures: Capture[] }>("/api/device/captures");
  return data?.captures ?? null;
}

export async function createCapture(input: {
  content: string;
  hashtagNames?: string[];
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/captures", {
    method: "POST",
    body: input,
  });
  return data?.id ?? null;
}

export async function updateCapture(input: {
  id: string;
  content?: string;
  hashtagNames?: string[];
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/captures", {
    method: "PATCH",
    body: input,
  });
  return data?.ok === true;
}

export async function deleteCapture(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(
    `/api/device/captures?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return data?.ok === true;
}

// ── Projects / Areas (read-only in v2 — managed on web) ────────────────────

export interface DeviceProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  openTaskCount: number;
}

export interface DeviceArea {
  id: string;
  name: string;
  emoji: string | null;
  projects: DeviceProject[];
}

export async function getProjects(): Promise<DeviceArea[] | null> {
  const data = await call<{ areas: DeviceArea[] }>("/api/device/projects");
  return data?.areas ?? null;
}

// ── Calendar (read-only; Google Calendar remains source of truth) ───────────

export type CalendarStatus = "connected" | "not_connected" | "revoked";

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string | null;
  colorId: string | null;
  recurringEventId: string | null;
  htmlLink: string;
}

export interface CalendarMeta {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  accessRole: string;
}

export interface CalendarData {
  status: CalendarStatus;
  events: CalendarEvent[];
  calendars: CalendarMeta[];
  error?: string;
}

export async function getCalendarEvents(limit = 25): Promise<CalendarData | null> {
  return call<CalendarData>(`/api/device/calendar?limit=${limit}`);
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD for the user's current day (client decides the date). */
export function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
