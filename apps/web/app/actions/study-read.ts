"use server";

/**
 * Read-side server actions for Study Review. Issue #400.
 *
 * Kept apart from `study.ts` so the client island can call a read without
 * pulling the mutation module into its bundle graph, and so the "one write path
 * for memory state" rule in study.ts stays easy to see.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStudyOverview, getTopicReviews } from "@/lib/db/queries/study";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WindowSchema = z.object({
  from: z.string().regex(ISO_DATE),
  to: z.string().regex(ISO_DATE),
});

const EMPTY = {
  topics: [],
  assessments: [],
  planItems: [],
  coverage: {},
} as Awaited<ReturnType<typeof getStudyOverview>>;

/**
 * Everything the /review cockpit renders, for one date window.
 *
 * Returns an empty overview rather than throwing when unauthenticated, so a
 * refetch racing a signed-out session degrades to an empty board instead of an
 * error boundary.
 */
export async function getStudyOverviewAction(input: unknown) {
  const userId = await getUserId();
  if (!userId) return EMPTY;

  const parsed = WindowSchema.safeParse(input);
  if (!parsed.success) return EMPTY;

  return getStudyOverview(userId, parsed.data.from, parsed.data.to);
}

/** Review history for one topic — the detail timeline and the gaps list. */
export async function getTopicReviewsAction(input: unknown) {
  const userId = await getUserId();
  if (!userId) return [];

  const parsed = z.object({ topicId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return [];

  return getTopicReviews(userId, parsed.data.topicId);
}
