import { XpProfileClient } from "@/components/xp/XpProfileClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getXpOverview } from "@/lib/db/queries/xp";
import { rankForLevel } from "@/lib/xp/levels";
import Link from "next/link";

export const metadata = {
  title: "Profile",
};

/**
 * /profile — the XP dashboard. Issue #345.
 *
 * Server-renders the whole overview so the ring is correct on first paint;
 * the client half re-fetches only when realtime reports a new award.
 */
export default async function ProfilePage() {
  const user = await requireOnboarded();
  const overview = await getXpOverview(user.id);
  const rank = rankForLevel(overview.level);

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-8 py-12">
      <main className="relative z-10 mx-auto max-w-6xl space-y-8">
        <header className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-display font-semibold tracking-tight text-[var(--ink)]">
              Profile
            </h1>
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full"
              style={{ backgroundColor: `hsl(${rank.hue} 85% 58%)` }}
            />
          </div>
          <p className="font-serif text-base text-[var(--ink-muted)]">
            Everything you have done in here, counted.{" "}
            <Link
              href="/settings"
              className="underline decoration-[var(--edge)] underline-offset-4 transition-colors hover:text-[var(--ink)]"
            >
              Account settings
            </Link>
            .
          </p>
        </header>

        <XpProfileClient
          userId={user.id}
          initial={overview}
          displayName={user.displayName || user.email || "You"}
        />
      </main>
    </div>
  );
}
