# u1-timeline-engine — control report

VERDICT: PASS — engine + 71 tests land green and tsc is clean; `pnpm --filter web test` is red repo-wide from 31 PRE-EXISTING jarvis/voice failures reproduced at base b5576f77 with my code absent (see GATES).

SUMMARY:
- `lib/projects/timeline.ts` is new and implements the full seed API: anchors, window/zoom math, two-tier columns, bar geometry, drag math, area grouping. Pure, UI-free, no I/O.
- `semesterStartISO(term, year)` added to `lib/projects/archive-status.ts` mirroring `semesterEndISO`. Terms tile the year without overlapping: fall→Sep 1, spring→Jan 1, summer→Jun 1.
- All date math is ISO-string math. Dates become numbers only via `isoToEpochDay`, which slices the parts out of the string and hands them to `Date.UTC`. Zero `new Date("YYYY-MM-DD")`.
- The timezone rule is PROVEN, not asserted: the suite is green under TZ=UTC, Pacific/Kiritimati (UTC+14), Pacific/Midway (UTC-11), America/New_York, Asia/Kolkata.
- 71 tests in `lib/projects/__tests__/timeline.test.ts` cover every criteria bullet plus the DESIGN.md engine-facing edge cases (undated, open-ended, corrupt, clamping both edges, per-zoom snapping, sentinel ordering, semester anchors, ghosts, zero areas/projects).
- **u3/u4 MUST READ API DEVIATIONS**: `columnsForWindow` cannot stamp `isCurrent` (its signature takes no todayISO), so callers pipe through the new `markCurrentColumn`. The major header tier is a second function, `headerGroupsForWindow`.
- Window clamping keeps today in view in every case, including all-past and all-future project sets — the property that makes MAX_WINDOW_DAYS safe.
- Scope respected: no schema, no migrations, no UI, no page edits. A biome auto-fix strayed onto pre-existing lines of `archive-status.ts` and was reverted to keep the diff focused.

COMMITS:
- 389dc6b0 feat(timeline-engine): add semesterStartISO mirroring semesterEndISO
- e6c26b28 feat(timeline-engine): pure date/geometry engine for the projects timeline
- a8dd0b14 style(timeline-engine): apply biome format to the engine
- 00f85d9e test(timeline-engine): cover anchors, window, columns, bars, drag, grouping
- fa081256 docs(planning): seal u1 design contract, scout reports, and unit brief

All on branch `bgsd/sesh-1784257742502/u1-timeline-engine`. Nothing pushed, merged, or PR'd; next/main/staging untouched. Working tree clean. Files changed vs base: `lib/projects/timeline.ts` (new), `lib/projects/archive-status.ts` (+semesterStartISO), `lib/projects/__tests__/timeline.test.ts` (new), and `.planning/**` — all inside the unit's declared scope.

GATES:
- `pnpm --filter web test` → **FAIL repo-wide, PASS for this unit.** Test Files 17 failed | 123 passed (140); Tests 31 failed | 1047 passed | 2 skipped | 3 todo (1083). All 17 failing files are jarvis/voice/whatsapp (`PostgresError: invalid input syntax for type uuid`, live-DB and API-key dependent). NOT MINE and NOT NEW: verified by checking out base b5576f77 into a throwaway worktree and running `tests/jarvis-executor.test.ts tests/voice-transcript-route.test.ts tests/api-jarvis-tts.test.ts` with my code absent → 3 failed (3), 7 failed | 21 passed. Identical signature. Worktree removed via `git worktree remove --force` + prune.
- `npx vitest run lib/projects/__tests__/timeline.test.ts tests/project-archive-status.test.ts` (from `apps/web`) → PASS. Test Files 2 passed (2); Tests 80 passed (80). My 71 plus the 9 pre-existing archive-status tests, still green.
- `npx tsc --noEmit` (from `apps/web`, = the repo's `typecheck` script) → PASS. Exit code 0, no output.
- Timezone sweep (extra gate, since the ISO rule is the unit's core criterion) → PASS at UTC / Pacific/Kiritimati / Pacific/Midway / America/New_York / Asia/Kolkata, 71 passed each.
- `npx biome check lib/projects/` → my two files clean after format. One pre-existing `lint/style/useImportType` violation remains on `archive-status.ts:1`; left alone deliberately (pre-existing, and lint is not a gate).

API DEVIATIONS:
All are ADDITIVE or forced by the seed's own signatures. Nothing from the seed was removed or renamed. Two items change how u3 calls the module:

1. **`isCurrent` needs `markCurrentColumn` (BEHAVIORAL — u3 must act).** The seed gives `TimelineColumn.isCurrent` but types `columnsForWindow(w, zoom)` with no `todayISO`, so the function cannot know today. `columnsForWindow` therefore returns `isCurrent: false` on every column, and callers pipe through the new `markCurrentColumn(columns, todayISO): TimelineColumn[]`. Keeps column geometry independent of the clock.
   → u3: `markCurrentColumn(columnsForWindow(w, zoom), todayISO)`.
2. **Major header tier is a second function (ADDITIVE — u3 must act).** The seed asks `columnsForWindow` to "expose both tiers", which its declared `TimelineColumn[]` return cannot do. `columnsForWindow` returns the MINOR tier (= the grid: days at weeks, weeks at months, months at quarters); new `headerGroupsForWindow(w, zoom): TimelineColumn[]` returns the MAJOR tier (weeks / months / quarters). The tiers do not nest (month groups cut across week columns), so each is positioned from its own dates and clipped to the window. Both tile the window exactly.
3. `TimelineWindow` gains `totalWidthPx: number` — the canvas width, so u3 does not re-derive it.
4. `TimelineColumn` gains `leftPx` and `widthPx` — positioning, so u3 does not re-derive it.
5. `TimelineBarGeometry` gains `clampedEnd: boolean` (real end outruns the window → right fade; distinct from `openEnded`) and `visible: boolean` (false when a clamped window excludes the project entirely; `leftPx`/`widthPx` are 0 — skip the render).
6. `TimelineGroup.projects` is `TimelineRowProject[]`, where `TimelineRowProject extends TimelineProjectInput { isGhost: boolean }`. The seed said ghosts must be "flagged" but gave `TimelineProjectInput[]`, which has nowhere to put the flag. Assignable to `TimelineProjectInput[]`, so this is source-compatible.
7. `groupByArea(areas: TimelineAreaInput[], ...)` — the seed left `areas` untyped. `TimelineAreaInput = { id, name, emoji: string | null, orderIndex, createdAt: string | Date }`; `orderIndex` and `createdAt` are required by the seed's own ordering rule. `TimelineGroup.area.emoji` is `string | null`.
8. `barGeometry(p, w, _todayISO)` — the third parameter is unused (an open-ended bar runs to the window edge, not to today, per DESIGN.md). Kept in the signature for u3/u4 stability; positionally identical.
9. Extra exports, all additive: ISO helpers (`isoToEpochDay`, `epochDayToISO`, `addDaysISO`, `diffDaysISO`, `minISO`, `maxISO`, `clampISO`, `weekdayIndexISO`, `startOfWeekISO`, `endOfWeekISO`, `startOfMonthISO`, `endOfMonthISO`, `addMonthsISO`, `startOfQuarterISO`, `endOfQuarterISO`, `toDateISO`); constants `ZOOM_PADDING_DAYS`, `MAX_WINDOW_DAYS` (1096, ~3y), `MIN_BAR_WIDTH_PX` (8); helpers `todayOffsetPx(w, todayISO): number | null` (today's marker, null when off-window), `isoDateToPx` (inverse of `pxToISODate`), `pxToSnappedDayDelta(px, w, zoom)` (drag delta at the zoom's grain — u4 probably wants this over raw `snapISO`), `isProjectGhost`, `isSentinelArea`.

ASSUMPTIONS:
- **Semester start months are a judgement call**: fall→Sep 1, spring→Jan 1, summer→Jun 1. The seed said "derive sensible term start months from the existing end months" (Dec 31 / May 31 / Aug 31). Sep 1 rather than Aug 1 for fall so the three terms tile the year without overlapping summer. Yale's fall term does start late Aug, so a fall class with no explicit start may render ~2 weeks short at its left edge. One-line change if wrong.
- `ZOOM_PX_PER_DAY` = weeks 28 / months 8 / quarters 3, padding = 3 / 14 / 45 days. Picked so a day column is legible at weeks, a week column ~56px at months, a month column ~90px at quarters. Pure taste; u3 may want to retune, and the tests assert relationships rather than hard-coding these where practical.
- `MAX_WINDOW_DAYS` = 1096 (~3y), per the seed's "max ~3y span". Column snapping can push the final span a few days past the cap; the cap is a DOM-safety bound, not an exact contract, and the test asserts it accordingly.
- Weeks start Monday, matching `weekStartsOn: 1` in CalendarGrid, TrainingClient, and lib/tasks/date-shortcuts.
- The sentinel is identified structurally (`name === "No Area" && emoji === null`), copying `AreasPageClient.tsx:39-40` rather than inventing a flag.
- `groupByArea` KEEPS areas with zero projects (whether an empty lane renders is u3's call) and DROPS projects whose `areaId` was not passed in (/areas filters archived areas server-side, so their projects arrive orphaned).
- A project ending exactly today is NOT a ghost (`end < today`, reusing `isProjectExpired` verbatim).
- `pxToISODate` is deliberately UNCLAMPED: DESIGN.md says a drag past the window edge auto-scrolls, so u4 needs the true date, not one pinned to the edge.

DEFECTS/RISKS:
- **The repo's test suite is red at base** (31 failures across 17 jarvis/voice files, live-Postgres and API-key dependent). Nothing to do with this unit, but it means `pnpm --filter web test` cannot be used as a literal green/red gate for downstream units either — they should scope the runner to their own files and diff against base, as done here. Worth a Conductor decision (env fixture or quarantine) outside this unit.
- `barGeometry` warns once per project id via a module-level `Set`, so a drag re-render does not flood the console. The set is never cleared, so a corrupt row that is FIXED and then re-corrupted in the same page session warns only once. Deliberate: the console is a debugging aid, and flooding it during a 60fps drag is the worse failure.
- Bars are positioned from day offsets, so sub-day precision does not exist. Correct for `date` columns (no time component), but it means `MIN_BAR_WIDTH_PX` makes a 1-day bar at quarters zoom (3px → 8px) render ~2.7 days wide. Unavoidable without lying about the geometry; u3 should not reverse `pxToISODate` off a bar's rendered width.
- Two seed criteria are UI-facing and untestable here (left fade rendering, label overflow outside a narrow bar). The engine exposes the flags (`clampedStart`, `clampedEnd`, `openEnded`); u3 owns whether they render.
- `computeWindow` is O(n) per call with no memoization. Fine at the stated "tens of projects" non-goal; u3 should still `useMemo` it rather than recompute per drag frame.
