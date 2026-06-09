/**
 * Typed Drizzle read queries for the Training surface (Phase 15).
 *
 * CLAUDE.md Critical Pattern 2: use Drizzle for typed queries; `supabase-js`
 * is reserved for Realtime subscriptions only. No `createClient` here.
 *
 * Auth happens one layer up — Server Components and Server Actions call
 * `getClaims()` before passing `userId` into these helpers.
 */

import { and, asc, between, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  trainingActivities,
  trainingActivityTypes,
  trainingBatches,
  users,
} from "@/lib/db/schema";

export type BatchRow = typeof trainingBatches.$inferSelect;
export type ActivityTypeRow = typeof trainingActivityTypes.$inferSelect;
export type ActivityRow = typeof trainingActivities.$inferSelect;

/**
 * An activity row joined with the minimal subset of its type the UI needs:
 * id, name, color (OKLCH), hasDistance (does the form show a distance field?),
 * batchId (so stats grouping doesn't need a second round-trip).
 */
export type ActivityWithType = ActivityRow & {
  type: {
    id: string;
    name: string;
    color: string;
    hasDistance: boolean;
    batchId: string | null;
  };
};

/**
 * An activity-type row joined with its (optional) batch name — used by the
 * Manage-Types sheet and any per-type display.
 */
export type TypeWithBatch = ActivityTypeRow & {
  batchName: string | null;
};

// ──────────────────────────────────────────────────────────────────────────
// Batches
// ──────────────────────────────────────────────────────────────────────────

/**
 * All non-archived batches for a user, ordered by user-defined `orderIndex`
 * (D-05 — drag-to-reorder is the source of truth).
 */
export async function getBatches(userId: string): Promise<BatchRow[]> {
  return db
    .select()
    .from(trainingBatches)
    .where(
      and(
        eq(trainingBatches.userId, userId),
        isNull(trainingBatches.archivedAt),
      ),
    )
    .orderBy(asc(trainingBatches.orderIndex), asc(trainingBatches.createdAt));
}

// ──────────────────────────────────────────────────────────────────────────
// Activity types
// ──────────────────────────────────────────────────────────────────────────

/**
 * All non-archived activity types for a user, each carrying its (optional)
 * batch name via a LEFT join so the Manage-Types sheet can group without a
 * second query. Ordered by orderIndex (D-05).
 */
export async function getActivityTypes(
  userId: string,
): Promise<TypeWithBatch[]> {
  const rows = await db
    .select({
      type: trainingActivityTypes,
      batchName: trainingBatches.name,
    })
    .from(trainingActivityTypes)
    .leftJoin(
      trainingBatches,
      eq(trainingBatches.id, trainingActivityTypes.batchId),
    )
    .where(
      and(
        eq(trainingActivityTypes.userId, userId),
        isNull(trainingActivityTypes.archivedAt),
      ),
    )
    .orderBy(
      asc(trainingActivityTypes.orderIndex),
      asc(trainingActivityTypes.createdAt),
    );

  return rows.map((r) => ({ ...r.type, batchName: r.batchName }));
}

// ──────────────────────────────────────────────────────────────────────────
// Activities
// ──────────────────────────────────────────────────────────────────────────

/**
 * Activities scheduled within `[fromISO, toISO]` (inclusive). Each row carries
 * its joined type metadata so the planner board and widget can render without
 * a second round-trip. Ordered by date then within-day order.
 *
 * Used by:
 *   - Weekly planner board (one-week window)
 *   - LifeOS TodayTrainingWidget (today-only window)
 *   - Heatmap (rolling ~365-day window)
 */
export async function getActivitiesInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<ActivityWithType[]> {
  const rows = await db
    .select({
      activity: trainingActivities,
      typeId: trainingActivityTypes.id,
      typeName: trainingActivityTypes.name,
      typeColor: trainingActivityTypes.color,
      typeHasDistance: trainingActivityTypes.hasDistance,
      typeBatchId: trainingActivityTypes.batchId,
    })
    .from(trainingActivities)
    .innerJoin(
      trainingActivityTypes,
      eq(trainingActivityTypes.id, trainingActivities.activityTypeId),
    )
    .where(
      and(
        eq(trainingActivities.userId, userId),
        between(trainingActivities.scheduledDate, fromISO, toISO),
      ),
    )
    .orderBy(
      asc(trainingActivities.scheduledDate),
      asc(trainingActivities.dayOrderIndex),
      asc(trainingActivities.createdAt),
    );

  return rows.map((r) => ({
    ...r.activity,
    type: {
      id: r.typeId,
      name: r.typeName,
      color: r.typeColor,
      hasDistance: r.typeHasDistance,
      batchId: r.typeBatchId,
    },
  }));
}

/**
 * All activities for a user across all time — backs the stats heatmap and
 * any all-time aggregate. Identical join shape to `getActivitiesInRange`.
 */
export async function getAllActivities(
  userId: string,
): Promise<ActivityWithType[]> {
  const rows = await db
    .select({
      activity: trainingActivities,
      typeId: trainingActivityTypes.id,
      typeName: trainingActivityTypes.name,
      typeColor: trainingActivityTypes.color,
      typeHasDistance: trainingActivityTypes.hasDistance,
      typeBatchId: trainingActivityTypes.batchId,
    })
    .from(trainingActivities)
    .innerJoin(
      trainingActivityTypes,
      eq(trainingActivityTypes.id, trainingActivities.activityTypeId),
    )
    .where(eq(trainingActivities.userId, userId))
    .orderBy(
      asc(trainingActivities.scheduledDate),
      asc(trainingActivities.dayOrderIndex),
    );

  return rows.map((r) => ({
    ...r.activity,
    type: {
      id: r.typeId,
      name: r.typeName,
      color: r.typeColor,
      hasDistance: r.typeHasDistance,
      batchId: r.typeBatchId,
    },
  }));
}

/**
 * Single activity by id, with type join. Used by the completion modal and
 * any single-record detail view. Returns null if not found or not owned.
 */
export async function getActivityById(
  userId: string,
  id: string,
): Promise<ActivityWithType | null> {
  const rows = await db
    .select({
      activity: trainingActivities,
      typeId: trainingActivityTypes.id,
      typeName: trainingActivityTypes.name,
      typeColor: trainingActivityTypes.color,
      typeHasDistance: trainingActivityTypes.hasDistance,
      typeBatchId: trainingActivityTypes.batchId,
    })
    .from(trainingActivities)
    .innerJoin(
      trainingActivityTypes,
      eq(trainingActivityTypes.id, trainingActivities.activityTypeId),
    )
    .where(
      and(
        eq(trainingActivities.userId, userId),
        eq(trainingActivities.id, id),
      ),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    ...r.activity,
    type: {
      id: r.typeId,
      name: r.typeName,
      color: r.typeColor,
      hasDistance: r.typeHasDistance,
      batchId: r.typeBatchId,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// User preference
// ──────────────────────────────────────────────────────────────────────────

/**
 * The signed-in user's preferred distance unit (km | mi). Server pages read
 * this once and pass it down so client components don't need to fetch.
 */
export async function getDistanceUnit(
  userId: string,
): Promise<"km" | "mi"> {
  const [row] = await db
    .select({ unit: users.distanceUnit })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const u = row?.unit ?? "km";
  return u === "mi" ? "mi" : "km";
}
