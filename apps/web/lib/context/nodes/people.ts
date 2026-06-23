/**
 * Snapshot loader: people.
 *
 * Cap: 200 most-recently-updated people, ordered by updated_at DESC. People
 * have no no_export column, so they are never export-excluded; `excluded` is
 * always 0 to keep the loader return shape uniform with the others.
 *
 * Phase E: people become first-class nodes in the personal-context graph, and a
 * separate loadPeopleReferences read feeds the pure mentions_person edge
 * derivation (entity -> person). The two reads are split so the snapshot builder
 * can mock them independently and so the reference rows stay raw (no node
 * conversion) for deriveEdges.
 */

import { db as defaultDb } from "@/lib/db";
import { people as peopleTable, peopleReferences } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type { Node } from "../types";

export type DB = typeof defaultDb;

const PEOPLE_CAP = 200;

function dateToISO(d: Date | string | null): string {
  if (d === null) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

export async function loadPeople(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: peopleTable.id,
      name: peopleTable.name,
      email: peopleTable.email,
      phone: peopleTable.phone,
      bio: peopleTable.bio,
      tags: peopleTable.tags,
      createdAt: peopleTable.createdAt,
      updatedAt: peopleTable.updatedAt,
    })
    .from(peopleTable)
    .where(eq(peopleTable.userId, userId))
    .orderBy(desc(peopleTable.updatedAt))
    .limit(PEOPLE_CAP);

  const nodes: Node[] = rows.map((r) => ({
    type: "person" as const,
    id: r.id,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    bio: r.bio ?? null,
    tags: r.tags ?? [],
    createdAt: dateToISO(r.createdAt),
    updatedAt: dateToISO(r.updatedAt),
  }));

  // People have no no_export column, so nothing is ever export-excluded.
  return { nodes, excluded: 0 };
}

/** Raw (from-entity -> person) reference rows, fed to deriveEdges. */
export type PersonReferenceRow = {
  fromType: string;
  fromId: string;
  personId: string;
};

export async function loadPeopleReferences(
  userId: string,
  db: DB = defaultDb,
): Promise<PersonReferenceRow[]> {
  const rows = await db
    .select({
      fromType: peopleReferences.fromType,
      fromId: peopleReferences.fromId,
      personId: peopleReferences.personId,
    })
    .from(peopleReferences)
    .where(eq(peopleReferences.userId, userId));
  return rows;
}
