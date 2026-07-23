import { describe, expect, it } from "vitest";

import { StudioInputHub } from "./hub";
import type { HoverProvider, StudioPhaseEvent } from "./types";

/**
 * Phase-lifecycle suppression at the hub — the structural guarantee that a pinch
 * begun over a WIDGET never drives the camera free-drag (pan + palm-depth dolly),
 * and a grab begun over EMPTY space never strands an orphaned lifecycle.
 *
 * This is the load-bearing reason a hand gesture can never resize (or apparent-
 * resize via a canvas zoom) a widget: the pinch-drag channel carries the dolly
 * scalar in `dragMove.dz`, and the ONLY thing that keeps that dolly off a grabbed
 * widget is this suppression. If a future desktop consumer ever wires `drag*`
 * phases to a real camera dolly, these tests must keep passing so a widget-scoped
 * pinch stays pan/dolly-free (see the audit in the resize-kill report).
 */

/** A hover provider that always reports a fixed target (or null). */
function fixedHover(id: string | null): HoverProvider {
  return { id: "test-hover", priority: 100, resolve: () => id };
}

/** Spin up a sync hub with the cursor active and a given hover target. */
function hubWithHover(id: string | null): { hub: StudioInputHub; phases: StudioPhaseEvent[] } {
  const hub = new StudioInputHub({ sync: true });
  hub.registerHoverProvider(fixedHover(id));
  const phases: StudioPhaseEvent[] = [];
  hub.subscribePhase((p) => phases.push(p));
  // Activate the cursor so hover resolves (providers return null when inactive).
  hub.sink.moveCursor(0.5, 0.5);
  return { hub, phases };
}

describe("hub phase suppression — a pinch over a widget never pans/dollies the camera", () => {
  it("suppresses the WHOLE drag (pan + dolly) lifecycle when the pinch begins over a widget", () => {
    const { hub, phases } = hubWithHover("widget-a");
    hub.sink.emitPhase({ type: "dragStart" });
    // The palm-depth dolly rides `dz`; every drag frame must be dropped.
    hub.sink.emitPhase({ type: "dragMove", dx: 0.1, dy: 0.2, dz: 0.9 });
    hub.sink.emitPhase({ type: "dragEnd" });
    expect(phases).toEqual([]);
  });

  it("passes the drag lifecycle through when the pinch begins over empty space", () => {
    const { hub, phases } = hubWithHover(null);
    hub.sink.emitPhase({ type: "dragStart" });
    hub.sink.emitPhase({ type: "dragMove", dx: 0.1, dy: 0.2, dz: 0.9 });
    hub.sink.emitPhase({ type: "dragEnd" });
    expect(phases).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0.1, dy: 0.2, dz: 0.9 },
      { type: "dragEnd" },
    ]);
  });

  it("re-arms suppression per gesture: a suppressed drag never leaks dolly into the next empty-space drag", () => {
    // A single provider whose target we flip between gestures.
    let target: string | null = "widget-a";
    const hub = new StudioInputHub({ sync: true });
    hub.registerHoverProvider({ id: "test-hover", priority: 100, resolve: () => target });
    const phases: StudioPhaseEvent[] = [];
    hub.subscribePhase((p) => phases.push(p));
    hub.sink.moveCursor(0.5, 0.5);

    // First pinch: over a widget → fully suppressed.
    hub.sink.emitPhase({ type: "dragStart" });
    hub.sink.emitPhase({ type: "dragMove", dx: 0, dy: 0, dz: 0.5 });
    hub.sink.emitPhase({ type: "dragEnd" });
    expect(phases).toEqual([]);

    // Second pinch: same hub, now over empty space → passes through cleanly.
    target = null;
    hub.sink.moveCursor(0.4, 0.4); // re-resolve hover to null
    hub.sink.emitPhase({ type: "dragStart" });
    hub.sink.emitPhase({ type: "dragMove", dx: 0.05, dy: 0, dz: 0.3 });
    hub.sink.emitPhase({ type: "dragEnd" });
    expect(phases).toEqual([
      { type: "dragStart" },
      { type: "dragMove", dx: 0.05, dy: 0, dz: 0.3 },
      { type: "dragEnd" },
    ]);
  });

  it("upgrades a grab over a widget with its target (widget MOVE, never a camera drag)", () => {
    const { hub, phases } = hubWithHover("widget-a");
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabMove", nx: 0.6, ny: 0.7 });
    hub.sink.emitPhase({ type: "grabEnd" });
    // Grab carries only nx/ny (position) — no depth/scale channel exists on it.
    expect(phases).toEqual([
      { type: "grabStart", targetId: "widget-a" },
      { type: "grabMove", nx: 0.6, ny: 0.7 },
      { type: "grabEnd" },
    ]);
  });

  it("drops a grab (and its whole lifecycle) begun over empty space", () => {
    const { hub, phases } = hubWithHover(null);
    hub.sink.emitPhase({ type: "grabStart" });
    hub.sink.emitPhase({ type: "grabMove", nx: 0.6, ny: 0.7 });
    hub.sink.emitPhase({ type: "grabEnd" });
    expect(phases).toEqual([]);
  });
});
