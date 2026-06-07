# Phase 11: Prompt Cache + State Priming - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock JARVIS first-token latency near warm-cache numbers across the day, not just within 5-minute bursts. Five surgical changes against the existing Anthropic Messages API call:

1. **CACHE-01** — `cache_control: { type: "ephemeral", ttl: "1h" }` on last tool (currently `ask_clarification`) AND on the last frozen system block (the one preceding the new user-state block). `cache_control: { type: "ephemeral" }` (5-min) on the new user-state snapshot block. Three breakpoints used, one in reserve.
2. **CACHE-02** — New `lib/jarvis/render-user-state.ts` produces an XML-tagged plain-text snapshot of `<areas>` + `<projects status="active">` + `<projects status="upcoming">` + `<recent_captures count="N">` + `<today_calendar>` + `<active_tasks count="N">`. Stable IDs first, human label after, deterministic sort (by ID asc), capped lists (50 captures / 10 tasks / 5 projects), date-only timestamps for captures/tasks, HH:MM only for today's calendar, NO second-precision `generated_at` (rounded to minute or omitted).
3. **CACHE-03** — `state_version INT` column added to `users` table with Postgres `BEFORE INSERT/UPDATE/DELETE` triggers on the 6 user-state tables (`tasks`, `captures`, `projects`, `areas`, `habits`, `jarvis_facts`) that bump it atomically. An in-memory `Map<userId, { version, snapshotString, generatedAt }>` per route module reuses the previous snapshot byte-for-byte when `currentVersion === cachedVersion`.
4. **CACHE-04** — Predictive cache-warmer endpoint (`POST /api/jarvis/warm`) fires a 1-token no-op Anthropic request when the client emits a `jarvis-warm-cache` signal on three UX entry events: app open, JARVIS input focus, mic arm. 30-second per-event debounce + age-gate (only warm if tools+system cache estimated age > 50min within the 1h TTL window). Net: ~10-30 warms/day.
5. **CACHE-05** — Vitest CI test (`tests/cache-invalidator-gate.test.ts`) + pre-commit hook (reading staged diff) block `Date.now()`, `new Date(`, `Date.toISOString(`, and unsorted `JSON.stringify(` from appearing in a file allowlist: `packages/jarvis-core/src/prompt-builder.ts`, `packages/jarvis-core/src/personality.ts`, `packages/jarvis-core/src/tools/**`, `apps/web/lib/jarvis/render-user-state.ts`. Per-line whitelist escape: `// CACHE-OK: <reason>`.

**Out of scope (other phases):**
- Managed Agents migration (`/v1/agents`, `/v1/sessions`) — research §"Managed Agents" rules this out for v1.x; reassess when Anthropic ships lightweight "session" on the Messages API.
- Heartbeat warmer (every-4min ping) — research §"Heartbeat Warmer — DON'T" explicitly rejects this; CACHE-04's UX-signal warming is the correct lever.
- Snapshot patching / incremental updates — research §"Invalidation Strategy" mandates regenerate-on-bump, not patch.
- Redis / Upstash for snapshot cache — single-user MVP doesn't justify the dependency.
- Habits in the snapshot block — different cadence (daily/weekly, not real-time state); deferred until Phase 13+ if Haiku-routing or other phases need it.
- Multi-user `state_version` (per-user version is fine for v1.x; tenant-wide versioning is post-MVP).

</domain>

<decisions>
## Implementation Decisions

### `state_version` Increment Mechanism (D-01)
- **D-01:** **Postgres `BEFORE INSERT/UPDATE/DELETE` triggers on the 6 user-state tables (`tasks`, `captures`, `projects`, `areas`, `habits`, `jarvis_facts`) that bump `users.state_version`.** Tamper-proof, atomic, can't be forgotten when a new JARVIS tool ships. App-level bumping rejected — fragile (one missed call = stale snapshot reuse). Read-time `MAX(updated_at)` rejected — defeats the cache (extra query every turn).
- **Schema migration:** `0018_user_state_version.sql` adds `state_version BIGINT NOT NULL DEFAULT 1` to `users` and creates one shared trigger function `bump_user_state_version()` plus 6 per-table triggers wiring it. The function reads `userId` from the row (the column is `user_id` in this codebase per Phase 1 conventions).
- **Trigger scope:** only fires on rows where `user_id IS NOT NULL` (defensive — `jarvis_facts` shouldn't have NULL user_id but guard anyway). DELETE triggers read `OLD.user_id`; INSERT/UPDATE triggers read `NEW.user_id`.
- **Version overflow:** BIGINT gives ~9.2 quintillion bumps before wraparound. At 1 CRUD/second × 24h × 365 × 100 years = 3.15 billion. No wraparound concern.
- **Read pattern:** route boundary fetches `SELECT state_version FROM users WHERE id = $1` ONCE per turn (already inside the Phase 10 LAT-04 `Promise.all`). No extra round-trip.

### Snapshot Byte-for-Byte Reuse Cache (D-02)
- **D-02:** **In-memory `Map<userId, { version, snapshotString, generatedAt }>`** held in a module-level singleton inside `apps/web/lib/jarvis/state-snapshot-cache.ts`. Per-turn flow at route boundary:
  1. Fetch `state_version` from DB (inside the Phase 10 `Promise.all`).
  2. Check cache: if `cached.version === fetched.version`, reuse `cached.snapshotString` byte-for-byte → guaranteed Anthropic cache hit on the 5-min tier.
  3. If miss (version changed OR cache cold), call `renderUserState(userData)` to build fresh snapshot, store as `cached`, return.
- **Vercel serverless cold-start handling:** when the route module reinitializes (cold boot), the Map starts empty → first turn rebuilds → Anthropic-side cache also misses (cold boot means new request shape arriving fresh anyway). Acceptable — the misalignment is inherent to serverless.
- **Memory bound:** single-user MVP means Map size ≤ 1 entry. No eviction policy needed for v1.x. When multi-user lands (post-v1.x), add LRU with capacity 1000.
- **NOT a DB column / Redis / Upstash** — overkill for the rebuild cost (one Postgres query + ~5ms render).

### Predictive Warmer Triggers + Debounce (D-03)
- **D-03:** **Three UX entry triggers per spec, each debounced 30s, age-gated by estimated cache age.**
  - **Trigger 1 — App open:** fires on `/today` (or any logged-in route) mount via a top-level `<JarvisWarmer />` client component. Dispatches `jarvis-warm-cache` once per session.
  - **Trigger 2 — JARVIS input focus:** fires on `JarvisInput` `onFocus`. Dispatches `jarvis-warm-cache`.
  - **Trigger 3 — Mic arm:** fires on FSM transition `idle → listening` (voice enabled), via a subscribe to `mic-state-bus`. Dispatches `jarvis-warm-cache`.
- **Debounce / age-gate logic (client-side, before dispatch):**
  - Per-trigger 30s debounce — same trigger firing within 30s of last fire is dropped.
  - Cross-trigger age-gate — server-side tracks `lastWarmAt` in the same in-memory cache module. If `now - lastWarmAt < 50min`, skip the warm (still inside 1h TTL window with margin).
- **Warmer endpoint shape:** `POST /api/jarvis/warm` with no body. Server fires Anthropic call with `max_tokens: 1`, identical tools + frozen system blocks as the real route, NO user-state block (warming tier 1+2 only), system message: `"warm"`. Returns 200 with `{ cacheHit: boolean, tokens: number }`. Client doesn't act on response — fire-and-forget.
- **Cost ceiling:** ~$0.01-0.03/day with this debounce + age-gate combination (research §"Heartbeat Warmer — DON'T" §"Better alternatives" alternative #2 numbers).

### CI Grep Gate Scope + Enforcement (D-04)
- **D-04:** **Vitest test + pre-commit hook with explicit file allowlist.**
  - **Allowlist (the only files that can break the cache):**
    - `packages/jarvis-core/src/prompt-builder.ts`
    - `packages/jarvis-core/src/personality.ts`
    - `packages/jarvis-core/src/tools/**/*.ts`
    - `apps/web/lib/jarvis/render-user-state.ts` (new)
  - **Forbidden patterns:**
    - `Date.now()`
    - `new Date(` (any constructor invocation)
    - `Date.toISOString(`
    - `Date.toString(`
    - `JSON.stringify(` UNLESS followed within the same call by a sorted-keys argument or a stable replacer (regex: `JSON\.stringify\([^,]+\)` without a 2nd arg = forbidden)
  - **Per-line whitelist escape:** `// CACHE-OK: <reason>` on the same line as the violation. The test/hook ignores lines containing this marker. Use sparingly — every escape is a potential silent invalidator.
  - **Vitest gate (`tests/cache-invalidator-gate.test.ts`):** reads each allowlisted file, greps for forbidden patterns, asserts zero violations (modulo CACHE-OK escapes). Runs in CI on every PR.
  - **Pre-commit hook (Husky / lefthook / lint-staged — planner decides):** reads `git diff --cached` for the allowlisted files only, runs the same regex set, blocks the commit if violations are introduced. Same CACHE-OK escape honored.
- **Why two layers:** pre-commit gives instant feedback (no PR cycle), CI is the load-bearing gate (if pre-commit is bypassed with `--no-verify`, CI still catches it).
- **No runtime-byte-identical assertion** — symptom-not-cause; the grep gate is upstream of any byte-identity test.

### State Block Scope (D-05)
- **D-05:** **Spec-literal — exactly the 5 sections CACHE-02 names, no more, no less.**
  - `<areas>` — all active areas, sorted by ID asc. Format: one line per area, `id "name"`. No date stamp.
  - `<projects status="active">` — capped at 5, sorted by ID asc. Format: one line per project, `id "name" (area_id)`. No date stamp.
  - `<projects status="upcoming">` — capped at 5, sorted by ID asc. Same shape.
  - `<recent_captures count="N">` — last 50 captures by `created_at DESC`, then INSIDE the block sorted by ID asc (deterministic), formatted as `id (YYYY-MM-DD) "content"` (date only, time stripped — second-precision is silent invalidator).
  - `<today_calendar date="YYYY-MM-DD">` — today's events from Google Calendar fetch, HH:MM only (no seconds, no TZ offset), sorted by start time then ID. Empty block if no events.
  - `<active_tasks count="N">` — next 10 active tasks by `due_at ASC NULLS LAST`, then INSIDE the block sorted by ID asc, formatted as `id (status, due YYYY-MM-DD or "—") "title" — project_id`. Date only.
- **`jarvis_facts` STAYS in the existing `buildFactsBlock` system block (Phase 5.1 D-M4) — not in the snapshot.** Different cache lifecycle: facts are rarely-changing personal memory (months between updates); snapshot is volatile (every CRUD). Keeping them separated preserves the facts block at the 1h tier while letting the snapshot churn at 5min.
- **Habits NOT in snapshot.** Different cadence (daily/weekly check-ins, not real-time state). Adding habits would inflate snapshot size + bump frequency without proportional value to JARVIS routing. Revisit if Haiku fast-path (Phase 13) shows habits-aware routing wins.
- **`generated_at` attribute:** OMITTED. Even minute-precision is a needless invalidator candidate (server clock drift across instances). The cache key on the Anthropic side is the byte content; reusing the snapshot string is fine without a timestamp. Reasoning: the `state_version` is the only freshness signal that matters; the snapshot is regenerated when version bumps; no need to advertise the build moment to the model.

### 3-Tier Prompt Layout (D-06 — locked by research, not gray)
- **D-06:** Anthropic Messages API call shape after Phase 11:
  ```ts
  client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,

    // TIER 1: tools — deploy-only changes
    tools: [
      { name: "create_task", ... },
      // ... other tools (unchanged order from Phase 5/5.1) ...
      { name: "ask_clarification", ...,
        cache_control: { type: "ephemeral", ttl: "1h" } }, // BREAKPOINT 1 — upgraded from default 5min
    ],

    // TIER 2: frozen system (personality + tool-use-rules + project-list + facts if any)
    system: [
      { type: "text", text: VOICE_ADDENDUM, /* if voiceActive */ },
      { type: "text", text: JARVIS_PERSONALITY },
      { type: "text", text: TOOL_USE_RULES },
      { type: "text", text: buildProjectListContext(projects) },
      // facts block conditionally, if present:
      { type: "text", text: buildFactsBlock(facts),
        cache_control: { type: "ephemeral", ttl: "1h" } }, // BREAKPOINT 2 — upgraded from default 5min
      // ... else cache_control moves to the project-list block (existing logic)

      // TIER 3: user-state snapshot (NEW)
      { type: "text",
        text: renderUserState(snapshot),
        cache_control: { type: "ephemeral" } }, // BREAKPOINT 3 — 5-min TTL (default ephemeral)
    ],

    // TIER 4: per-turn — recent turns + new user message. NO cache_control.
    messages: [...recentTurns, { role: "user", content: userText }],
  });
  ```
- **Three breakpoints used, one in reserve** (for a future `<recent-conversation>` block at Phase 12+).
- **Phase 5's existing breakpoint** on the LAST frozen system block remains correct — Phase 11 just upgrades its TTL to 1h and adds a third breakpoint for the new snapshot block.

### Claude's Discretion
- Choice of pre-commit hook framework — Husky / lefthook / lint-staged (planner decides; lint-staged is the lightest if no Husky exists yet).
- Exact regex form for `JSON.stringify` audit (matching the 2-argument-required pattern can be done several equivalent ways; planner picks the most readable).
- The fire-and-forget warmer endpoint can use `Anthropic.beta` or stable client — planner picks; stable preferred.
- `JarvisWarmer` client component placement — top-level `(app)` layout vs per-page (`/today`, etc.). Default: `(app)` layout so it covers every authenticated route once.
- Exact filename for the snapshot module — `apps/web/lib/jarvis/render-user-state.ts` is the working name; planner can pluralize / rename if a sibling exists.
- Trigger function naming convention (`bump_user_state_version()` is the working name; planner picks following existing migration conventions).
- Whether to expose `state_version` on the API response (`/api/jarvis/turn-start` SSE event) for client-side debugging — default: NO, server-internal only.
- Cache module location — `apps/web/lib/jarvis/state-snapshot-cache.ts` is the working name; planner can collapse into `prompt-builder.ts` if it stays under ~50 lines.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 11 source-of-truth (read these in this order)
- `.planning/ROADMAP.md` §"Phase 11: Prompt Cache + State Priming" — goal + 5 success criteria + dependencies
- `.planning/REQUIREMENTS.md` lines 183–187 — CACHE-01..05 verbatim contracts
- `.planning/research/speed-agility/05-context-priming.md` — full research grounding. Critical sections:
  - §"Recommended Prompt Structure (3 Cache Tiers, 3 Breakpoints)" — the canonical layout D-06 implements
  - §"State Serialization — XML, Not JSON" — D-05 implements this verbatim; §"Rules for density" enumerates the cache-hygiene rules
  - §"Invalidation Strategy — Regenerate, Don't Patch" — D-02 implements the regenerate-on-bump pattern
  - §"Heartbeat Warmer — DON'T" — D-03 implements alternative #2 (predictive UX-signal warming)
  - §"Audit Checklist (before Phase 11)" — D-04's forbidden-pattern list
- `.planning/research/speed-agility/SUMMARY.md` — milestone synthesis; Phase 11 sits in the critical-path

### Existing code surface (extend, do not replace)
- `packages/jarvis-core/src/prompt-builder.ts` — current `buildSystemPrompt` with cache_control on last block. Phase 11 upgrades the last block's TTL to 1h and the route boundary appends the new snapshot block (Phase 11 does NOT make `prompt-builder.ts` aware of the snapshot — it stays the frozen-system builder; the route appends the snapshot block after calling it).
- `packages/jarvis-core/src/tools/index.ts` line 98 — current `cache_control: { type: "ephemeral" }` on `ask_clarification`. Phase 11 upgrades to `ttl: "1h"`.
- `packages/jarvis-core/src/personality.ts` — `JARVIS_PERSONALITY`, `TOOL_USE_RULES`, `VOICE_ADDENDUM` constants. Phase 11 grep gate gates this file too.
- `apps/web/app/api/jarvis/route.ts` — main route. Phase 11 wires: (a) fetches `state_version` inside the existing Phase 10 `Promise.all` at lines ~171; (b) calls `state-snapshot-cache.getOrBuild(userId, version, snapshotInputs)` for the snapshot string; (c) appends a fourth system block with the snapshot + `cache_control: { type: "ephemeral" }`; (d) the existing `buildSystemPrompt` output continues to carry the LAST-block breakpoint at 1h TTL.
- `apps/web/lib/jarvis/log-event.ts` line 88 — `cacheReadInputTokens` capture preserved. Phase 11 also captures `cache_creation_input_tokens` (already present) and adds nothing.
- `apps/web/tests/jarvis-latency.test.ts` (Phase 9 TEL-03) — existing cache-hit regression guard. Phase 11 extends it to assert reads against BOTH breakpoints (tools+system AND snapshot) on the second of two back-to-back identical turns with `state_version` unchanged.

### Schema migration (NEW)
- **`apps/web/supabase/migrations/0018_user_state_version.sql`** — adds `state_version BIGINT NOT NULL DEFAULT 1` to `users`, creates `bump_user_state_version()` PL/pgSQL function, attaches 6 `BEFORE INSERT/UPDATE/DELETE` triggers (one per user-state table). RLS unchanged.
- Phase 1 migration conventions: read `apps/web/supabase/migrations/0001_*.sql` for the migration header format / file naming / commenting style this project uses.

### Files created (NEW)
- `apps/web/lib/jarvis/render-user-state.ts` — pure `renderUserState(inputs: SnapshotInputs): string` returning the XML block content (without the `<text>` wrapper — the route wraps).
- `apps/web/lib/jarvis/state-snapshot-cache.ts` — module-level `Map<userId, { version, snapshotString, generatedAt }>` + `getOrBuild(userId, version, inputs)` + `getLastWarmAt() / setLastWarmAt()` for D-03 age-gate.
- `apps/web/app/api/jarvis/warm/route.ts` — `POST /api/jarvis/warm` predictive warmer endpoint.
- `apps/web/components/jarvis/JarvisWarmer.tsx` — client component mounted in `app/(app)/layout.tsx` that emits `jarvis-warm-cache` on app open + listens for input-focus + mic-arm events.
- `apps/web/tests/cache-invalidator-gate.test.ts` — Vitest grep gate per D-04.
- `apps/web/tests/render-user-state.test.ts` — serializer fixtures (≤800, ~1500, ~2000 tokens; deterministic-sort assertion; date-only assertion).
- `apps/web/tests/state-snapshot-cache.test.ts` — version-match reuse + version-bump rebuild + cold-start rebuild.
- Pre-commit hook config (lint-staged + .lintstagedrc.json or Husky hook — planner decides).

### Phase 5 + 5.1 (preserve)
- `.planning/phases/05-jarvis/05-CONTEXT.md` — D-? cache_control placement on last system block; D-16 personality contract (frozen system tier 2 carries this verbatim)
- `.planning/phases/05.1-jarvis-agentic-refactor/05.1-CONTEXT.md` — D-M4 facts block contract; Phase 11 keeps it at the 1h tier alongside the project-list block

### Phase 9 (verification surface)
- `.planning/phases/09-latency-telemetry-baseline/09-CONTEXT.md` — D-07 capture mechanics; `cache_read_input_tokens` already on `jarvis_events`
- `apps/web/lib/jarvis/log-event.ts` — telemetry writer (no Phase 11 changes)
- `apps/web/components/insights/PipelineLatencyPanel.tsx` — Phase 9 panel; Phase 11 wins land here as `prompt_built_at - request_received_at` drops AND `first_token_at - prompt_built_at` drops dramatically when cache is warm

### Phase 10 (extend, do not break)
- `apps/web/app/api/jarvis/route.ts` lines 161–179 — Phase 10 LAT-04 `Promise.all` collapse. Phase 11 adds a 4th parallel query: `state_version`. The destructure becomes `const [userProjects, userRows, userFacts, stateVersion] = await Promise.all([...])`.
- `apps/web/lib/voice/turn-playback-controller.ts` — Phase 10's per-sentence dispatcher. No changes needed; Phase 11 affects upstream (prompt build), not downstream (TTS).

### Project-level constraints
- `CLAUDE.md` — Next.js 16, `@anthropic-ai/sdk` 0.94.x (`structured-outputs-2025-11-13` beta header), `claude-sonnet-4-6`, NO global stores. The in-memory snapshot cache (D-02) is a module-level Map, not a Context — module-level singleton is the pattern CLAUDE.md permits for server-side caches.
- `.planning/PROJECT.md` — single-user MVP framing; multi-user readiness via `user_id`-scoped rows from day 1 (D-01 trigger uses `user_id` correctly).
- Anthropic SDK behavior: `cache_control: { type: "ephemeral", ttl: "1h" }` requires the `extended-cache-ttl-2025-04-11` beta header (research §"Anthropic Prompt Caching — Current State"). Planner verifies + adds the header if not already present.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`buildSystemPrompt` (`packages/jarvis-core/src/prompt-builder.ts`)** — already builds an array of `SystemBlock[]` with cache_control on the last block. Phase 11 keeps the function shape; only the LAST block's `cache_control` upgrades to `ttl: "1h"`. The new snapshot block is appended by the route (NOT by `buildSystemPrompt`) so the prompt-builder stays "frozen-system only" and the snapshot lifecycle stays at the route boundary where DB access lives.
- **`SystemBlock` interface** (line 27-31 of prompt-builder.ts) — `cache_control?: { type: "ephemeral" }`. Phase 11 extends this to `cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" }` (Anthropic's actual shape — `ttl` is optional and defaults to 5m).
- **`getJarvisFactsForUser`** (`lib/db/queries/jarvis-facts.ts` or similar) — Phase 5.1 helper; unchanged in Phase 11 since facts stay in their own block.
- **Phase 10 `Promise.all` at route boundary** — Phase 11 adds the 4th parallel query (`state_version`) into the existing destructure. No new sequential awaits.
- **`jarvis_events.cache_read_input_tokens` + `cache_creation_input_tokens`** (Phase 5 + Phase 9 schema) — telemetry already in place. Phase 11 doesn't change capture; the verification gate uses the existing columns.
- **`apps/web/tests/jarvis-latency.test.ts`** (Phase 9 TEL-03) — existing back-to-back cache-hit assertion. Phase 11 extends to assert reads on BOTH cached tiers.
- **`mic-state-bus.ts`** (Phase 7) — already exposes mic FSM transitions. Phase 11 subscribes for the `idle → listening` transition to fire the mic-arm warm trigger.
- **`/api/jarvis/route.ts` existing prompt-build telemetry** — `prompt_built_at` timestamp (Phase 9 D-07) captures AFTER the `buildSystemPrompt` call. Phase 11 preserves this; capture happens after snapshot append.

### Established Patterns
- **`cache_control` on the LAST element** of tools array + system array — Phase 5's pattern. Phase 11 keeps the "last element gets the breakpoint" convention but adds a SECOND breakpoint on the new last-system-block (snapshot) and keeps the first breakpoint on what used to be the last-system-block (facts or project-list).
- **Module-level singletons for server-side caches** — pattern used by Phase 5 / Phase 7 for stateless server modules. The snapshot cache follows the same convention. NOT a `globalThis` shim; just a top-level `const cache = new Map(...)`.
- **Postgres triggers** — Phase 1 / Phase 2 already use triggers (`tasks.position_recompute_trigger`, capture `content_search` tsvector trigger). Phase 11 follows the existing trigger style.
- **Telemetry never breaks user flow** — Phase 5 / Phase 9 / Phase 10 contract. Phase 11's `state-snapshot-cache` `getOrBuild` falls through to rebuild on any error (no thrown exception reaches the prompt builder).
- **Vitest gates with `tests/*-gate.test.ts` naming** — Phase 5 established this for cache + adversarial guards. Phase 11 follows.
- **Pre-commit hooks via `lint-staged`** — not yet in the project. Phase 11 introduces; minimal config. If Husky is preferred, planner picks (existing `.git/hooks/` is empty per spot-check).

### Integration Points
- **`app/api/jarvis/route.ts`** lines ~161–200: append `state_version` to the existing `Promise.all`, call `state-snapshot-cache.getOrBuild`, append the snapshot block to the `system` array after `buildSystemPrompt` returns. Pass the `extended-cache-ttl-2025-04-11` beta header on the `client.messages.stream(...)` call if not already present.
- **`packages/jarvis-core/src/prompt-builder.ts`**: upgrade the last-block `cache_control` to `{ type: "ephemeral", ttl: "1h" }`. Extend the `SystemBlock` `cache_control` type with optional `ttl`. No other shape change.
- **`packages/jarvis-core/src/tools/index.ts` line 98**: upgrade `cache_control` to `{ type: "ephemeral", ttl: "1h" }`.
- **NEW `app/api/jarvis/warm/route.ts`**: thin endpoint that builds the same tools + system (NO snapshot, NO user messages — just `{ role: "user", content: "warm" }` and `max_tokens: 1`). Auth via existing `getClaims()`. Returns 200 with `{ cacheRead, cacheCreate }` for client debugging (client ignores).
- **NEW `lib/jarvis/render-user-state.ts`**: pure renderer; takes the SnapshotInputs (areas, projects, captures, calendar, tasks), returns string. No DB access inside — caller fetches.
- **NEW `lib/jarvis/state-snapshot-cache.ts`**: `Map<userId, { version, snapshotString, generatedAt }>`, plus `lastWarmAtByUser: Map<userId, number>` for D-03 age-gate. Two-line API: `getOrBuild(userId, version, inputs) → snapshot`, `setLastWarmAt(userId) / getLastWarmAt(userId)`.
- **NEW `components/jarvis/JarvisWarmer.tsx`**: client component. Effect on mount dispatches `jarvis-warm-cache` once. Listens for window events `jarvis-input-focus` (dispatched by `JarvisInput`) and `mic-arm` (dispatched by mic FSM). 30s per-trigger debounce client-side. Calls `POST /api/jarvis/warm` (fire-and-forget).
- **Wire JarvisWarmer into `app/(app)/layout.tsx`** — one-line mount so every authenticated route picks it up. Reads `user` from existing layout `getClaims()`.
- **`JarvisInput` `onFocus`** — add `window.dispatchEvent(new CustomEvent("jarvis-input-focus"))` in the onFocus handler. One line.
- **`mic-state-bus.ts`** — emit a `mic-arm` event on the FSM transition `idle → listening`. One line.

</code_context>

<specifics>
## Specific Ideas

- **The headline metric:** `first_token_at - prompt_built_at` (Phase 9 stage delta) drops from ~600-900ms cold to ~150-300ms warm. The Phase 9 `/insights` Pipeline Latency panel shows this without any chart change.
- **The user perceives Phase 11's win as "JARVIS responds instantly even hours into the day."** The cold-start cost is paid once per session (research §"TTFB Win Estimate"); after that, all turns within 1h hit the tools+system cache and most turns within 5min hit the snapshot cache.
- **Cost win is a side benefit:** ~90% prefix-token cost reduction on warm turns. Not the headline; Phase 11 is latency work, not cost work.
- **The grep gate is the load-bearing discipline.** Every prior Phase 9/10 cache-related bug came from a silent invalidator (a `new Date()` slipping into a prompt block). The gate makes regression structurally impossible.
- **The snapshot fixtures in tests/render-user-state.test.ts** should match the user's actual scale: ~5 areas, ~5-8 projects, ~30-50 recent captures, ~5-10 today calendar events, ~8-15 active tasks. The 800-2000 token cap is the budget; fixtures should land near 1200-1500 tokens (typical) and 1900-2000 (heavy day).
- **Predictive warmer cost ceiling** is a design constraint: if a planner extension somehow inflates it past $0.10/day, the design has regressed back toward the heartbeat anti-pattern. The 50min age-gate is what prevents this.

</specifics>

<deferred>
## Deferred Ideas

- **Managed Agents migration** (`/v1/agents`, `/v1/sessions`, beta `managed-agents-2026-04-01`) — research §"Managed Agents" rules this out for v1.x. Container model overkill for personal-app NLU. Revisit when Anthropic ships lightweight session on Messages API.
- **Heartbeat warmer** (background every-N-min pings) — research §"Heartbeat Warmer — DON'T" explicitly rejects. CACHE-04's UX-signal warming is the correct lever.
- **Habits / recent-undone-actions / search-history in snapshot block** — adds bump frequency without proportional routing value. Revisit if Haiku fast-path (Phase 13) needs habits-aware routing.
- **Snapshot patching** (incremental diff updates) — research §"Invalidation Strategy" rules out; prefix-match cache invalidates any suffix anyway.
- **Redis / Upstash for snapshot reuse** — overkill at single-user; revisit at multi-user (post-v1.x).
- **DB-persisted snapshot cache** (`users.cached_state_snapshot`) — single-user rebuild cost is one cheap query + ~5ms render; serverless cold-start doesn't justify the durability column.
- **`<recent-conversation>` 4th cached block** — research §"Recommended Prompt Structure" notes one breakpoint in reserve for this. Phase 12+ may consume it. Phase 11 leaves it unused.
- **Multi-user `state_version`** (tenant-wide invalidation, e.g., on schema migration) — per-user version is fine for v1.x; tenant-wide concerns are post-MVP.
- **Snapshot freshness for read-mode JARVIS** (backlog 999.3 JARVIS read-layer) — when JARVIS reads existing tasks/captures, the snapshot's bounded list (≤50 captures, ≤10 tasks) is insufficient. Read-layer phase will need direct DB query, not snapshot. Out of scope here.
- **`<text>` block size monitoring / alerting** — if snapshot ever exceeds 2000 tokens, flag in /insights. Defer to a post-v1.x telemetry pass.
- **Per-tool cache breakpoints** (different TTL per tool category) — research §"Render order" notes tools cache together; splitting per-tool would consume the reserved breakpoint without clear win.
- **Server-Timing HTTP headers** for cache-hit visibility in browser DevTools — interesting but /insights is the surface we own.

</deferred>

---

*Phase: 11-prompt-cache-state-priming*
*Context gathered: 2026-05-30*
