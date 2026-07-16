# unit-quick-wins — sd3 verification

Residual-register sweep + deferred defects. All 9 checklist items closed as atomic
commits; both gates green; headless evidence captured on port 3835.

## Gates (both green)
- `pnpm --filter web typecheck` → `tsc --noEmit` exit **0**, zero errors.
- `pnpm --filter web build` → exit **0** (all routes compiled; `/nutrition/stats`,
  `/wiki`, `/tasks`, etc. all present). Note: the build's page-data collection needs
  `DATABASE_URL`; the worktree shipped only `.env.local.example`, so the main-repo
  `.env.local` was copied in (gitignored, uncommitted) purely to let page-data
  collection run. TypeScript compilation + bundling were green before that.
- Clean boot: dev server `Ready in 247ms` on :3835, `GET / 200`.

## Per-item results
1. **PASS** — Landing diagrams regenerated dark (`b02f3b3c`). `stack.svg` +
   `architecture.svg` now near-black indigo ground (`hsl(235 16% 9%)`),
   `--sd-line` hairlines, cyan (#22D3EE) on the default/agent path, sans/mono labels
   (serif dropped). Verified in situ on the live landing page — see
   `sd3-quickwins-diagrams-light.png` (SVGs are static dark assets, identical in both
   themes; information content preserved: Web / Desktop / Polypad → JARVIS backend).
2. **PASS** — Projects detail body → sd tokens (`2c318b4d`). `components/projects/**`
   body components de-glassed to `--sd-*`; grep sweep of `components/projects` shows only
   descriptive comments + sanctioned `--ink-amber` edit-underline. typecheck/build green.
   (Authed surface — Conductor pixel-verifies on :3000 post-merge, §1.)
3. **PASS** — Area badge is click-to-change (`a55fa078`). New `AreaPicker.tsx`
   (Radix Popover + search Input + `--sd-*` surface, cyan-checked current area, chevron
   affordance) mirrors the IconPicker grammar; selection calls `moveProjectToArea` +
   optimistic swap + `router.refresh()`. Compiles; interactive, so verified by code +
   build (static shot would not exercise the popover).
4. **PASS** — Tasks residual glass excised (`53db2bb2`). InboxColumn glass-tile → solid
   `--sd-box`; recurrence pills + project-autocomplete chips + TasksClient toolbar drop
   `backdrop-blur`. Grep confirms **no live `backdrop-blur`/`.glass-tile`/`.glass-button`
   class remains** in `components/tasks/**` (only comments + `--glass-*` var refs, which
   are out of the "4 known glass hits" fence).
5. **PASS** — Wiki journal residue swept (`f56b51de`). JournalCards `font-serif`→`font-sans`,
   `--ink`→`--sd-ink`; `journal-rail.css` drops dead `.glass-*` neutralizer selectors +
   tokenizes the inset hairline.
6. **PASS** — `page-block-editor.css` de-glassed (`c63ea2a8`). Glass rules → solid sd
   surfaces (no `backdrop-blur`/glow); was-`.glass-button` self-contained sd surface.
7. **PASS (partial, fenced)** — SFX cues wired (`7e6bbe11`). `viewToggle` replaces the
   legacy `playPop()` on feature-tab change in `TopTabBar.tsx:113` (one cue, not two);
   `taskComplete` fires in `TaskListRow` on the completing direction only (`:135`,`:153`),
   never on un-complete. `dialogOpen` + `error` cues left unwired — their homes
   (`components/ui/dialog.tsx` primitive; a shared toast/error path) are OUTSIDE this
   unit's fence (unit-primitives). Assumption logged.
8. **PASS** — Nutrition macro-trend legend added (`43aaba36`). 3 mono legend chips below
   the plot, each swatch bound to the same token as its `<Line>` stroke:
   PROTEIN=`--sd-accent` (cyan), CARBS=`--ink-amber`, FAT=`--ink-coral`. Verified with
   real render (throwaway `qw-trend-preview` route, mock data, deleted after capture) —
   see `sd3-quickwins-nutrition-legend-dark.png` / `-light.png`: swatch colours match the
   line strokes 1:1, mono uppercase labels.
9. **PASS** — Inert `animate-*` audit (`e01521b6`). The pages "Saved" chip relied on the
   inert `animate-fade-in` (tailwindcss-animate absent); replaced with an ADDITIVE
   `sd-fade-in` keyframe in `globals.css` (opacity + 3px lift, 140ms, reduced-motion
   collapse). No plugin added. Remaining inert `animate-in/out` live in
   `components/ui/*` Radix primitives (unit-primitives fence) — noted for handoff, not
   touched. Assumption logged.

## Fence discipline
- `globals.css` change was ADDITIVE only (single `sd-fade-in` keyframe). §0 honored.
- `components/ui/` primitives NOT touched (dialogOpen/error cues + inert primitive
  animations handed to unit-primitives).
- Server hygiene §3: killed ONLY tcp:3835 (`lsof -ti tcp:3835 | xargs kill`); never a
  broad `pkill`. Browser: global `/tmp/bgsd-browser.lock` acquired only during capture,
  released immediately; ONE browser at a time.

## Auth fallback (§1)
`/nutrition/stats`, projects-detail, and other `(app)` surfaces are auth-gated → redirect
to `/sign-in` headless. Sanctioned §1 fallback used: sign-in gate captured
(`sd3-quickwins-authgate-fallback-light.png`); for the Conductor-flagged legend defect a
throwaway preview route gave a real render (deleted, tree clean). The Conductor
pixel-verifies authed surfaces on :3000 post-merge.

## Evidence (`.planning/`, `sd3-quickwins-` prefix)
- `sd3-quickwins-diagrams-light.png` — landing stack diagram dark in situ.
- `sd3-quickwins-nutrition-legend-dark.png` / `-light.png` — macro-trend legend, both themes.
- `sd3-quickwins-authgate-fallback-light.png` — §1 auth-gate fallback.

Status → **awaiting_review**. Waiting for Conductor.
