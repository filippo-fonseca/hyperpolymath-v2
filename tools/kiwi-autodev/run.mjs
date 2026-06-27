#!/usr/bin/env node
/**
 * Kiwi auto-dev orchestrator (260615-m68).
 *
 * Runs LOCALLY and unattended. For each open candidate GitHub issue (every
 * open issue, or only those carrying LABEL when LABEL is set; issues carrying
 * an EXCLUDE_LABELS opt-out label or already having an open kiwi/auto PR are
 * skipped), oldest-first and capped at MAX_ISSUES, it:
 *   1. creates an isolated git worktree + branch off origin/main,
 *   2. launches headless Claude Code (one issue per worktree, in parallel),
 *   3. enforces a per-issue wall-clock cap in Node via a process-group kill
 *      (no dependency on the timeout/gtimeout binary),
 *   4. classifies the outcome done | skipped | failed | timed-out, with one
 *      failure never aborting the run,
 *   5. aggregates a per-day recap, posts a best-effort summary to
 *      ${REPORT_URL}/api/dev-runs, fires a macOS notification, and
 *   6. writes a date-stamped lock LAST so the run is idempotent for the day.
 *
 * It NEVER pushes. The pre-push hook is the hard guard; this script also sets
 * KIWI_AUTOMATION=1 on every child so that guard fires for any push attempt.
 *
 * Zero dependencies: node built-ins plus the git, gh, claude, and osascript
 * CLIs only. Config arrives as env vars (launchd-entry.sh sources config.sh
 * before exec); literal fallbacks mirror config.sh so the script also runs
 * standalone.
 *
 * Secret handling: the dev-runs ingest secret is read at runtime from
 * process.env.DEV_RUN_INGEST_SECRET, falling back to parsing
 * apps/web/.env.local. It is never hardcoded and never committed.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileP = promisify(execFile);

// Serialize git worktree add/remove across the parallel issue runs. `git
// worktree add -b` writes branch upstream config under a .git/config lock;
// running several at once collides with "could not lock config file
// .git/config: File exists". Worktree setup/teardown is cheap, so funnel just
// those calls through a one-at-a-time chain while the agent work stays parallel.
let worktreeLock = Promise.resolve();
function withWorktreeLock(fn) {
  const next = worktreeLock.then(fn, fn);
  worktreeLock = next.then(
    () => {},
    () => {},
  );
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WEB_ENV_LOCAL = path.join(REPO_ROOT, 'apps', 'web', '.env.local');
const KIWI_DIR = path.join(REPO_ROOT, '.kiwi-auto');
// Sentinel file written by the web app's /api/dev/trigger-autodev route. When
// present, the once-per-day idempotency lock is bypassed so a manual trigger
// fires even if the worker already ran today. The file is deleted at the start
// of each manually-triggered run so it does not cause repeated bypasses.
const MANUAL_TRIGGER = path.join(KIWI_DIR, '.manual-trigger');
const LOG_DIR = path.join(__dirname, 'logs');

// Config: env first (launchd sources config.sh), then literal fallbacks that
// mirror config.sh so this also runs standalone.
const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? 3);
const PER_ISSUE_TIMEOUT_MS = Number(process.env.PER_ISSUE_TIMEOUT_MS ?? 2700000);
const MODEL = process.env.MODEL ?? 'opus';
// Fast model for the pre-dispatch triage pass (issue selection).
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'haiku';
// Optional opt-in label. Empty means "consider every open issue" (see
// config.sh); when set, only issues carrying it are candidates.
const LABEL = process.env.LABEL ?? '';
// Opt-out labels: any issue carrying one of these is never a candidate, even
// when LABEL is empty. Comma-separated; whitespace-trimmed; case-insensitive.
const EXCLUDE_LABELS = (process.env.EXCLUDE_LABELS ?? 'blocked')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const BRANCH_PREFIX = process.env.BRANCH_PREFIX ?? 'kiwi/auto';
const REPO_SLUG = process.env.REPO_SLUG ?? 'filippo-fonseca/hyperpolymath-v2';
const REPORT_URL = (process.env.REPORT_URL ?? 'https://hyperpolymath.com').replace(/\/$/, '');

const log = (...args) => console.log('[kiwi-autodev]', ...args);
const warn = (...args) => console.warn('[kiwi-autodev]', ...args);

// Environment for child `claude` invocations (both triage and implementation).
// Deleting ANTHROPIC_API_KEY guarantees the CLI authenticates via the Claude
// subscription (Claude Code) instead of the metered Anthropic API, no matter
// what the surrounding shell exports. Subscription billing is an explicit cost
// choice: the API is far pricier per token. `extra` overlays extra vars (e.g.
// KIWI_AUTOMATION so the pre-push guard fires on any push attempt).
function claudeChildEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

// Tiny dotenv parser (no deps): KEY=value, comments, blanks, optional quotes.
function parseDotenv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Resolve the ingest secret: env first, then apps/web/.env.local. Returns null
// when neither has it (reporting is then skipped with a warning).
async function resolveIngestSecret() {
  if (process.env.DEV_RUN_INGEST_SECRET) return process.env.DEV_RUN_INGEST_SECRET;
  try {
    const raw = await readFile(WEB_ENV_LOCAL, 'utf8');
    const parsed = parseDotenv(raw);
    return parsed.DEV_RUN_INGEST_SECRET ?? null;
  } catch {
    return null;
  }
}

// commitCount = git rev-list --count origin/main..<branch> (0 on any error).
async function commitCountFor(worktreeDir, branch) {
  try {
    const { stdout } = await execFileP(
      'git',
      ['-C', worktreeDir, 'rev-list', '--count', `origin/main..${branch}`],
      { timeout: 30_000 },
    );
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// The per-issue wall-clock budget, in minutes, kept in sync with
// PER_ISSUE_TIMEOUT_MS so the rules text never drifts from the real cap.
const TIMEOUT_MINUTES = Math.max(1, Math.round(PER_ISSUE_TIMEOUT_MS / 60000));

// Single source of truth for what makes an issue a good fit for one bounded
// auto-dev session. Used BOTH by the triage pass (to pick issues) and by the
// per-issue implementation prompt (to decide attempt-or-skip), so the selector
// and the implementer apply the exact same bar and can never drift apart. This
// is the fix for "triage picked something the implementer just skipped."
const DOABILITY_RULES = [
  `Each issue gets ONE unattended session under a hard ${TIMEOUT_MINUTES}-minute wall-clock cap; anything not finished by then is killed and the slot is wasted.`,
  'A GOOD fit is small, self-contained, and certain: a focused bug fix, a small UI tweak, or a localized enhancement touching one or a few files, with a clear, unambiguous acceptance criterion and no open design questions.',
  'A BAD fit is anything large, architectural, multi-surface, ambiguous or under-specified in scope, dependent on product/design/UX judgment, requiring a real planning phase, introducing new dependencies or database migrations, or risky to perform unattended.',
  'When in doubt, treat the issue as too big and leave it out.',
].join(' ');

// Build the headless-Claude prompt for one issue. Plain prose, no em/en dashes.
function buildPrompt(issueNumber, title) {
  return [
    `Resolve GitHub issue #${issueNumber} ("${title}") for this repository using the GSD quick pipeline (invoke /gsd:quick). Make small, atomic commits and reference "Closes #${issueNumber}" in a commit message.`,
    `For THIS invocation, disable inner GSD worktree isolation: set workflow.use_worktrees=false so you commit directly on the current branch with no nested worktrees.`,
    `NEVER run git push and NEVER run destructive git: no reset --hard, no push, no remote changes of any kind.`,
    `Apply these doability rules before doing anything: ${DOABILITY_RULES} If this issue is a BAD fit by those rules, DO NOT attempt it: leave the branch untouched and instead write a skip recap explaining why.`,
    `When you are done or you have decided to skip, write a per-issue recap to .kiwi-auto/ISSUE-${issueNumber}-recap.md (relative to this working directory) and commit that recap on the current branch. If you skipped, say so plainly at the top of the recap with the word "skipped".`,
  ].join(' ');
}

// Run one issue end to end. Always resolves (never rejects) with a result
// object so one failure cannot abort Promise.all.
async function runIssue(issue, runDate) {
  const issueNumber = issue.number;
  const title = issue.title ?? '';
  const branch = `${BRANCH_PREFIX}/${runDate}-issue-${issueNumber}`;
  const branchUrl = `https://github.com/${REPO_SLUG}/tree/${branch}`;
  const worktreeDir = path.join(KIWI_DIR, 'worktrees', `issue-${issueNumber}`);
  const logPath = path.join(LOG_DIR, `${runDate}-issue-${issueNumber}.log`);

  const result = {
    issueNumber,
    title,
    status: 'failed',
    branch,
    branchUrl,
    commitCount: 0,
    note: '',
    prUrl: null,
    summary: null,
  };

  let timedOut = false;

  try {
    // Fresh worktree off origin/main. Serialized: concurrent `worktree add -b`
    // calls collide on the .git/config lock.
    await withWorktreeLock(() =>
      execFileP('git', ['-C', REPO_ROOT, 'worktree', 'add', worktreeDir, '-b', branch, 'origin/main'], {
        timeout: 60_000,
      }),
    );

    const prompt = buildPrompt(issueNumber, title);
    const logStream = createWriteStream(logPath, { flags: 'a' });

    // Spawn headless Claude detached so we own the whole process group and can
    // signal the entire tree on timeout. --dangerously-skip-permissions and the
    // model are explicit user choices; keep them verbatim.
    const exitCode = await new Promise((resolve) => {
      const child = spawn(
        'claude',
        ['-p', '--dangerously-skip-permissions', '--model', MODEL, prompt],
        {
          cwd: worktreeDir,
          env: claudeChildEnv({ KIWI_AUTOMATION: '1' }),
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      child.stdout.pipe(logStream);
      child.stderr.pipe(logStream);

      // Node-enforced per-issue wall-clock cap: kill the whole process group.
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* group may already be gone */
        }
        setTimeout(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* already dead */
          }
        }, 10_000);
      }, PER_ISSUE_TIMEOUT_MS);

      child.on('error', (err) => {
        clearTimeout(timer);
        logStream.end(`\n[spawn error] ${err && err.message ? err.message : String(err)}\n`);
        resolve(1);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        logStream.end();
        resolve(typeof code === 'number' ? code : 1);
      });
    });

    // Read the per-issue recap if Claude wrote one, to disambiguate done vs
    // skipped and to capture the note text.
    let recapText = '';
    const recapPath = path.join(worktreeDir, '.kiwi-auto', `ISSUE-${issueNumber}-recap.md`);
    if (await fileExists(recapPath)) {
      try {
        recapText = (await readFile(recapPath, 'utf8')).trim();
      } catch {
        recapText = '';
      }
    }

    const commits = await commitCountFor(worktreeDir, branch);
    result.commitCount = commits;

    const recapSaysSkipped = /\bskip(ped)?\b/i.test(recapText.slice(0, 400));

    // Classification order: timed-out, failed, done, skipped.
    if (timedOut) {
      result.status = 'timed-out';
      result.note = recapText || 'Per-issue wall-clock cap reached; process group killed.';
    } else if (exitCode !== 0 && commits === 0) {
      result.status = 'failed';
      result.note = recapText || `Headless Claude exited ${exitCode} with no commits.`;
    } else if (commits > 0 && !recapSaysSkipped) {
      result.status = 'done';
      result.note = recapText || `Produced ${commits} commit(s) on ${branch}.`;
    } else {
      result.status = 'skipped';
      result.note = recapText || 'No code commits produced; treated as skipped.';
    }

    result.recapText = recapText;
  } catch (err) {
    // Per-issue isolation: any thrown error is contained here.
    result.status = timedOut ? 'timed-out' : 'failed';
    result.note = err && err.message ? err.message : String(err);
    result.recapText = '';
  }

  // Tear down the worktree but KEEP the branch (it is review-only). Serialized
  // on the same lock as add so teardown never races a concurrent add.
  try {
    await withWorktreeLock(() =>
      execFileP('git', ['-C', REPO_ROOT, 'worktree', 'remove', '--force', worktreeDir], {
        timeout: 60_000,
      }),
    );
  } catch {
    /* best-effort cleanup */
  }

  return result;
}

// Build the per-day recap markdown from the settled results.
function buildRecapMarkdown(runDate, results) {
  const lines = [];
  lines.push(`# Kiwi auto-dev recap ${runDate}`);
  lines.push('');
  lines.push(`Attempted ${results.length} issue(s).`);
  lines.push('');
  for (const r of results) {
    lines.push(`## Issue #${r.issueNumber}: ${r.title}`);
    lines.push('');
    lines.push(`- Branch: ${r.branch}`);
    lines.push(`- Status: ${r.status}`);
    lines.push(`- Commits beyond origin/main: ${r.commitCount}`);
    lines.push('');
    const body = (r.recapText && r.recapText.length ? r.recapText : r.note || '').trim();
    lines.push(body || '(no recap text)');
    lines.push('');
  }
  const doneBranches = results.filter((r) => r.status === 'done');
  lines.push('## Branches ready for review');
  lines.push('');
  if (doneBranches.length === 0) {
    lines.push('None this run.');
  } else {
    for (const r of doneBranches) {
      lines.push(`- #${r.issueNumber} ${r.title}`);
      lines.push(`  git checkout main && git merge ${r.branch}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// Best-effort POST to ${REPORT_URL}/api/dev-runs. Never throws to the caller.
async function reportRun({ runDate, startedAt, finishedAt, status, items }) {
  const secret = await resolveIngestSecret();
  if (!secret) {
    warn('no DEV_RUN_INGEST_SECRET in env or apps/web/.env.local; skipping dev-runs report');
    return;
  }
  try {
    const res = await fetch(`${REPORT_URL}/api/dev-runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runDate, startedAt, finishedAt, status, items }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      warn(`dev-runs report returned ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    log('dev-runs report posted OK');
  } catch (err) {
    warn('dev-runs report failed:', err && err.message ? err.message : String(err));
  }
}

// Best-effort macOS notification.
async function notify(message) {
  try {
    await execFileP('osascript', [
      '-e',
      `display notification "${message}" with title "Kiwi auto-dev"`,
    ], { timeout: 10_000 });
  } catch {
    /* best-effort */
  }
}

// Issue numbers that already have an open kiwi/auto review PR, read from the
// PR head branches (named `${BRANCH_PREFIX}/<date>-issue-<n>`). Used to skip
// re-attempting an issue whose prior PR is still unmerged. Best-effort: returns
// an empty set on any error so a listing failure never blocks a run.
async function openPrIssueNumbers() {
  const nums = new Set();
  try {
    const { stdout } = await execFileP(
      'gh',
      ['pr', 'list', '--repo', REPO_SLUG, '--state', 'open', '--json', 'headRefName', '--limit', '200'],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const prs = JSON.parse(stdout);
    const re = new RegExp(`^${BRANCH_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*-issue-(\\d+)$`);
    for (const pr of prs) {
      const m = (pr.headRefName ?? '').match(re);
      if (m) nums.add(Number(m[1]));
    }
  } catch (err) {
    warn('open-PR dedup lookup failed (continuing):', err && err.message ? err.message : String(err));
  }
  return nums;
}

// Triage: ask a fast model which open issues are small and self-contained
// enough to plausibly finish in one bounded /gsd:quick session, ranked
// most-tractable first. Returns the chosen issue objects (capped at
// MAX_ISSUES); an empty result means "nothing tractable, sit tight". Falls back
// to oldest-first only when the triage call itself errors, so the worker still
// functions if the fast model is unavailable.
async function triageSelect(issues) {
  const oldestFirst = [...issues].sort((a, b) => a.number - b.number);
  if (oldestFirst.length === 0) return [];
  const fallback = oldestFirst.slice(0, MAX_ISSUES);
  try {
    const catalog = oldestFirst
      .map((i) => {
        const body = (i.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
        return `#${i.number} | ${i.title} | ${body}`;
      })
      .join('\n');
    const prompt = [
      'You are the triage gate for an automated coding agent. The agent resolves ONE issue per unattended session using a quick-fix workflow, and it auto-refuses anything that is not a clean, small fix.',
      `Apply these exact rules (the implementer applies the SAME rules, so picking an issue that violates them burns a whole session for nothing): ${DOABILITY_RULES}`,
      'Rank the qualifying issues by how small, quick, and certain they are, smallest-effort first. STRONGLY prefer quick wins: it is better to return FEWER issues (even one, or none) than to fill the list with something that will be skipped or time out.',
      'Only include a larger-but-still-bounded issue if it genuinely fits the time cap AND there is no smaller qualifying issue left to take that slot.',
      `Return STRICT JSON only: an array of issue numbers, smallest-effort first, at most ${MAX_ISSUES} entries. If none qualify, return []. No prose, no code fences.`,
      '',
      'Issues:',
      catalog,
    ].join('\n');
    const { stdout } = await execFileP('claude', ['-p', '--model', TRIAGE_MODEL, prompt], {
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      env: claudeChildEnv(),
    });
    const match = stdout.match(/\[[\s\S]*\]/);
    if (!match) {
      warn('triage returned no JSON array; falling back to oldest-first');
      return fallback;
    }
    const nums = JSON.parse(match[0]);
    if (!Array.isArray(nums)) return fallback;
    const byNum = new Map(oldestFirst.map((i) => [i.number, i]));
    const chosen = [];
    for (const n of nums) {
      const it = byNum.get(Number(n));
      if (it && !chosen.includes(it)) chosen.push(it);
      if (chosen.length >= MAX_ISSUES) break;
    }
    return chosen;
  } catch (err) {
    warn('triage failed; falling back to oldest-first:', err && err.message ? err.message : String(err));
    return fallback;
  }
}

// Human-readable timestamp in US Eastern time. America/New_York resolves to EST
// or EDT automatically, and timeZoneName: 'short' prints whichever is in effect.
function easternTimestamp(d = new Date()) {
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

// A brief summary of a branch's changes, drawn from its commit subject lines
// (origin/main..branch), oldest-first, as a markdown bullet list. The per-issue
// worktree is already torn down by the time this runs, but the branch ref still
// lives in REPO_ROOT so git resolves it there. Empty string on any error.
async function commitSummaryFor(branch) {
  try {
    const { stdout } = await execFileP(
      'git',
      ['-C', REPO_ROOT, 'log', '--reverse', '--format=%s', `origin/main..${branch}`],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const subjects = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subjects.length === 0) return '';
    return subjects.map((s) => `- ${s}`).join('\n');
  } catch {
    return '';
  }
}

// Push a review branch and open a PR for it. Never merges. The push guard
// allows kiwi/auto/* but hard-blocks protected branches, so this can only ever
// create review PRs. Best-effort: returns the PR URL, or null on any failure.
// Also sets result.summary to the commit-derived change summary.
async function pushAndOpenPr(result) {
  const { branch, issueNumber, title, status, commitCount } = result;
  try {
    await execFileP('git', ['-C', REPO_ROOT, 'push', 'origin', `${branch}:${branch}`], {
      timeout: 120_000,
    });
  } catch (err) {
    warn(`push failed for ${branch}:`, err && err.message ? err.message : String(err));
    return null;
  }
  // Derive the change summary up front so it is set even when we reuse an
  // existing PR below (idempotent same-day re-runs take the early return).
  const summary = await commitSummaryFor(branch);
  result.summary = summary || null;
  // Reuse an existing PR for this branch if one is already open.
  try {
    const { stdout } = await execFileP(
      'gh',
      ['pr', 'list', '--repo', REPO_SLUG, '--head', branch, '--json', 'url', '--jq', '.[0].url // empty'],
      { timeout: 60_000 },
    );
    if (stdout.trim()) return stdout.trim();
  } catch {
    /* fall through to create */
  }
  const openedEastern = easternTimestamp();
  const prefix = status === 'done' ? '' : `[${status}] `;
  const bodyLines = [
    `Auto-generated by kiwi-autodev for issue #${issueNumber}. Review on this branch (you can check it out and test); merging is always manual.`,
    '',
    `Opened: ${openedEastern}`,
    `Status: ${status} (${commitCount} commit(s) on ${branch}).`,
  ];
  if (status === 'timed-out') {
    bodyLines.push('Note: the agent hit the per-issue time cap, so this may be incomplete.');
  }
  bodyLines.push(
    '',
    '## Summary of changes',
    summary || '(no commit messages found)',
    '',
    `Closes #${issueNumber} on merge.`,
  );
  const body = bodyLines.join('\n');
  try {
    const { stdout } = await execFileP(
      'gh',
      [
        'pr', 'create', '--repo', REPO_SLUG, '--base', 'main', '--head', branch,
        '--title', `${prefix}kiwi-autodev: fix #${issueNumber} ${title}`.slice(0, 240),
        '--body', body,
      ],
      { timeout: 60_000 },
    );
    return stdout.trim().split('\n').pop() || null;
  } catch (err) {
    warn(`gh pr create failed for ${branch}:`, err && err.message ? err.message : String(err));
    return null;
  }
}

async function main() {
  // Mark this process as automation so the pre-push guard blocks pushes to
  // protected branches (main) while allowing kiwi/auto/* review-branch pushes.
  // Inherited by child agents too.
  process.env.KIWI_AUTOMATION = '1';

  const startedAt = new Date().toISOString();

  // Check for a manual trigger sentinel written by the web app's
  // /api/dev/trigger-autodev route. When present, bypass gate.sh (which would
  // block on the once-per-day lock) and delete the sentinel immediately so
  // repeated polls do not fire again.
  const isManualTrigger = await fileExists(MANUAL_TRIGGER);
  if (isManualTrigger) {
    log('manual trigger sentinel found; bypassing once-per-day gate');
    try {
      await unlink(MANUAL_TRIGGER);
    } catch {
      // Best-effort: a missing or unlink-failing sentinel still allows the run.
    }
  } else {
    // Re-check the gate; if ineligible, exit 0 quietly.
    try {
      await execFileP(path.join(__dirname, 'gate.sh'), [], { timeout: 60_000 });
    } catch {
      log('gate ineligible at run time; exiting quietly');
      return;
    }
  }

  const RUN_DATE = new Date().toISOString().slice(0, 10);

  // Ensure scratch dirs exist (logs + .kiwi-auto).
  await mkdir(LOG_DIR, { recursive: true });
  await mkdir(KIWI_DIR, { recursive: true });

  // Refresh origin/main so worktrees branch off the latest.
  try {
    await execFileP('git', ['-C', REPO_ROOT, 'fetch', 'origin', 'main'], { timeout: 120_000 });
  } catch (err) {
    warn('git fetch origin main failed (continuing):', err && err.message ? err.message : String(err));
  }

  // List candidate issues, oldest-first by number, capped at MAX_ISSUES. When
  // LABEL is set, only issues carrying it are listed; empty LABEL lists every
  // open issue regardless of how it was filed.
  let issues = [];
  try {
    const listArgs = ['issue', 'list', '--repo', REPO_SLUG, '--state', 'open', '--json', 'number,title,labels,body', '--limit', '100'];
    if (LABEL) listArgs.push('--label', LABEL);
    const { stdout } = await execFileP('gh', listArgs, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
    issues = JSON.parse(stdout);
  } catch (err) {
    warn('gh issue list failed:', err && err.message ? err.message : String(err));
    issues = [];
  }

  // Drop opt-out issues (any EXCLUDE_LABELS label) before triage so a hands-off
  // label reliably keeps the worker away, no matter what triage would pick.
  const beforeExclude = issues.length;
  if (EXCLUDE_LABELS.length > 0) {
    issues = issues.filter(
      (i) => !(i.labels ?? []).some((l) => EXCLUDE_LABELS.includes(String(l.name ?? '').toLowerCase())),
    );
  }
  const excludedByLabel = beforeExclude - issues.length;

  // Skip issues that already have an open kiwi/auto review PR. Branches are
  // date-stamped, so without this an unmerged issue would spawn a fresh
  // duplicate PR every run — harmless with a curated kiwi-drafted queue, but a
  // steady stream of dupes once the net is every open issue.
  const issuesWithOpenPr = await openPrIssueNumbers();
  const beforeDedup = issues.length;
  if (issuesWithOpenPr.size > 0) {
    issues = issues.filter((i) => !issuesWithOpenPr.has(i.number));
  }
  const skippedHasPr = beforeDedup - issues.length;

  const selected = await triageSelect(issues);
  const scope = LABEL ? `${LABEL} issue(s)` : 'open issue(s)';
  log(
    `triage selected ${selected.length} of ${issues.length} candidate ${scope} ` +
      `(excluded ${excludedByLabel} by label, skipped ${skippedHasPr} with an open PR): ` +
      (selected.map((i) => `#${i.number}`).join(', ') || 'none (sitting tight)'),
  );

  // Run all selected issues in parallel (set is already capped at MAX_ISSUES).
  // runIssue never rejects, so one failure cannot abort the batch.
  const results = await Promise.all(selected.map((issue) => runIssue(issue, RUN_DATE)));

  const finishedAt = new Date().toISOString();

  // Aggregate recap (gitignored, in the main working copy).
  const recapPath = path.join(KIWI_DIR, `recap-${RUN_DATE}.md`);
  try {
    await writeFile(recapPath, buildRecapMarkdown(RUN_DATE, results), 'utf8');
    log(`recap written to ${recapPath}`);
  } catch (err) {
    warn('recap write failed:', err && err.message ? err.message : String(err));
  }

  // Tallies.
  const doneCount = results.filter((r) => r.status === 'done').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'failed' || r.status === 'timed-out').length;

  // Overall status: ok if every attempted issue is done or skipped; failed if
  // all attempted issues failed/timed-out; otherwise partial.
  let runStatus;
  if (results.length === 0 || failedCount === 0) {
    runStatus = 'ok';
  } else if (doneCount === 0 && skippedCount === 0) {
    runStatus = 'failed';
  } else {
    runStatus = 'partial';
  }

  // Open a review PR for every branch that produced commits (done or partial).
  // The worker pushes the review branch and opens a PR; it NEVER merges.
  for (const r of results) {
    if (r.commitCount > 0) {
      r.prUrl = await pushAndOpenPr(r);
    }
  }

  // Build the dev-runs items array (matches apps/web/app/api/dev-runs/route.ts).
  // branchUrl points at the PR when one was opened, else the branch tree.
  const items = results.map((r) => ({
    issueNumber: r.issueNumber,
    title: r.title,
    status: r.status,
    branch: r.branch,
    branchUrl: r.prUrl ?? r.branchUrl,
    prUrl: r.prUrl ?? null,
    summary: (r.summary || '').trim().slice(0, 2000) || null,
    commitCount: r.commitCount,
    note: (r.note || '').trim().slice(0, 2000) || null,
  }));

  // Best-effort report; never fails the run.
  await reportRun({ runDate: RUN_DATE, startedAt, finishedAt, status: runStatus, items });

  // Best-effort notification.
  await notify(`${doneCount} done, ${skippedCount} skipped, ${failedCount} failed`);

  // Write the date-stamped lock LAST so the run is idempotent for the day.
  try {
    await writeFile(path.join(KIWI_DIR, `.last-run-${RUN_DATE}`), finishedAt, 'utf8');
  } catch (err) {
    warn('lock write failed:', err && err.message ? err.message : String(err));
  }

  log(`done: ${doneCount} done, ${skippedCount} skipped, ${failedCount} failed (status=${runStatus})`);
}

main().catch((err) => {
  console.error('[kiwi-autodev] FATAL:', err && err.message ? err.message : err);
  // Exit 0 so launchd does not treat an unexpected throw as a crash loop; the
  // failure is already logged.
  process.exit(0);
});
