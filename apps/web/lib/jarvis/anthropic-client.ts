/**
 * Anthropic SDK singleton for the JARVIS Route Handler.
 *
 * Phase 5 Plan 05-02 Task 2.
 *
 * The SDK reads the API key on construction; we lazily build a single client
 * per process so cold-start cost is amortized across requests. ANTHROPIC_API_KEY
 * is required at runtime — surfacing a clear error here beats the inscrutable
 * 401 the SDK would throw deep inside a stream call.
 *
 * Model ID is the canonical Sonnet 4.6 identifier per the CLAUDE.md tech-stack
 * table — `claude-sonnet-4-6`. Phase 7 may bump this when a successor lands;
 * single-source pinning keeps the swap one-file.
 *
 * Phase 11 (CACHE-01): defaultHeaders includes `extended-cache-ttl-2025-04-11`
 * so 1h TTL on tier 1 (tools) + tier 2 (system) breakpoints is honored.
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY required");
    }
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Phase 11 / CACHE-01 — extended-cache-ttl-2025-04-11 beta header.
      // Required for the SDK to honor `cache_control: { ttl: "1h" }` on
      // tools and system blocks (default TTL is 5min). Without this header
      // the 1h literals from packages/jarvis-core silently fall back to
      // 5min and the cache window degrades.
      defaultHeaders: {
        "anthropic-beta": "extended-cache-ttl-2025-04-11",
      },
    });
  }
  return client;
}

export const JARVIS_MODEL = "claude-sonnet-4-6" as const;
