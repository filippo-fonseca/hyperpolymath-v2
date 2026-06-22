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

/**
 * Pure migrators keyed by the SOURCE version they migrate FROM.
 * Each migrator lifts the payload to the next version's shape and re-parses
 * via ContextSnapshotSchema. Additive changes (new node types) are safe to
 * re-parse because the old payload simply lacks the new nodes — that is valid.
 */
const migrators: Record<number, (payload: unknown) => Result<ContextSnapshot>> = {
  1: (payload) => {
    // v1 -> v2: added journal_entry node type (additive). v1 page nodes also lack
    // the folderId/folderPath fields added in v3, so we cannot parse a v1 payload
    // straight against the current schema. Chain through the v2 migrator, which
    // backfills those page fields before the final parse. (journal_entry is still
    // additive: v1 payloads simply have none, which the schema accepts.)
    return migrators[2](payload);
  },
  2: (payload) => {
    // v2 -> v3 (Phase 29): page nodes gained `folderId` (nullable) and `folderPath`
    // (root-first folder names). Old rows predate folder placement on the snapshot,
    // so backfill folderId:null and folderPath:[] on every page node. We do NOT
    // fabricate folder data for historical rows; each page keeps the direct-only
    // `projectIds` set it was persisted with.
    if (typeof payload !== "object" || payload === null) {
      return err("v2->v3 migration failed: payload is not an object");
    }
    const obj = payload as { nodes?: unknown };
    const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    const migratedNodes = nodes.map((node) => {
      if (
        typeof node === "object" &&
        node !== null &&
        (node as { type?: unknown }).type === "page"
      ) {
        const page = node as Record<string, unknown>;
        return {
          ...page,
          folderId: page.folderId ?? null,
          folderPath: Array.isArray(page.folderPath) ? page.folderPath : [],
        };
      }
      return node;
    });
    const lifted = {
      ...(payload as object),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nodes: migratedNodes,
    };
    const parsed = ContextSnapshotSchema.safeParse(lifted);
    if (!parsed.success) return err(`v2->v3 migration failed: ${parsed.error.message}`);
    return ok(parsed.data);
  },
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
  // fromVersion < CURRENT — check migrators map before falling through to legacy.
  const migrator = migrators[fromVersion];
  if (migrator) {
    return migrator(payload);
  }
  // No migrator registered for this version. Return opaque legacy wrapper so
  // the caller can choose to ignore the row rather than crash.
  return ok({
    _legacy: true,
    schemaVersion: fromVersion,
    ...(payload as object),
  } as LegacySnapshot);
}
