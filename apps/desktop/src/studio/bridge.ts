import { getCurrentWindow } from "@tauri-apps/api/window";

import { onWhatsappSendConfirmed } from "@/actions/confirm-gate";
import { onTranscriptReceived } from "@/audio/capture";
import {
  getJarvisState,
  onJarvisState,
  startConversation,
  type JarvisState,
} from "@/conversation/state-machine";
import {
  onJarvisResponseChunk,
  onJarvisResponseEnd,
  onJarvisResponseStart,
  onJarvisToolCall,
  onPhysicalTranscript,
  onStudioAction,
} from "@/physical-extender/sse-client";
import {
  markStudioAvailable,
  wireStudioWebviewPopups,
} from "@studio/actions/browser-router";
import { routeStudioAction } from "@studio/actions/studio-action-router";
import { startMaterialization } from "@studio/actions/materialize";

export interface StudioTranscriptEvent {
  text: string;
  source: "sse" | "capture";
  sttDoneAt?: number;
  vadEndAt?: number;
  at?: number;
}

export type StudioResponseEvent =
  | { phase: "start"; turnId: string; at: number }
  | { phase: "chunk"; turnId: string; delta: string; at: number }
  | { phase: "end"; turnId: string; at: number };

export interface StudioToolCallEvent {
  turnId: string;
  toolUseId: string;
  name: string;
  result: unknown;
  at: number;
}

export interface StudioBridgeEvents {
  jarvisState: JarvisState;
  transcript: StudioTranscriptEvent;
  response: StudioResponseEvent;
  toolCall: StudioToolCallEvent;
}

type StudioEventName = keyof StudioBridgeEvents;
type StudioListener<K extends StudioEventName> = (payload: StudioBridgeEvents[K]) => void;

const listeners: { [K in StudioEventName]: Set<StudioListener<K>> } = {
  jarvisState: new Set(),
  transcript: new Set(),
  response: new Set(),
  toolCall: new Set(),
};

function emit<K extends StudioEventName>(event: K, payload: StudioBridgeEvents[K]): void {
  for (const listener of listeners[event]) listener(payload);
}

function on<K extends StudioEventName>(event: K, listener: StudioListener<K>): () => void {
  listeners[event].add(listener);
  return () => listeners[event].delete(listener);
}

let started = false;

/** Subscribe the React-facing bridge to the existing framework-free event seams. */
export function startStudioBridge(): void {
  if (started) return;
  started = true;

  // Studio is mounted → open_url can route into the browser widget instead of
  // the system browser (dispatcher's routeOpenUrl gates on this).
  markStudioAvailable();

  // Contain child-webview popups: a page inside a promoted browser widget that
  // calls window.open() emits studio://webview-popup from Rust; route the URL
  // into a NEW managed browser widget instead of an unmanaged OS window.
  wireStudioWebviewPopups();

  onJarvisState((state) => emit("jarvisState", state));
  onPhysicalTranscript((payload) => {
    emit("transcript", {
      text: payload.transcript,
      source: "sse",
      sttDoneAt: payload.sttDoneAt,
      vadEndAt: payload.vadEndAt,
      at: payload.at,
    });
  });
  onTranscriptReceived((text, sttDoneAt) => {
    emit("transcript", { text, source: "capture", sttDoneAt });
  });
  onJarvisResponseStart((payload) => {
    emit("response", { phase: "start", turnId: payload.turnId, at: payload.at });
  });
  onJarvisResponseChunk((payload) => {
    emit("response", {
      phase: "chunk",
      turnId: payload.turnId,
      delta: payload.delta,
      at: payload.at,
    });
  });
  onJarvisResponseEnd((payload) => {
    emit("response", { phase: "end", turnId: payload.turnId, at: payload.at });
  });
  onJarvisToolCall((payload) => emit("toolCall", payload));
  onStudioAction(routeStudioAction);
  // After a confirmed WhatsApp send, summon/navigate the WhatsApp widget to that
  // chat and pulse-highlight the just-sent message. Routed through the SAME
  // studio-action router as server-emitted opens; the focus props travel as an
  // `open` action so an already-open singleton is re-navigated (the router
  // pushes props onto the live instance). Requires the bridge's resolved jid —
  // without it we can't address the chat, so we skip navigation silently.
  onWhatsappSendConfirmed((payload) => {
    if (!payload.jid) return;
    routeStudioAction({
      action: "open",
      kind: "whatsapp",
      props: {
        focusChatJid: payload.jid,
        focusChatName: payload.recipient,
        focusMessageBody: payload.text,
        focusAt: Date.now(),
      },
    });
  });
  startMaterialization();
}

export const studioBridge = {
  on,
  getJarvisState,
  triggerPushToTalk: startConversation,
  async toggleFullscreen(): Promise<void> {
    const window = getCurrentWindow();
    await window.setFullscreen(!(await window.isFullscreen()));
  },
} as const;
