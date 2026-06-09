---
phase: 999.12
title: Personal context graph + daily MCP export
status: backlog
filed: 2026-06-08
---

# Personal context graph + daily MCP export

## The idea

Curate a single, always-current "web of things about me" — a graph that
unifies everything across hyperpolymath (areas, projects, captures, tasks,
training, habits, JARVIS facts, journal/notes) plus light external inputs
(Linear/GH activity, calendar load, recent reading) into a coherent,
queryable personal-context snapshot.

Daily cron exports the snapshot to an MCP server so my other tools — the
claude.ai web agent, Claude Code, and any future agentic surface — can
pull it as authoritative context about *who I am right now, what I care
about, and what I'm doing*.

## Why

- Today every agent starts cold; I re-prime each one manually.
- Hyperpolymath already holds the richest signal — areas, projects,
  recent captures, JARVIS facts — but none of it leaves the app.
- An MCP server exposing a canonical personal context turns every agent
  into something that *already knows me*.

## Rough shape

- New `personal_context_snapshots` table (one row per day) with a JSON
  payload of the graph nodes + edges.
- Snapshot builder: pure server function that reads from each surface
  (areas/projects/tasks/captures/training/habits/JARVIS facts) and emits
  a typed graph.
- Cron (Vercel cron or Supabase pg_cron) runs nightly to build + persist.
- MCP server (separate package, hosted) exposes:
  - `get_current_context()` → latest snapshot
  - `query_context(question)` → semantic over snapshot history
- Auth: long-lived per-agent token; rotation TBD.

## Open questions

- What goes into the graph by default vs. opt-in per node type?
- Privacy: a "no-export" flag on rows (captures, tasks) so personal stuff
  stays local-only.
- Refresh cadence: nightly enough, or do agents need on-demand pulls?
- Schema versioning: snapshots are forever; payload schema will evolve.

## Reminder

Surface this when the current branch is ready to PR — user asked to be
reminded before shipping.
