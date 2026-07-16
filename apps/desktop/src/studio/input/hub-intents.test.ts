import { describe, expect, it } from "vitest";

import { StudioInputHub } from "./hub";
import type { HoverProvider, StudioIntent } from "./types";

/** A hover provider that always reports a fixed target (or null). */
function fixedHover(id: string | null): HoverProvider {
  return { id: "test-hover", priority: 100, resolve: () => id };
}

/** Spin up a sync hub with the cursor active and a given hover target. */
function hubWithHover(id: string | null): { hub: StudioInputHub; intents: StudioIntent[] } {
  const hub = new StudioInputHub({ sync: true });
  hub.registerHoverProvider(fixedHover(id));
  const intents: StudioIntent[] = [];
  hub.subscribeIntent((i) => intents.push(i));
  // Activate the cursor so hover resolves (providers return null when inactive).
  hub.sink.moveCursor(0.5, 0.5);
  return { hub, intents };
}

describe("hub intent upgrades — tap / expand / confirm", () => {
  it("upgrades a targetless `tap` with the current hover target", () => {
    const { hub, intents } = hubWithHover("widget-a");
    hub.sink.emitIntent({ type: "tap" });
    expect(intents).toEqual([{ type: "tap", targetId: "widget-a" }]);
  });

  it("drops a `tap` over empty space (no hover target)", () => {
    const { hub, intents } = hubWithHover(null);
    hub.sink.emitIntent({ type: "tap" });
    expect(intents).toEqual([]);
  });

  it("still upgrades `expand` (legacy click) from hover", () => {
    const { hub, intents } = hubWithHover("widget-b");
    hub.sink.emitIntent({ type: "expand" });
    expect(intents).toEqual([{ type: "expand", targetId: "widget-b" }]);
  });

  it("passes `confirmApprove` through UNCHANGED even over empty space", () => {
    const { hub, intents } = hubWithHover(null);
    hub.sink.emitIntent({ type: "confirmApprove" });
    expect(intents).toEqual([{ type: "confirmApprove" }]);
  });

  it("passes `confirmCancel` through unchanged (not hover-scoped)", () => {
    const { hub, intents } = hubWithHover("widget-c");
    hub.sink.emitIntent({ type: "confirmCancel" });
    expect(intents).toEqual([{ type: "confirmCancel" }]);
  });

  it("passes `halt` through unchanged (existing contract preserved)", () => {
    const { hub, intents } = hubWithHover(null);
    hub.sink.emitIntent({ type: "halt" });
    expect(intents).toEqual([{ type: "halt" }]);
  });
});
