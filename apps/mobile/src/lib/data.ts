// Typed client for the paired-device CRUD API (/api/device/*) — tasks,
// habits, captures. All calls are bearer-auth; mutation helpers return
// booleans/ids and callers refresh through use-collection afterwards.

import { fetch } from "expo/fetch";

import { getDeviceToken, getSettings } from "./settings";

function base(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const token = getDeviceToken();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      console.warn(`[data] ${init?.method ?? "GET"} ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[data] ${path} failed`, err);
    return null;
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

/** Local YYYY-MM-DD for the user's current day. */
export function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
