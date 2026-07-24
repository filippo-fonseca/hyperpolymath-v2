// Typed client for the paired-device CRUD API (/api/device/*) — tasks,
// habits, captures. All calls are bearer-auth; mutation helpers return
// booleans/ids and callers refresh through use-collection afterwards.

import { fetch } from "expo/fetch";

import { authHeaders } from "./auth-token";
import { getSettings } from "./settings";

function base(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...authHeaders(),
  };
}

/** Hard ceiling for any single device API call so a hung request surfaces as a
 * retryable error (null) instead of an infinite spinner. */
const REQUEST_TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[data] ${init?.method ?? "GET"} ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[data] ${path} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type Priority = "P∞" | "P1" | "P2" | "P3";
export type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

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

export async function getTasks(): Promise<Task[] | null> {
  const data = await call<{ tasks: Task[] }>("/api/device/tasks");
  return data?.tasks ?? null;
}

export async function createTask(input: {
  title: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
  notes?: string | null;
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/tasks", { method: "POST", body: input });
  return data?.id ?? null;
}

export async function updateTask(input: {
  id: string;
  title?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
  notes?: string | null;
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/tasks", { method: "PATCH", body: input });
  return data?.ok === true;
}

export async function deleteTask(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(`/api/device/tasks?id=${id}`, { method: "DELETE" });
  return data?.ok === true;
}

// ── Habits ──────────────────────────────────────────────────────────────────

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  daysOfWeek: boolean[];
  orderIndex: number;
}

export interface HabitData {
  habits: Habit[];
  /** Completions within the requested window. */
  completions: Array<{ habitId: string; completedDate: string }>;
}

export async function getHabits(start: string, end: string): Promise<HabitData | null> {
  return call<HabitData>(`/api/device/habits?start=${start}&end=${end}`);
}

export async function createHabit(input: {
  name: string;
  description?: string | null;
  icon?: string | null;
  daysOfWeek?: boolean[];
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/habits", { method: "POST", body: input });
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
  const data = await call<{ ok: boolean }>("/api/device/habits", { method: "PATCH", body: input });
  return data?.ok === true;
}

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
  const data = await call<{ ok: boolean }>(`/api/device/habits?id=${id}`, { method: "DELETE" });
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
  const data = await call<{ id: string }>("/api/device/captures", { method: "POST", body: input });
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
  const data = await call<{ ok: boolean }>(`/api/device/captures?id=${id}`, { method: "DELETE" });
  return data?.ok === true;
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

/** Local YYYY-MM-DD for the user's current day. */
export function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Projects / Areas ─────────────────────────────────────────────────────────

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

export async function createArea(input: {
  name: string;
  emoji?: string | null;
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/projects", {
    method: "POST",
    body: { type: "area", ...input },
  });
  return data?.id ?? null;
}

export async function updateArea(input: {
  id: string;
  name?: string;
  emoji?: string | null;
  archived?: boolean;
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/projects", {
    method: "PATCH",
    body: { type: "area", ...input },
  });
  return data?.ok === true;
}

export async function deleteArea(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(`/api/device/projects?type=area&id=${id}`, {
    method: "DELETE",
  });
  return data?.ok === true;
}

export async function createProject(input: {
  areaId: string;
  name: string;
  icon?: string | null;
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/projects", {
    method: "POST",
    body: { type: "project", ...input },
  });
  return data?.id ?? null;
}

export async function updateProject(input: {
  id: string;
  name?: string;
  icon?: string | null;
  archived?: boolean;
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/projects", {
    method: "PATCH",
    body: { type: "project", ...input },
  });
  return data?.ok === true;
}

export async function deleteProject(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(`/api/device/projects?type=project&id=${id}`, {
    method: "DELETE",
  });
  return data?.ok === true;
}

// ── Training ────────────────────────────────────────────────────────────────

export type TrainingStatus = "planned" | "done" | "cancelled" | "skipped";
export const TRAINING_STATUSES: TrainingStatus[] = ["planned", "done", "cancelled", "skipped"];

export interface TrainingType {
  id: string;
  name: string;
  color: string; // oklch(...) string from the web palette
  icon: string | null;
  hasDistance: boolean;
}

export interface TrainingActivity {
  id: string;
  activityTypeId: string;
  scheduledDate: string;
  title: string;
  description: string | null;
  plannedDurationMin: number | null;
  actualDurationMin: number | null;
  plannedDistanceKm: string | null;
  actualDistanceKm: string | null;
  status: TrainingStatus;
  dayOrderIndex: number;
}

export interface TrainingData {
  types: TrainingType[];
  activities: TrainingActivity[];
}

export async function getTraining(start: string, end: string): Promise<TrainingData | null> {
  return call<TrainingData>(`/api/device/training?start=${start}&end=${end}`);
}

export async function createActivity(input: {
  activityTypeId: string;
  scheduledDate: string;
  title: string;
  plannedDurationMin?: number | null;
  plannedDistanceKm?: number | null;
}): Promise<string | null> {
  const data = await call<{ id: string }>("/api/device/training", { method: "POST", body: input });
  return data?.id ?? null;
}

export async function updateActivity(input: {
  id: string;
  activityTypeId?: string;
  title?: string;
  scheduledDate?: string;
  status?: TrainingStatus;
  plannedDurationMin?: number | null;
  plannedDistanceKm?: number | null;
}): Promise<boolean> {
  const data = await call<{ ok: boolean }>("/api/device/training", {
    method: "PATCH",
    body: input,
  });
  return data?.ok === true;
}

export async function deleteActivity(id: string): Promise<boolean> {
  const data = await call<{ ok: boolean }>(`/api/device/training?id=${id}`, { method: "DELETE" });
  return data?.ok === true;
}
