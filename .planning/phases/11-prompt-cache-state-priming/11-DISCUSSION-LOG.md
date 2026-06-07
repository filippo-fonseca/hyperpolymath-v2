# Phase 11: Prompt Cache + State Priming - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 11-prompt-cache-state-priming
**Areas discussed:** state_version mechanism, snapshot reuse cache, predictive warmer triggers, grep gate scope, snapshot block scope, 3-tier prompt layout

**Mode:** User delegated all decisions to Claude with "u choose" after Claude presented 5 gray areas with recommended choices. All decisions reflect the recommended option from the presentation, plus the 3-tier layout (D-06) which was locked by research rather than presented as a gray area.

---

## state_version Increment Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres triggers | `BEFORE INSERT/UPDATE/DELETE` on 6 user-state tables bump `users.state_version`; tamper-proof, atomic, can't be forgotten | ✓ |
| App-level | Each tool executor manually calls `bumpStateVersion(userId)` after success | |
| Read-time computed | `MAX(updated_at)` across user-state tables | |

**User's choice:** Claude-selected — Postgres triggers.
**Notes:** Tamper-proof + atomic + can't be forgotten when a new tool ships. App-level rejected for fragility. Read-time computed rejected because it defeats the cache (one query per turn just to know the version). Migration `0018_user_state_version.sql` adds BIGINT column + `bump_user_state_version()` shared function + 6 per-table triggers.

---

## Snapshot Byte-for-Byte Reuse Cache

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory Map | `Map<userId, { version, snapshotString, generatedAt }>` in module-level singleton | ✓ |
| DB columns | `users.cached_state_snapshot TEXT` + `users.cached_state_version INT` for durability | |
| Redis / Upstash | Durable + fast; adds dependency | |

**User's choice:** Claude-selected — in-memory Map.
**Notes:** Vercel cold-start rebuild is acceptable (Anthropic-side cache also misses on cold boot). Zero schema change. Memory bound is 1 entry at single-user MVP scale. When multi-user lands, add LRU capacity 1000.

---

## Predictive Warmer Triggers + Debounce

| Option | Description | Selected |
|--------|-------------|----------|
| Spec-literal: app open + input focus + mic arm | Three UX entry triggers per CACHE-04; each debounced 30s, age-gated (only warm if estimated cache age > 50min) | ✓ |
| App open + input focus only | Drop mic arm; risks cold cache on first voice turn after long idle | |
| Add idle-threshold (4-min) proactive warming | Closer to heartbeat in cost; defeats the "no heartbeat" research guidance | |

**User's choice:** Claude-selected — spec-literal three triggers.
**Notes:** New `POST /api/jarvis/warm` endpoint fires Anthropic call with `max_tokens: 1` + same tools + frozen system as real route + system message "warm". 30s per-trigger debounce + 50min age-gate keeps cost at ~$0.01-0.03/day.

---

## CI Grep Gate Scope + Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + pre-commit hook with file allowlist | Two-layer gate: pre-commit fast feedback + CI load-bearing; allowlist limits scope to prompt-build files | ✓ |
| Runtime byte-identical assertion only | Builds prompt twice and asserts identity; symptom-not-cause | |

**User's choice:** Claude-selected — Vitest + pre-commit with file allowlist.
**Notes:** Allowlist: `packages/jarvis-core/src/prompt-builder.ts`, `packages/jarvis-core/src/personality.ts`, `packages/jarvis-core/src/tools/**`, `apps/web/lib/jarvis/render-user-state.ts`. Forbidden: `Date.now()`, `new Date(`, `Date.toISOString(`, `Date.toString(`, unsorted `JSON.stringify(`. Per-line escape: `// CACHE-OK: <reason>`. Pre-commit framework (Husky / lefthook / lint-staged) is planner's discretion.

---

## State Block Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Spec-literal | The 5 sections CACHE-02 names: areas, projects (active+upcoming), recent captures ≤50, today calendar, active tasks ≤10. `jarvis_facts` stays in existing facts block. Habits NOT in snapshot. | ✓ |
| Add habits + recent jarvis actions | Richer context; inflates size + bump frequency | |
| Merge `jarvis_facts` into snapshot | One block to rule them all; loses rarely-changing-facts cache benefit | |

**User's choice:** Claude-selected — spec-literal 5 sections.
**Notes:** `jarvis_facts` stays at 1h tier (Phase 5.1 D-M4); snapshot churns at 5min tier. Separation preserves the facts cache. Habits deferred (daily/weekly cadence, not real-time state). `generated_at` attribute OMITTED (state_version is the freshness signal; no need to invalidate on clock).

---

## 3-Tier Prompt Layout (D-06, locked by research)

This was not a gray area presented to the user — it was locked by `.planning/research/speed-agility/05-context-priming.md` §"Recommended Prompt Structure". Recording here for audit completeness.

**Layout:**
1. **Tier 1 — tools** (deploy-only changes): `cache_control: { type: "ephemeral", ttl: "1h" }` on last tool (`ask_clarification`, upgrade from default 5min)
2. **Tier 2 — frozen system** (personality + tool-use-rules + project-list + facts if any): `cache_control: { type: "ephemeral", ttl: "1h" }` on the LAST block (facts or project-list per existing Phase 5.1 logic, upgrade from default 5min)
3. **Tier 3 — user-state snapshot** (NEW, regenerates per turn unless `state_version` unchanged): `cache_control: { type: "ephemeral" }` (5min default)
4. **Tier 4 — per-turn messages** (recent turns + new user message): NO cache_control

**Breakpoints used:** 3 of 4. One in reserve for Phase 12+ `<recent-conversation>` block.

---

## Claude's Discretion

The following were locked as Claude's Discretion in CONTEXT.md and will be planner-decided:
- Pre-commit hook framework choice (lint-staged / Husky / lefthook)
- Exact regex form for unsorted-JSON-stringify detection
- Anthropic SDK call style (stable vs beta client)
- `JarvisWarmer` component placement (app layout vs per-page; default app layout)
- Snapshot module filename (`render-user-state.ts` is the working name)
- Trigger function naming convention (`bump_user_state_version()` working name)
- Whether to expose `state_version` on `/api/jarvis/turn-start` SSE event (default NO)
- Cache module collapse vs separate file (`state-snapshot-cache.ts` working location)

## Deferred Ideas

- Managed Agents migration (ruled out by research for v1.x)
- Heartbeat warmer (ruled out by research)
- Habits / recent-undone-actions / search-history in snapshot
- Snapshot patching / incremental diff updates
- Redis / Upstash for snapshot reuse
- DB-persisted snapshot cache
- `<recent-conversation>` 4th cached block (reserved breakpoint, Phase 12+)
- Multi-user / tenant-wide `state_version`
- Snapshot freshness for read-layer JARVIS (backlog 999.3)
- Snapshot size monitoring / alerting in /insights
- Per-tool cache breakpoints
- Server-Timing HTTP headers
