# Phase 6: Polish - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The deliberate quality pass that turns the v1.0 MVP from "feature-complete" into "shippable" per the project's "Be goated. Well." bar. Scope:

- **Typography & aesthetic:** EB Garamond throughout, journal-paper feel, restraint + whitespace + single accent color (AES-01..04, AES-06)
- **UX shortcuts & responsive:** Cmd+K focuses JARVIS, ≥768px responsive floor (AES-05, AES-07)
- **Theme:** Light/dark with system-default + persistent override, toggle in settings AND global header (SET-03, AES-06)
- **Resilience:** route-group `error.tsx`, toasts with Undo, brand-voice empty states across every list view (RES-01, RES-02, RES-03)
- **Telemetry & ops:** `/health` connectivity endpoint, `/insights` MVP charts over `jarvis_events`, custom error-report mechanism (no vendor) (RES-04, RES-06, RES-07)

Out of scope: mobile-native UX (AES-07 floors at iPad ≥768px), voice (Phase 7), JARVIS memory rework (backlog 999.4).

</domain>

<decisions>
## Implementation Decisions

### Typography (AES-01)

- **D-01:** Ship **EB Garamond only** for both body and headings (different weight/size for hierarchy). Louize is NOT in scope for v1.0 — added to backlog (see Deferred). Reason: licensing is a procurement decision that would block this phase; EB Garamond carries the journal voice well on its own.

### Keyboard shortcut (AES-05)

- **D-02:** **Cmd+K focuses the JARVIS Console input only.** No command palette. A future phase can layer CMDK on top if pattern actually emerges. Implementation: global keybind listener (escape-hatch from any focused element) that calls `editor.commands.focus("end")` on the JARVIS TipTap instance.

### Telemetry / error tracking (RES-07)

- **D-03:** **No vendor.** Implementation:
  - `error.tsx` per route group renders a branded fallback with a `Copy error report` button. Button copies a structured payload to clipboard: `{ timestamp, route, error.name, error.message, error.stack, digest, userAgent }`.
  - Server-side unhandled errors land in console.error and the Vercel runtime log (already retained for short window by hosting).
  - `console.error` calls in the app are left as-is (Sentry would intercept them; without a vendor they just hit the host log).
  - Reason: zero vendor lock-in, zero PII concerns, single-user app where you ARE the on-call. Sentry / PostHog can be added later if needs change (logged to Deferred).

### Telemetry surface (RES-06)

- **D-04:** `/insights` ships the **MVP 3 charts** exactly as the success criteria specifies:
  1. Action-type distribution (bar) — counts of `create_task / create_capture / create_event / remember_fact / ask_clarification` over the window
  2. Latency p50/p95 (line) — per-turn ms, computed from `jarvis_events` timing fields
  3. Error rate (number + sparkline) — `errors / total_turns` over the window
  - Window: last 7 days, no filter UI in v1. Server-rendered Server Component.
  - Reason: ship-fast, gives the signal you actually need; richer dashboard logged to Deferred if you start using /insights regularly.

### Theme (SET-03, AES-06)

- **D-05:** **Dark mode follows system on first load.** Once user clicks the toggle (in settings or header), preference persists to the `users` table or browser storage and overrides system from then on. Standard 2026 pattern (next-themes-style).
- **D-06:** **Toggle lives in BOTH** `/settings` (canonical surface — persistent preference) AND the global header (one-click everywhere — small icon button).

### Claude's Discretion

The following are not blocking decisions — I'll make sensible defaults during planning, document them in plans, and any choice can be revisited if it doesn't land well:

- **Toast library:** `sonner` (already installed, already used in JARVIS undo flow).
- **Motion library:** `motion/react` (per CLAUDE.md tech stack — already used by JARVIS receipts).
- **Empty-state copy voice:** brand-voice per `idea_for_polymathy.md` (Genz-Renaissance, confident, literate). I'll draft copy for every list view; you can review during execution.
- **error.tsx structure:** one per route group (root, `(app)`, etc.) following Next.js 16 conventions.
- **/health endpoint shape:** plain JSON `{ supabase: "ok"|"down", anthropic: "ok"|"down", google_calendar: "ok"|"down", checked_at }`; 200 if all ok, 503 if any down.
- **Accent color:** ONE accent (per AES-02 "monochrome plus single accent"). Likely a warm ink-red or muted blue — I'll prototype during planning and surface the swatch for confirmation before locking.
- **Motion durations:** 150–250ms for micro, 300–400ms for page transitions; respect `prefers-reduced-motion`.
- **Settings page IA:** existing `/settings/memory` pattern stays; theme + future toggles go under `/settings` root (no sub-navigation needed at this scale).
- **Responsive breakpoint behavior:** Tailwind defaults (`md:` = 768px). Below 768px, the spec says "core flows must not break" — interpretation: layout doesn't shatter, but density / sidebar collapse is acceptable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs

- `.planning/PROJECT.md` — vision, "Be goated. Well." bar, brand voice, single-user constraints
- `.planning/REQUIREMENTS.md` §AES, §SET, §RES — verbatim acceptance criteria for every requirement in this phase
- `.planning/ROADMAP.md` §Phase 6 — Success Criteria list (numbered 1–7)
- `CLAUDE.md` — tech stack (Next.js 16, Tailwind 4, motion/react, sonner, EB Garamond via next/font/google), Critical Patterns §1–§6
- `idea_for_polymathy.md` — Genz-Renaissance brand voice reference (cited by AES-04). Path TBD — researcher to locate or flag if missing.

### Prior phase context that constrains this phase

- `.planning/phases/05.1-jarvis-agentic-refactor/05.1-CONTEXT.md` — Phase 5.1 decisions, especially around JARVIS Console layout (compact receipts, prose-first) and `/settings/memory` IA
- `.planning/phases/05-jarvis/05-CONTEXT.md` — Phase 5 baseline (JARVIS Console, `jarvis_events` schema for /insights)
- `apps/web/components/jarvis/JarvisConsole.tsx` — Cmd+K target (where the keybind needs to land focus)
- `apps/web/lib/db/schema/jarvis-events.ts` (or equivalent) — `jarvis_events` table shape (drives /insights queries)
- `apps/web/app/(app)/settings/memory/page.tsx` — settings sub-page pattern to mirror for theme

### Tailwind 4 / shadcn references

- shadcn theme tokens via Tailwind 4 `@theme` blocks (CSS-first config) — extend, don't replace, for dark mode
- `next/font/google` for EB Garamond loading pattern (per CLAUDE.md Critical Pattern §5)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **sonner** for toasts — already installed and wired in `JarvisConsole.tsx` (undo flow). RES-02 toast spec ("Undo within 5 seconds") matches the existing 5s `useUndoCountdown` pattern in `JarvisReceipt.tsx`. Reuse, don't reinvent.
- **`motion/react`** — already imported in JARVIS receipts for fade-in. Same import for page transitions and list reorders.
- **`/settings`** page exists (Phase 4, SET-04 for default calendar) with `/settings/memory` sub-page (Phase 5.1). Pattern is server-rendered with a client sub-component; theme toggle slots in directly.
- **`jarvis_events`** table is populated by every JARVIS turn (Phase 5 RES-05) — /insights has its data source pre-wired, just needs read-side aggregation queries.

### Established Patterns

- **Drizzle for typed queries, supabase-js for Realtime** — CLAUDE.md Critical Pattern §2. /insights is read-only Server Component queries via Drizzle. No Realtime needed (it's a static dashboard).
- **`getClaims()` for server auth** — CLAUDE.md Critical Pattern §1. /insights + /health must guard auth correctly. /health probably 200/503 publicly (no auth, just connectivity); /insights requires auth.
- **Compact receipt visual weight** — Phase 5.1 D-R1 — when prose is primary, supporting UI is `border-l` thinner / smaller padding / reduced text size. Apply this principle to dark mode too: don't repaint, re-weight.

### Integration Points

- **Global header** — theme toggle docks here. Need to confirm whether a global header component exists or if it's per-route.
- **Cmd+K keybind** — global window-level listener, but needs to know which JARVIS Console instance to focus (there's one at a time per current architecture).
- **error.tsx** — one per route group: `app/error.tsx`, `app/(app)/error.tsx`, possibly `app/(auth)/error.tsx`. Next.js 16 convention.
- **/insights nav entry** — must appear in app navigation (sidebar or header). Single-user, so no role-gating.
- **/health endpoint** — `app/api/health/route.ts`. Three connectivity checks: Supabase ping, Anthropic ping (cheap call), Google Calendar ping (auth-context-required — may need to scope to "if user has gcal connected, ping it; otherwise mark n/a").

</code_context>

<specifics>
## Specific Ideas

- **Empty-state copy:** "Genz-Renaissance" voice — confident, literate, unapologetic. Examples to aim for: "Nothing here yet. Make it so." > "No tasks." || "An empty calendar is a kind of luxury." > "No events today."
- **Accent color hint:** the project aesthetic is "academic journal × Notion-Japanese-zen × Warp terminal" — warm ink tones (umber, ink-red) lean academic; cool greys lean terminal; muted indigo splits the difference. Prototype during planning.
- **Error report payload:** keep it copy-pastable into a GitHub issue without manual reformatting. Structured block with backticks.

</specifics>

<deferred>
## Deferred Ideas

Not in this phase. Captured so we don't lose them.

- **Louize licensing & integration** — procurement decision; add to backlog as 999.x. When license is bought + .woff2 in hand, drop into `next/font/local` and remap heading variables. Estimate: <1 day post-procurement.
- **Full CMDK command palette** — Cmd+Shift+K or replace Cmd+K. Linear-style overlay with nav + recent actions + JARVIS row. Wait until you actually feel the friction.
- **Sentry / PostHog / Highlight** — revisit if the clipboard-error-report flow proves insufficient (e.g., once you have multi-user beta testers, or want session replay).
- **Richer /insights dashboard** — time-range picker, tool-level breakdown, top-N errors table, cache hit rate panel. Logical follow-up if /insights becomes load-bearing.
- **Mobile-native UX (<768px)** — explicitly out of scope per AES-07. Future phase or future product.
- **Brand-voice copy review pass** — once empty states + error copy + button labels are drafted, a dedicated review pass to tighten voice consistency. Could be its own quick-task at end of Phase 6.

</deferred>

---

*Phase: 06-polish*
*Context gathered: 2026-05-18*
