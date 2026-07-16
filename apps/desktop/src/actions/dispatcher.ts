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
import { startTask, resolveTask } from "@/hud/background-tasks";

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
  /** Messaging channel: 'imessage' (Messages.app via AppleScript) or 'whatsapp'
   *  (HTTP POST to the local lharries/whatsapp-mcp Go bridge). */
  app: "imessage" | "whatsapp";
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

/** One item inside an open_workspace list. Same {type,value,label?} shape as
 *  the startup sequencer's StartupOpenItem, plus an optional fullscreen flag. */
export interface WorkspaceItem {
  type: "url" | "app";
  value: string;
  label?: string;
  fullscreen?: boolean;
}

/** open_workspace: one tool call → a whole set of apps + URLs opened in
 *  parallel. Items with fullscreen:true get best-effort fullscreen after
 *  opening; failure of that step never aborts the other opens. */
export interface OpenWorkspaceAction {
  kind: "open_workspace";
  items: WorkspaceItem[];
}

export type DesktopAction =
  | OpenUrlAction
  | OpenAppAction
  | OpenWorkspaceAction
  | SendMessageAction
  | SystemControlAction
  | TypeTextAction
  | PressKeyAction
  | TakeScreenshotAction
  | RunApplescriptAction
  | RunShortcutAction
  | PlayMusicAction
  | ComputerUseAction;

/** Where an `open_url` action should be materialized. */
export type OpenUrlRoute = "widget" | "system";

/**
 * Decide whether an `open_url` should land in the in-app browser WIDGET or the
 * SYSTEM default browser. Pure — no side effects — so it can be exhaustively
 * unit-tested (the desktop's URL-leak fix lives here).
 *
 * Rules:
 *   - Non-http(s) schemes (mailto:, tel:, facetime:, custom app deep links…)
 *     always go to the system opener — the browser widget can only render web
 *     pages, and handing it a `mailto:` would just show a blank frame.
 *   - Malformed / scheme-less URLs also go to the system opener; `openUrl`
 *     tolerates them (and this preserves the historical behaviour) whereas the
 *     widget's <webview> would choke.
 *   - Everything else (a real http/https page) routes to the WIDGET whenever the
 *     Studio canvas is available. Only when Studio is unavailable do we fall
 *     back to the system browser. This removes the leak where "is England
 *     winning" launched the user's default browser instead of the HUD widget.
 */
export function routeOpenUrl(
  url: string,
  opts: { studioAvailable: boolean },
): OpenUrlRoute {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    // Not a parseable absolute URL — let the system opener deal with it.
    return "system";
  }
  if (scheme !== "http:" && scheme !== "https:") return "system";
  return opts.studioAvailable ? "widget" : "system";
}

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

  if (kind === "open_workspace") {
    const raw = obj["items"];
    if (!Array.isArray(raw)) return null;
    // Filter — silently dropping malformed rows lets one bad entry not kill
    // the whole block. If NOTHING survives, safe-default to null.
    const items: WorkspaceItem[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const t = e["type"];
      const v = e["value"];
      if ((t !== "url" && t !== "app") || typeof v !== "string" || v.length === 0) continue;
      const item: WorkspaceItem = { type: t, value: v };
      if (typeof e["label"] === "string" && (e["label"] as string).length > 0) {
        item.label = e["label"] as string;
      }
      if (e["fullscreen"] === true) item.fullscreen = true;
      items.push(item);
    }
    if (items.length === 0) return null;
    return { kind: "open_workspace", items };
  }

  if (kind === "send_message") {
    const recipient = obj["recipient"];
    const text = obj["text"];
    if (
      typeof recipient === "string" && recipient.length > 0 &&
      typeof text === "string" && text.length > 0
    ) {
      // Narrow app to the supported channels. Unknown values fall back to
      // imessage so bad payloads never accidentally route to whatsapp.
      const rawApp = typeof obj["app"] === "string" ? (obj["app"] as string) : "imessage";
      const app: "imessage" | "whatsapp" = rawApp === "whatsapp" ? "whatsapp" : "imessage";
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
    case "open_workspace":
      return "opening your workspace";
    case "send_message":
      return `${action.app === "whatsapp" ? "WhatsApp" : "iMessage"} to ${action.recipient} — awaiting confirmation`;
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
  // statuses; the spoken description arrives over the normal SSE→TTS path. A
  // HUD chip tracks the round-trip (the describe endpoint can take a few
  // seconds) and resolves inside this already-detached promise, so it never
  // makes the caller wait.
  const taskId = startTask({ kind: "take_screenshot", label: describeAction(action) });
  void postScreenshotDescribe(base64)
    .then(() => resolveTask(taskId, "done"))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[action] screenshot describe POST failed", err);
      resolveTask(taskId, "failed");
    });
  return true;
}

/**
 * Fire a flat list of open_url / open_app opens in parallel, fire-and-forget.
 * Shared between the startup sequencer's `openOnStart` step and the
 * `open_workspace` branch below so both walk the same code path — no drift.
 *
 * A per-item handleAction failure is logged and skipped; nothing is thrown so
 * one bad app name never aborts the rest of the list.
 */
export function fireOpenItems(
  items: ReadonlyArray<{ type: "url" | "app"; value: string; label?: string }>,
): void {
  for (const item of items) {
    const action: DesktopAction =
      item.type === "url"
        ? { kind: "open_url", url: item.value, label: item.label ?? item.value }
        : { kind: "open_app", app: item.value, label: item.label ?? item.value };
    void handleAction(action).then((ok) => {
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn(`[action] fireOpenItems: failed to open ${item.type} "${item.value}"`);
      }
    });
  }
}

// Wait for a freshly-opened app to settle before we send it the fullscreen
// keystroke. 1200ms is a guess that covers warm launches (Arc, WhatsApp);
// cold launches may still miss and land the keystroke on the wrong app. That
// is the best-effort contract of this block — a miss logs a warn, never
// aborts subsequent items.
const FULLSCREEN_SETTLE_MS = 1200;

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Open one item and then best-effort fullscreen it. Sequential — see the
 * caller for why. Each step is try/caught; a fullscreen failure only warns.
 */
async function openAndFullscreenOne(item: WorkspaceItem): Promise<void> {
  fireOpenItems([{ type: item.type, value: item.value, label: item.label }]);
  await new Promise((resolve) => setTimeout(resolve, FULLSCREEN_SETTLE_MS));

  // App items: explicitly `activate` the target so a parallel open that stole
  // frontmost between the open and this step gets re-fronted before the
  // keystroke. URL items rely on the default browser already being frontmost
  // (the opener call above activates it).
  //
  // key code 3 = "f" on the US layout; ctrl+cmd+F is the macOS "toggle
  // fullscreen" keystroke and works across every app that has a Window menu.
  const activate =
    item.type === "app"
      ? `tell application "${escapeAppleScriptString(item.value)}" to activate\n`
      : "";
  const script =
    activate +
    `delay 0.4\n` +
    `tell application "System Events" to key code 3 using {control down, command down}`;

  try {
    await runAppleScript(script, `fullscreen ${item.value}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[action] open_workspace: fullscreen failed for "${item.value}"`, err);
  }
}

/**
 * Sequential fullscreen chain. Parallel fullscreens race for the frontmost
 * keystroke, so we open+fullscreen each item one at a time. Runs detached
 * from handleAction (which returned true immediately) so the SSE stream and
 * the parallel plain opens are never blocked on this.
 */
async function openFullscreenItems(items: ReadonlyArray<WorkspaceItem>): Promise<void> {
  for (const item of items) {
    try {
      await openAndFullscreenOne(item);
    } catch (err) {
      // openAndFullscreenOne already catches — this belt is for the map/await
      // itself. Still: never abort the loop on one bad item.
      // eslint-disable-next-line no-console
      console.warn(`[action] open_workspace: item failed "${item.value}"`, err);
    }
  }
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

    if (action.kind === "open_workspace") {
      // Split the list: plain opens fire in parallel immediately; fullscreen
      // items go through a detached sequential chain so their frontmost
      // keystrokes don't race each other.
      const plain = action.items.filter((i) => !i.fullscreen);
      const fs = action.items.filter((i) => i.fullscreen === true);
      fireOpenItems(plain);
      if (fs.length > 0) {
        // The fullscreen chain is a slow detached sequence (per-item settle +
        // keystroke). Surface it as a HUD chip; it resolves inside the detached
        // promise, so nothing awaits it here. openFullscreenItems never throws.
        const wsTaskId = startTask({ kind: "open_workspace", label: describeAction(action) });
        void openFullscreenItems(fs)
          .then(() => resolveTask(wsTaskId, "done"))
          .catch(() => resolveTask(wsTaskId, "failed"));
      }
      // eslint-disable-next-line no-console
      console.log(
        `[action] open_workspace → ${action.items.length} item(s), ${fs.length} fullscreen`,
      );
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
      // applies here too: the loop never set_focus()es the HUD. A HUD chip
      // tracks the loop for its duration and resolves inside this detached
      // promise, so nothing awaits it here.
      const cuTaskId = startTask({ kind: "computer_use", label: describeAction(action) });
      void runComputerUseLoop(action)
        .then(() => resolveTask(cuTaskId, "done"))
        .catch(() => resolveTask(cuTaskId, "failed"));
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
