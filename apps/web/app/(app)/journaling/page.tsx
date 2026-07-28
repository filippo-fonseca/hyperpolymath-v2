/**
 * /journaling — daily journal entry page.
 *
 * Server Component pattern mirrors /graph:
 *   requireOnboarded() gate → Drizzle reads → client island with initial data.
 *
 * Date is computed in local time (format(new Date(), "yyyy-MM-dd") from date-fns)
 * so "today" matches the user's clock, not UTC midnight.
 *
 * Deep link: `?date=YYYY-MM-DD` opens the editor on that calendar day (used by
 * global search to land on a specific journal entry). Invalid/absent → today.
 */

import { format } from "date-fns";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getJournalEntry, getJournalEntries } from "@/app/actions/journal";
import { JournalingClient } from "./JournalingClient";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function JournalingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireOnboarded();

  const { date: dateParam } = await searchParams;
  const today = format(new Date(), "yyyy-MM-dd");
  const initialDate =
    dateParam && DATE_RE.test(dateParam) && !Number.isNaN(Date.parse(dateParam))
      ? dateParam
      : today;

  const [entryResult, historyResult] = await Promise.all([
    getJournalEntry({ date: initialDate }),
    getJournalEntries({ limit: 90 }),
  ]);

  const initialEntry = entryResult.success ? entryResult.data : null;
  const initialHistory = historyResult.success ? historyResult.data : [];

  return (
    <JournalingClient
      initialDate={initialDate}
      initialEntry={initialEntry}
      initialHistory={initialHistory}
      userId={user.id}
    />
  );
}
