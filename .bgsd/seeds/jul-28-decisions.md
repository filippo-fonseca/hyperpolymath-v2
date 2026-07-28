# jul-28 sesh — sealed decisions (Conductor)

These were captured through native selectors and are binding on every unit. A unit
that wants to deviate raises a blocker; it does not decide unilaterally.

## D1 — Branching
Units merge into `next` (the standing integration branch, per BGSD invariant).
Once waves land, the Conductor cuts and pushes **`jul-28`** off `next` as Filippo's
dedicated test branch, re-syncing it as further waves land. `next -> main` stays
human-only. No worker ever writes `main`.

## D2 — Commit and push discipline
Every worker commits **often and atomically**, one focused commit per logical unit of
work, staged with explicit pathspecs (never `git add -A` / `git add .`). Every unit
branch is **pushed**. Commit hashes land on the unit control file as they are made.
Batching a whole unit into one end-of-run commit is a protocol violation.

## D3 — App shell: the control-center cockpit (FOUNDATION, ships first)
The app is restructured into a three-zone cockpit, modelled on the 3D-editor reference:

```
┌──────────────────────────────────────────────────┐
│ ┌────────┐ ┌──────────────────┐ ┌─────────────┐ │
│ │  RAIL  │ │      STAGE       │ │    DOCK     │ │
│ │        │ │  active feature  │ │ quick-glance│ │
│ │ nav +  │ │                  │ │  widgets    │ │
│ │ tree   │ ├──────────────────┤ │  collapsible│ │
│ │        │ │ 🥝 ask kiwi…   ⏎ │ │             │ │
│ └────────┘ └──────────────────┘ └─────────────┘ │
└──────────────────────────────────────────────────┘
```

- **RAIL** — the clean left sidebar: feature nav plus the contextual tree for the
  active feature. Collapsible.
- **STAGE** — the centre pane, owned by whatever feature is active. This is the only
  zone that swaps on navigation.
- **DOCK** — a persistent, collapsible right strip of quick-glance widgets (device and
  light status, next event, today's counts). Collapse state persists across sessions.
- **JARVIS command bar** — persistent at the bottom of the stage, always one keystroke
  away, expandable to the full `/jarvis` page. This is the single most important piece:
  the product's core value is "type one sentence into Kiwi", so Kiwi becomes furniture
  rather than a dialog you summon.

**Binding layout rule — the shared right slot.** The dock and any inline detail panel
(the Shakuro-style side panel) occupy the **same** right slot. Opening a detail panel
slides the dock out; closing it restores the dock. The dock auto-collapses below a
width breakpoint. Rail + stage + dock + detail panel must never be four live columns:
on a 14-inch screen that starves the stage to roughly 600px, which is the exact
cramped feeling this sesh exists to remove.

The cockpit lands as **unit zero, directly on `next`**, before any feature redesign
branches. Every subsequent UI unit builds inside it. Rationale: the shell is upstream
of Wiki, Tasks, Areas, Projects and LifeOS; redesigning those in today's layout and
restructuring afterwards means doing the work twice.

## D4 — Dock vs LifeOS boundary
The dock is a **distinct quick-glance strip** with its own purpose-built compact
widgets. It does not reuse the LifeOS dashboard cards. LifeOS remains the full
dashboard page (the deep view, with the background video). Two widget sets, each
designed for its own density.

## D5 — LifeOS background
Ship a **free-license space video loop** (CC0 / Pexels / Coverr), self-hosted under
`public/`, muted autoplay loop with a poster frame, a `prefers-reduced-motion`
fallback to a static frame, and a hard budget on file size. The licence and source URL
must be recorded in the unit report. The background belongs to the **LifeOS page only**,
never app-wide: full-bleed video behind a text-heavy journal UI hurts both readability
and performance.

## D6 — JARVIS over text message
**Twilio Programmable SMS/MMS**, built behind a **channel-agnostic core**. The unit
must find the existing seam every JARVIS entrypoint already calls and plug in there, so
the text channel behaves *identically* to web JARVIS rather than reimplementing it. If
that seam is not already channel-agnostic, refactoring it to be so is part of the unit.
Deliverables include webhook signature verification, idempotency, phone-number-to-user
mapping, a streaming-to-single-message strategy, and a **settings toggle gating outbound
replies**, exposed on web (mobile parity noted as follow-up). Green bubble, not blue; a
self-hosted iMessage bridge can be added later behind the same seam.

## D7 — GitHub issues
One epic issue for the sesh plus one atomic issue per unit. Each PR closes its issue on
merge. No PR is merged without Filippo's explicit say-so.

## D8 — Model routing
UI and design-heavy units run on **`claude-fable-5`**; everything else runs on
**`claude-opus-5`**. Every agent is spawned as a detached headless CLI process with the
model pinned explicitly. Verification and evaluation lanes stay on Opus regardless.

## D9 — Verification
`verification.usage_testing` stays **true** and `verification.headless` is set **true**:
the full Tester ladder including the Playwright/computer-use rung runs headless, still
capturing screenshots as evidence. No unit reaches done without a verified pass.

## D10 — Performance is its own unit, and it is not optional
The cockpit restructure is a design win, not a performance fix. The perf scout found the
real cause: every route render costs 25 to 34 serialized Postgres queries, driven by
`getSearchSnapshot()` sitting on the blocking path of the root layout, plus 32
`router.refresh()` call sites that re-run the whole server tree on every mutation. The
shell and the perf unit ship together, or the app is merely prettier and just as slow.

## D11 — The dock is a registry, not a hardcoded strip
U0 must expose the dock as a **widget registry seam**, not a fixed set of panels. A widget
declares its id, title, compact render, optional expanded render, and its own data hook;
the dock composes whatever is registered and lets Filippo choose which widgets are docked,
persisting that choice and the collapse state across sessions.

This is load-bearing: U12 plugs a habits widget in during wave 2, and the queued XP system
(issue #345) will want the same hook without touching shell code. A dock that hardcodes its
contents forces every future widget to re-open the shell, which is exactly the coupling the
cockpit restructure exists to remove.

## D12 — Habits (U12, wave 2, `claude-fable-5`)
Filippo's words: Habits "does not feel like it's too usable", and he wants it "on the
persistent bar on the side as well so it's more integrated into my routine". Two deliverables
in one unit:

1. **Habits UI overhaul** on the stage, inside the cockpit and against the shared design
   contract. The bar to clear: marking today's habit done must be one tap, optimistic, with no
   `router.refresh()`, and today's remaining habits plus streak state must be legible at a
   glance without interaction.
2. **A compact habits dock widget** registered through the D11 seam: today's habits with
   one-tap completion, sharing the same optimistic mutation and realtime invalidation as the
   page so the two surfaces never disagree.

Scout `s7-habits.md` grounds this unit.
