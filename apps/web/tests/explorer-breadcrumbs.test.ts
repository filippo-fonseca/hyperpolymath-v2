import { splitBreadcrumbSegments } from "@/components/ui/explorer/ExplorerBreadcrumbs";
import { describe, expect, it } from "vitest";

describe("splitBreadcrumbSegments", () => {
  it("keeps short trails fully visible", () => {
    expect(splitBreadcrumbSegments(["Wiki"])).toEqual({
      head: ["Wiki"],
      collapsed: [],
      tail: [],
    });
    expect(splitBreadcrumbSegments(["Wiki", "Self-Study"])).toEqual({
      head: ["Wiki", "Self-Study"],
      collapsed: [],
      tail: [],
    });
  });

  it("collapses middle folders once the path is deeper than root + leaf", () => {
    expect(splitBreadcrumbSegments(["Wiki", "Self-Study", "Cardiovascular"])).toEqual({
      head: ["Wiki"],
      collapsed: ["Self-Study"],
      tail: ["Cardiovascular"],
    });
    expect(
      splitBreadcrumbSegments(["Wiki", "A", "B", "C", "D"])
    ).toEqual({
      head: ["Wiki"],
      collapsed: ["A", "B", "C"],
      tail: ["D"],
    });
  });
});
