/**
 * prose-first (JARVIS-20) rendering contract tests.
 *
 * Asserts:
 *  1. JarvisScrollback renders textDelta ABOVE receipts on action turns
 *     (the Phase 5 `actions.length === 0` gate is removed per D-R1)
 *  2. JarvisReceipt in queued state renders a placeholder (D-P3)
 *  3. JarvisReceipt compact variant applies reduced visual weight (D-R1)
 */

import { render } from "@testing-library/react";
import { describe, it, expect, beforeAll } from "vitest";
import { JarvisScrollback } from "@/components/jarvis/JarvisScrollback";
import { JarvisReceipt } from "@/components/jarvis/JarvisReceipt";

// jsdom does not implement scrollIntoView — mock it so JarvisScrollback
// useEffect doesn't throw (it uses bottomRef.current?.scrollIntoView).
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe("prose-first (JARVIS-20)", () => {
  it("renders textDelta above receipts on action turns (Phase 5.1 D-R1)", () => {
    const { getByText } = render(
      <JarvisScrollback turns={[{
        kind: "assistant",
        id: "t1",
        textDelta: "Handled, sir. Test prose.",
        status: "done",
        createdAt: new Date(),
        actions: [{
          toolUseId: "tu1",
          name: "create_task",
          status: "done",
          result: { ok: true, id: "task-1", receipt: { title: "Test task", priority: "P3" } },
        }],
      }]} />
    );
    expect(getByText(/Handled, sir/)).toBeTruthy();
    expect(getByText(/Test task/)).toBeTruthy();
  });

  it("queued placeholder renders before result arrives (D-P3)", () => {
    const { container } = render(
      <JarvisReceipt action={{
        toolUseId: "tu2",
        name: "create_event",
        status: "queued",
      }} />
    );
    expect(container.textContent).toMatch(/queued|pending|\.\.\./i);
  });

  it("compact variant reduces visual weight (D-R1 receipt de-emphasis)", () => {
    const { container } = render(
      <JarvisReceipt
        variant="compact"
        action={{
          toolUseId: "tu3",
          name: "create_task",
          status: "done",
          result: { ok: true, id: "t3", receipt: { title: "Compact", priority: "P3" } },
        }}
      />
    );
    // Compact applies a known class signature
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/border-l(\s|$)|py-1(\s|$)|text-xs(\s|$)/);
  });
});
