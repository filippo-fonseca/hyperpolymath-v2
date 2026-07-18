// apps/desktop/src/jarvis-response.ts
// Buffers streaming JARVIS response chunks per turnId and:
//   1. Emits a "response-complete" event once the response ends (for the
//      receipt panel in index.html).
//   2. Feeds text deltas through the sentence splitter and enqueues each
//      completed sentence to the TtsPlayer for desktop audio playback.
//
// Wired by main.ts to the SSE client listeners.

import {
  onJarvisAck,
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
  onJarvisToolCall,
} from "@/physical-extender/sse-client";
import { splitDeltas } from "@/audio/sentence-splitter";
import { TtsPlayer } from "@/audio/tts-player";

export interface ToolCallSummary {
  toolUseId: string;
  name: string;
  result: unknown;
}

export interface JarvisResponseComplete {
  turnId: string;
  text: string;
  toolCalls: ToolCallSummary[];
}

type ResponseCompleteListener = (response: JarvisResponseComplete) => void;
const responseCompleteListeners = new Set<ResponseCompleteListener>();

export function onJarvisResponseComplete(fn: ResponseCompleteListener): () => void {
  responseCompleteListeners.add(fn);
  return () => responseCompleteListeners.delete(fn);
}

interface TurnBuffer {
  text: string;
  toolCalls: ToolCallSummary[];
  ttsBuffer: string;
  ttsSeq: number;
}

const turnBuffers = new Map<string, TurnBuffer>();

// Module-level TtsPlayer singleton. main.ts controls enabled + voiceId.
export const ttsPlayer = new TtsPlayer();

export function startJarvisResponseListener(): void {
  onJarvisResponseStart(({ turnId }) => {
    // Do NOT reset any global TTS state here: turns can overlap (routine
    // opener + brief-gather, per-block fillers). The player is turn-aware and
    // owns per-turn seq bookkeeping via the turnId we pass on enqueue/endTurn.
    //
    // First-seen wins on duplicate response-start (e.g. reconnect/retry): the
    // TtsPlayer's turnOrder already treats first-seen as canonical, and the
    // buffer's ttsSeq must stay in lockstep with the player's per-turn nextSeq,
    // so re-seeding would enqueue seq 0,1,2 against a nextSeq that has moved
    // past them and permanently wedge the turn.
    if (turnBuffers.has(turnId)) return;
    turnBuffers.set(turnId, { text: "", toolCalls: [], ttsBuffer: "", ttsSeq: 0 });
  });

  // Spoken tool-latency ack. Enqueue it into the SAME turn's TTS queue at the
  // next seq so it plays BEFORE the answer (it arrives during the tool round,
  // before any answer sentence streams). Deliberately NOT appended to buf.text:
  // the transcript bubble + receipt panel stay clean — the ack is speech-only.
  // Get-or-create the buffer so an ack that races ahead of response-start still
  // lands; response-start's own handler is first-seen-wins, so it won't reset it.
  onJarvisAck(({ turnId, text }) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    let buf = turnBuffers.get(turnId);
    if (!buf) {
      buf = { text: "", toolCalls: [], ttsBuffer: "", ttsSeq: 0 };
      turnBuffers.set(turnId, buf);
    }
    ttsPlayer.enqueueSentence(turnId, cleaned, buf.ttsSeq++);
  });

  onJarvisResponseChunk(({ turnId, delta }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;
    buf.text += delta;

    // Feed delta through sentence splitter; enqueue each completed sentence.
    const { sentences, remainder } = splitDeltas(buf.ttsBuffer, delta);
    buf.ttsBuffer = remainder;
    for (const s of sentences) {
      const cleaned = s.trim();
      if (!cleaned) continue;
      ttsPlayer.enqueueSentence(turnId, cleaned, buf.ttsSeq++);
    }
  });

  onJarvisToolCall(({ turnId, toolUseId, name, result }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;
    buf.toolCalls.push({ toolUseId, name, result });
  });

  onJarvisResponseEnd(({ turnId }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;

    // Flush any unfinished tail sentence, then signal end-of-turn so the
    // player retires the turn once it drains and moves on to the next.
    if (buf.ttsBuffer.trim()) {
      ttsPlayer.enqueueSentence(turnId, buf.ttsBuffer.trim(), buf.ttsSeq++);
    }
    ttsPlayer.endTurn(turnId);

    turnBuffers.delete(turnId);
    const completed: JarvisResponseComplete = {
      turnId,
      text: buf.text,
      toolCalls: buf.toolCalls,
    };
    for (const fn of responseCompleteListeners) fn(completed);
  });
}
