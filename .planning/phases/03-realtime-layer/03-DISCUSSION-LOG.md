# Phase 3: Realtime Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 03-realtime-layer
**Areas discussed:** Optimistic UX scope

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack Query adoption depth | Hybrid SSR + useQuery vs full client migration | |
| Cross-device update feedback | Silent / pulse / toast | |
| Optimistic UX scope | All mutations vs drag/status only vs high-frequency only | ✓ |
| Hashtag count live-update mechanism | Subscribe to captures_hashtags vs captures | |

**User's choice:** Optimistic UX scope only. Other three delegated to Claude's discretion.

---

## Optimistic UX

### Q1: Which mutations should feel instant (optimistic UI before server confirms)?

| Option | Description | Selected |
|--------|-------------|----------|
| All write paths (Recommended) | Drag-reorder, create, edit, delete, complete, hashtag toggle, project link — every mutation feels instant. Highest polish. Most rollback paths to test. | ✓ |
| Drag + status flips only | Kanban drag-drop, sidebar reorder, task status change only. Other writes keep Phase 2's Server Action + router.refresh pattern. | |
| High-frequency only | Capture composer Cmd+Enter, task creation, task complete-toggle, kanban drag. Edits/deletes via detail panels stay non-optimistic. | |

**User's choice:** All write paths (recommended).
**Notes:** Matches the "be goated" quality bar — no mutation surface should feel laggy.

---

### Q2: When the server rejects an optimistic update, what should the user see?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent revert + toast error (Recommended) | UI snaps back, single toast.error. Calm, journal-paper consistent. | ✓ |
| Shake + toast | 100ms shake animation on affected element + toast.error. Tactile but more motion. | |
| Inline error pill | Red border/pill stays for 3s with error text, no separate toast. | |

**User's choice:** Silent revert + toast error (recommended).
**Notes:** Reuses sonner pattern from Plan 02-01 (already mounted at app shell).

---

### Q3: While the optimistic update is pending, what visual cue?

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing — feels instant (Recommended) | UI updates immediately, no spinner, no dim. Rollback handles failures. Most native-app feel. | ✓ |
| Subtle opacity dim until echo lands | opacity-50/60 until Realtime echoes back. Honest but busier. | |
| Tiny inline spinner | Spinner icon on row corner until echo. More info-dense, closer to Linear. | |

**User's choice:** Nothing — feels instant (recommended).
**Notes:** Assumes ≥99% success rate; the rare failure path is handled by silent revert + toast (Q2).

---

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context (Recommended) | Accept defaults on the unselected gray areas (hybrid SSR+useQuery, silent cross-device, captures_hashtags subscription). | ✓ |
| Explore more gray areas | Discuss TanStack Query adoption, cross-device feedback, or hashtag-count mechanism. | |

**User's choice:** Ready for context.

---

## Claude's Discretion

Three gray areas were delegated to Claude:
- **TanStack Query adoption depth** → Hybrid SSR + `useQuery({ initialData })` (preserves Phase 1-2 SSR patterns; cache invalidates on Realtime).
- **Cross-device update feedback** → Silent (matches journal aesthetic; single-user app, no need to notify).
- **Hashtag count live-update mechanism** → Subscribe to `captures_hashtags` join (granular, only refetches on actual join change).

## Deferred Ideas

None raised during this discussion.
