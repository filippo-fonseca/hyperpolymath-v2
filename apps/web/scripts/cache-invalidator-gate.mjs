#!/usr/bin/env node
// Phase 11 / CACHE-05 — shared invalidator scanner.
//
// Used by BOTH:
//   - apps/web/tests/cache-invalidator-gate.test.ts (CI gate via Vitest)
//   - .husky/pre-commit                              (pre-commit gate via Husky)
//
// Single source of truth for the regex set + allowlist so the two layers
// cannot drift apart. Per-line `// CACHE-OK: <reason>` escape ignored.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// Repo root inferred from this script's location: apps/web/scripts/ → ../../../
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Files the gate guards. These flow INTO the cached prefix. */
export const ALLOWLIST = [
  "packages/jarvis-core/src/prompt-builder.ts",
  "packages/jarvis-core/src/personality.ts",
  "packages/jarvis-core/src/tools/index.ts",
  "packages/jarvis-core/src/tools/create-task.ts",
  "packages/jarvis-core/src/tools/create-capture.ts",
  "packages/jarvis-core/src/tools/create-event.ts",
  "packages/jarvis-core/src/tools/remember-fact.ts",
  "packages/jarvis-core/src/tools/ask-clarification.ts",
  "apps/web/lib/jarvis/render-user-state.ts",
];

/**
 * Forbidden patterns per D-04. Each entry: { name, regex, rationale }.
 *
 * JSON.stringify rule: single-arg form is forbidden because key ordering
 * is iteration-order-dependent. The regex matches `JSON.stringify(X)` where
 * the second argument is missing — i.e., a stringify call whose ONLY token
 * before the closing paren is the value. Detection: regex matches
 * `JSON\.stringify\([^,\n)]+\)` — a single non-comma, non-newline,
 * non-paren token followed directly by `)`. Two-arg forms with a
 * sorted-keys replacer pass.
 */
export const FORBIDDEN_PATTERNS = [
  {
    name: "Date.now()",
    regex: /Date\.now\(\)/,
    rationale: "Per-call timestamp invalidates cache prefix on every render.",
  },
  {
    name: "new Date(",
    regex: /\bnew Date\(/,
    rationale: "Constructing a Date inside cached content embeds the request clock; cache invalidates instantly.",
  },
  {
    name: "Date.toISOString(",
    regex: /\.toISOString\(/,
    rationale: "Same as new Date — produces a timestamp string in the prefix.",
  },
  {
    name: "Date.toString(",
    regex: /\bDate\.toString\(/,
    rationale: "Same risk as toISOString.",
  },
  {
    name: "JSON.stringify(<single-arg>)",
    regex: /JSON\.stringify\([^,)\n]+\)/,
    rationale: "Single-arg stringify is iteration-order-dependent. Use a sorted-keys replacer or render XML.",
  },
];

const CACHE_OK_MARKER = /\/\/\s*CACHE-OK:/;

/**
 * Scan one file's source for forbidden patterns.
 * @param {string} filepath - For display in error messages.
 * @param {string} source - File contents.
 * @returns {{ violations: Array<{ line: number; pattern: string; text: string; rationale: string }> }}
 */
export function scanFile(filepath, source) {
  const lines = source.split("\n");
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // CACHE-OK escape: skip the entire line if the marker is present.
    if (CACHE_OK_MARKER.test(line)) continue;
    for (const { name, regex, rationale } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          line: i + 1,
          pattern: name,
          text: line.trim(),
          rationale,
        });
      }
    }
  }
  return { violations };
}

/** Scan every file in ALLOWLIST that exists on disk. */
export function scanAllowlist() {
  const all = [];
  for (const rel of ALLOWLIST) {
    const abs = resolve(REPO_ROOT, rel);
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue; // File may not exist yet (e.g., before Plan 11-01 lands).
    }
    const { violations } = scanFile(rel, source);
    for (const v of violations) all.push({ file: rel, ...v });
  }
  return all;
}

/** Scan only staged files (intersected with ALLOWLIST). */
export function scanStaged() {
  const stdout = execSync(
    "git diff --cached --name-only --diff-filter=ACMR",
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const staged = stdout.split("\n").filter(Boolean);
  const targets = staged.filter((p) => ALLOWLIST.includes(p));
  const all = [];
  for (const rel of targets) {
    const abs = resolve(REPO_ROOT, rel);
    const source = readFileSync(abs, "utf8");
    const { violations } = scanFile(rel, source);
    for (const v of violations) all.push({ file: rel, ...v });
  }
  return all;
}

function formatViolations(violations) {
  if (violations.length === 0) return "";
  const out = ["", "🛑 CACHE-05 violation — silent cache invalidator detected:", ""];
  for (const v of violations) {
    out.push(`  ${v.file}:${v.line}`);
    out.push(`    pattern: ${v.pattern}`);
    out.push(`    line:    ${v.text}`);
    out.push(`    fix:     ${v.rationale}`);
    out.push(`    escape:  add \`// CACHE-OK: <reason>\` on the same line if intentional`);
    out.push("");
  }
  return out.join("\n");
}

// CLI entry point.
const argv = process.argv.slice(2);
if (argv.includes("--staged")) {
  const violations = scanStaged();
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    process.exit(1);
  }
} else if (argv.includes("--all") || argv.length === 0) {
  // Default: scan everything in ALLOWLIST. Used by manual smoke + CI.
  const violations = scanAllowlist();
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    process.exit(1);
  } else {
    console.log(`✓ CACHE-05 — ${ALLOWLIST.length} allowlisted files clean.`);
  }
}
