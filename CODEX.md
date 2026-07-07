# CODEX.md - Codex operating notes for this bgsd repo

This repo is a bgsd repo. Treat bgsd conventions as part of the engineering
contract, even when working from Codex instead of Claude Code.

## What bgsd is

`better-gsd` (`bgsd`) is an orchestration layer on top of GSD. Its normal user
interface is one Conductor session:

```text
/bgsd-sesh "what to build"
```

The Conductor, usually named Kiwi, sizes the request, splits larger work into
units, runs isolated worker agents in git worktrees, verifies each unit, merges
verified work onto the standing integration branch, and then opens a human
review gate. The production branch is never written by an agent.

The hard invariants:

- Agents never write to `main` or another production branch.
- Verified work lands on the configured integration branch, `next` in this repo.
- `next -> main` is always a manual human merge.
- No silent green: insufficient evidence is not a pass.
- The backlog is `.bgsd/queue`, not an ad hoc planning file.
- Session memory lives in `.bgsd/`.

## Local repo configuration

Read these before substantive work:

- `BGSD.md` - this repo's bgsd settings and notes.
- `CLAUDE.md` - includes the managed bgsd block and GSD workflow guidance.
- `.bgsd/ledger.md` - session index.
- `.bgsd/queue/queue.json` - durable backlog.
- `.bgsd/seshs/` and `.bgsd/runs/` - historical and in-flight session records
  when present.

Current local bgsd settings of note:

- `integration_branch`: `next`
- `git.integration_to_main`: `manual`
- env propagation includes `.env`, `.env.local`, and `.env.*.local`
- GitHub issue/PR machinery is enabled when a remote exists
- repo note: start the web/API server on `:3000` with the desktop app; prefer
  `tools/hyperpolymath/hyperpolymath.mjs` for stack orchestration
- repo note: commit small, atomic units; stage explicit pathspecs only

## Codex-specific behavior

Upstream bgsd is harness-agnostic and documents a Codex path. If the bgsd plugin
source tree is present in a repo, the Codex-friendly launcher is:

```sh
node bgsd/scripts/conductor.mjs "<what to build>" [--project|--feature|--quick]
```

That launcher loads the real `/bgsd-sesh` instructions and drives the same
durable `.bgsd/` state from Codex.

In this repo, the `.bgsd/` state and `BGSD.md` are present, but the upstream
`bgsd/scripts/` plugin source tree is not part of the checkout. Therefore, from
Codex:

1. Respect bgsd conventions directly.
2. Ask whether the user wants a true bgsd session for large build/fix work if
   the surrounding client can run slash commands.
3. If the user wants direct Codex work, proceed but keep the same safeguards:
   small scoped changes, explicit verification, no production-branch assumptions,
   no fabricated pass, and no hidden backlog/planning state.

The user may say to proceed in a faster or "yolo" style. Interpret that as
permission to avoid unnecessary confirmation, not as permission to skip branch
safety, verification, or care with existing worktree changes.

## Starting work

Before changing code:

1. Check local state:
   ```sh
   git status --short
   git branch --show-current
   ```
2. Read the relevant app/package docs and nearby code.
3. Check `.bgsd/ledger.md` and `.bgsd/queue/queue.json` when the task may relate
   to prior or deferred work.
4. For larger work, prefer bgsd session semantics:
   - quick: small fix, doc update, narrow behavior change
   - feature: coherent feature or a few related units
   - project: broad work with multiple surfaces or unclear scope

If a real bgsd session is available, use `/bgsd-sesh`. Otherwise, emulate the
discipline manually in Codex: plan briefly, implement in focused units, verify,
and report residual risk.

## Queue and recall

Do not create a random backlog file.

For deferred work, use the bgsd queue if the bgsd scripts are available:

```sh
node bgsd/scripts/queue.mjs add --title "<title>" --body "<details>"
```

If the scripts are not available, update `.bgsd/queue/queue.json` only with a
clear user request or leave the item in the final response as an explicit
follow-up. Do not hide it in `.planning/`.

For past-session context, prefer:

```sh
node bgsd/scripts/kb.mjs --query "<terms>"
```

If `kb.mjs` is unavailable, read `.bgsd/ledger.md`, `.bgsd/seshs/`, and
`.bgsd/runs/` directly.

## Branch and commit discipline

- Do not write to or merge into `main`.
- Treat `next` as the bgsd integration branch.
- Do not work directly on `next` by default. Normal BGSD flow is:
  1. start from the integration branch,
  2. create an isolated worktree/feature branch for the unit,
  3. copy required env files into that worktree,
  4. implement and verify there,
  5. merge the verified branch back into `next`.
- Only commit directly on `next` when a brief explicitly says all commits land
  on `next` or the user gives that exact instruction after being told it
  bypasses the normal BGSD feature-branch lane.
- If Codex accidentally commits directly to `next`, do not rewrite history
  automatically. Stop, tell the user exactly which commits landed on `next`,
  and ask whether to leave them or move them onto a feature branch/reset `next`.
- Do not run destructive git commands unless explicitly requested.
- Preserve user changes in the dirty worktree.
- Commit only when asked or when the workflow explicitly requires it.
- If committing, make atomic commits and stage explicit paths:
  ```sh
  git add path/to/file another/path
  git commit -m "type(scope): concise summary"
  ```
- Never use `git add -A` or `git add .` for repo-wide staging.

## Env propagation

BGSD worktrees do not automatically inherit gitignored env files. Before
running, testing, or launching the app in a BGSD/Codex worktree:

1. Copy the configured env files from the source checkout into the worktree:
   `.env`, `.env.local`, and `.env.*.local` where present.
2. For this repo, make sure at least these local keys are present in
   `apps/web/.env.local` when exercising JARVIS web search:
   - `ANTHROPIC_API_KEY`
   - `BROWSERBASE_API_KEY`
3. Never print secret values in logs or final responses. Verify only presence /
   non-empty status.
4. Never commit env files or env placeholders containing real secrets.
5. Do not add `BROWSERBASE_PROJECT_ID`; Browserbase Search/Fetch in this repo
   uses `BROWSERBASE_API_KEY` only.

## Verification standard

bgsd's verification doctrine applies to Codex work:

- A test/build/check that was not run is not evidence.
- A blocked check must be reported as blocked.
- A UI claim should be backed by browser-level evidence when feasible.
- Console, network, DOM, and screenshot evidence are stronger than visual
  inspection alone.
- Never describe work as passing unless the relevant checks actually passed.

For this repo, choose the narrowest meaningful checks first: package-specific
typecheck/test/build, then broader workspace checks if the touched surface
requires it. If a dev server is needed for user-facing UI work, start it and give
the user the URL.

## Practical command memory

Useful local commands and files:

```sh
pnpm --filter web dev
pnpm --filter web typecheck
pnpm --filter desktop typecheck
pnpm --filter @hyperpolymath/jarvis-core test
node tools/hyperpolymath/hyperpolymath.mjs
```

Confirm exact scripts in `package.json` files before relying on these names.

## Source understanding

This file is based on:

- upstream `better-gsd` README and docs
- upstream `AGENTS.md` Codex guidance
- this repo's `BGSD.md`
- this repo's managed bgsd block in `CLAUDE.md`

When upstream bgsd behavior and this repo's `BGSD.md` conflict, prefer this
repo's `BGSD.md` for local operation.
