// Transcript persistence on expo-file-system JSON — deliberately NOT
// SecureStore. v1 chunked the transcript into Keychain items on a 400ms
// debounce while streaming, which serialized dozens of Keychain writes per
// turn. Here: one JSON file, loaded once on mount, saved on a 1s debounce
// that only runs AFTER a turn completes — never during streaming.

import { File, Paths } from "expo-file-system";

import type { JarvisTurn } from "./types";

const TRANSCRIPT_FILE = "jarvis-transcript.json";
const MAX_TURNS = 60;
const SAVE_DEBOUNCE_MS = 1000;

function file(): File {
  return new File(Paths.document, TRANSCRIPT_FILE);
}

export async function loadTranscript(): Promise<JarvisTurn[]> {
  try {
    const f = file();
    if (!f.exists) return [];
    const raw = await f.text();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Streaming/pending states never resurrect across launches.
    return (parsed as JarvisTurn[]).map((t) =>
      t.role === "assistant" && (t.status === "streaming" || t.status === "pending")
        ? { ...t, status: "done" as const }
        : t,
    );
  } catch (err) {
    console.warn("[transcript] load failed", err);
    return [];
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: JarvisTurn[] | null = null;

/** Debounced save — call on turn end / action append, never per token. */
export function saveTranscript(turns: JarvisTurn[]): void {
  pending = turns.slice(-MAX_TURNS);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const snapshot = pending;
    pending = null;
    if (!snapshot) return;
    try {
      file().write(JSON.stringify(snapshot));
    } catch (err) {
      console.warn("[transcript] save failed", err);
    }
  }, SAVE_DEBOUNCE_MS);
}

export async function clearTranscript(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pending = null;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch (err) {
    console.warn("[transcript] clear failed", err);
  }
}
