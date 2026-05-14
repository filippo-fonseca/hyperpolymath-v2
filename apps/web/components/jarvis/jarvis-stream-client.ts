/**
 * SSE client for POST /api/jarvis (Plan 05-02 server contract).
 *
 * Why not EventSource?
 *   EventSource only supports GET. Our route is POST (request body carries
 *   prompt + history + parsed dates + linked refs). Research §3.2 — use
 *   `fetch + ReadableStream + TextDecoderStream`.
 *
 * Invariants:
 *   - `X-Voice-Active: "false"` header pinned (Phase 5 always; Phase 7 flips).
 *   - AbortController plumbed through — client cancel → upstream Anthropic
 *     cancel (route handler honours req.signal).
 *   - Frame parsing tolerates SSE chunks split mid-frame (TextDecoderStream
 *     can return partial bytes; we buffer until `\n\n`).
 */

import type { ParsedDate, Priority } from "@hyperpolymath/jarvis-core";

export interface JarvisRequest {
  input: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  parsedDates?: ParsedDate[];
  /** Client-extracted priority hint (B5 fix). Server forwards to model so
   *  explicit "p1"/"p2"/"ptop" tokens are honoured even when adjacent to dates. */
  parsedPriority?: Priority;
  slashCommand?: "task" | "capture" | "event" | "help" | null;
  /** M5: client-validated project UUIDs from $project Mention chips. */
  linkedProjectIds?: string[];
  /** M6: client-extracted hashtag names (lowercased) from #hashtag chips + permissive text scan. */
  linkedHashtags?: string[];
}

export interface JarvisActionEvent {
  toolUseId: string;
  name: string;
  result: {
    ok: boolean;
    id?: string;
    receipt?: Record<string, unknown>;
    error?: string;
    kind?: string;
  };
}

export interface JarvisCallbacks {
  onText: (delta: string) => void;
  onAction: (data: JarvisActionEvent) => void;
  onDone: (usage: Record<string, number>) => void;
  onError: (message: string) => void;
}

export async function streamJarvis(
  payload: JarvisRequest,
  callbacks: JarvisCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/jarvis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Voice-Active": "false", // Phase 7 will toggle
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    callbacks.onError(e?.name === "AbortError" ? "aborted" : String(e?.message ?? err));
    return;
  }

  if (!response.ok || !response.body) {
    callbacks.onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf("\n\n");

        const eventName = chunk.match(/^event: (\w+)$/m)?.[1] ?? "";
        const dataRaw = chunk.match(/^data: (.+)$/m)?.[1] ?? "null";
        let data: unknown;
        try {
          data = JSON.parse(dataRaw);
        } catch {
          continue;
        }
        const obj = (data ?? {}) as Record<string, unknown>;
        if (eventName === "text") {
          callbacks.onText(typeof obj.delta === "string" ? obj.delta : "");
        } else if (eventName === "action") {
          callbacks.onAction(obj as unknown as JarvisActionEvent);
        } else if (eventName === "done") {
          callbacks.onDone(
            (obj.usage as Record<string, number>) ?? {},
          );
        } else if (eventName === "error") {
          callbacks.onError(
            typeof obj.message === "string" ? obj.message : "Unknown error",
          );
        }
      }
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name !== "AbortError") {
      callbacks.onError(String(e?.message ?? err));
    } else {
      callbacks.onError("aborted");
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader may already be closed — non-fatal.
    }
  }
}
