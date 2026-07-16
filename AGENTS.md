<!-- bgsd:managed -->
## bgsd (this is a bgsd repo) — running from Codex

This repository is orchestrated by **bgsd** (the Conductor, "Kiwi"), an
autonomous, self-verifying layer on top of GSD. bgsd is primarily a Claude
Code tool, but it is harness-agnostic: you can run the WHOLE thing from Codex.

**To start a bgsd session from Codex**, run the harness-neutral launcher from
the repo root:

    node bgsd/scripts/conductor.mjs "<what to build>" [--project|--feature|--quick]

It loads the real Conductor instructions (`bgsd/commands/bgsd-sesh.md`), exports
the plugin root so every `node "${CLAUDE_PLUGIN_ROOT}/scripts/…"` command works,
and hands them to you (Codex) to drive end to end. If you are reading this while
already acting as the Conductor, follow `bgsd/commands/bgsd-sesh.md` directly and
run the node scripts it references (they are plain, harness-agnostic Node).

**Where history lives.** `.bgsd/ledger.md` (index of every session) and
`.bgsd/seshs/<run-id>/` (per-session records). Search with
`node bgsd/scripts/kb.mjs --query "<terms>"`.

**The backlog is the bgsd queue, never a file.** "Queue that" / "leave it for
the next sesh" means `node bgsd/scripts/queue.mjs add --title "<t>" --body "<b>"`
(the per-repo queue at `.bgsd/queue`). `.planning/` belongs to GSD — never write
a `.planning/BACKLOG.md`.

**Models.** Spawned workers resolve to Codex model equivalents automatically
(`harness.mjs`, tunable in `BGSD.md > harness.models`).
<!-- bgsd:managed -->
