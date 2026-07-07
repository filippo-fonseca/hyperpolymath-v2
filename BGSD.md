# BGSD.md — bgsd settings

This file configures how bgsd (the Conductor, "Kiwi") runs in this repo. Every
knob lives in the `bgsd-settings` block below and ships with a sensible default.
Edit the block to override; Kiwi reads it at the start of every sesh. You can
also write prose preferences (tone, risk appetite, "always ask before X") in the
Notes section and Kiwi will respect them.

## Settings

- **integration_branch** — the standing branch that acts as the rehearsal /
  integration mirror of `main`. Worktree branches merge here; `integration ->
  main` is always a manual, human-only merge.
- **base_branch** — `null` auto-detects from `origin/HEAD` (falls back to
  `main`, then `master`). Set explicitly to pin it.
- **git.sync_integration_from_base** — ff-update the integration branch from the
  base branch at the start of every sesh, so it never falls behind production.
- **git.integration_to_main** — kept `manual`: no agent ever commits to
  `main`. Kiwi only suggests the merge command for you to run.
- **github.issues** — file one atomic issue per work unit plus one epic issue
  per sesh; each PR closes its issue on merge.
- **github.require_remote** — when there's no GitHub remote, skip all issue/PR
  machinery and just branch + merge locally.
- **env.propagate / env.files** — git worktrees don't carry gitignored files, so
  Kiwi copies these env files from the repo root into every worktree (and onto
  the integration branch) so your apps actually run. Edit the globs to match
  this repo's env files.
- **model_posture** — the per-unit model + effort routing. Executor uses the
  unit's difficulty tier; researcher drops one tier (capped at `medium`);
  verifier is fixed. Override any tier, threshold, or role here.
- **conductor** — persona + narration. `narrate` streams stage-aware live
  updates; `suggest_gate_commands` makes Kiwi hand you the exact command at
  every human gate.

```json bgsd-settings
{
  "version": 1,
  "integration_branch": "next",
  "base_branch": null,
  "git": {
    "sync_integration_from_base": true,
    "integration_to_main": "manual"
  },
  "env": {
    "propagate": true,
    "files": [
      ".env",
      ".env.local",
      ".env.*.local"
    ]
  },
  "github": {
    "issues": true,
    "require_remote": true
  },
  "model_posture": {
    "thresholds": {
      "high": 0.7,
      "medium": 0.4
    },
    "tiers": {
      "high": {
        "model": "opus",
        "effort": "xhigh"
      },
      "medium": {
        "model": "sonnet",
        "effort": "high"
      },
      "low": {
        "model": "haiku",
        "effort": "medium"
      }
    },
    "researcher": "one-tier-below",
    "verifier": {
      "model": "haiku",
      "effort": "low"
    }
  },
  "conductor": {
    "persona": "kiwi",
    "narrate": true,
    "suggest_gate_commands": true
  }
}
```

## Notes

- Always start the backend (web/API on :3000) together with the desktop app — never leave the desktop pointed at a missing/other web server (a stray dev server on :3000 causes 'disconnected from jarvis server'). Prefer the repo's stack orchestrator, the 'hyperpolymath' CLI at tools/hyperpolymath/hyperpolymath.mjs, to bring services up consistently, using its flags as needed: --no-supabase, --no-web, --no-desktop, --no-mobile, --no-bridge, --no-wa-sync, --no-im-sync, --only=name[,name...]. It orchestrates web+desktop+bridge+WhatsApp/iMessage sync as one stack.

- **Commit atomically and consistently.** Every unit (and the Conductor when
  fixing things inline) commits in small, focused, atomic commits — one per
  logical unit of work — staged with explicit pathspecs (never `git add -A`).
  Never batch a whole feature into one giant commit; each part (schema, engine,
  UI, wiring, docs) lands in its own commit as it's finished. Keep planning
  artifacts (`.planning/*`) out of code commits, or in their own clearly-labelled
  `docs(planning)` commit. Hard rule for every pipeline agent, not a preference.

<!-- Free-form preferences for Kiwi. Examples:
- Never use haiku for verification.
- Always ask before deleting files.
- Prefer terse PR descriptions. -->
