/**
 * @vitest-environment jsdom
 *
 * /lifeos bento cells: the widget slot must not sit unkeyed in a list (D2).
 *
 * WHAT BROKE, AND WHY IT WAS INVISIBLE TO INSPECTION
 *
 * `ResizableCell` renders three static siblings inside its `motion.div`: the
 * widget, the drag projection, and the resize handle. Three siblings compile to
 * `jsxs`, so React hands the reconciler an ARRAY, and every element in an array
 * is subject to the key rule.
 *
 * Reading the source, the first sibling looks like a single opaque `{children}`
 * node, which is why it reads as fine. At runtime on /lifeos it is not: the page
 * is a Server Component, so each `<WidgetCard>` crosses the RSC/Flight boundary
 * and arrives on the client wrapped in a *lazy chunk* (`$$typeof: react.lazy`)
 * rather than as the element itself.
 *
 * That wrapper is what defeats React's key bookkeeping. `validateChildKeys`
 * runs when the JSX is created, and for a lazy it only marks the inner element
 * when the chunk is already `fulfilled`; on the render pass where the chunk is
 * still uninitialized it marks the WRAPPER instead and the inner element keeps
 * `_store.validated === 0`. react-dom then resolves the lazy during
 * `reconcileChildrenArray` — initializing the chunk in the process — and finds
 * an element with no key that nothing ever validated, so it warns:
 *
 *   Each child in a list should have a unique "key" prop.
 *   Check the render method of `ForwardRef(motion.div)`.
 *   It was passed a child from LifeOsPage.
 *
 * (`ForwardRef(motion.div)` is the owner of the host `div` that holds the array,
 * and `LifeOsPage` is the inner element's owner — which is why the message
 * points at two places that both look innocent in isolation.)
 *
 * Nothing misrendered, but an unkeyed child under a `motion.div` that also
 * carries `layout` is the exact shape that produces wrong animation identity —
 * the drooping wiki tiles this sesh existed to fix.
 *
 * HOW THIS TEST REPRODUCES IT WITHOUT A SERVER
 *
 * A plain client render cannot reproduce the bug: pass a real element and the
 * parent's own `jsx` call marks it validated, so the warning never fires. The
 * uninitialized lazy chunk is the whole mechanism, so `flightLazy` below
 * reconstructs one — including the initialize-on-first-read behaviour of the
 * Flight client's `readChunk`. The control test proves the reconstruction is
 * faithful (it MUST warn); the real assertion is that the bento grid does not.
 */

import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeOsBentoGrid } from "@/components/lifeos/LifeOsBentoGrid";

const REACT_LAZY_TYPE = Symbol.for("react.lazy");

/**
 * A stand-in for what `react-server-dom-*-client` hands a client component when
 * an element prop arrives over the RSC boundary: a lazy wrapper around a chunk
 * that has been received but NOT yet initialized (`resolved_model`), which
 * `readChunk` promotes to `fulfilled` on first read.
 *
 * That pre-initialized state is load-bearing. Hand the wrapper an already
 * `fulfilled` chunk instead and `validateChildKeys` marks the inner element,
 * the bug hides, and this test proves nothing.
 */
function flightLazy(element: ReactElement): ReactNode {
  const chunk = { status: "resolved_model", value: element };
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: (c: typeof chunk) => {
      c.status = "fulfilled";
      return c.value;
    },
    _store: { validated: 0 },
  } as unknown as ReactNode;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

function keyWarnings(): string[] {
  return errorSpy.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((message) => message.includes('unique "key" prop'));
}

describe("RSC lazy children in a list", () => {
  /**
   * Control. react-dom dedupes this warning by the PARENT's component name, so
   * this control deliberately warns under `section` and leaves the `div` slot —
   * the one the bento grid's motion.div would use — untouched.
   */
  it("react-dom does warn for a flight-lazy child sitting in a static sibling list", () => {
    render(
      <section>
        {flightLazy(<div data-testid="lazy-payload">widget</div>)}
        <span>sibling</span>
      </section>
    );
    expect(keyWarnings()).not.toHaveLength(0);
  });
});

describe("LifeOsBentoGrid", () => {
  it("renders RSC widget slots with no unique-key warning", () => {
    render(
      <LifeOsBentoGrid
        hero={flightLazy(<div>tasks widget</div>)}
        habits={flightLazy(<div>habits widget</div>)}
        training={flightLazy(<div>training widget</div>)}
        captures={flightLazy(<div>captures widget</div>)}
        insights={flightLazy(<div>insights widget</div>)}
      />
    );

    expect(keyWarnings()).toEqual([]);
  });

  it("still renders every widget slot's content", () => {
    const { getByText } = render(
      <LifeOsBentoGrid
        hero={flightLazy(<div>tasks widget</div>)}
        habits={flightLazy(<div>habits widget</div>)}
        training={flightLazy(<div>training widget</div>)}
        captures={flightLazy(<div>captures widget</div>)}
        insights={flightLazy(<div>insights widget</div>)}
      />
    );

    for (const label of [
      "tasks widget",
      "habits widget",
      "training widget",
      "captures widget",
      "insights widget",
    ]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });
});
