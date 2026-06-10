/**
 * Schema-version migrator for personal-context snapshots (CTX-09).
 *
 * Snapshots are FOREVER — historical rows must never be UPDATEd because the
 * agent could mis-attribute changes to the user's actual past. Instead, the
 * reader migrates on read.
 *
 * - `fromVersion === CURRENT_SCHEMA_VERSION` → Zod-parse + return typed.
 * - `fromVersion >  CURRENT_SCHEMA_VERSION` → fail loudly (forward-incompat).
 * - `fromVersion <  CURRENT_SCHEMA_VERSION` → if no migrator is registered
 *   (we're at v1 today), return an opaque `_legacy: true` wrapper so the
 *   caller can choose to ignore the row rather than crash. Per RESEARCH.md
 *   Pitfall 3: never silently invent missing fields.
 *
 * When v2 ships, add a `migrators` table mapping fromVersion → pure function
 * that transforms the JSON into the next-version shape, then re-parse.
 */

import { type Result, ok, err } from "@/lib/integrations/result";
import { ContextSnapshotSchema, CURRENT_SCHEMA_VERSION, type ContextSnapshot } from "./types";

export { CURRENT_SCHEMA_VERSION };

/** Opaque wrapper for payloads older than the reader with no migrator registered. */
export type LegacySnapshot = {
  _legacy: true;
  schemaVersion: number;
  [k: string]: unknown;
};

export function migrate(
  payload: unknown,
  fromVersion: number,
): Result<ContextSnapshot | LegacySnapshot> {
  if (fromVersion === CURRENT_SCHEMA_VERSION) {
    const parsed = ContextSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      return err(
        `v${CURRENT_SCHEMA_VERSION} payload failed validation: ${parsed.error.message}`,
      );
    }
    return ok(parsed.data);
  }
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    return err(
      `snapshot v${fromVersion} is newer than reader v${CURRENT_SCHEMA_VERSION}`,
    );
  }
  // fromVersion < CURRENT and no migrator registered yet. Return opaque legacy.
  return ok({
    _legacy: true,
    schemaVersion: fromVersion,
    ...(payload as object),
  } as LegacySnapshot);
}
