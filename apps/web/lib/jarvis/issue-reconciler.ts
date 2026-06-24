/**
 * issue-reconciler.ts (260615-rc). Auto-close pass for the captures-to-issues
 * daily cron.
 *
 * For each OPEN kiwi-drafted issue, it judges (one Claude call) whether the
 * issue is already resolved by recent work on main, and if so CLOSES it
 * (state_reason completed) with an explanatory comment plus an "auto-closed"
 * label. Conservative by design: it only acts on HIGH-confidence judgments that
 * cite at least one recent commit; everything else is left untouched. GitHub
 * already natively closes issues referenced by a "Closes #N" commit on the
 * default branch, so this catches the already-built-but-never-referenced case.
 *
 * Fail-safe: any model/parse error yields zero closures (never closes on
 * uncertainty), and a per-issue API failure is isolated.
 */

import { z } from "zod";
import { getAnthropicClient, JARVIS_MODEL } from "@/lib/jarvis/anthropic-client";

const GH_API = "https://api.github.com";
const AUTO_CLOSED_LABEL = "auto-closed";
const MAX_COMMITS = 40;
const MAX_ISSUES = 40;

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hyperpolymath-cron",
  };
}

interface OpenIssue {
  number: number;
  title: string;
  body: string;
}

interface RecentCommit {
  sha: string;
  message: string;
}

const decisionSchema = z.object({
  resolved: z.array(
    z.object({
      issueNumber: z.number(),
      confidence: z.enum(["high", "low"]),
      reason: z.string(),
      commitShas: z.array(z.string()),
    }),
  ),
});

const TOOL_NAME = "report_resolved_issues";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    resolved: {
      type: "array",
      description:
        "Issues that recent main commits clearly already resolve. Omit any issue you are not sure about.",
      items: {
        type: "object",
        properties: {
          issueNumber: { type: "number" },
          confidence: {
            type: "string",
            enum: ["high", "low"],
            description: "high ONLY when a cited commit clearly implements or fixes the issue.",
          },
          reason: { type: "string", description: "One sentence: how the commits resolve it." },
          commitShas: {
            type: "array",
            items: { type: "string" },
            description: "Short SHAs of the commits that resolve it. Must be non-empty for a real match.",
          },
        },
        required: ["issueNumber", "confidence", "reason", "commitShas"],
        additionalProperties: false,
      },
    },
  },
  required: ["resolved"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You reconcile open GitHub issues against recent commits on the main branch of a single app.",
  "Decide which open issues are ALREADY resolved by the listed recent commits.",
  "Be conservative: mark an issue resolved with confidence=high ONLY when one or more listed commits clearly implement the requested feature or fix the reported bug. Cite those commits by their short SHA in commitShas.",
  "If you are not certain, do NOT include the issue (or use confidence=low). A wrong close is worse than a missed one.",
  "Never invent a SHA. Only use SHAs from the provided commit list. Respond by calling report_resolved_issues exactly once.",
].join("\n");

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function fetchOpenIssues(token: string, repo: string): Promise<OpenIssue[]> {
  const res = await fetch(
    `${GH_API}/repos/${repo}/issues?state=open&labels=kiwi-drafted&per_page=100`,
    { headers: ghHeaders(token) },
  );
  if (!res.ok) return [];
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  const out: OpenIssue[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if ("pull_request" in item) continue; // GitHub returns PRs from this endpoint too.
    if (typeof item.number !== "number") continue;
    out.push({
      number: item.number,
      title: typeof item.title === "string" ? item.title : "",
      body: typeof item.body === "string" ? item.body.slice(0, 600) : "",
    });
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
}

async function fetchRecentCommits(token: string, repo: string): Promise<RecentCommit[]> {
  const res = await fetch(`${GH_API}/repos/${repo}/commits?sha=main&per_page=${MAX_COMMITS}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) return [];
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  const out: RecentCommit[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const sha = typeof item.sha === "string" ? item.sha.slice(0, 7) : "";
    const commit = isRecord(item.commit) ? item.commit : {};
    const message = typeof commit.message === "string" ? commit.message.split("\n")[0].slice(0, 140) : "";
    if (sha) out.push({ sha, message });
  }
  return out;
}

async function judgeResolved(
  issues: OpenIssue[],
  commits: RecentCommit[],
): Promise<z.infer<typeof decisionSchema>> {
  const safe = { resolved: [] };
  try {
    // Owner-system path (daily cron): owner's own infra, no end-user, so it
    // uses the owner's ANTHROPIC_API_KEY explicitly. No BYOK.
    const ownerKey = process.env.ANTHROPIC_API_KEY;
    if (!ownerKey) throw new Error("ANTHROPIC_API_KEY required for issue-reconciler");
    const client = getAnthropicClient(ownerKey);
    const user = [
      "OPEN ISSUES:",
      ...issues.map((i) => `#${i.number} ${i.title}\n${i.body}`),
      "",
      "RECENT MAIN COMMITS (newest first):",
      ...commits.map((c) => `${c.sha} ${c.message}`),
    ].join("\n");
    const response = await client.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Report which open issues recent main commits already resolve.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: user }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return safe;
    const parsed = decisionSchema.safeParse(toolUse.input);
    return parsed.success ? parsed.data : safe;
  } catch (err) {
    console.error("[issue-reconciler] judge failed; closing nothing", err);
    return safe;
  }
}

/**
 * Run the reconcile pass. Returns how many issues were checked and closed.
 */
export async function reconcileResolvedIssues({
  token,
  repo,
}: {
  token: string;
  repo: string;
}): Promise<{ checked: number; closed: number }> {
  const issues = await fetchOpenIssues(token, repo);
  if (issues.length === 0) return { checked: 0, closed: 0 };
  const commits = await fetchRecentCommits(token, repo);
  if (commits.length === 0) return { checked: issues.length, closed: 0 };

  const decision = await judgeResolved(issues, commits);

  let closed = 0;
  for (const r of decision.resolved) {
    // Conservative gate: high confidence AND at least one cited commit.
    if (r.confidence !== "high" || r.commitShas.length === 0) continue;
    if (!issues.some((i) => i.number === r.issueNumber)) continue;
    try {
      await fetch(`${GH_API}/repos/${repo}/issues/${r.issueNumber}/comments`, {
        method: "POST",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `Auto-closed: this looks already addressed by recent work on main (${r.commitShas.join(", ")}).\n\n${r.reason}\n\nReopen if this was premature.`,
        }),
      });
      await fetch(`${GH_API}/repos/${repo}/issues/${r.issueNumber}/labels`, {
        method: "POST",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ labels: [AUTO_CLOSED_LABEL] }),
      });
      const closeRes = await fetch(`${GH_API}/repos/${repo}/issues/${r.issueNumber}`, {
        method: "PATCH",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
      if (closeRes.ok) closed++;
    } catch (err) {
      console.error("[issue-reconciler] close failed", {
        issue: r.issueNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { checked: issues.length, closed };
}
