# Issue #41 recap — hashtags render as styled tokens without Enter

**Status:** resolved (closes #41)
**Branch:** `kiwi/auto/2026-06-15-issue-41`
**Pipeline:** `/gsd:quick` (worktrees disabled for this run; committed directly on the current branch; nothing pushed)

## The bug

In capture inputs (`CaptureComposer`, `CaptureDetailPanel`), typing `#word`
only flipped to the styled sage-chip register after the user committed via
the TipTap Mention suggestion popover — which in practice meant pressing
Enter on the highlighted suggestion. The save-path parser and the right-rail
filter already worked on the plain `#word` text, so the visual treatment was
the only thing lagging behind. From a user's POV: filtering recognises the
tag immediately, but the tag itself looks like ordinary serif text until
they hit Enter.

## The fix

One new TipTap extension: `apps/web/components/captures/hashtag-decorations.ts`.
It mounts a ProseMirror plugin that, on each `docChanged`, scans text nodes
with the **same regex the save-path parser uses**
(`/(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu`) and emits an inline `Decoration`
with class `hashtag-chip-live` for every match. Decorations don't modify the
document — they're a pure view layer — so the existing Mention popover,
Mention nodes, `parseEditor`/`parseEditorJSON`, and filter behaviour all stay
unchanged. The scanner can't double-style committed Mention nodes because
their literal `#tag` text lives in `node.attrs.label`, not as a doc text
node.

Wired into the two capture-input surfaces called out by the issue:

- `apps/web/components/captures/CaptureComposer.tsx`
- `apps/web/components/captures/CaptureDetailPanel.tsx`

A sibling CSS class `.hashtag-chip-live` was added next to the existing
`.hashtag-chip-inline` in `apps/web/app/globals.css`. Same sage register,
same font/size, but `display: inline` (not `inline-block`) so the wrapping
span flows with text and doesn't disrupt the caret mid-word.

To make ProseMirror primitives importable from app code, `@tiptap/core` and
`@tiptap/pm` were promoted from transitive to direct deps in
`apps/web/package.json` (both pinned to `3.23.1`, exactly matching the other
tiptap packages already in the lock).

## Files touched (scope kept tight)

Code (committed as the `feat` commit that closes #41):

- `apps/web/components/captures/hashtag-decorations.ts` — new extension
- `apps/web/components/captures/CaptureComposer.tsx` — wire extension
- `apps/web/components/captures/CaptureDetailPanel.tsx` — wire extension
- `apps/web/app/globals.css` — `.hashtag-chip-live` rule
- `apps/web/package.json` — `@tiptap/core`, `@tiptap/pm`
- `pnpm-lock.yaml` — match

Planning (committed as a separate `docs` commit):

- `.planning/quick/260615-n1x-hashtag-realtime-tokens/260615-n1x-PLAN.md`
- `.planning/quick/260615-n1x-hashtag-realtime-tokens/260615-n1x-SUMMARY.md`
- `.planning/STATE.md` — Quick Tasks row + Last activity
- `.kiwi-auto/ISSUE-41-recap.md` (this file)

## Verification

- `pnpm --filter web typecheck` — my new file and edits are clean. There are
  pre-existing TS errors in `tests/api-jarvis-tts.test.ts` (about
  `NextRequest` typing) that exist on the unmodified branch — unrelated to
  this issue; left alone.
- `pnpm exec biome check apps/web/components/captures/hashtag-decorations.ts`
  — clean. The other touched files have pre-existing biome notes
  (organize-imports, useExhaustiveDependencies) that are also present on the
  unmodified branch; out of scope for #41 and not touched.
- Live UI smoke (typing `#idea` and watching the chip render in real time)
  was not run in a browser from this automated session; the change is
  contained enough that the unit-level verification above is high-confidence,
  but a 30-second eyeball in `pnpm dev` is left to the user.

## Notes for the human reviewer

- During the session, an old `git stash` (May 31, `pre-physical-extension-branch`)
  somehow surfaced a set of pre-existing unrelated untracked files into the
  worktree (`apps/web/components/insights/CapturesInsights.tsx`,
  `OverviewDashboard.tsx`, `TasksInsights.tsx`, landing/lifeos/insights
  variants, plus a `supabase/migrations/0016_habit_completion_status.sql` and a
  `.claude/` runtime dir). **None of these were committed by this run** — only
  the files listed under "Files touched" above were staged. The stash itself
  was left intact (`stash@{0}` from 2026-05-31 is still present). Cleaning
  those orphan untracked files up — or applying / dropping the May stash — is
  intentionally left to the human.
- JARVIS console (`JarvisInput`) uses the same `.hashtag-chip-inline` styling
  through the same Mention extension and would benefit from the same live
  decoration. The issue's wording ("all capture input surfaces") is narrower
  than JARVIS, so this was deliberately left out of scope. Trivial follow-up
  if wanted: add `HashtagDecorations` to JarvisInput's `extensions` array.
- Per session policy, this run did **not** `git push`. The branch is ready
  for review locally.
