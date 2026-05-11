import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hashtags } from "@/lib/db/schema";

export interface HashtagSuggestion {
  id: string;
  name: string; // lowercase canonical
  displayName: string; // first-seen casing
}

/**
 * Server-only fetch of all hashtags for autocomplete suggestion data.
 * Returned by Server Components (layout, /captures page) and passed down as props
 * to the TipTap composer's Mention suggestion config.
 */
export async function getHashtagSuggestions(
  userId: string,
): Promise<HashtagSuggestion[]> {
  const rows = await db
    .select({
      id: hashtags.id,
      name: hashtags.name,
      displayName: hashtags.displayName,
    })
    .from(hashtags)
    .where(eq(hashtags.userId, userId));
  return rows;
}
