/**
 * Dev-only auto sign-in. When Expo is running a dev build and
 * EXPO_PUBLIC_DEV_DEVICE_TOKEN is set (apps/mobile/.env.local, gitignored),
 * adopt it as the device token so the simulator skips Google OAuth entirely.
 * Production builds compile this to a no-op (__DEV__ is false and the env
 * var is never set in CI).
 */

import { resolveServerUrl } from "./server";
import { getDeviceToken, setDeviceToken } from "./settings";

export async function maybeDevAutoSignIn(): Promise<boolean> {
  if (!__DEV__) return false;
  const token = process.env.EXPO_PUBLIC_DEV_DEVICE_TOKEN;
  if (!token) return false;
  // Point the API client at the local web server before any calls fire.
  await resolveServerUrl();
  if (!getDeviceToken()) await setDeviceToken(token);
  return true;
}
