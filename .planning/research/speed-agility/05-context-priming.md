# Research: Prompt Cache + Context Priming Strategy — May 2026

## TL;DR

Current code has `cache_control` on last tool def and last system block — good. Next 10× win is moving the **per-user state snapshot** (areas, projects, recent captures, today calendar) into the cached prefix as a third tier, and stopping the per-request invalidation that's almost certainly happening (timestamps, unsorted JSON).

**DO NOT run a heartbeat warmer** — cost trap. Better levers exist.

## Anthropic Prompt Caching — Current State (Verified May 2026)

- **Two TTL tiers**: 5-min (ephemeral, default) and **1-hour** via `cache_control: { type: "ephemeral", ttl: "1h" }`.
- **Pricing**: cache **read** = ~0.1× base input; cache **write** = **1.25×** (5-min) / **2×** (1-hour). Break-even: 5-min after 2 requests, 1-hour after 3.
- **Max 4 breakpoints per request.**
- **Min cacheable prefix on Sonnet 4.6**: 2048 tokens (5K well above floor).
- **Render order**: `tools` → `system` → `messages`. Breakpoint on last `system` block caches tools + system together.
- **20-block lookback window** per breakpoint.
- **Invalidation hierarchy**: changing tools or model nukes everything. Changing system preserves tools cache. Changing only messages preserves both. So you can vary user message every turn without rebuilding tools+system cache.
- **Verify via** `response.usage.cache_read_input_tokens` vs `cache_creation_input_tokens`. If reads stay 0 across turns, silent invalidator at work (almost always `Date.now()` or unsorted JSON in prefix).

## Recommended Prompt Structure (3 Cache Tiers, 3 Breakpoints)

```ts
client.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,

  // TIER 1: tools — changes only on deploy
  tools: [
    { name: "create_task", ... },
    { name: "create_capture", ... },
    // ...
    { name: "ask_clarification", ...,
      cache_control: { type: "ephemeral", ttl: "1h" } }, // BREAKPOINT 1
  ],

  // TIER 2: system — frozen persona + protocol
  system: [
    { type: "text",
      text: FROZEN_JARVIS_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral", ttl: "1h" } }, // BREAKPOINT 2

    // TIER 3: per-user state snapshot
    { type: "text",
      text: renderUserState(snapshot),
      cache_control: { type: "ephemeral" } }, // BREAKPOINT 3 — 5-min TTL
  ],

  // TIER 4: per-turn — recent turns + new message. NO cache_control.
  messages: [
    ...recentTurns,
    { role: "user", content: userText },
  ],
});
```

**Why this layout**:
- Tools + frozen system get **1h TTL** because they truly never change between deploys; 2× write cost amortizes over hundreds of turns/hour.
- User-state snapshot gets **5-min TTL** because only valid until user mutates state. 1.25× write covers itself in 2 turns.
- 3 of 4 breakpoints used — one in reserve for future `<recent-conversation>` block.
- **Critical**: `recentTurns` and new user message stay completely outside cached region. Never carry `cache_control`.

**Hour-budget math (single user)**: ~50 voice/text turns/day in two 30-min sessions. 5-min TTL gets ~10 reads per session before cold (worth 1.25× write 5× over). 1h TTL on frozen tier = **one write per session** instead of one every 5 min. At 5K base tokens, write = ~$0.03 once vs 6× per session. **Use 1h TTL for tier 1 + 2.**

## State Serialization — XML, Not JSON

JSON wastes tokens on quotes/braces; XML gives Claude clear semantic boundaries it parses extremely well (Anthropic's own guidance). Keep IDs on every entity so model can reference in tool calls without ambiguity.

Example (~800-1500 tokens for typical state):

```xml
<user_state generated_at="2026-05-28T09:00:00Z">

<areas>
- area_01 "Research" (active)
- area_02 "Health" (active)
- area_03 "Finance" (active)
</areas>

<projects status="active">
- proj_17 "Phase 6.1 visual redesign" (area_01)
- proj_22 "Sub-15-week marathon" (area_02)
- proj_31 "Q3 tax filing" (area_03)
</projects>

<projects status="upcoming">
- proj_45 "Read Gödel Escher Bach" (area_01)
</projects>

<recent_captures count="12">
- cap_812 (2026-05-28 08:14) "Idea: cached agent state via incremental JSON patches"
- cap_811 (2026-05-27 22:03) "Book rec: 'A Pattern Language'"
... (last 10-15 captures, oldest last)
</recent_captures>

<today_calendar date="2026-05-28">
- 09:00-10:00 "Deep work — JARVIS caching"
- 13:00-13:30 "Lunch w/ Maya"
</today_calendar>

<active_tasks count="8">
- task_201 (today, p1) "Ship JARVIS context priming" — proj_17
... (next 8-10 due, ordered by due date)
</active_tasks>

</user_state>
```

**Rules for density**:
1. **Stable IDs first, human label after.** Model needs ID for correct tool calls.
2. **Sort deterministically** (by ID, then date). Non-deterministic = cache miss.
3. **Cap each list**: 50 captures, 10 active tasks, 5 active projects. Older lives in DB.
4. **Strip timestamps to date-only** unless time matters (calendar yes, captures coarse, areas no).
5. **No `generated_at` to the second.** Round to minute or omit — second-precision is silent invalidator.

**Target**: 800-2000 tokens. At 2000 still 15× denser than equivalent JSON.

## Invalidation Strategy — Regenerate, Don't Patch

**Recommendation: regenerate snapshot at START of every turn; accept cache write on user-mutating turns.**

Reasoning:
- **Model already knows what it just did** — when JARVIS creates task_X, model has that action in its assistant turn from agentic loop. Don't need cached snapshot to reflect for *current* turn.
- **Next-turn cost is one cache write** (~1.25× × 800-2000 tokens = ~$0.0075 at Sonnet input pricing). Noise.
- **Patching cached block impossible** — prefix match means any change rebuilds suffix anyway.
- **Snapshot freshness matters more than cost.** Stale "active_tasks" causes misroute/duplicates.

Implementation: build snapshot once per turn from one indexed Postgres query (`SELECT ... WHERE user_id = $1 AND status = 'active' ORDER BY id LIMIT 50`). <20ms.

**Smart optimization**: track `state_version` integer that increments on any DB write. If unchanged since last turn, **reuse previous snapshot string verbatim** — guaranteed cache hit. Converts read-only conversations into pure cache reads.

## Heartbeat Warmer — DON'T

Tempting but wrong.

**Cost**: every 4 min × 24h = 360 heartbeats/day. Each pays cache read on tools+system (~5K × 0.1× × $3/MT = $0.0015) + min output (~$0.001) = ~$0.0025/ping. **~$0.90/day, $27/month** purely for idle.

**Better alternatives**:
1. **Upgrade tools + frozen system to 1h TTL.** One write per hour (~$0.03) covers waking hours. The cost-equivalent of 12 heartbeats buys 60 min guaranteed warm cache on largest blocks.
2. **Predictive warming via UX signals.** When user opens app, focuses JARVIS input, or activates wake-word, fire 1-token no-op to prime cache. ~10-50 warms/day, warms *exactly* when about to interact. Costs ~$0.10/day.
3. **Accept cold start on first turn of session.** TTFB on cold 5K prefix is ~600-900ms. After first turn, warm for next 5 min. Personal app: fine.

Heartbeat makes sense for: (a) unpredictable burst latency requirements, (b) multiple users sharing cache key, (c) B2B SLA. None apply.

## Managed Agents / Files API — Not Yet a Replacement

Checked. As of May 2026:
- **Managed Agents** (`/v1/agents`, `/v1/sessions`, beta header `managed-agents-2026-04-01`) DOES provide built-in caching, context compaction, persistent sessions. But designed for **server-managed stateful agents with Anthropic-hosted tool execution in a container** — not for personal-app NLU where tools are `create_task` in *your* Postgres. Container model overkill, costs more, adds cold-start latency per session.
- **Files API**: documents/PDFs/images attached to requests, not for persistent state stores.
- **Memory Stores** (Managed Agents only): `/mnt/memory/jarvis/` mount model reads/writes via filesystem tools. Interesting long-term but requires switching to Managed Agents wholesale; overkill for small state snapshot.

**Verdict**: manual `cache_control` on Messages API still right primitive. Reassess when Anthropic ships lightweight "session" on regular Messages API.

## TTFB Win Estimate

Assumptions: 5K tokens of (tools + frozen-system + user-state) prefix today, sent fresh every turn.

**Current state (no cache or invalidated)**:
- TTFB ≈ **600-900ms** on Sonnet 4.6 (input processing dominates at 5K, ~150ms/1K input tokens cold + network).
- Cost per turn: 5K × $3/MT = **$0.015** for prefix.

**After this design with warm cache (turn 2+ in 5-min window)**:
- TTFB ≈ **150-300ms** (cache read ~10× faster + network + small uncached suffix).
- Cost per turn: 5K × $0.30/MT = **$0.0015** for prefix.

**Net: ~400-600ms shaved off TTFB, ~90% prefix cost reduction.**

Bonus: turn-2-onward consistency. Without caching, latency varies with prefix size + Anthropic load. With cache, variance collapses — p99 tightens, which matters more than p50 for voice UX.

## Audit Checklist (before Phase 11)

Grep prompt-building code:
1. `Date.now()`, `new Date()`, `Date.toISOString()` in `system` or early `messages`? → Move to last user message or remove.
2. `JSON.stringify(obj)` on unsorted object/Map? → `JSON.stringify(obj, Object.keys(obj).sort())` or XML.
3. Tool order non-deterministic (built from `Set` or async map)? → Sort by name.
4. System prompt interpolates user name, current date, session ID? → Move to `<context>` block inside `messages`.
5. Run two identical turns back-to-back. If `response.usage.cache_read_input_tokens === 0` on second, silent invalidator. Extend `tests/jarvis-latency.test.ts` to assert `cache_read_input_tokens > 0` on second call.

**Files to modify**:
- `packages/jarvis-core/src/prompt-builder.ts` — current cache breakpoint placement; add Tier 3 user-state block
- `packages/jarvis-core/src/tools/index.ts` — upgrade tools breakpoint to `ttl: "1h"`
- `apps/web/lib/jarvis/anthropic-client.ts` — request construction
- `apps/web/app/api/jarvis/route.ts` — fetch and inject user-state snapshot per turn

## Sources

- Anthropic Prompt Caching docs (verified May 2026): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic changelog March 6, 2026 — 5-min default TTL, 1h optional, current write/read multipliers
- Anthropic `claude-api` skill `shared/prompt-caching.md` (canonical reference)
- Anthropic `claude-api` skill `shared/agent-design.md` (agent caching guidance)
- Anthropic Models docs — `claude-sonnet-4-6` pricing $3/$15 per MTok, 2048 cache floor
