/**
 * Anthropic SDK client factory for the JARVIS Route Handler.
 *
 * Phase 5 Plan 05-02 Task 2.
 *
 * BYOK: the API key is now passed in per call rather than read from the
 * environment. Per-user request paths resolve the caller's OWN key via
 * lib/byok/keys.ts and pass it here; owner-system paths (cron, health,
 * landing demo) pass `process.env.ANTHROPIC_API_KEY` explicitly. This keeps a
 * public user from ever spending the owner's tokens.
 *
 * To preserve cold-start amortization we cache one client per distinct key in
 * a Map (keyed by the apiKey string) rather than a single process singleton —
 * the same key reuses its client across requests.
 *
 * Model ID is the canonical Sonnet 4.6 identifier per the CLAUDE.md tech-stack
 * table — `claude-sonnet-4-6`. Phase 7 may bump this when a successor lands;
 * single-source pinning keeps the swap one-file.
 *
 * Phase 11 (CACHE-01): defaultHeaders includes `extended-cache-ttl-2025-04-11`
 * so 1h TTL on tier 1 (tools) + tier 2 (system) breakpoints is honored.
 */

import Anthropic from "@anthropic-ai/sdk";

const clients = new Map<string, Anthropic>();

export function getAnthropicClient(apiKey: string): Anthropic {
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({
      apiKey,
      // Phase 11 / CACHE-01 — extended-cache-ttl-2025-04-11 beta header.
      // Required for the SDK to honor `cache_control: { ttl: "1h" }` on
      // tools and system blocks (default TTL is 5min). Without this header
      // the 1h literals from packages/jarvis-core silently fall back to
      // 5min and the cache window degrades.
      defaultHeaders: {
        "anthropic-beta": "extended-cache-ttl-2025-04-11",
      },
    });
    clients.set(apiKey, client);
  }
  return client;
}

export const JARVIS_MODEL = "claude-sonnet-4-6" as const;
