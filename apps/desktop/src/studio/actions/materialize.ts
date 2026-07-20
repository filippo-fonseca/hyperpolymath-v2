import { onJarvisToolCall } from "@/physical-extender/sse-client";
import {
  onTasksChange,
  type BackgroundTask,
} from "@/hud/background-tasks";

import { openBrowserUrl } from "./browser-router";
import { summonWidget } from "../state/widget-windows";
import { WIDGET_CATALOG } from "../windows/catalog";

interface ToolCallPayload {
  toolUseId: string;
  name: string;
  result: unknown;
  /** Present on live SSE payloads; used for per-turn browser-URL dedupe. */
  turnId?: string;
}

interface PendingWhatsappSend {
  toolUseId: string;
  recipient: string;
  text: string;
  taskId?: string;
}

const pendingWhatsappSends: PendingWhatsappSend[] = [];
const completedTaskIds = new Set<string>();
let started = false;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function validHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function summon(kind: "browser" | "card", props: Record<string, unknown>): void {
  const entry = WIDGET_CATALOG[kind];
  summonWidget(kind, props, undefined, {
    singleton: entry.singleton,
  });
}

function shortAnswer(result: Record<string, unknown>): string | null {
  const receipt = record(result.receipt);
  const candidate = receipt?.answer ?? receipt?.summary ?? result.answer;
  return typeof candidate === "string" && candidate.trim().length <= 500
    ? candidate.trim()
    : null;
}

export function materializeToolCall(payload: ToolCallPayload): void {
  const result = record(payload.result);
  if (!result || result.ok === false) return;
  const action = record(result.action);

  if (action?.kind === "send_message" && action.app === "whatsapp") {
    if (
      typeof action.recipient === "string" &&
      typeof action.text === "string"
    ) {
      pendingWhatsappSends.push({
        toolUseId: payload.toolUseId,
        recipient: action.recipient,
        text: action.text,
      });
    }
    return;
  }

  const url = validHttpUrl(action?.url) ?? validHttpUrl(record(result.receipt)?.url);
  if (url) {
    // Deduped per turn: if a studio-action (or the open_url dispatcher path)
    // already opened this exact page this turn, this is a no-op.
    openBrowserUrl(url, payload.turnId);
    return;
  }

  const answer = shortAnswer(result);
  if (answer) {
    summon("card", { title: "JARVIS", body: answer });
  }
}

export function materializeTaskSnapshot(tasks: BackgroundTask[]): void {
  for (const task of tasks) {
    if (task.kind !== "send_message" || !task.label.startsWith("WhatsApp to ")) {
      continue;
    }
    const recipient = task.label.slice("WhatsApp to ".length).trim().toLowerCase();
    const pending = pendingWhatsappSends.find(
      (item) =>
        (item.taskId === undefined || item.taskId === task.id) &&
        item.recipient.trim().toLowerCase() === recipient,
    );
    if (!pending) continue;
    pending.taskId = task.id;

    if (task.status !== "done" || completedTaskIds.has(task.id)) continue;
    completedTaskIds.add(task.id);
    summon("card", {
      title: `WhatsApp · Sent to ${pending.recipient}`,
      body: pending.text,
    });
    const index = pendingWhatsappSends.indexOf(pending);
    if (index >= 0) pendingWhatsappSends.splice(index, 1);
  }
}

export function startMaterialization(): void {
  if (started) return;
  started = true;
  onJarvisToolCall(materializeToolCall);
  onTasksChange(materializeTaskSnapshot);
}

export function __resetMaterialization(): void {
  pendingWhatsappSends.length = 0;
  completedTaskIds.clear();
  started = false;
}
