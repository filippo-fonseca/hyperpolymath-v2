import { BriefingClient } from "@/components/briefing/BriefingClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getLatestBriefing } from "@/lib/briefing/queries";

/**
 * /briefing — the daily frontier-tech intelligence digest.
 *
 * Server Component shell + BriefingClient island (mirrors /tasks, /people):
 * SSR fetches the latest edition + its curated items so the page paints with no
 * flash, then hands the payload to the client island which owns the TanStack
 * Query cache and the Refresh action.
 */
export default async function BriefingPage() {
  const user = await requireOnboarded();
  const payload = await getLatestBriefing(user.id);

  return (
    <div className="min-h-screen bg-[var(--canvas)] px-8 py-12">
      <main className="mx-auto max-w-5xl space-y-8">
        <BriefingClient userId={user.id} initial={payload} />
      </main>
    </div>
  );
}
