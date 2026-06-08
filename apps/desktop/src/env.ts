// apps/desktop/src/env.ts
// Runtime config loaded once at boot. Values come from VITE_* env vars so
// they are inlined by Vite at build time and available as import.meta.env.*.
//
// Required .env.local for local dev (apps/desktop/.env.local):
//   VITE_API_BASE_URL=http://localhost:3000
//   VITE_PHYSICAL_TRIGGER_SECRET=<same value as PHYSICAL_TRIGGER_SECRET in apps/web/.env.local>

interface DesktopEnv {
  apiBaseUrl: string;
  triggerSecret: string;
}

let cached: DesktopEnv | null = null;

export function getEnv(): DesktopEnv {
  if (cached) return cached;

  const apiBaseUrl =
    (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
    "http://localhost:3000";
  // Legacy header — required by the ESP32 bridge path and kept as a fallback
  // for the desktop while we migrate to per-device bearer tokens. Empty
  // string is acceptable now; the device token (Authorization: Bearer)
  // pasted in via Settings is the canonical auth.
  const triggerSecret =
    (import.meta.env["VITE_PHYSICAL_TRIGGER_SECRET"] as string | undefined) ?? "";

  cached = { apiBaseUrl, triggerSecret };
  return cached;
}
