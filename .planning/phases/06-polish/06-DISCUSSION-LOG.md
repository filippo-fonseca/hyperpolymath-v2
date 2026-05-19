# Phase 6: Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 06-polish
**Areas discussed:** Louize licensing path, Cmd+K scope, Telemetry vendor, /insights depth, Dark mode default, Theme toggle placement

---

## Area Selection (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Louize licensing path | AES-01. Buy now / EB Garamond only / defer | ✓ |
| Cmd+K scope | AES-05. Focus-only / full palette / both | ✓ |
| Telemetry vendor | RES-07. Sentry / PostHog / Highlight / skip | ✓ |
| /insights depth | RES-06. MVP 3 charts / richer dashboard / minimal table | ✓ |

**User's choice:** All four areas selected. None deferred to Claude's Discretion at the area level.

---

## Louize

| Option | Description | Selected |
|--------|-------------|----------|
| Ship EB Garamond only (Recommended) | Headings use EB Garamond (different weight/size). No licensing blocker. Louize → backlog. | ✓ |
| Buy Louize web license now | Wire `next/font/local` after procurement; phase delayed 1–2d if license not bought before planning. | |
| Use a free Louize alternative | PT Serif, Cormorant, Spectral — Google-hosted, journal-feel. | |

**User's choice:** Ship EB Garamond only.
**Notes:** Louize logged to Deferred Ideas — revisit when procurement is done.

---

## Cmd+K

| Option | Description | Selected |
|--------|-------------|----------|
| Focus JARVIS input only (Recommended) | Cmd+K from anywhere = cursor in JARVIS Console. Tiny implementation, literal AES-05. | ✓ |
| Full CMDK command palette | shadcn `cmdk` overlay: JARVIS row default + nav + recent + fuzzy search. Linear-style. ~1 plan. | |
| Both: focus default, palette via Cmd+Shift+K | Both behaviors; doubles surface area. | |

**User's choice:** Focus JARVIS input only.
**Notes:** Palette logged to Deferred. Phase 6 stays lean on shortcuts.

---

## Telemetry

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry free tier (Recommended) | Industry standard, free tier fits single-user. Captures client + server errors. | |
| PostHog | Errors + product analytics + session replay. More setup; covers more uses. | |
| Skip vendor — console.error + clipboard error report | No vendor. error.tsx renders branded fallback + Copy button (clipboard structured payload). Zero lock-in. | ✓ |

**User's choice:** Skip vendor — console.error + clipboard error report.
**Notes:** Single-user app, user IS the on-call. Sentry / PostHog logged to Deferred if clipboard-report proves insufficient.

---

## /insights

| Option | Description | Selected |
|--------|-------------|----------|
| MVP: 3 charts as spec'd (Recommended) | Action-type bar + latency p50/p95 line + error-rate number/sparkline. Last 7 days, no filters. | ✓ |
| Richer dashboard | + time-range picker, tool-level breakdown, top-N errors table, cache hit rate. ~2x build. | |
| Minimal: raw query + table | No charts; SQL dumps in tables. 30min ship; ugly. | |

**User's choice:** MVP 3 charts as spec'd.
**Notes:** Richer dashboard logged to Deferred if /insights becomes load-bearing.

---

## Dark mode default

| Option | Description | Selected |
|--------|-------------|----------|
| Follow system, toggle overrides (Recommended) | Match `prefers-color-scheme` on first load; user toggle persists override. | ✓ |
| Always light until toggle | Default light, user opts into dark. | |
| Always dark | Journal-paper-as-ink default. | |

**User's choice:** Follow system, toggle overrides.

---

## Theme toggle placement

| Option | Description | Selected |
|--------|-------------|----------|
| Settings + global header (Recommended) | Toggle in /settings (persistent) AND header (one-click everywhere). | ✓ |
| Settings only | Theme is a settings concern; keep header clean; extra click. | |

**User's choice:** Settings + global header.

---

## Ready gate

| Option | Description | Selected |
|--------|-------------|----------|
| Write CONTEXT.md (Recommended) | Lock decisions; route to /gsd:plan-phase 6. | ✓ |
| More areas to discuss | Surface 2–3 additional gray areas. | |

**User's choice:** Write CONTEXT.md.

---

## Claude's Discretion

Following items not asked — sensible defaults documented in CONTEXT.md `<decisions>`:

- Toast library (sonner, already installed)
- Motion library (motion/react, already imported)
- Empty-state copy voice depth (brand-voice draft during planning)
- `error.tsx` structure per route group (Next.js 16 convention)
- `/health` endpoint shape (plain JSON)
- Accent color (prototype during planning, surface swatch before lock)
- Motion durations (150–400ms range; respect `prefers-reduced-motion`)
- Settings page IA (mirror existing `/settings/memory` pattern)
- Responsive breakpoint behavior below 768px (layout doesn't shatter; density flex acceptable)

## Deferred Ideas

- Louize web license + integration (procurement-blocked)
- Full CMDK command palette
- Sentry / PostHog / Highlight (revisit if needed)
- Richer /insights dashboard
- Mobile-native UX (<768px) — out of scope per AES-07
- Dedicated brand-voice copy review pass (quick-task at end of Phase 6)
