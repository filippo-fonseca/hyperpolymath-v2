import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getCapturesForUser } from "@/lib/db/queries/captures";

/**
 * RecentCapturesWidget — at-a-glance tile for the LifeOS homepage.
 *
 * Last 5 captures, reverse-chronological. Reuses getCapturesForUser
 * verbatim — the same fetch /captures runs — so Realtime invalidation
 * downstream lights both surfaces up without bespoke wiring.
 *
 * Field name resolved by reading lib/db/queries/captures.ts CaptureWithLinks:
 * the capture body lives on `content` (not `body`/`text`).
 */
export async function RecentCapturesWidget() {
  const user = await requireOnboarded();
  const allCaptures = await getCapturesForUser(user.id);
  const recent = allCaptures.slice(0, 5);

  return (
    <section className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 flex flex-col h-full transition-[border-color,transform] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
          Recent captures
        </h3>
        <Link
          href="/captures"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          All →
        </Link>
      </header>
      {recent.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
          Nothing captured yet. Type into JARVIS to drop a note.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 flex-1">
          {recent.map((c) => (
            <li
              key={c.id}
              className="border-b border-[var(--edge)] pb-3 last:border-b-0 last:pb-0"
            >
              <p className="font-serif text-[14px] text-[var(--ink)] line-clamp-2">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
