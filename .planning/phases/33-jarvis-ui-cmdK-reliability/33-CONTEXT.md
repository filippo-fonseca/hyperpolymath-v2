# Phase 33: JARVIS page UI redesign + cmd+K reliability — Context

**Gathered:** 2026-06-29
**Status:** Ready for planning
**Source:** User session — direct requirements

<domain>
## Phase Boundary

Two coupled deliverables, shipped together on branch `feat/issue-172-jarvis-ui-cmdK`:

### Deliverable A — JARVIS page visual overhaul

Full redesign of the JARVIS tab page in `apps/web`: chat message bubbles, JARVIS prose responses, action receipts, streaming/thinking indicator, and the composer. The current implementation feels "clunky."

What to build: a "Apple Messages × JARVIS (Iron Man HUD) × Sunday Robotics" register. This means:
- Clean iMessage-style bubble layout (user right, JARVIS left) but with the HUD sensibility
- Cyan accent glows on JARVIS message bubbles (not user bubbles)
- Glass/neumorphic surfaces using the existing `.glass-tile` / `.glass-button` tokens (already canonical project-wide)
- Receipts as sleek inline glass-inset cards — NOT heavy border boxes
- Streaming/thinking indicator: refined, minimal, premium (not generic spinner)
- Dark-first surface; the tab should feel like a premium AI console

**What NOT to do:** No literal Iron Man HUD chrome (scan-lines, ticker readouts, busy HUD overlays). Clean and restrained. The Anthropic discipline (claude.ai) is the restraint pole; JARVIS aesthetic is the mood.

### Deliverable B — cmd+K Jarvis message reliability (issue #172)

Bug: when the user sends a message to JARVIS from the ⌘K command palette and then navigates away (e.g. switches to the JARVIS tab or anywhere else) before the request finishes, the in-flight request aborts and the message is lost.

Fix requirements:
- The fetch/SSE request must survive navigation (fire-and-forget or global background queue approach)
- After submission from ⌘K, the turn must appear in the JARVIS tab conversation as if the user had typed it there — including in-flight streaming state visible if the user arrives mid-stream
- The standard 5s undo must work on cmd+K-initiated turns exactly like normal turns
- If a turn aborts for any reason, a retry affordance is visible on the failed bubble

</domain>

<decisions>
## Implementation Decisions

### UI aesthetic (LOCKED)
- Bubble layout: iMessage-style (user right-aligned, JARVIS left-aligned)
- Color register: cyan accent on JARVIS bubbles, neutral/glass on user bubbles
- Surface system: extend existing `.glass-tile` / `.glass-button` tokens — do NOT introduce new design primitives
- Receipts: slim inline glass-inset card, no heavy outer border box
- Composer: neumorphic glass input, consistent with rest of app
- Streaming indicator: subtle, premium (not a generic spinner)
- Dark-first: the tab background is the app's dark surface

### cmd+K reliability approach (LOCKED intent, implementation TBD by researcher)
- The fix must not require the user to stay on any particular route
- The JARVIS tab must show the turn when the user navigates there, regardless of when they arrive
- 5s undo must be identical in behavior to a normally-submitted turn
- Retry must be user-triggerable from the failed bubble

### Scope fence (LOCKED — do NOT build)
- No changes to JARVIS routing logic, tools, or `jarvis-core` package
- No changes to the cmd+K palette's non-JARVIS actions
- No changes to mobile JARVIS
- No new design tokens or global CSS variables — work with what exists

### Claude's Discretion
- Whether to use a global React context / store (e.g., a pending-turn queue) vs. a service-worker / BroadcastChannel approach for navigation persistence
- Exact Motion animation curves and durations (maintain consistency with existing app motion budget)
- Whether the failed-turn retry triggers a new SSE stream or re-POSTs the same payload
- Exact color values for cyan glow — use `--accent-cyan` token if it exists, otherwise derive from the existing glass system

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### JARVIS implementation
- `packages/jarvis-core/` — core agent package (tools, executor, system prompt builder)
- `apps/web/app/api/jarvis/route.ts` — SSE route handler
- `apps/web/components/jarvis/` — all JARVIS UI components (JarvisScrollback, JarvisReceipt, JarvisComposer, etc.)
- `apps/web/app/(app)/jarvis/page.tsx` (or equivalent path) — JARVIS tab page

### cmd+K palette
- `apps/web/components/command-palette/` or similar — the ⌘K palette component
- Look for how the palette currently fires JARVIS (likely a fetch/mutation call in the palette's submit handler)

### Design system
- `apps/web/app/globals.css` — glass tokens (`.glass-tile`, `.glass-button`, CSS custom properties for cyan, glow)
- `apps/web/components/ui/` — shared UI primitives

### Phase context
- `.planning/phases/05-jarvis/` — original JARVIS phase context and plans
- `.planning/phases/05.1-jarvis-agentic-refactor/` — agentic refactor context
- `.planning/phases/16-smarter-jarvis-session-memory-crud/` — session memory + CRUD phase
- `~/.claude/projects/-Users-filippofonseca-Developer-Projects-hyperpolymath-v2/memory/feedback_ui_aesthetic.md` — neumorphic canonical register
- `~/.claude/projects/-Users-filippofonseca-Developer-Projects-hyperpolymath-v2/memory/project_phase61_directional_anchors.md` — Phase 6.1 directional anchors (multi-accent, dark-first, per-surface motion budget)

</canonical_refs>

<specifics>
## Specific Ideas

- "Apple Messages had a baby with JARVIS and Sunday Robotics" — the reference trio. Clean bubble layout + AI HUD mood + robotics precision.
- Cyan glow on JARVIS bubbles (not user bubbles). User bubbles: flat glass. JARVIS bubbles: soft cyan glow + glass.
- Receipts currently feel like "heavy boxes." Target: slim pill-like or card-inset receipt, compact, actionable.
- Streaming indicator: instead of a generic spinner, consider a subtle cyan pulse or animated dots in JARVIS bubble style.
- The composer area should feel like a premium input — not a plain textarea. Glass background, subtle border glow on focus.

</specifics>

<deferred>
## Deferred

- JARVIS voice surface (handled in Phase 7)
- In-document @JARVIS (handled in Phases 31–32)
- Mobile JARVIS UI (separate scope)
- Any routing/tool changes in jarvis-core

</deferred>

---

*Phase: 33-jarvis-ui-cmdK-reliability*
*Context gathered: 2026-06-29 — direct from user session*
