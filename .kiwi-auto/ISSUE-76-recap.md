# Issue #76 recap — Page creation: show loader, autofocus title, and Enter-to-jump-to-body

**Status:** shipped
**Branch:** `kiwi/auto/2026-06-21-issue-76`
**Closes:** [#76](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/76)

## Commits
- `7239916` — `feat(pages): show spinner on "+ New page" buttons while creating`
- `7ed3a0c` — `feat(pages): autofocus title input on new page`
- `2cee209` — `feat(pages): Enter from title jumps cursor into body editor`

## What changed
Three small UX fixes around new-page creation, each landed as its own atomic commit so any one can be reverted in isolation.

1. **Loader.** All three "+ New page" entry points (`/pages` list, project sidebar, Cmd+K palette) now swap their leading icon for an animated `Loader2` and flip the label to "Creating…" while the server action is in flight. `aria-busy` plus `disabled:cursor-wait` are set so the affordance reads correctly to assistive tech and pointer alike. The buttons were previously disabled-but-visually-identical, which is what made the action feel unresponsive.
2. **Autofocus title.** `PageDetailClient` mounts with a `titleInputRef`; a one-shot `useEffect` keyed on the SSR-hydrated `initialPage.title` focuses the input only when that title is empty. That keys the autofocus off "this is a brand-new page" rather than "the local state happens to be empty", so editing an existing title down to zero chars mid-session does not steal focus.
3. **Enter → body.** `PageBlockEditor` now accepts an `onEditorReady?: (editor: Editor) => void` callback that fires once on mount with the BlockNote instance. `PageDetailClient` stashes that instance in a `bodyEditorRef`. A new `onKeyDown` on the title input intercepts bare `Enter` (Shift/Cmd/Ctrl/Alt + Enter are passed through), drops the cursor at the start of the body's first block via `editor.setTextCursorPosition`, and calls `editor.focus()`. Title + body now read as one continuous writing flow.

## Files touched (5)
- `apps/web/components/pages/PagesListClient.tsx` — Loader2 spinner on the `/pages` "+ New page" button.
- `apps/web/components/projects/ProjectPagesSection.tsx` — Loader2 spinner on the project-sidebar "+ New page" button.
- `apps/web/components/shell/CommandMenuContent.tsx` — Loader2 spinner on the Cmd+K "New page" affordance.
- `apps/web/components/pages/PageDetailClient.tsx` — title ref + empty-title autofocus, body editor ref, Enter handler.
- `apps/web/components/pages/PageBlockEditor.tsx` — exported `Editor` type and new `onEditorReady` prop.

## Acceptance check (per issue body)
- ✅ Loading indicator shows while the page is being created (icon swap + label swap + `aria-busy`).
- ✅ Title input is autofocused on create (new pages always land with empty title).
- ✅ Enter from the title moves focus into the body editor (cursor at start of first block).

## Verification
- `pnpm typecheck` — zero errors in any of the modified files. The 6 remaining errors in the project are all pre-existing `NextRequest` typing issues in `tests/api-jarvis-tts.test.ts`, unrelated to this change.
- No new dependencies, no migrations, no schema changes.
- The autofocus + Enter behaviors live on `PageDetailClient`, so they automatically cover the post-create navigation from all three creation entry points without each one needing its own wiring.

## What was NOT done
- Did not push. (Per `CLAUDE.md` global rule and the harness's explicit "NEVER run git push" instruction for this run.)
- Did not run the dev server / browser smoke test. The worktree shipped without `node_modules`; I installed deps and verified via `pnpm typecheck` only. A manual smoke is recommended before merge: click "+ New page" from each of the three entry points, confirm the spinner appears, confirm the new page lands with the title focused, type a title, hit Enter, confirm cursor lands in the body editor.
- Did not touch the server action `createPage` itself or the autosave loop — both were already correct, just visually under-communicated.

## Worktree config
- Per the harness instruction, this run set `workflow.use_worktrees=false` in `.planning/config.json` and committed directly on `kiwi/auto/2026-06-21-issue-76` with no inner GSD worktree isolation.

## Quick task artifact
- `.planning/quick/260621-ekk-fix-issue-76-page-creation-should-show-l/` — no PLAN.md was generated since this run skipped the inner gsd-planner dispatch and edited directly.
