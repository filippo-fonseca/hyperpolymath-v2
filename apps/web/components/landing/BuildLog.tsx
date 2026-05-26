import { SectionEyebrow } from "./SectionEyebrow";
import {
  fetchRecentCommits,
  shippedThisWeek,
  type Commit,
  type WeeklySummary,
} from "./lib/fetchCommits";
import {
  readRoadmapSafely,
  parseCurrentPhase,
} from "./lib/readRoadmap";

/**
 * §06 — Build Log (LAND-BUILDLOG / SC-6 / D-09 / D-10 / D-11 / UI-SPEC §5f).
 *
 * Hybrid data model:
 *   Block 1 — Currently Shipping: parsed from .planning/ROADMAP.md at build/request time
 *   Block 2 — Last 7 Commits: fetched from GitHub REST API via ISR (revalidate: 600)
 *   Block 3 — Shipped This Week: computed from commit list
 *
 * Graceful degradation (D-10):
 *   - GitHub unreachable → Block 2 + Block 3 collapse to "→ Commit feed unavailable.
 *     See the repo directly." (linked to repo). Block 1 always renders.
 *   - ROADMAP.md unreadable → Block 1 renders "→ Phase data unavailable." instead.
 *
 * This is a Server Component — fs.readFile and fetch run at request/build
 * time on the server (no client directive).
 */

const REPO_URL = "https://github.com/filippo-fonseca/hyperpolymath-v2";

export async function BuildLog() {
  const [roadmapText, commits] = await Promise.all([
    readRoadmapSafely(),
    fetchRecentCommits(),
  ]);
  const currentPhase = roadmapText ? parseCurrentPhase(roadmapText) : null;

  return (
    <section className="py-16 max-w-[800px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 07 · BUILD LOG" />
      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Live from main.
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        I&rsquo;m building Hyperpolymath in public, in named phases, one wave
        at a time. There&rsquo;s no private roadmap and no fake demos. The
        page below this line is the source of truth.
      </p>

      {/* Block 1 — Currently Shipping (always renders) */}
      <div className="mt-8">
        <SectionEyebrow label="CURRENTLY SHIPPING" />
        <div className="mt-2 border-t border-[var(--edge)] pt-3">
          {currentPhase ? (
            <p className="font-serif text-[18px] text-[var(--ink)]">
              <span aria-hidden="true">▶ </span>
              Phase {currentPhase.number} · {currentPhase.name}
              <span className="ml-2 font-mono text-[14px] text-[var(--ink-muted)]">
                · In Progress ({currentPhase.plansComplete} plans)
              </span>
            </p>
          ) : (
            <p className="font-mono text-[14px] text-[var(--ink-muted)]">
              → Phase data unavailable.
            </p>
          )}
        </div>
      </div>

      {/* Block 2 + 3 — collapse to degraded variant if commits null */}
      {commits ? (
        <>
          <LastCommits commits={commits.slice(0, 7)} />
          <ShippedThisWeekBlock summary={shippedThisWeek(commits)} />
        </>
      ) : (
        <DegradedFeed />
      )}
    </section>
  );
}

function LastCommits({ commits }: { commits: ReadonlyArray<Commit> }) {
  return (
    <div className="mt-8">
      <SectionEyebrow label="LAST 7 COMMITS" />
      <div className="mt-2 border-t border-[var(--edge)] pt-3 space-y-2">
        {commits.map((c) => (
          <div
            key={c.sha}
            className="grid grid-cols-[80px_110px_1fr] gap-3 items-baseline font-mono font-mono-stats text-[14px] leading-[1.5]"
          >
            <a
              href={`${REPO_URL}/commit/${c.sha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              {c.shortSha}
            </a>
            <span className="text-[var(--ink-muted)]">{c.date.slice(0, 10)}</span>
            <span className="text-[var(--ink)] truncate">{c.subject}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShippedThisWeekBlock({ summary }: { summary: WeeklySummary }) {
  const parts: string[] = [];
  if (summary.counts.fix)
    parts.push(`${summary.counts.fix} ${summary.counts.fix === 1 ? "fix" : "fixes"}`);
  if (summary.counts.feat)
    parts.push(
      `${summary.counts.feat} ${summary.counts.feat === 1 ? "feature" : "features"}`,
    );
  if (summary.counts.refactor)
    parts.push(
      `${summary.counts.refactor} ${summary.counts.refactor === 1 ? "refactor" : "refactors"}`,
    );
  if (summary.counts.other) parts.push(`${summary.counts.other} other`);

  const ago = summary.latest ? formatAgo(summary.latest.date) : null;

  return (
    <div className="mt-8">
      <SectionEyebrow label="SHIPPED THIS WEEK" />
      <div className="mt-2 border-t border-[var(--edge)] pt-3 flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
        <p className="font-serif text-[18px] text-[var(--ink)]">
          {parts.length > 0 ? parts.join(" · ") : "Quiet week."}
        </p>
        {ago && (
          <p className="font-mono font-mono-stats text-[14px] text-[var(--ink-muted)]">
            (latest: {ago})
          </p>
        )}
      </div>
    </div>
  );
}

function DegradedFeed() {
  return (
    <div className="mt-8">
      <p className="font-mono text-[14px] text-[var(--ink-muted)]">
        →{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--ink)] transition-colors"
        >
          Commit feed unavailable. See the repo directly.
        </a>
      </p>
    </div>
  );
}

function formatAgo(iso: string): string {
  const diffMs = Date.now() - +new Date(iso);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? "hr" : "hrs"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} ${diffDay === 1 ? "day" : "days"} ago`;
}
