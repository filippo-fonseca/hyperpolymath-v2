#!/usr/bin/env node
/**
 * Kiwi auto-dev orchestrator (260615-m68).
 *
 * Runs LOCALLY and unattended. For each open kiwi-drafted GitHub issue
 * (oldest-first, capped at MAX_ISSUES), it:
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
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
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
const LOG_DIR = path.join(__dirname, 'logs');

// Config: env first (launchd sources config.sh), then literal fallbacks that
// mirror config.sh so this also runs standalone.
const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? 3);
const PER_ISSUE_TIMEOUT_MS = Number(process.env.PER_ISSUE_TIMEOUT_MS ?? 2700000);
const MODEL = process.env.MODEL ?? 'opus';
// Fast model for the pre-dispatch triage pass (issue selection).
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'haiku';
const LABEL = process.env.LABEL ?? 'kiwi-drafted';
const BRANCH_PREFIX = process.env.BRANCH_PREFIX ?? 'kiwi/auto';
const REPO_SLUG = process.env.REPO_SLUG ?? 'filippo-fonseca/hyperpolymath-v2';
const REPORT_URL = (process.env.REPORT_URL ?? 'https://hyperpolymath.com').replace(/\/$/, '');

const log = (...args) => console.log('[kiwi-autodev]', ...args);
const warn = (...args) => console.warn('[kiwi-autodev]', ...args);

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

// Build the headless-Claude prompt for one issue. Plain prose, no em/en dashes.
function buildPrompt(issueNumber, title) {
  return [
    `Resolve GitHub issue #${issueNumber} ("${title}") for this repository using the GSD quick pipeline (invoke /gsd:quick). Make small, atomic commits and reference "Closes #${issueNumber}" in a commit message.`,
    `For THIS invocation, disable inner GSD worktree isolation: set workflow.use_worktrees=false so you commit directly on the current branch with no nested worktrees.`,
    `NEVER run git push and NEVER run destructive git: no reset --hard, no push, no remote changes of any kind.`,
    `If the issue is too large, architectural, ambiguous, or risky to do safely in one bounded session, DO NOT attempt it. Leave the branch untouched and instead write a skip recap explaining why.`,
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
          env: { ...process.env, KIWI_AUTOMATION: '1' },
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
      'You are triaging GitHub issues for an automated coding agent that resolves ONE issue per bounded session using a quick-fix workflow.',
      'Choose ONLY issues small and self-contained enough to plausibly complete in a single bounded session: a focused bug fix, a small UI tweak, or a contained enhancement.',
      'EXCLUDE anything large, architectural, multi-surface, design-ambiguous, or that needs a real planning phase.',
      `Return STRICT JSON only: an array of issue numbers, most tractable first, at most ${MAX_ISSUES} entries. If none qualify, return []. No prose, no code fences.`,
      '',
      'Issues:',
      catalog,
    ].join('\n');
    const { stdout } = await execFileP('claude', ['-p', '--model', TRIAGE_MODEL, prompt], {
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
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

async function main() {
  const startedAt = new Date().toISOString();

  // Re-check the gate; if ineligible, exit 0 quietly.
  try {
    await execFileP(path.join(__dirname, 'gate.sh'), [], { timeout: 60_000 });
  } catch {
    log('gate ineligible at run time; exiting quietly');
    return;
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

  // List eligible issues, oldest-first by number, capped at MAX_ISSUES.
  let issues = [];
  try {
    const { stdout } = await execFileP(
      'gh',
      ['issue', 'list', '--repo', REPO_SLUG, '--state', 'open', '--label', LABEL, '--json', 'number,title,labels,body', '--limit', '100'],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    issues = JSON.parse(stdout);
  } catch (err) {
    warn('gh issue list failed:', err && err.message ? err.message : String(err));
    issues = [];
  }
  const selected = await triageSelect(issues);
  log(
    `triage selected ${selected.length} of ${issues.length} open ${LABEL}: ` +
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

  // Build the dev-runs items array (matches apps/web/app/api/dev-runs/route.ts).
  const items = results.map((r) => ({
    issueNumber: r.issueNumber,
    title: r.title,
    status: r.status,
    branch: r.branch,
    branchUrl: r.branchUrl,
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
