/**
 * Snapshot loader: training activities.
 *
 * Cap: 30 most-recent activities (by scheduled_date desc). The snapshot
 * surfaces "what Filippo has actually been training" — the canonical km
 * storage gets passed straight through (no per-user unit conversion at the
 * snapshot layer; agents can ask their own questions about units).
 *
 * activity_type_id is joined to training_activity_types so we can ship the
 * type name (e.g. "Running", "Push Day") as the `kind` field — agents care
 * about the kind, not the type-UUID.
 */

import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import {
  trainingActivities,
  trainingActivityTypes,
} from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

const TRAINING_CAP = 30;

function dateToISO(d: Date | string | null): string {
  if (d === null) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

function numericToNumber(n: string | number | null): number | null {
  if (n === null) return null;
  if (typeof n === "number") return n;
  const parsed = Number.parseFloat(n);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadTraining(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: trainingActivities.id,
      kind: trainingActivityTypes.name,
      // Prefer actual when present (the snapshot is "what happened"),
      // fall back to planned for activities that are still on the board.
      plannedDurationMin: trainingActivities.plannedDurationMin,
      actualDurationMin: trainingActivities.actualDurationMin,
      plannedDistanceKm: trainingActivities.plannedDistanceKm,
      actualDistanceKm: trainingActivities.actualDistanceKm,
      scheduledDate: trainingActivities.scheduledDate,
    })
    .from(trainingActivities)
    .innerJoin(
      trainingActivityTypes,
      and(
        eq(trainingActivityTypes.id, trainingActivities.activityTypeId),
        eq(trainingActivityTypes.userId, userId),
      ),
    )
    .where(eq(trainingActivities.userId, userId))
    .orderBy(desc(trainingActivities.scheduledDate))
    .limit(TRAINING_CAP);

  const nodes: Node[] = rows.map((r) => ({
    type: "training_activity" as const,
    id: r.id,
    kind: r.kind,
    durationMin: r.actualDurationMin ?? r.plannedDurationMin ?? null,
    distanceKm: numericToNumber(r.actualDistanceKm ?? r.plannedDistanceKm),
    occurredAt: dateToISO(r.scheduledDate),
  }));

  return { nodes, excluded: 0 };
}
