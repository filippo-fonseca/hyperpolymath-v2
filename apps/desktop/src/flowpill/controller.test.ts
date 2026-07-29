/**
 * controller.test.ts — the end-to-end proof, headless.
 *
 * Every unit in this feature was verified in isolation. This is the test that
 * runs the whole chain in one process:
 *
 *   a synthetic Option gesture
 *     → the real pill store and reducer (u1)
 *       → the real capture session, level meter and silence gate (u2), fed by a
 *         synthetic PCM source through u2's own `PcmSource` seam
 *         → a stubbed speech-to-text result
 *           → the real `send.ts`, against a mocked fetch
 *
 * Only three things are stubbed, and all three are the native seams that cannot
 * exist in a Node process: the microphone, the transcription response, and the
 * network. The gesture decoding, the state machine, the effect performance, the
 * cancel path, the empty guard and the exact bytes of the POST are all real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  armPreroll,
  disarmPreroll,
  resetFlowpillAudio,
  startCapture,
  type CaptureOptions,
} from "./audio";
import {
  FLOWPILL_CANCEL,
  FLOWPILL_HUD_MIC,
  FLOWPILL_MIC_PREEMPT,
  FLOWPILL_SESSION,
} from "./channel";
import {
  attachFlowPillController,
  MIC_DENIED_COPY,
  silentInputCopy,
  type FlowPillController,
  type OptionTapEvent,
} from "./controller";
import { NOTHING_HEARD } from "./machine";
import { AUDIO_INPUT_SILENT } from "./tauri-bridge";
import { createLevelBus } from "./level-bus";
import { MIC_BUSY_COPY, type EventBridge } from "./mic-arbiter";
import { NOT_PAIRED, SEND_FAILED, sendFlowpillText, type SendFetch } from "./send";
import { createFlowPillStore } from "./store";
import { makeFakeSource, tonePcm, silentPcm, type FakeSource } from "./audio/test-fixtures";
import type { FlowPillStatus } from "./types";

// The native microphone reaches into Tauri, which has no backend here. Every
// test injects its own source, so this only has to keep the import graph clean.
vi.mock("./audio/source", () => ({
  createTauriPcmSource: () => {
    throw new Error("the native source must not be constructed in tests");
  },
  MicBusyError: class MicBusyError extends Error {},
}));

// ─── A test double for the Tauri event system ───────────────────────────────

interface FakeBridge extends EventBridge {
  /** Everything the pill emitted, in order. */
  sent: Array<{ event: string; payload: unknown }>;
  /** Deliver an event to the pill as if it came from the HUD window. */
  deliver(event: string, payload?: unknown): void;
  /** The payloads the pill emitted on one channel. */
  payloads(event: string): unknown[];
}

function makeBridge(): FakeBridge {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const sent: Array<{ event: string; payload: unknown }> = [];

  const deliver = (event: string, payload?: unknown): void => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(payload);
  };

  return {
    sent,
    deliver,
    payloads: (event) => sent.filter((e) => e.event === event).map((e) => e.payload),
    async emit(event, payload) {
      sent.push({ event, payload });
    },
    async listen<T>(event: string, handler: (payload: T) => void) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      const fn = (payload: unknown): void => handler(payload as T);
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
  };
}

// ─── The rig ────────────────────────────────────────────────────────────────

const TOKEN = "hpd_test_token";
const BASE_URL = "http://localhost:3000";
const SECRET = "trigger-secret";

interface Posted {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

interface Rig {
  controller: FlowPillController;
  bridge: FakeBridge;
  mic: FakeSource;
  /** Every POST that reached the network stub. */
  posted: Posted[];
  /** The status the pill passed through, in order, first to last. */
  statuses: FlowPillStatus[];
  status(): FlowPillStatus;
  /** The line the pill is showing, when it is in `error`. */
  error(): string | null;
  /** Levels that reached the waveform. */
  levels: number[];
  shows: number;
  hides: number;
  gesture(kind: OptionTapEvent["kind"]): void;
  /** Deliver a chunk of speech to the open microphone. */
  speak(samples?: number): void;
  settle(): Promise<void>;
  teardown(): Promise<void>;
}

interface RigOptions {
  /** What the stubbed speech-to-text returns. Defaults to a usable transcript. */
  transcript?: string;
  /** Make the transcription itself fail. */
  sttFails?: boolean;
  /** Make the network stub reject, or answer with a status. */
  network?: "ok" | "throw" | number;
  /** Withhold the device bearer, as an unpaired desktop would. */
  paired?: boolean;
  /** Start with the HUD holding the microphone. */
  hudRecording?: boolean;
  /** Reverse the sealed preemption decision, for the flag's own test. */
  preempt?: boolean;
}

async function rig(options: RigOptions = {}): Promise<Rig> {
  const bridge = makeBridge();
  const mic = makeFakeSource();
  const posted: Posted[] = [];
  const statuses: FlowPillStatus[] = [];
  const levels: number[] = [];
  let shows = 0;
  let hides = 0;

  // The store's own fade timer is the only timing this test cannot control from
  // the outside, so it is neutered: `dismiss` is never scheduled, and the pill
  // holds its terminal state for the assertions.
  const store = createFlowPillStore({
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  });
  const levelBus = createLevelBus();
  levelBus.onLevel((level) => levels.push(level));

  store.subscribe((state) => statuses.push(state.status));

  const captureOptions: CaptureOptions = {
    createSource: () => mic.source,
    transcribe: async () =>
      options.sttFails
        ? { kind: "failed", message: "stt exploded" }
        : { kind: "transcript", text: options.transcript ?? "remind me to call the lab" },
  };

  const fetchImpl: SendFetch = async (url, init) => {
    posted.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (options.network === "throw") throw new Error("network down");
    if (typeof options.network === "number") {
      return { ok: false, status: options.network };
    }
    return { ok: true, status: 200 };
  };

  let gestures: ((event: OptionTapEvent) => void) | null = null;

  const controller = await attachFlowPillController(
    {
      store,
      dispatch: (event) => store.dispatch(event),
      getState: () => store.getState(),
      attachLevelSource: (source) => levelBus.pipe(source),
    },
    {
      bridge,
      gestures: async (handler) => {
        gestures = handler;
        return () => {
          gestures = null;
        };
      },
      window: {
        show: async () => {
          shows += 1;
        },
        hide: async () => {
          hides += 1;
        },
        ensureGestureTap: async () => undefined,
      },
      audio: {
        armPreroll: () => armPreroll(captureOptions),
        disarmPreroll: () => disarmPreroll(),
        startCapture: (mode) => startCapture(mode, captureOptions),
      },
      send: (text) =>
        sendFlowpillText(text, {
          fetchImpl,
          deviceToken: async () => (options.paired === false ? null : TOKEN),
          apiBaseUrl: BASE_URL,
          triggerSecret: SECRET,
        }),
    },
  );

  if (options.preempt === false) {
    // The arbiter reads the flag once, at construction, so this variant is built
    // by hand rather than by mutating a module constant.
    await controller.detach();
    throw new Error("preempt:false is exercised directly against createMicArbiter");
  }

  if (options.hudRecording) {
    bridge.deliver(FLOWPILL_HUD_MIC, { active: true });
  }

  const settle = async (): Promise<void> => {
    // Four turns of the microtask queue: acquire the mic, open the device, stop
    // and transcribe, then post. Each awaits the one before it.
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  return {
    controller,
    bridge,
    mic,
    posted,
    statuses,
    levels,
    get shows() {
      return shows;
    },
    get hides() {
      return hides;
    },
    status: () => store.getState().status,
    error: () => store.getState().error,
    gesture(kind) {
      gestures?.({ kind, atMs: 0 });
    },
    speak(samples = 16_000) {
      mic.emit(tonePcm(samples));
    },
    settle,
    async teardown() {
      await controller.detach();
      await resetFlowpillAudio();
    },
  };
}

let live: Rig | null = null;

beforeEach(() => {
  live = null;
});

afterEach(async () => {
  await live?.teardown();
  await resetFlowpillAudio();
});

// ─── The chain, end to end ──────────────────────────────────────────────────

describe("the flow pill, end to end", () => {
  it("long-press Option records, releasing it posts the transcript to the web conversation", async () => {
    const r = (live = await rig());

    r.gesture("down");
    r.gesture("long_press_start");
    await r.settle();

    expect(r.shows).toBe(1);
    expect(r.status()).toBe("listening");

    r.speak();
    expect(r.levels.length).toBeGreaterThan(0);
    expect(Math.max(...r.levels)).toBeGreaterThan(0);

    r.gesture("long_press_end");
    r.gesture("up");
    await r.settle();

    expect(r.status()).toBe("sent");
    expect(r.statuses).toEqual([
      "armed",
      "listening",
      "transcribing",
      "sending",
      "sent",
    ]);

    // The exact request that reaches the route.
    expect(r.posted).toHaveLength(1);
    const post = r.posted[0]!;
    expect(post.url).toBe(`${BASE_URL}/api/jarvis/voice/text`);
    expect(post.method).toBe("POST");
    expect(post.body).toBe(JSON.stringify({ text: "remind me to call the lab" }));
    expect(post.headers).toEqual({
      "x-trigger-secret": SECRET,
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    });
  });

  it("double-tap Option locks hands-free, and the NEXT press ends it, not the trailing release", async () => {
    const r = (live = await rig({ transcript: "book the flight" }));

    // u3 emits down, up, down, double_tap, up for a double tap. The trailing up
    // is the release of the double tap's own second press: consuming it as the
    // stop gesture would end the session about sixty milliseconds after it
    // began. This is the single most likely way to get the lock mode wrong.
    r.gesture("down");
    r.gesture("up");
    r.gesture("down");
    r.gesture("double_tap");
    r.gesture("up");
    await r.settle();

    expect(r.status()).toBe("listening");

    r.speak();
    r.gesture("up"); // still not a stop: only a press ends a locked session
    await r.settle();
    expect(r.status()).toBe("listening");

    r.gesture("down");
    await r.settle();

    expect(r.status()).toBe("sent");
    expect(r.posted[0]!.body).toBe(JSON.stringify({ text: "book the flight" }));
  });

  it("Escape from the global path cancels: the mic closes, nothing is posted", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    expect(r.status()).toBe("listening");

    // Escape cannot reach the overlay's own window, so it arrives as an event
    // from the HUD's global shortcut. This is the keyboard-only cancel path.
    r.bridge.deliver(FLOWPILL_CANCEL);
    await r.settle();

    expect(r.status()).toBe("idle");
    expect(r.posted).toHaveLength(0);
    expect(r.hides).toBe(1);
    expect(r.mic.isRunning()).toBe(false);
  });

  it("a silent utterance is never posted", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    // Digital silence never crosses the speech threshold, so the capture path
    // reports `empty` and no transcription request is even made.
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.posted).toHaveLength(0);
  });

  // ─── A dead input device (the live hardware failure) ──────────────────────
  // The macOS default input on the user's Mac Studio was a silent virtual
  // loopback device, so every utterance came back as `rms=0.0000` and the pill
  // said "Didn't catch that", which points the user at their own voice rather
  // than at the one setting that fixes it.

  it("names the device when the microphone produced nothing at all", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    r.bridge.deliver(AUDIO_INPUT_SILENT, { name: "BlackHole 16ch" });
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.error()).toBe(silentInputCopy("BlackHole 16ch"));
    expect(r.error()).toContain("BlackHole 16ch");
    expect(r.posted).toHaveLength(0);
  });

  it("keeps the generic line when the microphone was working and the user simply said nothing", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.error()).toBe(NOTHING_HEARD);
  });

  it("a dead device on one utterance does not mislabel the next", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    r.bridge.deliver(AUDIO_INPUT_SILENT, { name: "QuickTime Input" });
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();
    expect(r.error()).toBe(silentInputCopy("QuickTime Input"));

    // Second utterance, a different (working) microphone, nothing said.
    r.gesture("long_press_start");
    await r.settle();
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();

    expect(r.error()).toBe(NOTHING_HEARD);
  });

  it("ignores a silent-device report that lands between sessions", async () => {
    const r = (live = await rig());

    r.bridge.deliver(AUDIO_INPUT_SILENT, { name: "ZoomAudioDevice" });
    r.gesture("long_press_start");
    await r.settle();
    r.mic.emit(silentPcm(16_000));
    r.gesture("long_press_end");
    await r.settle();

    expect(r.error()).toBe(NOTHING_HEARD);
  });

  it("a dead device never turns a real transcript into a failure", async () => {
    const r = (live = await rig({ transcript: "book the bench for Thursday" }));

    r.gesture("long_press_start");
    await r.settle();
    r.bridge.deliver(AUDIO_INPUT_SILENT, { name: "BlackHole 16ch" });
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("sent");
    expect(r.posted).toHaveLength(1);
  });

  it("a whitespace-only transcript is never posted", async () => {
    const r = (live = await rig({ transcript: "   \n  " }));

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.posted).toHaveLength(0);
  });

  it("a network failure fails quietly and sends nothing twice", async () => {
    const r = (live = await rig({ network: "throw" }));

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    // One attempt. No retry storm on a surface that floats over the user's work.
    expect(r.posted).toHaveLength(1);
  });

  it("a rejected send reports the status without nagging", async () => {
    const r = (live = await rig({ network: 500 }));

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.posted).toHaveLength(1);
  });

  it("an unpaired desktop says so instead of posting a doomed request", async () => {
    const r = (live = await rig({ paired: false }));

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.posted).toHaveLength(0);
  });

  it("a failed transcription is reported and nothing is posted", async () => {
    const r = (live = await rig({ sttFails: true }));

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.status()).toBe("error");
    expect(r.posted).toHaveLength(0);
  });
});

// ─── Contention, re-entry and the session signal ────────────────────────────

describe("the flow pill's guards", () => {
  it("preempts a recording HUD turn and only then opens the microphone", async () => {
    const r = (live = await rig({ hudRecording: true }));

    r.gesture("long_press_start");
    await r.settle();

    // The pill asked the HUD to let go, and is waiting rather than recording.
    expect(r.bridge.payloads(FLOWPILL_MIC_PREEMPT)).toHaveLength(1);
    expect(r.status()).toBe("armed");
    expect(r.mic.starts()).toBe(0);

    // The HUD confirms it has abandoned its turn.
    r.bridge.deliver(FLOWPILL_HUD_MIC, { active: false });
    await r.settle();

    expect(r.status()).toBe("listening");
    expect(r.mic.starts()).toBe(1);

    r.speak();
    r.gesture("long_press_end");
    await r.settle();
    expect(r.posted).toHaveLength(1);
  });

  it("does not open the microphone speculatively while the HUD is recording", async () => {
    const r = (live = await rig({ hudRecording: true }));

    r.gesture("down");
    await r.settle();

    expect(r.mic.starts()).toBe(0);
  });

  it("a second gesture during a send does not start an overlapping session", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    r.speak();
    r.gesture("long_press_end");

    // Land a fresh gesture in the middle of the transcribe-and-send window.
    r.gesture("long_press_start");
    r.gesture("double_tap");
    await r.settle();

    expect(r.posted).toHaveLength(1);
    expect(r.status()).toBe("sent");
    expect(r.statuses.filter((s) => s === "armed")).toHaveLength(1);
  });

  it("announces the session so the HUD holds Escape for exactly its duration", async () => {
    const r = (live = await rig());

    r.gesture("long_press_start");
    await r.settle();
    expect(r.bridge.payloads(FLOWPILL_SESSION)).toEqual([{ active: true }]);

    r.speak();
    r.gesture("long_press_end");
    await r.settle();

    expect(r.bridge.payloads(FLOWPILL_SESSION)).toEqual([
      { active: true },
      { active: false },
    ]);
  });
});

// ─── The send module's own contract ─────────────────────────────────────────

describe("sendFlowpillText", () => {
  it("refuses an empty message without touching the network", async () => {
    const posted: string[] = [];
    const result = await sendFlowpillText("   ", {
      fetchImpl: async (url) => {
        posted.push(url);
        return { ok: true, status: 200 };
      },
      deviceToken: async () => TOKEN,
      apiBaseUrl: BASE_URL,
      triggerSecret: SECRET,
    });

    expect(result.kind).toBe("failed");
    expect(posted).toHaveLength(0);
  });

  it("reports an unpaired desktop rather than a bare 401", async () => {
    const result = await sendFlowpillText("hello", {
      fetchImpl: async () => ({ ok: true, status: 200 }),
      deviceToken: async () => null,
      apiBaseUrl: BASE_URL,
      triggerSecret: SECRET,
    });

    expect(result).toEqual({ kind: "failed", message: NOT_PAIRED });
  });

  it("trims the text it posts", async () => {
    let body = "";
    await sendFlowpillText("  add milk  ", {
      fetchImpl: async (_url, init) => {
        body = init.body;
        return { ok: true, status: 200 };
      },
      deviceToken: async () => TOKEN,
      apiBaseUrl: BASE_URL,
      triggerSecret: SECRET,
    });

    expect(body).toBe(JSON.stringify({ text: "add milk" }));
  });

  it("turns a transport failure into short, honest copy", async () => {
    const result = await sendFlowpillText("hello", {
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      deviceToken: async () => TOKEN,
      apiBaseUrl: BASE_URL,
      triggerSecret: SECRET,
    });

    expect(result).toEqual({ kind: "failed", message: SEND_FAILED });
  });
});

// ─── The sealed switch ──────────────────────────────────────────────────────

describe("the microphone contention switch", () => {
  it("yields instead of preempting when the flag is reversed", async () => {
    const { createMicArbiter } = await import("./mic-arbiter");
    const bridge = makeBridge();
    const arbiter = await createMicArbiter({ bridge, preempt: false });

    bridge.deliver(FLOWPILL_HUD_MIC, { active: true });
    expect(await arbiter.acquire()).toBe("busy");
    expect(bridge.payloads(FLOWPILL_MIC_PREEMPT)).toHaveLength(0);

    await arbiter.dispose();
  });

  it("preempts by default, which is the sealed behaviour", async () => {
    const { createMicArbiter } = await import("./mic-arbiter");
    const bridge = makeBridge();
    const arbiter = await createMicArbiter({ bridge });

    bridge.deliver(FLOWPILL_HUD_MIC, { active: true });
    const acquisition = arbiter.acquire();
    await Promise.resolve();
    await Promise.resolve();
    bridge.deliver(FLOWPILL_HUD_MIC, { active: false });

    expect(await acquisition).toBe("preempted");
    expect(bridge.payloads(FLOWPILL_MIC_PREEMPT)).toHaveLength(1);

    await arbiter.dispose();
  });

  it("proceeds anyway when the HUD never answers, rather than stalling the user", async () => {
    const { createMicArbiter } = await import("./mic-arbiter");
    const bridge = makeBridge();
    const fired: Array<() => void> = [];
    const arbiter = await createMicArbiter({
      bridge,
      setTimeout: (handler) => {
        fired.push(handler);
        return fired.length;
      },
      clearTimeout: () => undefined,
    });

    bridge.deliver(FLOWPILL_HUD_MIC, { active: true });
    const acquisition = arbiter.acquire();
    await Promise.resolve();
    await Promise.resolve();
    for (const fire of fired) fire();

    expect(await acquisition).toBe("timeout");

    await arbiter.dispose();
  });
});

// ─── Copy that must never drift into a promise the pill cannot keep ─────────

describe("the pill's failure copy", () => {
  it("is short and says nothing about a reply", () => {
    for (const copy of [MIC_DENIED_COPY, MIC_BUSY_COPY, SEND_FAILED, NOT_PAIRED]) {
      expect(copy.length).toBeLessThanOrEqual(28);
    }
  });
});
