/**
 * /journaling — daily journal entry page.
 *
 * Server Component pattern mirrors /graph:
 *   requireOnboarded() gate → Drizzle reads → client island with initial data.
 *
 * Date is computed in local time (format(new Date(), "yyyy-MM-dd") from date-fns)
 * so "today" matches the user's clock, not UTC midnight.
 */

import { format } from "date-fns";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getJournalEntry, getJournalEntries } from "@/app/actions/journal";
import { JournalingClient } from "./JournalingClient";

export const dynamic = "force-dynamic";

export default async function JournalingPage() {
  const user = await requireOnboarded();

  const today = format(new Date(), "yyyy-MM-dd");

  const [entryResult, historyResult] = await Promise.all([
    getJournalEntry({ date: today }),
    getJournalEntries({ limit: 90 }),
  ]);

  const initialEntry = entryResult.success ? entryResult.data : null;
  const initialHistory = historyResult.success ? historyResult.data : [];

  return (
    <JournalingClient
      initialDate={today}
      initialEntry={initialEntry}
      initialHistory={initialHistory}
      userId={user.id}
    />
  );
}
