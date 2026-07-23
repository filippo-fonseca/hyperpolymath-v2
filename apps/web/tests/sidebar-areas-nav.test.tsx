/**
 * @vitest-environment jsdom
 *
 * Areas nav pill — presence + active-state routing (sesh-1784257742502 / u2)
 *
 * /areas spent its life as a SectionHeader link rather than a MAIN_ITEMS pill,
 * which left it unreachable from a pinned collapsed rail (the header degrades
 * to a bare hairline at 56px). It is now a real pill, and these tests pin the
 * two things that make it behave like one:
 *
 *   Test 1: it renders in the MAIN rail at all, in both the expanded and the
 *     collapsed rail — the collapsed case IS the bug that motivated the pill,
 *     so a regression that hides it at 56px must fail here.
 *
 *   Test 2: active state is a PREFIX match, so drilling into /areas/<id> keeps
 *     the section lit. Exact matching would dark the pill the moment you opened
 *     an area, which is the one place you most need to know where you are.
 *
 *   Test 3: the pill is NOT active on unrelated routes, and — the real trap —
 *     the shared layoutId backplate stays a single-occupancy affair. Tree rows
 *     match exactly (`pathname === '/areas/<id>'`) while the pill matches by
 *     prefix, so on an area detail route both light up; only NavRow may mount
 *     the shared `nav-active-pill` backplate. Two pills claiming one layoutId
 *     would make Framer Motion tear the backplate between them.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersistentNav } from "@/components/shell/PersistentNav";

// The route under test. Mutated per-case before render; usePathname reads it
// lazily so one module mock serves every case.
let pathname = "/lifeos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

// The gcal badge hook would open a network path; the nav's routing has nothing
// to do with it.
vi.mock("@/lib/gcal/useGcalConnectionStatus", () => ({
  useGcalConnectionStatus: () => ({ data: "connected" }),
}));

function areasLink() {
  return document.querySelector('a[href="/areas"]');
}

describe("Areas nav pill", () => {
  it("renders in the MAIN rail when expanded and when collapsed", () => {
    pathname = "/lifeos";

    const { unmount } = render(<PersistentNav collapsed={false} />);
    expect(areasLink()).not.toBeNull();
    expect(screen.getByLabelText("Areas")).toBeInTheDocument();
    unmount();

    // The collapsed rail is the whole point: /areas was unreachable here.
    render(<PersistentNav collapsed={true} />);
    expect(areasLink()).not.toBeNull();
  });

  it("is active on /areas and stays active on an area detail route", () => {
    for (const route of ["/areas", "/areas/abc-123"]) {
      pathname = route;
      const { unmount } = render(<PersistentNav collapsed={false} />);
      expect(screen.getByLabelText("Areas")).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });

  it("is not active on unrelated routes, and never lights two pills at once", () => {
    pathname = "/tasks";
    render(<PersistentNav collapsed={false} />);

    expect(screen.getByLabelText("Areas")).not.toHaveAttribute("aria-current");
    expect(screen.getByLabelText("Tasks")).toHaveAttribute("aria-current", "page");

    // Exactly one row may claim the shared backplate.
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});
