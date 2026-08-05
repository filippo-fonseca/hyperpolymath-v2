---
task: craft-ui-v2
status: complete
completed: 2026-08-04
branch: feat/craft-ui-v2
---

# Summary — Craft UI v2

Shipped the canvas-vs-sheet restructure and propagated the deepened craft
register across LifeOS, Tasks, and Wiki. All units executed by parallel/serial
subagents per PLAN.md; verified with a production build, typecheck, targeted
vitest suites, and authenticated light + dark screenshots of every target
surface (evidence PNGs in this directory).

## Commits (in order)

| Commit | Subject |
|---|---|
| 6cf87262 | docs(planning): craft-ui-v2 quick task — plan and design-language reference |
| 9b411811 | feat(design): craft register v2 — canvas chrome, pills, chips, glass pops, day tiles |
| e33a5800 | feat(shell): sidebar becomes quiet canvas chrome |
| b425d19b | feat(shell): craft top bar — breadcrumb, cmd-k pill, icon cluster |
| 51953161 | feat(shell): jarvis command bar becomes the floating pill |
| 2cf1b35b | feat(shell): dock sheds its panel — widgets carry the elevation |
| 5bd37def | feat(shell): stage sheet presence on the calm canvas |
| 4f7845e7 | feat(lifeos): craft v2 pass — bento tiles keep glass, gain the craft hover lift |
| 71ede1f0 | feat(lifeos): craft v2 pass — pill quick-send, chip view toggle |
| b163fab0 | feat(tasks): craft v2 pass — chip filters, bare-row list, lifted board |
| 8c0820f3 | feat(lifeos): craft v2 pass — calm hero |
| 13326d62 | feat(tasks): craft bare-row list — rows on the sheet, tinted meta chips |
| 68544dba | feat(tasks): lifted board — craft-card-hover cards, borderless tinted wells |
| 78b32784 | feat(wiki): retire the explorer's local ladder — join the craft register |
| fae8a5cf | feat(tasks): craft detail chips and pill composer |
| 1db30f71 | feat(wiki): craft v2 pass — carded explorer, sheet editor, glass menus |
| b54d54df | feat(design): craft-pill gains an in-register focus recipe |
| 581dbad7 | fix(design): calm the global scrollbar, let widget titles breathe |
| (this)   | docs(changelog): craft v2 entry + task summary |

## Verification

- `pnpm -C apps/web typecheck` and production `pnpm build` green on the
  combined tree.
- Vitest: side-panel contract 6/6; wiki suites (helpers 23, selection 3,
  breadcrumbs 2, preview 5, daily-page 12, references 15) all pass.
- Headless authed screenshots (verify:bootstrap stack) of /lifeos, /tasks
  (board, list, overview), /wiki (hub, folder, page) in light and dark.

## Gotchas recorded

- A dev server booted right after a production build can restore a stale
  Turbopack CSS compile from the shared `.next` dir; the app renders with the
  old stylesheet and no error. `rm -rf apps/web/.next` before `verify:bootstrap`
  when styles look impossibly absent.
- PLAN.md's invariant about `.wiki-explorer` redeclaring the `--sd-*` ladder
  was stale; the ladder was already structurally gone. Commit A of the wiki
  unit removed the remnants (dead reduced-motion rule, stale comments, three
  `--hud-cyan` literals).
- EB Garamond page titles were deliberately NOT applied: globals.css exposes
  the serif only as `--font-logotype` (Logotype.tsx is its one sanctioned
  consumer). Amending the type contract is a user decision.

## Follow-ups (not done)

- `LiteJarvisComposer` still carries `craft-glass-tile` under the QuickSend
  pill override; harmless but could be cleaned.
- The New Area dialog (and overlay layer generally) frosts via the cascade,
  but reads near-solid over flat scrims; tune `--glass-panel-bg` alpha if a
  glassier read is wanted.
- Duplicated glass recipe in `page-block-editor.css` (BlockNote suggestion
  menus take no className) must be kept in step with `.craft-glass-pop`.
