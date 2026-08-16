import { addDays, format, startOfToday } from "date-fns";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getStudyOverview } from "@/lib/db/queries/study";
import { ReviewClient } from "@/components/review/ReviewClient";

/**
 * /review — the study cockpit. Issue #400.
 *
 * Topic-level active recall and spaced repetition across every class. The model
 * ranks what has faded; the user drags it onto a day. Deliberately day-level,
 * with no time slots and no calendar coupling: Google Calendar stays the store
 * of record for events, and a revision plan is not an event.
 *
 * Seeds the current fortnight. The client refetches on navigation and on any
 * realtime change to topics, plan items or the review log.
 */
export default async function ReviewPage() {
  const user = await requireOnboarded();

  // Starts today, not at the start of the week: a planner should open on the
  // day you are planning, not on however much of the week has already gone.
  const start = startOfToday();
  const from = format(start, "yyyy-MM-dd");
  const to = format(addDays(start, 13), "yyyy-MM-dd");

  const initial = await getStudyOverview(user.id, from, to);

  return <ReviewClient userId={user.id} initial={initial} windowStart={from} />;
}
