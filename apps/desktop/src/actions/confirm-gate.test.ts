import { beforeEach, describe, expect, it, vi } from "vitest";

// The confirm gate reaches into Tauri, audio, and the WhatsApp bridge. Mock all
// side-effecting imports so the STATE MACHINE (hold → pending → confirm/cancel →
// resolution) is testable in plain Node. `fetch` resolves ok so a confirmed send
// "succeeds" without a real bridge.
const { speakNow, onTranscriptReceived, transcriptListeners } = vi.hoisted(() => {
  const listeners: Array<(text: string) => void> = [];
  return {
    speakNow: vi.fn(),
    transcriptListeners: listeners,
    onTranscriptReceived: vi.fn((fn: (text: string) => void) => {
      listeners.push(fn);
      return () => {};
    }),
  };
});
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ recipient: "Rohan", jid: "rohan@s.whatsapp.net" }),
  })),
}));
vi.mock("@/audio/capture", () => ({ onTranscriptReceived }));
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
  startConfirmGate,
  type ConfirmResolution,
} from "./confirm-gate";
import type { SendMessageAction } from "./dispatcher";

/** Feed a transcript to the confirm gate exactly as the capture pipeline
 *  would (via the mocked onTranscriptReceived subscription armed by
 *  startConfirmGate()). startConfirmGate is idempotent (guarded by a
 *  module-level `started` flag), so calling it repeatedly across tests is
 *  safe and only the first call actually registers the listener. */
function emitTranscript(text: string): void {
  startConfirmGate();
  for (const fn of transcriptListeners) fn(text);
}

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

describe("confirm gate — spoken transcript resolution", () => {
  beforeEach(() => {
    cancelPendingSend();
    speakNow.mockClear();
    // NOTE: do NOT clear transcriptListeners here — startConfirmGate() is
    // guarded by a module-level `started` flag (armed once, by whichever test
    // runs first), so its onTranscriptReceived registration only ever fires
    // once per test run. Clearing the array would silently orphan every test
    // after the first. emitTranscript() itself re-arms startConfirmGate(),
    // which is an idempotent no-op after the first call.
  });

  it.each(["yes", "yeah", "go ahead", "do it", "yep", "sure", "okay"])(
    "affirmative %j resolves the pending send as 'sent'",
    (word) => {
      const resolutions: ConfirmResolution[] = [];
      const un = onConfirmResolved((r) => resolutions.push(r));
      holdSendMessage(action({ text: `affirmed by ${word}` }));
      emitTranscript(word);
      expect(hasPendingSend()).toBe(false);
      expect(resolutions).toEqual(["sent"]);
      un();
    },
  );

  it("a negative ('no' / 'cancel') discards the pending as 'cancelled'", () => {
    const resolutions: ConfirmResolution[] = [];
    const un = onConfirmResolved((r) => resolutions.push(r));
    holdSendMessage(action({ text: "declined body" }));
    emitTranscript("no, cancel that");
    expect(hasPendingSend()).toBe(false);
    expect(resolutions).toEqual(["cancelled"]);
    un();
  });

  it("an unrelated turn (neither yes nor no) cancels the pending instead of swallowing it", () => {
    const resolutions: ConfirmResolution[] = [];
    const un = onConfirmResolved((r) => resolutions.push(r));
    holdSendMessage(action({ text: "unrelated-turn body" }));
    expect(hasPendingSend()).toBe(true);

    // A completely unrelated follow-up ("what's on my calendar today?") must
    // NOT be eaten by the gate — it should drop the stale pending so the new
    // turn proceeds normally, rather than leaving the amber confirm ring (and
    // the app) looking stuck until the TTL backstop finally fires minutes later.
    emitTranscript("what's on my calendar today?");
    expect(hasPendingSend()).toBe(false);
    expect(resolutions).toEqual(["cancelled"]);
    un();
  });

  it("TTL auto-cancels an unanswered pending after 45s and speaks a note", () => {
    vi.useFakeTimers();
    try {
      const resolutions: ConfirmResolution[] = [];
      const un = onConfirmResolved((r) => resolutions.push(r));
      holdSendMessage(action({ text: "ttl body" }));
      expect(hasPendingSend()).toBe(true);

      vi.advanceTimersByTime(44_000);
      expect(hasPendingSend()).toBe(true); // not yet — still inside the window

      vi.advanceTimersByTime(2_000); // crosses the 45s mark
      expect(hasPendingSend()).toBe(false);
      expect(resolutions).toEqual(["expired"]);
      expect(speakNow).toHaveBeenCalledWith("No confirmation, sir — cancelled.");
      un();
    } finally {
      vi.useRealTimers();
    }
  });
});
