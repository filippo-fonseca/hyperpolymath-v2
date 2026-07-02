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
 * Build the iMessage send script. The iMessage service is resolved
 * dynamically (`1st service whose service type = iMessage`) rather than by
 * account name; sending requires an existing conversation with the contact.
 * Both interpolated values are escaped — never inline raw user/LLM text.
 */
export function buildIMessageSend(recipient: string, text: string): string {
  const r = escapeAppleScript(recipient);
  const t = escapeAppleScript(text);
  return [
    'tell application "Messages"',
    "  set targetService to 1st service whose service type = iMessage",
    `  set targetParticipant to participant "${r}" of targetService`,
    `  send "${t}" to targetParticipant`,
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
