// apps/desktop/src/jarvis-response.ts
// Buffers streaming JARVIS response chunks per turnId and emits a
// "response-complete" event once the response ends.
//
// Wired by main.ts to the SSE client listeners. The receipt panel in
// index.html subscribes via onJarvisResponseComplete to render the final
// response text and tool-call summaries.

import {
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
  onJarvisToolCall,
} from "@/physical-extender/sse-client";

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
}

const turnBuffers = new Map<string, TurnBuffer>();

export function startJarvisResponseListener(): void {
  onJarvisResponseStart(({ turnId }) => {
    turnBuffers.set(turnId, { text: "", toolCalls: [] });
  });

  onJarvisResponseChunk(({ turnId, delta }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;
    buf.text += delta;
  });

  onJarvisToolCall(({ turnId, toolUseId, name, result }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;
    buf.toolCalls.push({ toolUseId, name, result });
  });

  onJarvisResponseEnd(({ turnId }) => {
    const buf = turnBuffers.get(turnId);
    if (!buf) return;
    turnBuffers.delete(turnId);
    const completed: JarvisResponseComplete = {
      turnId,
      text: buf.text,
      toolCalls: buf.toolCalls,
    };
    for (const fn of responseCompleteListeners) fn(completed);
  });
}
