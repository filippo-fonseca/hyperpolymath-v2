# VERIFICATION — Unit 1: Spacedrive foundation and app shell

Run `sesh-1783863067187`. Evidence for the verification bar (no silent green).

## Automated gates — this unit

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm --filter web typecheck` (`tsc --noEmit`) | **PASS** — exit 0. (First run surfaced 3 TS2745/TS2322 errors in `DeckPanel.tsx` from the polymorphic `as` collapsing `children` to `never`; fixed by rendering via `createElement`, commit `f76d22b0`.) |
| Lint | `biome check` on net-new + edited files | **PASS** — 0 findings on `components/spacedrive/**`, the 2 new test files, and `globals.css`. The edited shell files add **zero new** findings; the repo's pre-existing biome debt (organizeImports / useTemplate / noArrayIndexKey / noNonNullAssertion on lines this unit never touched) is left untouched by design. |
| This unit's tests | `vitest run tests/spacedrive-primitives.test.tsx tests/shell-sidebar-contract.test.tsx` | **PASS** — 18/18. |
| Build | `pnpm --filter web build` (`next build`) | **PASS** — exit 0, compiled + 37/37 static pages generated + finalized. |

## Full test suite — honest status

`pnpm --filter web test` reports **38 pre-existing, environmental failures** across
21 files (`*rls*`, `jarvis-executor*`, `journal/*`, `voice-*`, `studio/summaries`).
These are NOT caused by this unit:

- Failure mode is environmental: Postgres `connection refused` / `ErrorResponse`
  (RLS + journal + folder tests need a live DB) and `Groq API key invalid` /
  `anthropic 500` (API-gated integration tests). The headless worktree has no
  DATABASE_URL / API keys.
- Zero overlap with this unit's diff: none of the failing files import
  `globals.css`, `components/spacedrive/**`, or `components/shell/**`. The code
  they exercise is byte-identical to the base commit `e205d7b6`, so they fail
  identically there. (A caller-side note, not this unit's silent green.)

This unit's own tests are all green within the full run.

## Code review

`gsd-code-reviewer` over `git diff e205d7b6..HEAD -- apps/web/` →
**0 Critical / 0 High / 0 Medium / 2 Low** (see REVIEW.md). Independently verified:
frozen contracts intact (no href/aria/role/storage-key/event/data-tour/query
change), token aliases resolve correctly in both themes, primitive a11y sound,
`duration-[var(--dur-hover)]` compiles to a real `transition-duration`. LO-01
(Space `preventDefault` assertion) addressed in commit `cfaa264f`; LO-02 (the
sidebar-collapsed serialization guard is tautological) is a documented, accepted
limitation — rendering the full `Sidebar` for a contract test would require a
brittle mock tree (query client, realtime, server actions, dnd-kit).

## Deferred to bgsd Loop-1 verify

Criterion 6's **signed-in browser pass on port 3105 with zero console errors** is
the province of the Conductor's Loop-1 verify (`bgsd-verify` / tester) against a
booted, authenticated app — it needs Supabase auth + DB not provisioned in this
headless pipeline run. Not claimed as done here; handed off honestly.
