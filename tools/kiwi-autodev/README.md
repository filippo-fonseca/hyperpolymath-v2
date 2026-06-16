# Kiwi auto-dev worker

A local, unattended macOS worker that closes the loop on the daily
captures-to-issues cron. The cron files `kiwi-drafted` issues at 06:00 UTC; this
worker picks them up on your laptop, attempts safe fixes on isolated branches,
and surfaces results so you can review and merge manually.

Nothing here runs automatically until you run `./install.sh`. The executor that
created these files only created and committed them.

## What it does

Once installed, a LaunchAgent polls every 30 minutes while you are logged in.
Each poll runs a fast gate; the gate keeps the worker idle until the daily time
window has opened and at least one open `kiwi-drafted` issue exists. When
eligible, the worker:

1. lists the open `kiwi-drafted` issues oldest-first and takes up to `MAX_ISSUES`,
2. resolves each issue in its own git worktree and branch (`kiwi/auto/<date>-issue-<n>`) off `origin/main`, in parallel, by launching headless Claude Code through the `/gsd:quick` pipeline,
3. never pushes (branches are review-only),
4. classifies each issue `done`, `skipped`, `failed`, or `timed-out`,
5. writes a per-day recap to `.kiwi-auto/recap-<date>.md`,
6. posts a best-effort run summary to `/api/dev-runs` (shown in the DEVELOPMENT tab on `/insights`), and
7. fires a macOS notification, then writes a date-stamped lock so the run is idempotent for the day.

## SAFETY model

Be honest about the tradeoff: the headless agent runs with
`--dangerously-skip-permissions`, which removes Claude's command gating. That
means the usual permission prompts do not protect you. The guards that DO
protect you are:

- The pre-push hook is the SOLE push guard. It hard-blocks any push when
  `KIWI_AUTOMATION` is set (the worker sets it on every child) or when any pushed
  ref is under `refs/heads/kiwi/auto/*`. Nothing the agent does ever reaches the
  remote.
- Worktree isolation: each issue runs in its own worktree and branch off
  `origin/main`, so attempts cannot interfere with each other or with your
  working copy.
- A Node-enforced per-issue timeout (`PER_ISSUE_TIMEOUT_MS`) kills the child
  process group when the wall-clock cap is reached. It does not depend on the
  `timeout`/`gtimeout` binary.
- The daily lock makes the run idempotent: at most one run per UTC day.
- The `MAX_ISSUES` cap bounds how much work runs in a single pass.

Residual risk: an unattended, full-permission agent can still make local file
and git changes within a worktree. It cannot push, but you should review every
`kiwi/auto/*` branch before merging. Treat the output as draft work, not
trusted commits.

## Reporting

After each run the worker POSTs a summary to `${REPORT_URL}/api/dev-runs` with an
`Authorization: Bearer <secret>` header. The secret is resolved at runtime from
`process.env.DEV_RUN_INGEST_SECRET`, falling back to parsing
`apps/web/.env.local`. It is NEVER committed and never placed in the plist. If no
secret is found, the report is skipped with a warning and the run still
succeeds; the report is best-effort and a non-200 response never fails the run.

## Install

```sh
./install.sh
```

This substitutes the repo path into the plist, loads the LaunchAgent, ensures
the logs dir exists, and installs the pre-push guard (without touching the
gitleaks pre-commit). Verify with:

```sh
launchctl list | grep kiwi-autodev
```

Again: nothing runs until you run `./install.sh`.

## Review

- Read the per-day recap at `.kiwi-auto/recap-<date>.md` (gitignored).
- Check the DEVELOPMENT tab on `/insights`.
- Inspect the `kiwi/auto/*` branches.
- Merge the ones you want manually:

```sh
git checkout main && git merge kiwi/auto/<date>-issue-<n>
```

## Tune

Edit `config.sh` to change behavior: `MAX_ISSUES`, `PER_ISSUE_TIMEOUT_MS`,
`MODEL`, `EARLIEST_UTC_HHMM`, `LABEL`, `BRANCH_PREFIX`, `REPO_SLUG`, and
`REPORT_URL`. The values are read by the gate and passed through to `run.mjs`.

## Uninstall

```sh
./uninstall.sh
```

This boots out the LaunchAgent and removes the installed plist. It leaves the
pre-push guard in place (a harmless safety net); the script prints how to remove
that guard manually if you want to.
