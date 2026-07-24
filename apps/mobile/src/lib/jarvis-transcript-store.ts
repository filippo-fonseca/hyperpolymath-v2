// Local JARVIS transcript persistence for Home.tsx.
//
// SecureStore can reject larger single values on some platforms, so mirror the
// Supabase session storage pattern and split the transcript JSON into chunks.

import * as SecureStore from "expo-secure-store";

import type { ClarificationState } from "../components/ClarificationCard";
import type { ReceiptAction } from "../components/JarvisReceipt";

export const JARVIS_TRANSCRIPT_KEY = "jarvis.mobile.transcript.v1";
export const MAX_JARVIS_TRANSCRIPT_TURNS = 40;

const CHUNK_SIZE = 1800;

export interface JarvisTranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: ReceiptAction[];
  done: boolean;
  clarification?: ClarificationState;
  cancelled?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceClarification(value: unknown): ClarificationState | undefined {
  if (!isRecord(value) || typeof value.question !== "string" || !Array.isArray(value.options)) {
    return undefined;
  }
  return {
    question: value.question,
    options: value.options.filter((option): option is string => typeof option === "string"),
    answered: value.answered === true,
  };
}

function coerceTurn(value: unknown): JarvisTranscriptTurn | null {
  if (!isRecord(value)) return null;
  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  if (!role || typeof value.id !== "string") return null;

  return {
    id: value.id,
    role,
    text: typeof value.text === "string" ? value.text : "",
    actions: Array.isArray(value.actions) ? (value.actions as ReceiptAction[]) : [],
    done: value.done === true,
    clarification: coerceClarification(value.clarification),
    cancelled: value.cancelled === true,
  };
}

async function secureSetChunked(key: string, value: string): Promise<void> {
  const previousCountRaw = await SecureStore.getItemAsync(`${key}.n`);
  const previousCount = Number(previousCountRaw);
  const chunks = Math.ceil(value.length / CHUNK_SIZE) || 1;

  await SecureStore.setItemAsync(`${key}.n`, String(chunks));
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(
      `${key}.${i}`,
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    );
  }
  if (Number.isFinite(previousCount) && previousCount > chunks) {
    for (let i = chunks; i < previousCount; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined);
    }
  }
}

async function secureGetChunked(key: string): Promise<string | null> {
  const chunkCountRaw = await SecureStore.getItemAsync(`${key}.n`);
  if (!chunkCountRaw) {
    return SecureStore.getItemAsync(key);
  }

  const chunkCount = Number(chunkCountRaw);
  if (!Number.isFinite(chunkCount) || chunkCount < 1) return null;

  let out = "";
  for (let i = 0; i < chunkCount; i++) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    if (part == null) return null;
    out += part;
  }
  return out;
}

export async function loadJarvisTranscript(): Promise<JarvisTranscriptTurn[]> {
  try {
    const raw = await secureGetChunked(JARVIS_TRANSCRIPT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceTurn).filter((t): t is JarvisTranscriptTurn => Boolean(t)).slice(
      -MAX_JARVIS_TRANSCRIPT_TURNS,
    );
  } catch (err) {
    console.warn("[jarvis-transcript] load failed", err);
    return [];
  }
}

export async function saveJarvisTranscript(turns: JarvisTranscriptTurn[]): Promise<void> {
  try {
    const capped = turns.slice(-MAX_JARVIS_TRANSCRIPT_TURNS);
    await secureSetChunked(JARVIS_TRANSCRIPT_KEY, JSON.stringify(capped));
  } catch (err) {
    console.warn("[jarvis-transcript] save failed", err);
  }
}
