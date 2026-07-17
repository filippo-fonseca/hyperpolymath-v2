import { describe, expect, it } from "vitest";
import {
  type EntityLabelRequest,
  type ResolvedEntityLabel,
  CONTEXT_MAX,
  RESOLVE_LABELS_CAP,
  assembleResolvedLabels,
  entityLabelKey,
  groupIdsByType,
  labelRequestCacheKey,
  normalizeLabelRequests,
  previewContext,
} from "@/lib/references/resolve-labels";

const UUID_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const UUID_B = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
const UUID_C = "0f0e0d0c-0b0a-4908-8706-050403020100";

describe("normalizeLabelRequests", () => {
  it("keeps distinct refs in source order", () => {
    const refs: EntityLabelRequest[] = [
      { type: "task", id: UUID_A },
      { type: "capture", id: UUID_B },
    ];
    expect(normalizeLabelRequests(refs)).toEqual(refs);
  });

  it("dedupes the same entity referenced repeatedly", () => {
    const refs: EntityLabelRequest[] = [
      { type: "task", id: UUID_A },
      { type: "task", id: UUID_A },
      { type: "task", id: UUID_A },
    ];
    expect(normalizeLabelRequests(refs)).toEqual([{ type: "task", id: UUID_A }]);
  });

  it("treats the same id under different kinds as different entities", () => {
    const refs: EntityLabelRequest[] = [
      { type: "task", id: UUID_A },
      { type: "page", id: UUID_A },
    ];
    expect(normalizeLabelRequests(refs)).toHaveLength(2);
  });

  it("drops rows with an unknown kind", () => {
    const refs = [
      { type: "event", id: UUID_A },
      { type: "task", id: UUID_B },
    ] as unknown as EntityLabelRequest[];
    expect(normalizeLabelRequests(refs)).toEqual([{ type: "task", id: UUID_B }]);
  });

  it("drops rows with a missing or non-string id", () => {
    const refs = [
      { type: "task", id: "" },
      { type: "task", id: null },
      { type: "task" },
      { type: "task", id: UUID_A },
    ] as unknown as EntityLabelRequest[];
    expect(normalizeLabelRequests(refs)).toEqual([{ type: "task", id: UUID_A }]);
  });

  it("caps the batch and drops the overflow", () => {
    const refs: EntityLabelRequest[] = Array.from({ length: 150 }, (_, i) => ({
      type: "task",
      id: `${UUID_A.slice(0, -3)}${String(i).padStart(3, "0")}`,
    }));
    expect(normalizeLabelRequests(refs)).toHaveLength(RESOLVE_LABELS_CAP);
  });

  it("counts the cap after deduping, not before", () => {
    // 200 mentions of one entity is one entity, and must not exhaust the cap.
    const refs: EntityLabelRequest[] = Array.from({ length: 200 }, () => ({
      type: "task",
      id: UUID_A,
    }));
    expect(normalizeLabelRequests(refs)).toHaveLength(1);
  });

  it("honours an explicit cap", () => {
    const refs: EntityLabelRequest[] = [
      { type: "task", id: UUID_A },
      { type: "task", id: UUID_B },
      { type: "task", id: UUID_C },
    ];
    expect(normalizeLabelRequests(refs, 2)).toHaveLength(2);
  });

  it("returns nothing for an empty input", () => {
    expect(normalizeLabelRequests([])).toEqual([]);
  });
});

describe("groupIdsByType", () => {
  it("buckets ids under their kind", () => {
    const grouped = groupIdsByType([
      { type: "task", id: UUID_A },
      { type: "capture", id: UUID_B },
      { type: "task", id: UUID_C },
    ]);
    expect(grouped.task).toEqual([UUID_A, UUID_C]);
    expect(grouped.capture).toEqual([UUID_B]);
  });

  it("gives every kind a bucket, so callers can index without a guard", () => {
    const grouped = groupIdsByType([]);
    expect(grouped.task).toEqual([]);
    expect(grouped.person).toEqual([]);
    expect(grouped.area).toEqual([]);
    expect(grouped.project).toEqual([]);
    expect(grouped.page).toEqual([]);
    expect(grouped.capture).toEqual([]);
  });
});

describe("labelRequestCacheKey", () => {
  it("is order-independent, so two containers share one cache entry", () => {
    const a = labelRequestCacheKey([
      { type: "task", id: UUID_A },
      { type: "capture", id: UUID_B },
    ]);
    const b = labelRequestCacheKey([
      { type: "capture", id: UUID_B },
      { type: "task", id: UUID_A },
    ]);
    expect(a).toBe(b);
  });

  it("ignores duplicates", () => {
    expect(
      labelRequestCacheKey([
        { type: "task", id: UUID_A },
        { type: "task", id: UUID_A },
      ]),
    ).toBe(labelRequestCacheKey([{ type: "task", id: UUID_A }]));
  });

  it("distinguishes different ref sets", () => {
    expect(labelRequestCacheKey([{ type: "task", id: UUID_A }])).not.toBe(
      labelRequestCacheKey([{ type: "task", id: UUID_B }]),
    );
  });

  it("is empty for no refs, so the query can stay disabled", () => {
    expect(labelRequestCacheKey([])).toBe("");
  });
});

describe("previewContext", () => {
  it("returns undefined for empty bodies", () => {
    expect(previewContext(null)).toBeUndefined();
    expect(previewContext(undefined)).toBeUndefined();
    expect(previewContext("")).toBeUndefined();
    expect(previewContext("   \n  \n ")).toBeUndefined();
  });

  it("collapses lines and whitespace into one run", () => {
    expect(previewContext("first\n\nsecond   line")).toBe("first second line");
  });

  it("skips the first line for captures, whose label already is that line", () => {
    expect(previewContext("the label\nthe body", { skipFirstLine: true })).toBe(
      "the body",
    );
  });

  it("returns undefined when skipping the first line leaves nothing", () => {
    expect(
      previewContext("only one line", { skipFirstLine: true }),
    ).toBeUndefined();
  });

  it("skips the first NON-EMPTY line, matching how the label is derived", () => {
    expect(
      previewContext("\n\n  the label  \nthe body", { skipFirstLine: true }),
    ).toBe("the body");
  });

  it("truncates with an ellipsis at the cap", () => {
    const out = previewContext("x".repeat(500));
    expect(out).toHaveLength(CONTEXT_MAX);
    expect(out?.endsWith("…")).toBe(true);
  });

  it("leaves a body at exactly the cap untouched", () => {
    const body = "y".repeat(CONTEXT_MAX);
    expect(previewContext(body)).toBe(body);
  });

  it("honours an explicit max", () => {
    expect(previewContext("abcdefghij", { max: 5 })).toBe("abcd…");
  });
});

describe("assembleResolvedLabels", () => {
  const found: ResolvedEntityLabel[] = [
    { type: "task", id: UUID_A, label: "Ship it", exists: true },
  ];

  it("answers a resolved ref with its row", () => {
    const out = assembleResolvedLabels([{ type: "task", id: UUID_A }], found);
    expect(out).toEqual(found);
  });

  it("answers an unresolved ref with an explicit tombstone", () => {
    const out = assembleResolvedLabels([{ type: "task", id: UUID_B }], found);
    expect(out).toEqual([
      { type: "task", id: UUID_B, label: "", exists: false },
    ]);
  });

  it("returns one row per request, in request order", () => {
    const out = assembleResolvedLabels(
      [
        { type: "task", id: UUID_B },
        { type: "task", id: UUID_A },
      ],
      found,
    );
    expect(out.map((r) => r.id)).toEqual([UUID_B, UUID_A]);
    expect(out.map((r) => r.exists)).toEqual([false, true]);
  });

  it("does not match a row of a different kind with the same id", () => {
    const out = assembleResolvedLabels([{ type: "page", id: UUID_A }], found);
    expect(out[0].exists).toBe(false);
  });
});

describe("entityLabelKey", () => {
  it("namespaces the id by kind", () => {
    expect(entityLabelKey("task", UUID_A)).toBe(`task:${UUID_A}`);
    expect(entityLabelKey("page", UUID_A)).not.toBe(entityLabelKey("task", UUID_A));
  });
});
