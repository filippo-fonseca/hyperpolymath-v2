// Composer context (projects / hashtags / timezone) fetched from
// /api/jarvis/voice/context with the device bearer token. The web console
// receives these via Server Component props; mobile pulls them at app start
// and after settings change, caching in module scope.

import { fetch } from "expo/fetch";

import { getDeviceToken, getSettings } from "./settings";

export interface ProjectRef {
  id: string;
  name: string;
  icon: string | null;
}

export interface HashtagRef {
  name: string;
  displayName: string;
}

export interface JarvisContext {
  projects: ProjectRef[];
  hashtags: HashtagRef[];
  timezone: string;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

let cached: JarvisContext = { projects: [], hashtags: [], timezone: deviceTimezone() };

export function getJarvisContext(): JarvisContext {
  return cached;
}

export async function refreshJarvisContext(): Promise<JarvisContext> {
  const token = getDeviceToken();
  if (!token) return cached;
  try {
    const base = getSettings().serverUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/jarvis/voice/context`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[context] ${res.status}`);
      return cached;
    }
    const data = (await res.json()) as {
      projects?: ProjectRef[];
      hashtags?: HashtagRef[];
      timezone?: string | null;
    };
    cached = {
      projects: data.projects ?? [],
      hashtags: data.hashtags ?? [],
      timezone: data.timezone || deviceTimezone(),
    };
  } catch (err) {
    console.warn("[context] fetch failed", err);
  }
  return cached;
}
