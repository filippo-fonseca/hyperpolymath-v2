/**
 * GitHub commits fetcher — Phase 8 (LAND-BUILDLOG / D-09).
 *
 * Per RESEARCH §Pattern 3 + Pitfall 4:
 *   - Uses GITHUB_TOKEN (classic PAT, public_repo scope) → 5,000 req/hr/token
 *   - Per-call ISR via { next: { revalidate: 600 } } — 10 min cache
 *   - Graceful degradation: returns null on 403 / 5xx / network / missing token
 *   - shippedThisWeek() filter built from in-memory commit array
 *
 * Failure modes (D-10):
 *   - Missing GITHUB_TOKEN env: soft warn + null
 *   - 403 (rate limit) / 5xx: warn + null; cached page continues serving via SWR
 *   - Network timeout: caught + null
 */

const REPO = "filippo-fonseca/hyperpolymath-v2";

export type Commit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly date: string; // ISO from author.date
  readonly subject: string;
};

export type WeeklySummary = {
  readonly recent: ReadonlyArray<Commit>;
  readonly counts: { feat: number; fix: number; refactor: number; other: number };
  readonly latest: Commit | undefined;
};

export async function fetchRecentCommits(): Promise<Commit[] | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[BuildLog] GITHUB_TOKEN missing; commits feed disabled");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=10`,
      {
        next: { revalidate: 600 },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      console.warn(`[BuildLog] GitHub API ${res.status}; degrading`);
      return null;
    }
    const raw = (await res.json()) as Array<{
      sha: string;
      commit: { message: string; author: { date: string } };
    }>;
    return raw.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      date: c.commit.author.date,
      subject: c.commit.message.split("\n")[0],
    }));
  } catch (e) {
    console.error("[BuildLog] commit fetch threw:", e);
    return null;
  }
}

export function shippedThisWeek(commits: ReadonlyArray<Commit>): WeeklySummary {
  const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = commits.filter((c) => +new Date(c.date) >= oneWeekAgoMs);
  const counts = { feat: 0, fix: 0, refactor: 0, other: 0 };
  for (const c of recent) {
    if (c.subject.startsWith("feat(") || c.subject.startsWith("feat:")) counts.feat++;
    else if (c.subject.startsWith("fix(") || c.subject.startsWith("fix:")) counts.fix++;
    else if (c.subject.startsWith("refactor(") || c.subject.startsWith("refactor:"))
      counts.refactor++;
    else counts.other++;
  }
  return { recent, counts, latest: recent[0] };
}
