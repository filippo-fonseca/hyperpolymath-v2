// apps/desktop/src/actions/dispatcher.ts
// Executes computer-control actions that arrive over the SSE `jarvis-tool-call`
// event. The backend agent decides WHAT to do and streams its spoken
// acknowledgement ("Right away, sir — opening {label}") as normal response
// text; this module just carries out the side effect on the desktop:
//
//   open_url        → default browser (opener plugin)
//   open_app        → `open -a <app>` (shell plugin), optional URL/path arg
//   send_message    → HELD by the confirm gate; AppleScript send on spoken yes
//   system_control  → Rust `system_control` (volume/brightness/sleep/focus)
//   type_text       → Rust `type_text` (enigo keystrokes)
//   press_key       → Rust `press_key` (enigo key + modifiers)
//   take_screenshot → Rust `take_screenshot` (+ POST to /screenshot/describe)
//   run_applescript → Rust `run_applescript` (osascript, 15s SIGKILL timeout)
//   run_shortcut    → Rust `run_shortcut` (Shortcuts.app CLI)
//   play_music      → AppleScript against Music/Spotify via run_applescript
//   computer_use    → multi-step Computer Use loop (actions/computer-use.ts)
//
// The action shapes are a FIXED CONTRACT with the backend executor
// (apps/web/lib/jarvis/executor.ts). We key strictly off `kind`.
// GOTCHA: Tauri v2 IPC camelCases snake_case Rust args (timeout_ms → timeoutMs).

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Command } from "@tauri-apps/plugin-shell";

import { buildPlayMusic, runAppleScript } from "@/actions/applescript";
import { runComputerUseLoop, type ComputerUseAction } from "@/actions/computer-use";
import { holdSendMessage } from "@/actions/confirm-gate";
import { bytesToBase64, downscalePngWithInfo } from "@/actions/png";
import { postScreenshotDescribe } from "@/api/client";

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

export interface SendMessageAction {
  kind: "send_message";
  /** Messaging channel — only "imessage" is emitted by the backend today. */
  app: string;
  recipient: string;
  text: string;
  /** Always true from the executor; the gate holds the send regardless. */
  requires_confirm: boolean;
}

export interface SystemControlAction {
  kind: "system_control";
  /** "volume" | "brightness" | "sleep" | "focus" (validated Rust-side). */
  action: string;
  /** number (volume/brightness 0-100) or string (focus shortcut name). */
  value?: string | number;
}

export interface TypeTextAction {
  kind: "type_text";
  text: string;
}

export interface PressKeyAction {
  kind: "press_key";
  key: string;
  /** Lowercase modifier names: "cmd" | "shift" | "alt" | "ctrl" … */
  modifiers: string[];
}

export interface TakeScreenshotAction {
  kind: "take_screenshot";
  /** true → POST the PNG to /api/jarvis/screenshot/describe (which speaks
   *  the description over SSE); false → save to a temp file and log it. */
  describe: boolean;
  /** Optional "x,y,w,h" region (passed straight to `screencapture -R`). */
  region?: string;
}

export interface RunApplescriptAction {
  kind: "run_applescript";
  label: string;
  script: string;
}

export interface RunShortcutAction {
  kind: "run_shortcut";
  name: string;
  input?: string;
}

export interface PlayMusicAction {
  kind: "play_music";
  app: "music" | "spotify";
  query?: string;
}

export type DesktopAction =
  | OpenUrlAction
  | OpenAppAction
  | SendMessageAction
  | SystemControlAction
  | TypeTextAction
  | PressKeyAction
  | TakeScreenshotAction
  | RunApplescriptAction
  | RunShortcutAction
  | PlayMusicAction
  | ComputerUseAction;

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

  if (kind === "send_message") {
    const recipient = obj["recipient"];
    const text = obj["text"];
    if (
      typeof recipient === "string" && recipient.length > 0 &&
      typeof text === "string" && text.length > 0
    ) {
      const app = typeof obj["app"] === "string" ? (obj["app"] as string) : "imessage";
      // Missing/false requires_confirm still goes through the gate — every
      // send_message is destructive; the flag is carried for contract fidelity.
      return {
        kind: "send_message",
        app,
        recipient,
        text,
        requires_confirm: obj["requires_confirm"] !== false,
      };
    }
    return null;
  }

  if (kind === "system_control") {
    const sysAction = obj["action"];
    if (typeof sysAction === "string" && sysAction.length > 0) {
      const rawValue = obj["value"];
      const value =
        typeof rawValue === "string" || typeof rawValue === "number" ? rawValue : undefined;
      return {
        kind: "system_control",
        action: sysAction,
        ...(value !== undefined ? { value } : {}),
      };
    }
    return null;
  }

  if (kind === "type_text") {
    const text = obj["text"];
    if (typeof text === "string" && text.length > 0) {
      return { kind: "type_text", text };
    }
    return null;
  }

  if (kind === "press_key") {
    const key = obj["key"];
    if (typeof key === "string" && key.length > 0) {
      const rawMods = obj["modifiers"];
      const modifiers = Array.isArray(rawMods)
        ? rawMods.filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase())
        : [];
      return { kind: "press_key", key, modifiers };
    }
    return null;
  }

  if (kind === "take_screenshot") {
    // describe defaults true (matches the executor's default).
    const describe = obj["describe"] !== false;
    const region = typeof obj["region"] === "string" ? (obj["region"] as string) : undefined;
    return { kind: "take_screenshot", describe, ...(region ? { region } : {}) };
  }

  if (kind === "run_applescript") {
    const script = obj["script"];
    if (typeof script === "string" && script.length > 0) {
      return { kind: "run_applescript", label: label || "applescript", script };
    }
    return null;
  }

  if (kind === "run_shortcut") {
    const name = obj["name"];
    if (typeof name === "string" && name.length > 0) {
      const input = typeof obj["input"] === "string" ? (obj["input"] as string) : undefined;
      return { kind: "run_shortcut", name, ...(input !== undefined ? { input } : {}) };
    }
    return null;
  }

  if (kind === "play_music") {
    const app = obj["app"] === "spotify" ? "spotify" : "music";
    const rawQuery = obj["query"];
    const query =
      typeof rawQuery === "string" && rawQuery.trim().length > 0 ? rawQuery.trim() : undefined;
    return { kind: "play_music", app, ...(query ? { query } : {}) };
  }

  if (kind === "computer_use") {
    const task = obj["task"];
    const sessionId = obj["session_id"];
    if (
      typeof task === "string" && task.length > 0 &&
      typeof sessionId === "string" && sessionId.length > 0
    ) {
      return { kind: "computer_use", task, session_id: sessionId };
    }
    return null;
  }

  return null;
}

/**
 * One-line human-readable summary of an action, for the HUD receipt footer.
 * open_url/open_app keep the historical "opening {label}" copy.
 */
export function describeAction(action: DesktopAction): string {
  switch (action.kind) {
    case "open_url":
    case "open_app":
      return `opening ${action.label || "…"}`;
    case "send_message":
      return `message to ${action.recipient} — awaiting confirmation`;
    case "system_control":
      return `system ${action.action}${action.value !== undefined ? ` → ${action.value}` : ""}`;
    case "type_text":
      return "typing text";
    case "press_key":
      return `pressing ${[...action.modifiers, action.key].join("+")}`;
    case "take_screenshot":
      return action.describe ? "describing your screen" : "taking a screenshot";
    case "run_applescript":
      return action.label;
    case "run_shortcut":
      return `shortcut "${action.name}"`;
    case "play_music":
      return action.query ? `playing ${action.query}` : "resuming music";
    case "computer_use":
      return `taking the controls: ${action.task}`;
  }
}

// The describe endpoint caps decoded PNGs at 8MB, and the vision model caps
// images at ~5MB — a full-screen Retina capture routinely exceeds both. Scale
// long-edge down to this before shipping; the description only needs to name
// the foreground app + the salient thing, not read 4-pt text.
const SCREENSHOT_MAX_DIM = 1920;

/** Downscale a PNG for the describe flow. Best-effort wrapper around the
 *  shared helper in png.ts: any failure returns the original bytes. */
async function downscalePng(png: Uint8Array, maxDim = SCREENSHOT_MAX_DIM): Promise<Uint8Array> {
  try {
    const down = await downscalePngWithInfo(png, maxDim);
    if (down.bytes !== png) {
      // eslint-disable-next-line no-console
      console.log(
        `[action] screenshot downscaled ${png.length} → ${down.bytes.length} bytes (${down.width}×${down.height})`,
      );
    }
    return down.bytes;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[action] screenshot downscale failed — sending original", err);
    return png;
  }
}

/**
 * take_screenshot flow. describe=true: capture → downscale → base64 → POST to
 * /api/jarvis/screenshot/describe fire-and-forget (the endpoint speaks the
 * description itself over the SSE bus — the desktop must NOT speak it too).
 * describe=false: capture straight to a temp file and log the path.
 */
async function handleTakeScreenshot(action: TakeScreenshotAction): Promise<boolean> {
  if (!action.describe) {
    const path = await invoke<string>("take_screenshot_to_file", {
      region: action.region ?? null,
    });
    // eslint-disable-next-line no-console
    console.log(`[action] take_screenshot saved → ${path}`);
    return true;
  }

  const bytes = await invoke<number[]>("take_screenshot", { region: action.region ?? null });
  const png = await downscalePng(new Uint8Array(bytes));
  const base64 = bytesToBase64(png);
  // eslint-disable-next-line no-console
  console.log(
    `[action] take_screenshot captured ${bytes.length} bytes — posting ${png.length} bytes for description`,
  );
  // Fire-and-forget with error logging — postScreenshotDescribe logs non-OK
  // statuses; the spoken description arrives over the normal SSE→TTS path.
  void postScreenshotDescribe(base64).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[action] screenshot describe POST failed", err);
  });
  return true;
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

    if (action.kind === "send_message") {
      // SAFETY-CRITICAL: never send on arrival. The confirm gate holds the
      // payload and releases it only on a spoken affirmative (or discards it
      // on a negative / when the continue window closes). See confirm-gate.ts.
      holdSendMessage(action);
      // eslint-disable-next-line no-console
      console.log(`[action] send_message to "${action.recipient}" routed to confirm gate`);
      return true;
    }

    if (action.kind === "system_control") {
      // Rust wants value: Option<String> — numbers (volume/brightness) are
      // stringified; it parses them back.
      const value = action.value !== undefined ? String(action.value) : null;
      const out = await invoke<string>("system_control", { action: action.action, value });
      // eslint-disable-next-line no-console
      console.log(`[action] system_control ${action.action} → ${out}`);
      return true;
    }

    if (action.kind === "type_text") {
      await invoke("type_text", { text: action.text });
      // eslint-disable-next-line no-console
      console.log(`[action] type_text (${action.text.length} chars)`);
      return true;
    }

    if (action.kind === "press_key") {
      await invoke("press_key", { key: action.key, modifiers: action.modifiers });
      // eslint-disable-next-line no-console
      console.log(`[action] press_key ${[...action.modifiers, action.key].join("+")}`);
      return true;
    }

    if (action.kind === "take_screenshot") {
      return await handleTakeScreenshot(action);
    }

    if (action.kind === "run_applescript") {
      const out = await runAppleScript(action.script, action.label);
      // eslint-disable-next-line no-console
      console.log(`[action] run_applescript "${action.label}" → ${out || "(no output)"}`);
      return true;
    }

    if (action.kind === "run_shortcut") {
      const out = await invoke<string>("run_shortcut", {
        name: action.name,
        input: action.input ?? null,
      });
      // eslint-disable-next-line no-console
      console.log(`[action] run_shortcut "${action.name}" → ${out || "(no output)"}`);
      return true;
    }

    if (action.kind === "play_music") {
      const { script, label } = buildPlayMusic(action.app, action.query);
      await runAppleScript(script, label);
      // eslint-disable-next-line no-console
      console.log(
        `[action] play_music ${action.app}${action.query ? ` "${action.query}"` : " (resume)"}`,
      );
      return true;
    }

    if (action.kind === "computer_use") {
      // Long-running (up to 15 model round-trips) — fire-and-forget so the
      // SSE handler isn't blocked. runComputerUseLoop never throws; it logs
      // everything and the SERVER narrates progress over SSE. Focus rule
      // applies here too: the loop never set_focus()es the HUD.
      void runComputerUseLoop(action);
      // eslint-disable-next-line no-console
      console.log(`[action] computer_use session ${action.session_id} started: "${action.task}"`);
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
