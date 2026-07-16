// apps/desktop/src/actions/applescript.ts
// AppleScript plumbing for the computer-control dispatcher: string escaping
// (injection safety — message bodies and recipients are user/LLM-controlled),
// script builders for iMessage + music playback, and a thin typed wrapper
// around the Rust `run_applescript` command.

import { invoke } from "@tauri-apps/api/core";

/**
 * Escape a value for interpolation inside an AppleScript double-quoted string
 * literal. Backslashes FIRST, then double quotes — the reverse order would
 * re-escape the escapes. AppleScript string literals only treat `\` and `"`
 * specially, so this closes the injection hole for LLM-controlled text.
 */
export function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Run an AppleScript via the Rust `run_applescript` command (osascript with a
 * hard SIGKILL timeout). GOTCHA: Tauri v2 IPC camelCases snake_case Rust args,
 * so `timeout_ms` must be invoked as `timeoutMs`.
 */
export async function runAppleScript(
  script: string,
  label: string,
  timeoutMs?: number,
): Promise<string> {
  return invoke<string>("run_applescript", {
    script,
    label,
    timeoutMs: timeoutMs ?? null,
  });
}

/**
 * Run a JXA (JavaScript for Automation) script via the Rust `run_jxa` command
 * (osascript -l JavaScript with the same hard SIGKILL timeout as
 * run_applescript). JXA is required for Contacts.app queries: it launches
 * Contacts in the background and works when it isn't open, unlike AppleScript
 * `tell application "Contacts"` which returns -600 "Application isn't running".
 * GOTCHA: Tauri v2 IPC camelCases snake_case Rust args, so `timeout_ms` must be
 * invoked as `timeoutMs`.
 */
export async function runJxa(
  script: string,
  label: string,
  timeoutMs?: number,
): Promise<string> {
  return invoke<string>("run_jxa", {
    script,
    label,
    timeoutMs: timeoutMs ?? null,
  });
}

/**
 * Detect whether the recipient string is a Messages.app chat id (a group chat or
 * a chat referenced by GUID) rather than a single participant handle. Two shapes
 * are recognized, both exposed by Messages.app for `text chat id`:
 *   1. Service-prefixed: `iMessage;+;chat<hex>` or `SMS;-;chat<hex>` — the form
 *      you see when scripting existing chats (service prefix, sign, chat guid).
 *   2. Bare `chat<hex-or-digits>` — the form that sometimes appears in exported
 *      dumps and older AppleScript recipes.
 * Anything else (phone number, email, contact handle) stays on the participant
 * path, so the common single-recipient send cannot regress.
 */
function isChatId(recipient: string): boolean {
  return (
    /^(iMessage|SMS);[+-];chat/i.test(recipient) ||
    /^chat[0-9A-F-]{6,}$/i.test(recipient)
  );
}

/**
 * Build the iMessage send script. Two branches, both with escaped interpolation:
 *   - **Chat-id recipient** (group or 1:1 chat by GUID): send to `text chat id`.
 *     No service fallback — the chat id already encodes iMessage vs. SMS.
 *   - **Participant recipient** (phone / email / handle, the common path): try
 *     the iMessage service first, and on error fall back to the SMS service so
 *     green-bubble contacts still receive the message. The healthy iMessage
 *     path runs the same `send` it always did; the fallback only fires when the
 *     iMessage attempt raises.
 */
export function buildIMessageSend(recipient: string, text: string): string {
  const r = escapeAppleScript(recipient);
  const t = escapeAppleScript(text);
  if (isChatId(recipient)) {
    return [
      'tell application "Messages"',
      `  set targetChat to text chat id "${r}"`,
      `  send "${t}" to targetChat`,
      "end tell",
    ].join("\n");
  }
  return [
    'tell application "Messages"',
    "  try",
    "    set targetService to 1st service whose service type = iMessage",
    `    send "${t}" to participant "${r}" of targetService`,
    "  on error",
    "    set smsService to 1st service whose service type = SMS",
    `    send "${t}" to participant "${r}" of smsService`,
    "  end try",
    "end tell",
  ].join("\n");
}

/**
 * Build the play_music script.
 *   - Apple Music + query: play the playlist by name; if no playlist matches,
 *     fall back to the first library track whose name contains the query.
 *   - Spotify + query: Spotify's AppleScript dictionary can only play a URI
 *     (`play track "spotify:track:…"`), not search by name — a non-URI query
 *     logs a warning and falls back to resuming playback.
 *   - No query: plain `play` (resume) on either app.
 */
export function buildPlayMusic(
  app: "music" | "spotify",
  query?: string,
): { script: string; label: string } {
  if (app === "spotify") {
    if (query && query.startsWith("spotify:")) {
      const uri = escapeAppleScript(query);
      return {
        script: `tell application "Spotify" to play track "${uri}"`,
        label: "spotify-play-uri",
      };
    }
    if (query) {
      // eslint-disable-next-line no-console
      console.warn(
        `[music] Spotify can only play URIs via AppleScript — got "${query}"; resuming playback instead`,
      );
    }
    return {
      script: 'tell application "Spotify" to play',
      label: "spotify-play",
    };
  }

  if (query) {
    const q = escapeAppleScript(query);
    return {
      script: [
        'tell application "Music"',
        "  try",
        `    play playlist "${q}"`,
        "  on error",
        `    play (first track of library playlist 1 whose name contains "${q}")`,
        "  end try",
        "end tell",
      ].join("\n"),
      label: "music-play-query",
    };
  }
  return { script: 'tell application "Music" to play', label: "music-play" };
}
