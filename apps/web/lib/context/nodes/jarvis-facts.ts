/**
 * Snapshot loader: JARVIS persistent facts.
 *
 * Includes ALL facts where no_export=false (small set, user-curated). Each
 * fact ships as one Node — the agent can read them all without truncation
 * because they're the most-condensed personal-context surface the system has.
 *
 * The `text` field is built from `value` only — `type`/`key` are an internal
 * indexing taxonomy (`jarvis_facts` schema: type+key+value+source). Exposing
 * the raw key/value pair is an option for later schema versions but bloats v1.
 */

import { and, asc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { jarvisFacts } from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

function dateToISO(d: Date | string | null): string {
  if (d === null) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

export async function loadJarvisFacts(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: jarvisFacts.id,
      value: jarvisFacts.value,
      createdAt: jarvisFacts.createdAt,
      noExport: jarvisFacts.noExport,
    })
    .from(jarvisFacts)
    .where(eq(jarvisFacts.userId, userId))
    .orderBy(asc(jarvisFacts.createdAt));

  let excluded = 0;
  const nodes: Node[] = [];
  for (const r of rows) {
    if (r.noExport) {
      excluded++;
      continue;
    }
    nodes.push({
      type: "jarvis_fact" as const,
      id: r.id,
      text: r.value,
      createdAt: dateToISO(r.createdAt),
    });
  }

  return { nodes, excluded };
}
