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
- **model_posture** — which model + effort each role runs at. These are
  **defaults only**: the Conductor decides per unit and adapts, and you have the
  final say — override any role, tier, or threshold here, per-session with a
  flag, or by just telling the Conductor (it adapts on the fly). The principle:
  **Opus is the standard for every role.** Fable is never the executor (it guzzles
  tokens on the highest-volume role); its reasoning is leveraged only as a separate
  upstream pre-plan that seeds Opus. Sonnet shows up only on trivial fixes.
  - **conductor** `session` — bgsd does NOT force the Conductor's model; it's
    whatever you launch the session with. It only nudges, both ways: on Opus for a
    heavy prompt it suggests Fable; on Fable for a light one it suggests dropping
    to Opus to save. It nudges again once it has sized your prompt, and asks to
    confirm before continuing. The Conductor's own reasoning (decompose, oracle)
    therefore runs on your session model.
  - **executor** is the unit's worktree-subprocess model (passed to
    `claude -p --model`): `opus/xhigh` for every unit — **never Fable** —
    dropping to `sonnet/xhigh` only on trivial units (< 0.2) and only with
    `--sonnet`. plan + execute share it.
  - **planner** `opus/high` always (the in-pipeline planner).
  - **fable_plan** the separate upstream Fable pre-planner: **off by default** (the
    plain path is normal GSD on Opus). `--fable` turns it on for the session, or the
    Conductor can opt a specific unit in. It is launched as a standalone
    `claude -p /bgsd-plan-unit --model claude-fable-5` **subprocess** (never the
    in-session agent tool, which can't run Fable); it writes `.planning/fable-plan.md`,
    which seeds the Opus pipeline agent (`--seed-plan`). It only plans, never builds.
  - **scout** (research / explore) `opus/high`, `opus/medium` when trivial — the
    explore floor is Opus latest, since explore quality gates plan quality.
    Conductor-wide exploring in the session uses the Conductor's own model.
  - **reviewer** `opus/high` (fresh context), **verifier**/**tester**
    `opus/medium`, **conflict** `opus/high`, **loop2_fix** `opus/medium` —
    Opus across the board. Fable, when it runs per-unit, is only the standalone
    pre-planner subprocess; the in-session agent tool offers only opus/sonnet/haiku.
- **verification.usage_testing** — `true` runs the full Tester ladder including
  the Playwright/vision rung (driving the real app). `false` skips that UI
  usage-testing but STILL runs the goal-backward code verification
  (gsd-verifier), so quick fixes and non-UI changes don't pay for browser
  testing. Toggle per-session with `--no-usage-verification`, or tell Kiwi
  ("stop UI-testing quick fixes") and it sets this for you. It never disables
  code verification — "no silent green" still holds.
- **verification.headless** — `true` drives Playwright headless, no visible
  browser or server window pops up on your machine (discreet). `false` lets it
  run headed. Toggle per-session with `--headless-ui`, or tell Kiwi ("always
  verify headless").
- **gui.auto** — start and open the live web dashboard automatically for
  feature- and project-scale seshs; quick seshs stay terminal-only. Opt out for
  one session with `--no-gui`, or set `false` here to keep it manual
  (`/bgsd-gui` still opens it on demand).
- **notifications.os** — fire a native macOS notification the moment the
  pipeline needs your input (an escalated question, a human gate), so you can
  walk away from long seshs and still get pinged. Fail-silent, and a no-op off
  macOS.
- **remote.enabled / remote.host / remote.port** — expose a local HTTP bridge
  (`/bgsd-remote`) so you can watch and steer a live sesh from a phone app:
  stream the Conductor's output, send it messages, and answer its questions
  remotely. `host` is `loopback` (127.0.0.1, tunnel it for true remote) or
  `lan` (0.0.0.0 on your network); a token is generated at start and required
  for any non-loopback bind. `port: 0` lets the OS pick. Off by default.
- **modes.pipeline / modes.verifier** — how much work each role does, three
  levels: `fast` (pipeline skips research; verifier code-only), `thorough`
  (pipeline researches every unit; verifier full driver ladder), or `adaptive`
  (the Conductor decides per unit and adapts). `adaptive` is the default and
  recommended. Override per-session with `--mode` / `--verify-mode`, or
  persist here. A manually-passed flag always wins over this file.
- **conductor** — the Conductor's identity + behavior. `name` and `emoji`
  are the name pill on every message it sends (default `🥝` `Kiwi`); you pick
  them at `/bgsd-init`, and can change them any time here, via
  `/bgsd-modify-memory` ("rename yourself to Jarvis", "change your emoji to
  🤖"), or by just asking the
  Conductor. The Conductor runs on whatever model you launched the session with
  (bgsd never forces it — see `model_posture.conductor`); it only nudges.
  `narrate` streams stage-aware live updates; `suggest_gate_commands`
  makes it hand you the exact command at every human gate. `self_compact_at` is
  the context fraction (0–1) at which the Conductor — the one human-facing
  session — auto-compacts itself and continues, so a long sesh never runs out of
  room.
- **context** — per-subagent context-window management. `max_window_tokens`
  is the model's full window (Pipeline Agents run on ~1M tokens). When an
  agent's usage crosses `compact_at` (fraction of the window) Kiwi compacts it
  proactively; crossing `relaunch_at` clears and relaunches the agent from its
  handoff manifest, into a fresh small window. Raise the fractions to let agents
  run longer before Kiwi intervenes.

```json bgsd-settings
{
  "version": 1,
  "integration_branch": "next-codex-spacedrive-ui",
  "base_branch": "next",
  "git": {
    "sync_integration_from_base": false,
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
  "harness": {
    "active": "auto",
    "models": {
      "claude": {
        "opus": "claude-opus-4-8",
        "sonnet": "sonnet",
        "haiku": "haiku",
        "fable": "claude-fable-5"
      },
      "codex": {
        "opus": "gpt-5.6-luna",
        "sonnet": "gpt-5",
        "haiku": "gpt-5-mini",
        "fable": "gpt-5-codex"
      }
    }
  },
  "model_posture": {
    "conductor": {
      "model": "session"
    },
    "thresholds": {
      "fable": 0.5,
      "sonnet": 0.2
    },
    "executor": {
      "default": {
        "model": "opus",
        "effort": "xhigh"
      },
      "easiest": {
        "model": "sonnet",
        "effort": "xhigh"
      }
    },
    "planner": {
      "model": "opus",
      "effort": "high"
    },
    "fable_plan": {
      "model": "fable",
      "effort": "high",
      "default": false
    },
    "decompose": {
      "model": "session",
      "effort": "high"
    },
    "oracle": {
      "model": "session",
      "effort": "high"
    },
    "scout": {
      "model": "opus",
      "effort": "high",
      "trivial": {
        "model": "opus",
        "effort": "medium"
      }
    },
    "reviewer": {
      "model": "opus",
      "effort": "high"
    },
    "verifier": {
      "model": "opus",
      "effort": "medium"
    },
    "tester": {
      "model": "opus",
      "effort": "medium"
    },
    "conflict": {
      "model": "opus",
      "effort": "high"
    },
    "loop2_fix": {
      "model": "opus",
      "effort": "medium"
    }
  },
  "verification": {
    "usage_testing": true,
    "headless": false
  },
  "gui": {
    "auto": true
  },
  "notifications": {
    "os": true
  },
  "remote": {
    "enabled": false,
    "host": "loopback",
    "port": 0
  },
  "modes": {
    "pipeline": "adaptive",
    "verifier": "adaptive"
  },
  "conductor": {
    "name": "Kiwi",
    "emoji": "🥝",
    "persona": "kiwi",
    "narrate": true,
    "suggest_gate_commands": true,
    "fable_advisor": "auto",
    "self_compact_at": 0.9
  },
  "context": {
    "max_window_tokens": 1000000,
    "compact_at": 0.7,
    "relaunch_at": 0.9
  }
}
```

## Notes

- On every terminal bgsd session outcome (done, blocked, or failed), play
  `/System/Library/Sounds/Glass.aiff` once with `afplay` after writing the final
  session record. This is a completion cue, must fail silently, and must never
  interrupt or change the pipeline outcome.

- If the Claude spend/usage limit kills pipeline agents and Filippo later says to continue (any phrasing: 'go', 'continue', etc.), that itself means the limit has reset for ALL Claude instances — respawn the executor fleet immediately instead of falling back to inline conductor work.

- Always delete a pipeline agent's worktree (git worktree remove --force) AND its unit branch (git branch -D) as soon as its unit is done and merged — the merged commits live on the integration branch, so neither the worktree (node_modules + cargo target) nor the stale bgsd/* branch may linger and eat disk or clutter refs.

<!-- Free-form preferences for Kiwi. Examples:
- Never use haiku for verification.
- Always ask before deleting files.
- Prefer terse PR descriptions. -->
