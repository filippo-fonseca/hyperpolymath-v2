import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  StudioInputProvider,
  useStudioCursor,
  useStudioDomTarget,
  useStudioIntent,
  useStudioIsHovered,
} from "@/lib/studio/input/react";
import type {
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
  StudioIntent,
} from "@/lib/studio/input/types";

/** Flush a requestAnimationFrame turn (hover resolution is rAF-coalesced). */
async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** A fake driver that captures the sink so tests can drive the hub imperatively. */
class FakeDriver implements StudioInputDriver {
  readonly id = "fake";
  sink: StudioInputSink | null = null;
  env: StudioDriverEnv | null = null;
  stopped = false;
  start(sink: StudioInputSink, env: StudioDriverEnv) {
    this.sink = sink;
    this.env = env;
  }
  stop() {
    this.stopped = true;
  }
}

function CursorReadout() {
  const cursor = useStudioCursor();
  return <div data-testid="cursor">{`${cursor.nx},${cursor.ny},${cursor.active}`}</div>;
}

describe("StudioInputProvider + hooks", () => {
  it("starts injected drivers and stops them on unmount", () => {
    const driver = new FakeDriver();
    const { unmount } = render(
      <StudioInputProvider drivers={[driver]}>
        <div />
      </StudioInputProvider>,
    );
    expect(driver.sink).not.toBeNull();
    expect(driver.env).not.toBeNull();
    unmount();
    expect(driver.stopped).toBe(true);
  });

  it("useStudioCursor reflects sink cursor moves", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <CursorReadout />
      </StudioInputProvider>,
    );
    expect(screen.getByTestId("cursor").textContent).toBe("0,0,false");
    act(() => {
      driver.sink!.moveCursor(0.25, 0.75);
    });
    expect(screen.getByTestId("cursor").textContent).toBe("0.25,0.75,true");
  });

  it("useStudioDomTarget + useStudioIsHovered flips, and a sibling id does not re-render", async () => {
    const driver = new FakeDriver();
    const aRenders = { n: 0 };
    const bRenders = { n: 0 };

    function Target({ id, counter }: { id: string; counter: { n: number } }) {
      const ref = useRef<HTMLDivElement>(null);
      useStudioDomTarget(id, ref);
      const hovered = useStudioIsHovered(id);
      counter.n += 1;
      return (
        <div ref={ref} data-testid={id} data-hovered={hovered}>
          {id}
        </div>
      );
    }

    render(
      <StudioInputProvider drivers={[driver]}>
        <Target id="a" counter={aRenders} />
        <Target id="b" counter={bRenders} />
      </StudioInputProvider>,
    );

    // Stage defaults to viewport (jsdom: innerWidth/innerHeight). Mock rects.
    const elA = screen.getByTestId("a");
    const elB = screen.getByTestId("b");
    vi.spyOn(elA, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {},
    } as DOMRect);
    vi.spyOn(elB, "getBoundingClientRect").mockReturnValue({
      left: 500, top: 500, right: 600, bottom: 600, width: 100, height: 100, x: 500, y: 500, toJSON() {},
    } as DOMRect);

    const aBefore = aRenders.n;
    const bBefore = bRenders.n;

    // Move the cursor over A's rect. Stage = viewport so stage px == viewport px.
    // nx must map to px ~50 within innerWidth.
    const nx = 50 / window.innerWidth;
    const ny = 50 / window.innerHeight;
    act(() => {
      driver.sink!.moveCursor(nx, ny);
    });
    await flushRaf();

    expect(elA.getAttribute("data-hovered")).toBe("true");
    expect(elB.getAttribute("data-hovered")).toBe("false");
    // A re-rendered (hover flipped); B did NOT (its slice is stable false).
    expect(aRenders.n).toBeGreaterThan(aBefore);
    expect(bRenders.n).toBe(bBefore);
  });

  it("useStudioIntent receives the hub-upgraded expand", async () => {
    const driver = new FakeDriver();
    const received: StudioIntent[] = [];

    function IntentSink() {
      useStudioIntent((i) => received.push(i));
      const ref = useRef<HTMLDivElement>(null);
      useStudioDomTarget("w1", ref);
      return (
        <div
          ref={ref}
          data-testid="w1"
        />
      );
    }

    render(
      <StudioInputProvider drivers={[driver]}>
        <IntentSink />
      </StudioInputProvider>,
    );

    const el = screen.getByTestId("w1");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight,
      width: window.innerWidth, height: window.innerHeight, x: 0, y: 0, toJSON() {},
    } as DOMRect);

    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    await flushRaf();
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });

    expect(received).toEqual([{ type: "expand", targetId: "w1" }]);
  });
});
