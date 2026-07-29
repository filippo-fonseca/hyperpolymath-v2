import { describe, expect, it } from "vitest";

import {
  ERROR_DISMISS_MS,
  NOTHING_HEARD,
  SENT_DISMISS_MS,
  initialState,
  isCapturing,
  isVisible,
  reduce,
  reduceAll,
} from "./machine";
import type {
  FlowPillEvent,
  FlowPillState,
  FlowPillStatus,
  FlowPillTransition,
} from "./types";

/** Every event kind, used for the exhaustive ignore / cancel sweeps. */
const EVERY_EVENT: FlowPillEvent[] = [
  { type: "invoke", mode: "hold" },
  { type: "capture-started" },
  { type: "lock" },
  { type: "end" },
  { type: "transcript", text: "hello" },
  { type: "transcript-empty" },
  { type: "sent" },
  { type: "fail", reason: "boom" },
  { type: "cancel" },
  { type: "dismiss" },
];

/** The shortest event sequence that parks the machine in each status. */
const PATHS: Record<FlowPillStatus, FlowPillEvent[]> = {
  idle: [],
  armed: [{ type: "invoke", mode: "hold" }],
  listening: [{ type: "invoke", mode: "hold" }, { type: "capture-started" }],
  transcribing: [
    { type: "invoke", mode: "hold" },
    { type: "capture-started" },
    { type: "end" },
  ],
  sending: [
    { type: "invoke", mode: "hold" },
    { type: "capture-started" },
    { type: "end" },
    { type: "transcript", text: "remind me to call the lab" },
  ],
  sent: [
    { type: "invoke", mode: "hold" },
    { type: "capture-started" },
    { type: "end" },
    { type: "transcript", text: "remind me to call the lab" },
    { type: "sent" },
  ],
  error: [
    { type: "invoke", mode: "hold" },
    { type: "fail", reason: "Microphone blocked" },
  ],
};

const ALL_STATUSES = Object.keys(PATHS) as FlowPillStatus[];

function at(status: FlowPillStatus): FlowPillState {
  const { state } = reduceAll(initialState, PATHS[status]);
  expect(state.status).toBe(status);
  return state;
}

function effectTypes(transition: FlowPillTransition): string[] {
  return transition.effects.map((effect) => effect.type);
}

describe("flow pill machine — the happy path", () => {
  it("runs invoke → listening → transcribing → sending → sent → idle", () => {
    let state = initialState;
    const seen: FlowPillStatus[] = [];
    const effects: string[] = [];

    const drive = (event: FlowPillEvent) => {
      const next = reduce(state, event);
      state = next.state;
      seen.push(state.status);
      effects.push(...effectTypes(next));
    };

    drive({ type: "invoke", mode: "hold" });
    drive({ type: "capture-started" });
    drive({ type: "end" });
    drive({ type: "transcript", text: "  add reading list to today  " });
    drive({ type: "sent" });
    drive({ type: "dismiss" });

    expect(seen).toEqual([
      "armed",
      "listening",
      "transcribing",
      "sending",
      "sent",
      "idle",
    ]);
    expect(effects).toEqual([
      "show",
      "start-capture",
      "stop-capture",
      "send",
      "dismiss-after",
      "hide",
    ]);
  });

  it("trims the transcript before sending it", () => {
    const transition = reduce(at("transcribing"), {
      type: "transcript",
      text: "\n  file this under orthopaedics \n",
    });
    expect(transition.effects).toEqual([
      { type: "send", text: "file this under orthopaedics" },
    ]);
  });

  it("carries the invoking mode into the start-capture effect", () => {
    const transition = reduce(initialState, { type: "invoke", mode: "locked" });
    expect(transition.state.mode).toBe("locked");
    expect(transition.effects).toContainEqual({
      type: "start-capture",
      mode: "locked",
    });
  });

  it("schedules the sent confirmation to clear itself", () => {
    const transition = reduce(at("sending"), { type: "sent" });
    expect(transition.effects).toEqual([
      { type: "dismiss-after", ms: SENT_DISMISS_MS },
    ]);
  });

  it("gives each invocation a fresh utterance id", () => {
    const first = reduce(initialState, { type: "invoke", mode: "hold" });
    expect(first.state.utteranceId).toBe(1);
    const cancelled = reduce(first.state, { type: "cancel" });
    expect(cancelled.state.utteranceId).toBe(1);
    const second = reduce(cancelled.state, { type: "invoke", mode: "locked" });
    expect(second.state.utteranceId).toBe(2);
  });
});

describe("flow pill machine — modes", () => {
  it("promotes a held session to locked when the gesture resolves late", () => {
    const listening = at("listening");
    expect(listening.mode).toBe("hold");
    const locked = reduce(listening, { type: "lock" });
    expect(locked.state.mode).toBe("locked");
    expect(locked.state.status).toBe("listening");
    expect(locked.effects).toEqual([]);
  });

  it("can lock before audio has started flowing", () => {
    const locked = reduce(at("armed"), { type: "lock" });
    expect(locked.state.mode).toBe("locked");
    expect(locked.state.status).toBe("armed");
  });

  it("treats a release before capture started as nothing said", () => {
    const transition = reduce(at("armed"), { type: "end" });
    expect(transition.state.status).toBe("idle");
    expect(effectTypes(transition)).toEqual(["discard", "hide"]);
  });
});

describe("flow pill machine — cancel is absolute", () => {
  it("lands in idle from every status and never sends", () => {
    for (const status of ALL_STATUSES) {
      const transition = reduce(at(status), { type: "cancel" });
      expect(transition.state.status, `cancel from ${status}`).toBe("idle");
      expect(transition.state.mode).toBeNull();
      expect(transition.state.error).toBeNull();
      expect(
        transition.effects.some((effect) => effect.type === "send"),
        `cancel from ${status} must not send`,
      ).toBe(false);
      expect(
        transition.effects.some((effect) => effect.type === "hide"),
        `cancel from ${status} must hide the window`,
      ).toBe(true);
    }
  });

  it("discards the capture when one is in flight, and not otherwise", () => {
    for (const status of ["armed", "listening", "transcribing", "sending"] as const) {
      expect(
        effectTypes(reduce(at(status), { type: "cancel" })),
        `cancel from ${status}`,
      ).toEqual(["discard", "hide"]);
    }
    for (const status of ["idle", "sent", "error"] as const) {
      expect(
        effectTypes(reduce(at(status), { type: "cancel" })),
        `cancel from ${status}`,
      ).toEqual(["hide"]);
    }
  });

  it("never sends, whatever order the events arrive in after a cancel", () => {
    const { effects } = reduceAll(at("listening"), [
      { type: "cancel" },
      // Everything below is a straggler from the abandoned utterance.
      { type: "capture-started" },
      { type: "end" },
      { type: "transcript", text: "this must never reach JARVIS" },
      { type: "sent" },
    ]);
    expect(effects.some((effect) => effect.type === "send")).toBe(false);
  });
});

describe("flow pill machine — failure", () => {
  it("reports an empty transcript as nothing heard, not as success", () => {
    for (const event of [
      { type: "transcript", text: "   \n\t " },
      { type: "transcript-empty" },
    ] as FlowPillEvent[]) {
      const transition = reduce(at("transcribing"), event);
      expect(transition.state.status).toBe("error");
      expect(transition.state.error).toBe(NOTHING_HEARD);
      expect(effectTypes(transition)).toEqual(["discard", "dismiss-after"]);
      expect(transition.effects.some((e) => e.type === "send")).toBe(false);
    }
  });

  it("fails out of every state that can still be recording", () => {
    for (const status of ["armed", "listening", "transcribing"] as const) {
      const transition = reduce(at(status), {
        type: "fail",
        reason: "Microphone blocked",
      });
      expect(transition.state.status).toBe("error");
      expect(transition.state.error).toBe("Microphone blocked");
      expect(effectTypes(transition)).toEqual(["discard", "dismiss-after"]);
    }
  });

  it("does not discard on a send failure, the microphone is long closed", () => {
    const transition = reduce(at("sending"), { type: "fail", reason: "Offline" });
    expect(transition.state.status).toBe("error");
    expect(effectTypes(transition)).toEqual(["dismiss-after"]);
  });

  it("clears itself rather than nagging", () => {
    const transition = reduce(at("listening"), { type: "fail", reason: "Offline" });
    expect(transition.effects).toContainEqual({
      type: "dismiss-after",
      ms: ERROR_DISMISS_MS,
    });
    const dismissed = reduce(transition.state, { type: "dismiss" });
    expect(dismissed.state).toEqual({ ...initialState, utteranceId: 1 });
    expect(effectTypes(dismissed)).toEqual(["hide"]);
  });

  it("clears the stale error message on the next invocation", () => {
    const errored = at("error");
    expect(errored.error).not.toBeNull();
    const next = reduce(errored, { type: "invoke", mode: "locked" });
    expect(next.state.status).toBe("armed");
    expect(next.state.error).toBeNull();
    expect(next.state.mode).toBe("locked");
  });

  it("re-invokes straight out of the sent confirmation", () => {
    const next = reduce(at("sent"), { type: "invoke", mode: "hold" });
    expect(next.state.status).toBe("armed");
    expect(effectTypes(next)).toEqual(["show", "start-capture"]);
  });
});

describe("flow pill machine — out-of-order events are inert", () => {
  it("ignores every event a status has no transition for", () => {
    // The legal transitions, so the sweep below can assert on the rest.
    const legal: Record<FlowPillStatus, string[]> = {
      idle: ["invoke", "cancel"],
      armed: ["capture-started", "lock", "end", "fail", "cancel"],
      listening: ["lock", "end", "fail", "cancel"],
      transcribing: ["transcript", "transcript-empty", "fail", "cancel"],
      sending: ["sent", "fail", "cancel"],
      sent: ["dismiss", "invoke", "cancel"],
      error: ["dismiss", "invoke", "cancel"],
    };

    for (const status of ALL_STATUSES) {
      const state = at(status);
      for (const event of EVERY_EVENT) {
        if (legal[status].includes(event.type)) continue;
        const transition = reduce(state, event);
        expect(transition.state, `${status} + ${event.type}`).toEqual(state);
        expect(transition.effects, `${status} + ${event.type}`).toEqual([]);
      }
    }
  });

  it("ignores a transcript that lands after the window already closed", () => {
    const { state, effects } = reduceAll(initialState, [
      { type: "transcript", text: "late" },
      { type: "sent" },
      { type: "dismiss" },
    ]);
    expect(state).toEqual(initialState);
    expect(effects).toEqual([]);
  });
});

describe("flow pill machine — derived predicates", () => {
  it("is visible in every status but idle", () => {
    for (const status of ALL_STATUSES) {
      expect(isVisible(at(status)), status).toBe(status !== "idle");
    }
  });

  it("is capturing only while armed or listening", () => {
    for (const status of ALL_STATUSES) {
      expect(isCapturing(at(status)), status).toBe(
        status === "armed" || status === "listening",
      );
    }
  });
});
