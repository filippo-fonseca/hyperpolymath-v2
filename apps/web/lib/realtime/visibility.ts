import type { RealtimeTable } from "./query-keys";

/**
 * Module-level refcounted registry of active (table, userId) pairs across all
 * mounted useTableSubscription hooks. Backs the single visibilitychange
 * listener at the QueryProvider level (D-11 / RT-03) — one listener, not N.
 *
 * Refcount semantics: multiple mounts of the same (table, userId) increment;
 * unregister decrements; entry is removed when count hits zero. This guarantees
 * notifyVisible() invalidates each (table, userId) exactly once even when N
 * components share the underlying subscription (RT-01).
 */

type Key = `${RealtimeTable}::${string}`;
const counts = new Map<
  Key,
  { table: RealtimeTable; userId: string; refcount: number }
>();

function makeKey(table: RealtimeTable, userId: string): Key {
  return `${table}::${userId}`;
}

export function registerActiveTable(
  table: RealtimeTable,
  userId: string,
): void {
  const key = makeKey(table, userId);
  const entry = counts.get(key);
  if (entry) entry.refcount += 1;
  else counts.set(key, { table, userId, refcount: 1 });
}

export function unregisterActiveTable(
  table: RealtimeTable,
  userId: string,
): void {
  const key = makeKey(table, userId);
  const entry = counts.get(key);
  if (!entry) return;
  entry.refcount -= 1;
  if (entry.refcount <= 0) counts.delete(key);
}

export function getActiveTables(): ReadonlyArray<{
  table: RealtimeTable;
  userId: string;
}> {
  return Array.from(counts.values()).map(({ table, userId }) => ({
    table,
    userId,
  }));
}

/**
 * Invokes invalidate exactly once per active (table, userId). Called from the
 * single QueryProvider-level visibilitychange listener (D-11 / RT-03).
 */
export function notifyVisible(
  invalidate: (table: RealtimeTable, userId: string) => void,
): void {
  for (const { table, userId } of getActiveTables()) invalidate(table, userId);
}

/** Test-only — reset module state between tests. */
export function __resetForTests(): void {
  counts.clear();
}
