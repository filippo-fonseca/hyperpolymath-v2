import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function findSingleUserId(): Promise<string | null> {
  const rows = await db.select({ id: users.id }).from(users).limit(2);
  if (rows.length !== 1) return null;
  return rows[0]!.id;
}
