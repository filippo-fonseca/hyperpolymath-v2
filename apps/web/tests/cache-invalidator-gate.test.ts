/**
 * Phase 11 / CACHE-05 — CI gate against silent cache invalidators.
 *
 * Wraps apps/web/scripts/cache-invalidator-gate.mjs as a Vitest test so
 * the same scanner runs in CI on every PR. The pre-commit hook
 * (.husky/pre-commit) catches violations earlier; this is the
 * belt-and-suspenders layer if --no-verify is used to bypass the hook.
 *
 * SHARED LOGIC — the regex set + allowlist are imported from the script
 * so the two gates cannot drift.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALLOWLIST,
  FORBIDDEN_PATTERNS,
  scanFile,
} from "../scripts/cache-invalidator-gate.mjs";

// Repo root = apps/web/tests/ → ../../../
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("CACHE-05 — file allowlist + forbidden pattern set are stable", () => {
  it("has exactly 5 forbidden patterns (D-04 spec)", () => {
    // Locks the set against accidental drop. Adding a pattern is fine
    // (and increases this number); removing one is suspicious.
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });

  it("guards the 4 surfaces named in D-04 (prompt-builder, personality, tools/**, render-user-state)", () => {
    expect(ALLOWLIST).toContain("packages/jarvis-core/src/prompt-builder.ts");
    expect(ALLOWLIST).toContain("packages/jarvis-core/src/personality.ts");
    expect(ALLOWLIST).toContain("packages/jarvis-core/src/tools/index.ts");
    expect(ALLOWLIST).toContain("apps/web/lib/jarvis/render-user-state.ts");
  });
});

describe("CACHE-05 — no allowlisted file currently contains a forbidden pattern", () => {
  for (const rel of ALLOWLIST) {
    it(`${rel} is clean`, () => {
      const abs = resolve(REPO_ROOT, rel);
      let source: string;
      try {
        source = readFileSync(abs, "utf8");
      } catch {
        // File doesn't exist yet (e.g., before Wave 1 lands) — skip
        // rather than fail. Wave 1's own tests cover existence; this
        // test guards CONTENT.
        return;
      }
      const { violations } = scanFile(rel, source);
      expect(
        violations,
        `CACHE-05 REGRESSION: ${rel} contains a forbidden pattern. ` +
          `Each violation is a silent cache invalidator. Either remove ` +
          `the pattern OR add \`// CACHE-OK: <reason>\` on the line if ` +
          `the call truly cannot break the cache (rare — every escape ` +
          `is a potential silent invalidator).\n\nViolations:\n` +
          JSON.stringify(violations, null, 2),
      ).toEqual([]);
    });
  }
});

describe("CACHE-05 — scanner sanity (would catch a planted violation)", () => {
  it("catches a planted Date.now() in synthetic source", () => {
    const synthetic = `export const x = Date.now();`;
    const { violations } = scanFile("synthetic.ts", synthetic);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].pattern).toBe("Date.now()");
  });

  it("honors CACHE-OK escape on the same line", () => {
    const synthetic = `export const x = Date.now(); // CACHE-OK: test-only`;
    const { violations } = scanFile("synthetic.ts", synthetic);
    expect(violations).toEqual([]);
  });

  it("catches single-arg JSON.stringify", () => {
    const synthetic = `const s = JSON.stringify(obj);`;
    const { violations } = scanFile("synthetic.ts", synthetic);
    expect(violations.some((v) => v.pattern.includes("JSON.stringify"))).toBe(true);
  });

  it("allows two-arg JSON.stringify (with replacer / sort)", () => {
    const synthetic = `const s = JSON.stringify(obj, Object.keys(obj).sort());`;
    const { violations } = scanFile("synthetic.ts", synthetic);
    expect(violations.some((v) => v.pattern.includes("JSON.stringify"))).toBe(false);
  });
});
