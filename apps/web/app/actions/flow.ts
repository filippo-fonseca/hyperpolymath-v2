"use server";

import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { flowSessions } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

/**
 * Upload + upsert Flow Pomodoro CSV.
 *
 * CSV shape: `Session, Started, Completed` (Flow app default export).
 * Re-uploads upsert on the (user_id, started_at) unique index, so the same
 * session row is updated, not duplicated.
 */
export async function uploadFlowCsv(
  formData: FormData,
): Promise<ActionResult<ImportResult>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No file uploaded" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File too large (10MB max)" };
  }

  let raw: string;
  try {
    raw = await file.text();
  } catch (e) {
    return {
      success: false,
      error: `Couldn't read file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (e) {
    return {
      success: false,
      error: `CSV parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const records: {
    userId: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const startedRaw = row.Started ?? row.started ?? "";
    const completedRaw = row.Completed ?? row.completed ?? "";
    if (!startedRaw || !completedRaw) {
      skipped++;
      continue;
    }
    const startedAt = new Date(startedRaw);
    const completedAt = new Date(completedRaw);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(completedAt.getTime())) {
      skipped++;
      continue;
    }
    const durationMs = completedAt.getTime() - startedAt.getTime();
    if (durationMs < 0) {
      skipped++;
      continue;
    }
    records.push({ userId, startedAt, completedAt, durationMs });
  }

  if (records.length === 0) {
    return { success: false, error: "No valid sessions in CSV" };
  }

  // Batch insert with onConflictDoUpdate. Postgres caps at ~65k params per
  // statement so chunk to keep us safely under that (4 cols × 1000 rows = 4k).
  const CHUNK = 1000;
  let upserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const result = await db
      .insert(flowSessions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [flowSessions.userId, flowSessions.startedAt],
        set: {
          completedAt: sql`excluded.completed_at`,
          durationMs: sql`excluded.duration_ms`,
          importedAt: new Date(),
        },
      })
      .returning({ id: flowSessions.id });
    upserted += result.length;
  }

  revalidatePath("/insights");

  // Drizzle's onConflictDoUpdate doesn't distinguish insert vs update in the
  // returned rows. Report a single "upserted" count rather than guess.
  return {
    success: true,
    data: {
      inserted: upserted,
      updated: 0,
      skipped,
      total: records.length,
    },
  };
}
