// apps/desktop/src/actions/dispatcher.ts
// Executes computer-control actions that arrive over the SSE `jarvis-tool-call`
// event. The backend agent decides WHAT to do and streams its spoken
// acknowledgement ("Right away, sir — opening {label}") as normal response
// text; this module just carries out the side effect on the desktop:
//
//   open_url → open a URL in the user's default browser (opener plugin)
//   open_app → launch a macOS app by name via `open -a <app>` (shell plugin),
//              optionally with a URL/path argument
//
// The action shape is a FIXED CONTRACT with the parallel backend agent:
//   { kind: "open_url", url, label } | { kind: "open_app", app, label }
// We key strictly off `kind`.

import { openUrl } from "@tauri-apps/plugin-opener";
import { Command } from "@tauri-apps/plugin-shell";

export interface OpenUrlAction {
  kind: "open_url";
  url: string;
  label: string;
}

export interface OpenAppAction {
  kind: "open_app";
  app: string;
  label: string;
  /** Optional URL/path to hand to the app (e.g. a deep link). */
  url?: string;
}

export type DesktopAction = OpenUrlAction | OpenAppAction;

/**
 * Narrow an untrusted SSE payload into a DesktopAction. Returns null when the
 * payload doesn't match the fixed contract — the caller then does nothing,
 * which is the safe default for an unrecognized action.
 */
export function parseAction(value: unknown): DesktopAction | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const kind = obj["kind"];
  const label = typeof obj["label"] === "string" ? obj["label"] : "";

  if (kind === "open_url") {
    const url = obj["url"];
    if (typeof url === "string" && url.length > 0) {
      return { kind: "open_url", url, label };
    }
    return null;
  }

  if (kind === "open_app") {
    const app = obj["app"];
    if (typeof app === "string" && app.length > 0) {
      const url = typeof obj["url"] === "string" ? (obj["url"] as string) : undefined;
      return { kind: "open_app", app, label, url };
    }
    return null;
  }

  return null;
}

/**
 * Execute a desktop action. Best-effort: failures are logged, not thrown, so a
 * bad action never breaks the response stream. Returns true when the action was
 * dispatched, false otherwise.
 */
export async function handleAction(action: DesktopAction): Promise<boolean> {
  try {
    // FOCUS RULE (RESEARCH Q4, critical): opening a URL/app foregrounds the
    // target app (macOS `open`/opener calls activate it). We deliberately do
    // NOT call any window.set_focus() on the HUD here — the HUD is alwaysOnTop
    // + Accessory, so it floats above visually without stealing key focus. Let
    // the opened app own key focus. Do NOT reintroduce a focus call in this path.
    if (action.kind === "open_url") {
      await openUrl(action.url);
      // eslint-disable-next-line no-console
      console.log(`[action] open_url → ${action.url}`);
      return true;
    }

    // open_app → `open -a <App> [<url|path>]`. Two distinct capability shapes
    // are allowlisted (capabilities/default.json): `open-app` for the 2-arg
    // launch-by-name case, `open-app-url` for the optional 3-arg deep-link
    // case. Using the matching command name is what makes launching an app by
    // name (e.g. "open Spotify") pass the scoped allowlist.
    const [scopeName, args] = action.url
      ? (["open-app-url", ["-a", action.app, action.url]] as const)
      : (["open-app", ["-a", action.app]] as const);
    const cmd = Command.create(scopeName, [...args]);
    const output = await cmd.execute();
    if (output.code !== 0) {
      // eslint-disable-next-line no-console
      console.warn(`[action] open_app "${action.app}" exited ${output.code}: ${output.stderr}`);
      return false;
    }
    // eslint-disable-next-line no-console
    console.log(`[action] open_app → ${action.app}${action.url ? ` (${action.url})` : ""}`);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[action] dispatch failed", err);
    return false;
  }
}
