/**
 * GitHub commits fetcher — Phase 8 (LAND-BUILDLOG / D-09).
 *
 * Public-repo strategy:
 *   - Hyperpolymath is open source, so the GitHub commits endpoint is
 *     reachable unauthenticated (60 req/hr/IP). Combined with our 10-min
 *     ISR cache, that's ~6 fetches/hr — well under the limit.
 *   - If GITHUB_TOKEN is set (5,000 req/hr) we use it for headroom, but
 *     it's no longer required for the feed to render.
 *   - shippedThisWeek() filter is computed from the in-memory commit array.
 *
 * Failure modes (D-10):
 *   - 403 (rate limit) / 5xx: warn + null; cached page continues serving via SWR
 *   - Network timeout: caught + null
 */

const REPO = "filippo-fonseca/hyperpolymath-v2";

export type Commit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly date: string; // ISO from author.date
  readonly subject: string;
  readonly author: {
    readonly login: string | null;
    readonly avatarUrl: string | null;
    readonly htmlUrl: string | null;
  };
};

export type WeeklySummary = {
  readonly recent: ReadonlyArray<Commit>;
  readonly counts: { feat: number; fix: number; refactor: number; other: number };
  readonly latest: Commit | undefined;
};

export async function fetchRecentCommits(): Promise<Commit[] | null> {
  // Token optional: public repo means unauthenticated calls work (60/hr/IP);
  // the token only buys headroom (5,000/hr) and helps locally if you're
  // hitting the public limit from a shared NAT.
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=10`,
      {
        next: { revalidate: 600 },
        headers,
      },
    );
    if (!res.ok) {
      console.warn(`[BuildLog] GitHub API ${res.status}; degrading`);
      return null;
    }
    const raw = (await res.json()) as Array<{
      sha: string;
      commit: { message: string; author: { date: string } };
      author: { login: string; avatar_url: string; html_url: string } | null;
    }>;
    return raw.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      date: c.commit.author.date,
      subject: c.commit.message.split("\n")[0],
      author: {
        login: c.author?.login ?? null,
        avatarUrl: c.author?.avatar_url ?? null,
        htmlUrl: c.author?.html_url ?? null,
      },
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
