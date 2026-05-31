/**
 * Phase 11 / CACHE-02 — pure XML state serializer fixture tests.
 *
 * Locks the byte-for-byte determinism + token-budget + cap-enforcement
 * invariants that make Anthropic prompt cache reuse possible across turns.
 * Per D-05, the serializer emits exactly 5 sections (areas / projects
 * active / projects upcoming / recent_captures / today_calendar /
 * active_tasks — 6 blocks total) sorted by id ASC, capped, date-only.
 *
 * Fixtures are inlined (no tests/fixtures/ subdirectory) — keeps the
 * file self-contained and lets the typical-day token-budget assertion
 * use a single reference fixture without external state.
 *
 * NOTE: Fixture builders deliberately avoid `Date.now()` / `new Date()`
 * inside the builder bodies — every Date object is derived from the
 * REF_DATE anchor via offset math (UTC ms arithmetic). The serializer
 * itself is on the CACHE-05 grep gate allowlist; this test file is
 * NOT on the allowlist, so REF_DATE construction is permitted at module
 * scope. The discipline still matters: fixture stability across runs
 * is what gives the determinism test its teeth.
 */
import { describe, expect, it } from "vitest";

import {
  renderUserState,
  type SnapshotInputs,
} from "@/lib/jarvis/render-user-state";

// Single anchor — every other Date in this file is derived from this via
// UTC ms offsets. Keeps fixtures host-tz-agnostic and run-to-run stable.
const REF_DATE = new Date("2026-05-28T12:00:00.000Z");
const TODAY_STAMP = "2026-05-28";

function refOffsetDays(days: number): Date {
  return new Date(REF_DATE.getTime() + days * 24 * 60 * 60 * 1000);
}

// ──────────────────────────────────────────────────────────────────────
// Fixture builders
// ──────────────────────────────────────────────────────────────────────

function smallFixture(): SnapshotInputs {
  return {
    areas: [{ id: "area_01", name: "Research" }],
    projectsActive: [],
    projectsUpcoming: [],
    recentCaptures: [],
    todayCalendar: [],
    todayDate: TODAY_STAMP,
    activeTasks: [],
  };
}

function emptyFixture(): SnapshotInputs {
  return {
    areas: [],
    projectsActive: [],
    projectsUpcoming: [],
    recentCaptures: [],
    todayCalendar: [],
    todayDate: TODAY_STAMP,
    activeTasks: [],
  };
}

function typicalFixture(): SnapshotInputs {
  // ~5 areas, 5 active projects + 1 upcoming, 30 captures (12-word content),
  // 8 calendar events, 10 active tasks — target token budget 800-2000
  // (3200-10000 chars at ~4 chars/token).
  const areas = [
    { id: "area_01", name: "Research" },
    { id: "area_02", name: "Health" },
    { id: "area_03", name: "Finance" },
    { id: "area_04", name: "Studies" },
    { id: "area_05", name: "Creative" },
  ];
  const projectsActive = [
    { id: "proj_01", name: "Phase 11 prompt-cache state-priming", areaId: "area_01" },
    { id: "proj_02", name: "Sub-15-week marathon training cycle", areaId: "area_02" },
    { id: "proj_03", name: "Q3 quarterly tax filing preparation", areaId: "area_03" },
    { id: "proj_04", name: "Differential geometry textbook reading", areaId: "area_04" },
    { id: "proj_05", name: "Watercolor sketchbook practice routine", areaId: "area_05" },
  ];
  const projectsUpcoming = [
    { id: "proj_06", name: "Reading list: Gödel Escher Bach", areaId: "area_01" },
  ];
  const recentCaptures = Array.from({ length: 30 }, (_, i) => ({
    id: `cap_${String(i + 1).padStart(3, "0")}`,
    createdAt: refOffsetDays(-i),
    content: `Capture number ${i + 1} placeholder content with roughly twelve words for typical fixture density check.`,
  }));
  const todayCalendar = [
    { id: "evt_01", startHHMM: "09:00", endHHMM: "10:00", title: "Deep work — JARVIS caching block" },
    { id: "evt_02", startHHMM: "10:30", endHHMM: "11:00", title: "Standup with research collaborators" },
    { id: "evt_03", startHHMM: "11:15", endHHMM: "12:00", title: "Code review queue triage" },
    { id: "evt_04", startHHMM: "13:00", endHHMM: "13:30", title: "Lunch with Maya at the cafe" },
    { id: "evt_05", startHHMM: "14:00", endHHMM: "15:30", title: "Phase 11 plan execution focus block" },
    { id: "evt_06", startHHMM: "16:00", endHHMM: "16:30", title: "Marathon training easy recovery run" },
    { id: "evt_07", startHHMM: "17:00", endHHMM: "17:45", title: "Differential geometry textbook chapter" },
    { id: "evt_08", startHHMM: "19:00", endHHMM: "20:00", title: "Watercolor sketchbook practice session" },
  ];
  const activeTasks = Array.from({ length: 10 }, (_, i) => ({
    id: `task_${String(i + 1).padStart(3, "0")}`,
    status: i % 2 === 0 ? "not started" : "in progress",
    dueAt: i === 3 ? null : refOffsetDays(i),
    title: `Active task number ${i + 1} with a realistic descriptive title for fixture density`,
    projectId: i < 8 ? `proj_${String((i % 5) + 1).padStart(2, "0")}` : null,
  }));
  return {
    areas,
    projectsActive,
    projectsUpcoming,
    recentCaptures,
    todayCalendar,
    todayDate: TODAY_STAMP,
    activeTasks,
  };
}

function heavyFixture(): SnapshotInputs {
  // 5 areas, 10 active projects (5 will be sliced), 10 upcoming (5 sliced),
  // 100 captures (50 sliced), 8 calendar events, 50 tasks (10 sliced).
  const areas = [
    { id: "area_01", name: "Research" },
    { id: "area_02", name: "Health" },
    { id: "area_03", name: "Finance" },
    { id: "area_04", name: "Studies" },
    { id: "area_05", name: "Creative" },
  ];
  const projectsActive = Array.from({ length: 10 }, (_, i) => ({
    id: `proj_act_${String(i + 1).padStart(2, "0")}`,
    name: `Active project ${i + 1}`,
    areaId: `area_0${(i % 5) + 1}`,
  }));
  const projectsUpcoming = Array.from({ length: 10 }, (_, i) => ({
    id: `proj_upc_${String(i + 1).padStart(2, "0")}`,
    name: `Upcoming project ${i + 1}`,
    areaId: `area_0${(i % 5) + 1}`,
  }));
  const recentCaptures = Array.from({ length: 100 }, (_, i) => ({
    id: `cap_${String(i + 1).padStart(3, "0")}`,
    createdAt: refOffsetDays(-i),
    content: `Capture ${i + 1}`,
  }));
  const todayCalendar = [
    { id: "evt_01", startHHMM: "09:00", endHHMM: "10:00", title: "Morning block" },
    { id: "evt_02", startHHMM: "10:30", endHHMM: "11:00", title: "Standup" },
    { id: "evt_03", startHHMM: "11:15", endHHMM: "12:00", title: "Triage" },
    { id: "evt_04", startHHMM: "13:00", endHHMM: "13:30", title: "Lunch" },
    { id: "evt_05", startHHMM: "14:00", endHHMM: "15:30", title: "Focus block" },
    { id: "evt_06", startHHMM: "16:00", endHHMM: "16:30", title: "Recovery run" },
    { id: "evt_07", startHHMM: "17:00", endHHMM: "17:45", title: "Reading" },
    { id: "evt_08", startHHMM: "19:00", endHHMM: "20:00", title: "Practice" },
  ];
  const activeTasks = Array.from({ length: 50 }, (_, i) => ({
    id: `task_${String(i + 1).padStart(3, "0")}`,
    status: "not started",
    dueAt: refOffsetDays(i),
    title: `Task ${i + 1}`,
    projectId: `proj_act_${String((i % 10) + 1).padStart(2, "0")}`,
  }));
  return {
    areas,
    projectsActive,
    projectsUpcoming,
    recentCaptures,
    todayCalendar,
    todayDate: TODAY_STAMP,
    activeTasks,
  };
}

// Helper — count `\n- ` line starts (list item markers) inside an XML block.
function countListItems(output: string, openTag: string, closeTag: string): number {
  const openIdx = output.indexOf(openTag);
  const closeIdx = output.indexOf(closeTag, openIdx);
  if (openIdx === -1 || closeIdx === -1) return 0;
  const slice = output.slice(openIdx, closeIdx);
  const matches = slice.match(/\n- /g);
  return matches ? matches.length : 0;
}

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────

describe("renderUserState", () => {
  it("renders all 5 sections even on empty inputs", () => {
    const output = renderUserState(emptyFixture());
    // 5 named sections = 6 XML blocks (projects splits active/upcoming).
    expect(output).toContain("<areas>\n</areas>");
    expect(output).toContain('<projects status="active">\n</projects>');
    expect(output).toContain('<projects status="upcoming">\n</projects>');
    expect(output).toContain('<recent_captures count="0">\n</recent_captures>');
    expect(output).toContain(`<today_calendar date="${TODAY_STAMP}">\n</today_calendar>`);
    expect(output).toContain('<active_tasks count="0">\n</active_tasks>');
  });

  it("is byte-identical when inputs are shuffled", () => {
    const a = typicalFixture();
    const outA = renderUserState(a);

    // Reverse every array — same elements, opposite order. After internal
    // sort-by-id ASC, both renders MUST produce identical strings.
    const b: SnapshotInputs = {
      areas: [...a.areas].reverse(),
      projectsActive: [...a.projectsActive].reverse(),
      projectsUpcoming: [...a.projectsUpcoming].reverse(),
      recentCaptures: [...a.recentCaptures].reverse(),
      todayCalendar: [...a.todayCalendar].reverse(),
      todayDate: a.todayDate,
      activeTasks: [...a.activeTasks].reverse(),
    };
    const outB = renderUserState(b);

    expect(outB).toBe(outA);
  });

  it("strips time from capture dates", () => {
    const inputs: SnapshotInputs = {
      ...emptyFixture(),
      recentCaptures: [
        {
          id: "cap_001",
          createdAt: new Date("2026-05-28T14:32:17.123Z"),
          content: "test capture",
        },
      ],
    };
    const output = renderUserState(inputs);
    // Pull the captures block to scope our regex assertions tightly.
    const startIdx = output.indexOf("<recent_captures");
    const endIdx = output.indexOf("</recent_captures>");
    const block = output.slice(startIdx, endIdx);

    expect(block).toContain("(2026-05-28)");
    expect(block).not.toMatch(/T\d{2}:\d{2}/);
    expect(block).not.toContain("14:32");
  });

  it("renders calendar events as HH:MM-HH:MM only (no seconds, no TZ)", () => {
    const inputs: SnapshotInputs = {
      ...emptyFixture(),
      todayCalendar: [
        { id: "evt_01", startHHMM: "09:00", endHHMM: "10:00", title: "Test event" },
      ],
    };
    const output = renderUserState(inputs);
    const startIdx = output.indexOf("<today_calendar");
    const endIdx = output.indexOf("</today_calendar>");
    const block = output.slice(startIdx, endIdx);

    expect(block).toMatch(/\b\d{2}:\d{2}-\d{2}:\d{2}\b/);
    // No second-precision (HH:MM:SS). Also no `+`-sign TZ offset (a `-`
    // sign TZ would collide with the HH:MM-HH:MM range form, so we
    // assert structurally: every line matches exactly the
    // `- HH:MM-HH:MM "title"` shape — anything richer (TZ, seconds,
    // `Z`-suffix) would extend it.
    expect(block).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(block).not.toContain("+");
    expect(block).not.toMatch(/\d{2}:\d{2}Z/);
    // Structural shape lock: every event line is exactly
    // `- HH:MM-HH:MM "..."` with no time-zone trailer before the quote.
    const eventLines = block
      .split("\n")
      .filter((line) => line.startsWith("- "));
    for (const line of eventLines) {
      expect(line).toMatch(/^- \d{2}:\d{2}-\d{2}:\d{2} "[^"]*"$/);
    }
  });

  it("renders — for null task due", () => {
    const inputs: SnapshotInputs = {
      ...emptyFixture(),
      activeTasks: [
        {
          id: "task_001",
          status: "not started",
          dueAt: null,
          title: "no-due task",
          projectId: null,
        },
        {
          id: "task_002",
          status: "in progress",
          dueAt: new Date("2026-06-01T00:00:00Z"),
          title: "due task",
          projectId: "proj_01",
        },
      ],
    };
    const output = renderUserState(inputs);

    // Literal em dash for null due.
    expect(output).toContain("due —");
    // Concrete YYYY-MM-DD for non-null due.
    expect(output).toContain("due 2026-06-01");
    // Null projectId renders as em dash trailing.
    expect(output).toContain('"no-due task" — —');
    expect(output).toContain('"due task" — proj_01');
  });

  it("caps lists at 50 captures / 10 tasks / 5 active projects / 5 upcoming projects", () => {
    const output = renderUserState(heavyFixture());

    // Counts reflect POST-cap (slice length), not input length.
    expect(output).toContain('<recent_captures count="50">');
    expect(output).toContain('<active_tasks count="10">');

    // Verify literal line counts inside each block.
    expect(countListItems(output, "<areas>", "</areas>")).toBe(5);
    expect(countListItems(output, '<projects status="active">', "</projects>")).toBe(5);
    expect(countListItems(output, '<projects status="upcoming">', "</projects>")).toBe(5);
    expect(countListItems(output, "<recent_captures", "</recent_captures>")).toBe(50);
    expect(countListItems(output, "<active_tasks", "</active_tasks>")).toBe(10);
  });

  it("omits generated_at attribute entirely", () => {
    const outputs = [
      renderUserState(smallFixture()),
      renderUserState(typicalFixture()),
      renderUserState(heavyFixture()),
    ];
    for (const output of outputs) {
      expect(output).not.toContain("generated_at");
    }
  });

  it("produces 3200–10000 chars for typical-day fixture", () => {
    // Char count is a rough proxy for tokens (≈4 chars/token).
    // 800-2000 tokens = 3200-8000 chars; ceiling padded to 10000 for safety.
    // If this trips, the typical fixture has drifted off real-user scale —
    // recalibrate the fixture, NOT the bound.
    const output = renderUserState(typicalFixture());
    expect(output.length).toBeGreaterThanOrEqual(3200);
    expect(output.length).toBeLessThanOrEqual(10000);
  });
});
