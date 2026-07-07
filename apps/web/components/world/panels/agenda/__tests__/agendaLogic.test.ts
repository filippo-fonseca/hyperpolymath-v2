/**
 * agendaLogic.test.ts — W-01 · The Studiolo · Phase 3 (The Bottega)
 *
 * The extracted-survivor coverage, moved (and renamed) from the demolished
 * `meridian/__tests__/meridianLayout.test.ts`. Only the pieces that outlive the
 * Meridian Ring are pinned here: `classifyEvent` exact boundaries (T-15, start,
 * end — was `classifyTablet`), the conservative `linkEventToProject` heuristic
 * (course-code hit, plain miss, ambiguous → null, class precedence), and
 * `calendarDotColor` / `PARCHMENT_HEX` (the tint doctrine's dot + neutral). The
 * ring/dial math (`timeToAngle`, `solveMeridianLayout`, `visibleSlots`,
 * `resolveOverlaps`) died with the presentation and is not ported.
 */
import { describe, it, expect } from "vitest";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import {
  classifyEvent,
  linkEventToProject,
  calendarDotColor,
  PARCHMENT_HEX,
  IMMINENT_MS,
} from "../agendaLogic";

// ── fixtures ────────────────────────────────────────────────────────────────
function mkArea(
  id: string,
  projects: Array<{ id: string; name: string; isClass?: boolean }>,
): SidebarArea {
  return {
    id,
    name: id,
    emoji: null,
    orderIndex: 0,
    archivedAt: null,
    projects: projects.map((p, i) => ({
      id: p.id,
      name: p.name,
      icon: null,
      orderIndex: i,
      isClass: p.isClass ?? false,
      archivedAt: null,
    })),
  };
}

// ── classifyEvent — exact boundaries (T-15, start, end) ──────────────────────
describe("classifyEvent — boundary truth table", () => {
  const now = 1_000_000_000_000;
  const base = { startMs: now, endMs: now + 60 * 60 * 1000 };

  it("end ≤ now → past (exact end boundary is past)", () => {
    expect(classifyEvent({ startMs: now - 3600_000, endMs: now }, now)).toBe(
      "past",
    );
  });

  it("start ≤ now < end → current (exact start boundary is current)", () => {
    expect(classifyEvent(base, now)).toBe("current");
    expect(classifyEvent(base, now + 30 * 60 * 1000)).toBe("current");
  });

  it("exactly T-15 (start − now === 15min) → imminent", () => {
    const start = now + IMMINENT_MS;
    expect(classifyEvent({ startMs: start, endMs: start + 3600_000 }, now)).toBe(
      "imminent",
    );
  });

  it("just past T-15 (15min + 1ms out) → upcoming", () => {
    const start = now + IMMINENT_MS + 1;
    expect(classifyEvent({ startMs: start, endMs: start + 3600_000 }, now)).toBe(
      "upcoming",
    );
  });

  it("well in the future → upcoming", () => {
    const start = now + 5 * 60 * 60 * 1000;
    expect(classifyEvent({ startMs: start, endMs: start + 3600_000 }, now)).toBe(
      "upcoming",
    );
  });
});

// ── linkEventToProject — conservative heuristic fixtures ─────────────────────
describe("linkEventToProject — course-code hit / miss / ambiguous", () => {
  const tree: SidebarArea[] = [
    mkArea("area-cs", [
      { id: "p-cpsc426", name: "CPSC 426: Building Interactive Machines", isClass: true },
      { id: "p-reading", name: "Reading Group" },
    ]),
    mkArea("area-sci", [
      { id: "p-physics", name: "Physics", isClass: true },
      { id: "p-chem", name: "Chemistry", isClass: true },
    ]),
  ];

  it("hit via course code 'CPSC 426' → the class project", () => {
    expect(linkEventToProject("CPSC 426 Lecture", tree)).toEqual({
      areaId: "area-cs",
      projectId: "p-cpsc426",
    });
  });

  it("hit via fused course code 'CPSC426'", () => {
    expect(linkEventToProject("cpsc426 review session", tree)).toEqual({
      areaId: "area-cs",
      projectId: "p-cpsc426",
    });
  });

  it("hit via whole-word class name", () => {
    expect(linkEventToProject("Physics problem set", tree)).toEqual({
      areaId: "area-sci",
      projectId: "p-physics",
    });
  });

  it("plain miss → null (no matching words)", () => {
    expect(linkEventToProject("Lunch with Ana", tree)).toBeNull();
  });

  it("ambiguous ≥2 class hits → null (wrong tint worse than none)", () => {
    expect(linkEventToProject("Physics and Chemistry review", tree)).toBeNull();
  });

  it("empty / punctuation-only title → null", () => {
    expect(linkEventToProject("   ", tree)).toBeNull();
    expect(linkEventToProject("!!!", tree)).toBeNull();
  });

  it("archived projects/areas are ignored", () => {
    const archived: SidebarArea[] = [
      {
        ...mkArea("area-x", [{ id: "p-x", name: "Physics", isClass: true }]),
        projects: [
          {
            id: "p-x",
            name: "Physics",
            icon: null,
            orderIndex: 0,
            isClass: true,
            archivedAt: new Date(),
          },
        ],
      },
    ];
    expect(linkEventToProject("Physics lecture", archived)).toBeNull();
  });

  it("class precedence: a class hit wins over a non-class name hit", () => {
    const mixed: SidebarArea[] = [
      mkArea("a", [
        { id: "c", name: "Seminar", isClass: true },
        { id: "n", name: "Seminar", isClass: false },
      ]),
    ];
    expect(linkEventToProject("Seminar", mixed)).toEqual({
      areaId: "a",
      projectId: "c",
    });
  });
});

// ── calendarDotColor + PARCHMENT_HEX — the tint doctrine dots ────────────────
describe("calendarDotColor — the only place a calendar bg surfaces", () => {
  const cals: GcalCalendarMeta[] = [
    {
      id: "primary",
      summary: "P",
      backgroundColor: "#FF0000",
      foregroundColor: "#fff",
      primary: true,
      accessRole: "owner",
    },
  ];

  it("returns the calendar's background color when found", () => {
    expect(calendarDotColor("primary", cals)).toBe("#FF0000");
  });

  it("falls back to Google blue when the calendar row is missing", () => {
    expect(calendarDotColor("unknown", cals)).toBe("#4285F4");
  });

  it("PARCHMENT_HEX is the neutral parchment glass", () => {
    expect(PARCHMENT_HEX).toBe("#F2E9D8");
  });
});
