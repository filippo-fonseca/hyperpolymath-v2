// CACHE-INFRASTRUCTURE (not on CACHE-05 allowlist — this file holds
// VOLATILE state by design; the allowlist guards content-producing
// files that flow INTO the cached prefix). This module is the reuse
// layer; its outputs (renderUserState strings) ARE on the allowlist.
//
// Phase 11 / CACHE-03 (D-02) — module-level singleton snapshot reuse cache.
//
// Per-route module Map keyed by userId. When the route boundary fetches
// users.state_version and finds it unchanged since the previous turn,
// getOrBuild returns the previously-rendered snapshot string byte-for-byte
// → guaranteed Anthropic cache hit on tier 3 (5-min ephemeral).
//
// CLAUDE.md compliance: module-level Map is the permitted form of
// server-side cache (NOT React Context, NOT globalThis, NOT Zustand).
// Vercel serverless cold-start: Map starts empty → first turn rebuilds,
// Anthropic-side cache also misses (cold boot = new request shape
// anyway). Acceptable misalignment per D-02.
//
// No eviction policy — single-user MVP means Map.size ≤ 1.
// When multi-user lands (post-v1.x), add LRU(1000).

import { renderUserState, type SnapshotInputs } from "./render-user-state";

interface CacheEntry {
  version: bigint;
  snapshotString: string;
  generatedAt: number; // Date.now() of the build — used for diagnostics only, NEVER concatenated into prompt content
}

const snapshotCache = new Map<string, CacheEntry>();
const lastWarmAtByUser = new Map<string, number>();

function normalizeVersion(v: bigint | number): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

export function getOrBuild(
  userId: string,
  version: bigint | number,
  inputs: SnapshotInputs,
): string {
  const v = normalizeVersion(version);
  const cached = snapshotCache.get(userId);
  if (cached && cached.version === v) {
    return cached.snapshotString;
  }
  // Cache miss: rebuild. Fall through (no throw) — telemetry must never
  // break user flow. If renderUserState ever throws, the route still
  // gets a working snapshot via the catch path below.
  let snapshotString: string;
  try {
    snapshotString = renderUserState(inputs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[jarvis] state-snapshot-cache: renderUserState failed", err);
    // Best-effort empty snapshot — preserves cache key shape so Anthropic
    // doesn't see structural shift; the user-state tier degrades to empty
    // for this turn only.
    snapshotString = "<user_state />";
  }
  snapshotCache.set(userId, {
    version: v,
    snapshotString,
    generatedAt: Date.now(),
  });
  return snapshotString;
}

export function getLastWarmAt(userId: string): number | null {
  return lastWarmAtByUser.get(userId) ?? null;
}

export function setLastWarmAt(userId: string, ts: number): void {
  lastWarmAtByUser.set(userId, ts);
}

/** Test-only — clears both maps. Never call in production code. */
export function __resetForTests(): void {
  snapshotCache.clear();
  lastWarmAtByUser.clear();
}
