import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { getDeviceToken } from "../auth/device-token";
import { getEnv } from "../env";

/**
 * Fetch a web studio API route through Tauri's native HTTP client.
 *
 * This avoids WKWebView CORS restrictions and applies the same device bearer
 * plus legacy trigger-secret fallback as the desktop API client.
 */
export async function studioFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const headers = new Headers(init.headers);
  headers.set("x-trigger-secret", triggerSecret);
  const token = await getDeviceToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const url = /^https?:\/\//i.test(path)
    ? path
    : `${apiBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  return tauriFetch(url, { ...init, headers });
}
