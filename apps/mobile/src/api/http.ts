// Shared bearer-auth HTTP core for the /api/device/* and /api/jarvis/*
// clients. Every JSON call returns `T | null` (null on any network or
// non-2xx error) so screens degrade to an error/empty state instead of
// throwing mid-render.

import { fetch } from "expo/fetch";

import { authHeaders } from "../lib/auth-token";
import { getSettings } from "../lib/settings";

/** Hard ceiling for any single API call so a hung request surfaces as a
 * retryable error (null) instead of an infinite spinner. */
export const REQUEST_TIMEOUT_MS = 15_000;

export function apiBase(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

export function jsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...authHeaders(),
  };
}

export async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? "GET",
      headers: jsonHeaders(),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[api] ${init?.method ?? "GET"} ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[api] ${path} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
