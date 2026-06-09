---
phase: 999.15
title: NoExport toggle on captures + tasks (per-row UI)
status: backlog
filed: 2026-06-09
parent: 999.12
---

# NoExport toggle on captures + tasks (per-row UI)

## The idea

Surface the per-row `no_export` toggle on capture detail and task detail
panels. Phase 999.12 ships the underlying column on `captures`, `tasks`,
and `jarvis_facts` and the builder already filters rows where
`no_export = true`. The only missing piece for v1 was the UI: the toggle
ships only on `/settings/memory` (jarvis_facts list) — the most
privacy-sensitive surface.

Per-capture and per-task toggles are pure additive UI work because the
column, the Server Action, and the builder filter all exist already.

## Why

- Captures and tasks DO leak personal information out via MCP today
  unless the user remembers to flip the row's flag before the nightly
  cron fires. There is currently no UI for that flip.
- Defaulting captures + tasks to exportable is the right default
  (otherwise the whole system loses its "the agent already knows me"
  value), but the per-row opt-out needs to be one click away on the
  detail surface.

## Rough shape

- Mount the existing `NoExportToggle` component on the capture detail
  panel (right rail or footer) and the task detail panel.
- Same Server Action signature as `/settings/memory` —
  `setNoExport(table, id, value)` — already accepts `'captures'` and
  `'tasks'` from 999.12.
- Optional polish: a small "🔒 Not exported" badge inline on
  /captures and /tasks lists when a row is flagged.

## Trigger

Surface immediately after Phase 999.12 lands and a few weeks of MCP
usage reveal which capture / task types the user actually wants to
hide. Cheap, additive, no migration.
