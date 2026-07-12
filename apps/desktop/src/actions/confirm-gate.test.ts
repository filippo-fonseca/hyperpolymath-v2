import { beforeEach, describe, expect, it, vi } from "vitest";

// The confirm gate reaches into Tauri, audio, and the WhatsApp bridge. Mock all
// side-effecting imports so the STATE MACHINE (hold → pending → confirm/cancel →
// resolution) is testable in plain Node. `fetch` resolves ok so a confirmed send
// "succeeds" without a real bridge.
const { speakNow } = vi.hoisted(() => ({ speakNow: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ recipient: "Rohan", jid: "rohan@s.whatsapp.net" }),
  })),
}));
vi.mock("@/audio/capture", () => ({ onTranscriptReceived: vi.fn() }));
vi.mock("@/physical-extender/sse-client", () => ({ onJarvisResponseStart: vi.fn() }));
vi.mock("@/actions/applescript", () => ({
  buildIMessageSend: vi.fn(() => "script"),
  runAppleScript: vi.fn(async () => undefined),
}));
vi.mock("@/actions/imessage-contacts", () => ({
  resolveImessageRecipient: vi.fn(async () => ({ kind: "passthrough", handle: "x" })),
}));
vi.mock("@/jarvis-response", () => ({ ttsPlayer: { speakNow } }));
vi.mock("@/settings", () => ({ loadSettings: vi.fn(async () => ({})) }));
vi.mock("@/hud/background-tasks", () => ({
  startTask: vi.fn(() => "task-1"),
  resolveTask: vi.fn(),
}));
vi.mock("@/api/client", () => ({ postWhatsappReceipt: vi.fn(async () => undefined) }));

import {
  cancelPendingSend,
  confirmPendingSend,
  hasPendingSend,
  holdSendMessage,
  onConfirmPendingChange,
  onConfirmResolved,
  type ConfirmResolution,
} from "./confirm-gate";
import type { SendMessageAction } from "./dispatcher";

function action(overrides: Partial<SendMessageAction> = {}): SendMessageAction {
  return {
    type: "send_message",
    app: "whatsapp",
    recipient: "Rohan",
    text: "hey there",
    requires_confirm: true,
    ...overrides,
  } as SendMessageAction;
}

describe("confirm gate — gesture confirm/cancel state machine", () => {
  beforeEach(() => {
    // Clear any pending left by a prior test so each starts clean.
    cancelPendingSend();
    speakNow.mockClear();
  });

  it("holding a send marks it pending and emits pending=true", () => {
    const pendings: boolean[] = [];
    const un = onConfirmPendingChange((p) => pendings.push(p));
    holdSendMessage(action());
    expect(hasPendingSend()).toBe(true);
    expect(pendings.at(-1)).toBe(true);
    un();
  });

  it("confirmPendingSend dispatches, clears pending, and resolves 'sent'", () => {
    const resolutions: ConfirmResolution[] = [];
    const un = onConfirmResolved((r) => resolutions.push(r));
    holdSendMessage(action({ text: "unique confirm body" }));
    const ok = confirmPendingSend();
    expect(ok).toBe(true);
    expect(hasPendingSend()).toBe(false);
    expect(resolutions).toEqual(["sent"]);
    un();
  });

  it("cancelPendingSend discards pending and resolves 'cancelled'", () => {
    const resolutions: ConfirmResolution[] = [];
    const un = onConfirmResolved((r) => resolutions.push(r));
    holdSendMessage(action({ text: "unique cancel body" }));
    const ok = cancelPendingSend();
    expect(ok).toBe(true);
    expect(hasPendingSend()).toBe(false);
    expect(resolutions).toEqual(["cancelled"]);
    un();
  });

  it("confirm/cancel are no-ops (return false) with nothing pending", () => {
    expect(hasPendingSend()).toBe(false);
    expect(confirmPendingSend()).toBe(false);
    expect(cancelPendingSend()).toBe(false);
  });

  it("a confirm after a cancel does nothing (pending already cleared)", () => {
    holdSendMessage(action({ text: "one then the other" }));
    expect(cancelPendingSend()).toBe(true);
    expect(confirmPendingSend()).toBe(false); // nothing left to confirm
  });
});
