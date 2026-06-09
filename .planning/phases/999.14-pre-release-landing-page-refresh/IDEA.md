---
phase: 999.14
title: Pre-release landing page refresh
status: backlog
filed: 2026-06-09
---

# Pre-release landing page refresh

## The idea

Before going public, sweep the marketing landing page so it reflects what
hyperpolymath actually does *today* — not the Phase 1/2 placeholder copy.
Two big additions plus general housekeeping.

## Scope

**Net-new content**
- **MCP / personal context graph story** (ships from Phase 999.12):
  explain that hyperpolymath becomes the daily-refreshed memory layer for
  every other agent the user touches (claude.ai web, Claude Code, custom
  surfaces). One screenshot of the graph + one of an external agent
  pulling it.
- **Knowledge graph** angle: the unified web of areas / projects /
  captures / tasks / training / habits as a *first-class* surface. Not
  a side-feature — frame as "your second brain has a schema now."

**Cleanup pass**
- Replace any v1-era copy or Goodreads/Strava/Twilio references (legacy
  v1 surfaces explicitly cut from v2 scope).
- Audit the JARVIS demo section — make sure the example turns reflect
  current tool list (the 9 CRUD tools added 2026-05-27, not the Phase 4
  toolset).
- Confirm split-screen + ⌃1/⌃2 + LifeOS hero/bento are showcased.
- Re-shoot any stale screenshots that still show the Phase 6 neumorphic
  or HUD-heavy chrome — current direction is Arc/Safari-clean.
- Open-graph / favicon / twitter-image: verify they reflect the latest
  brand mark (kiwi glyph) and copy.
- Run a typo/grammar sweep — landing copy is the first impression.

**Polish**
- Footer: GitHub link points at the public repo; MIT license badge.
- Hero CTA: clear primary action (sign in with Google) + secondary
  (read the philosophy / open-source page).
- Performance pass: landing should be ≤ 100KB JS first-load, lazy
  videos/GIFs.

## Why

The landing page is the first surface every new visitor hits. Right now
it underrepresents what's been built — MCP + knowledge-graph framing
moves hyperpolymath from "yet another todo app" to "the personal data
layer your other agents read from." Worth doing once, properly, before
sharing.

## When to surface

When 999.12 (personal context graph + MCP export) is in scope or freshly
shipped — that's the unlock for the MCP-as-headline copy. Independent
of that, surface this any time we plan a public release / Show HN /
ProductHunt push.

## Open questions

- Single landing page or split into / and /docs?
- Do we want a public-facing "philosophy" page (counterpart to v1's
  manifesto)?
- Demo video or live interactive embed?
