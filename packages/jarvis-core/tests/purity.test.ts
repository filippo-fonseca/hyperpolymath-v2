// JARVIS-16 / D-12: import-boundary enforcement. packages/jarvis-core MUST
// NOT import from react, next, @supabase/*, drizzle-orm, or googleapis.
// This test walks every .ts file under src/ and asserts that no FORBIDDEN
// regex matches. Failing CI on violation is the load-bearing structural
// guarantee for the future Ink-CLI factor.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, "../src");

const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: "react", re: /from ['"]react['"]/ },
  { name: "react/*", re: /from ['"]react\// },
  { name: "next/*", re: /from ['"]next\// },
  { name: "@supabase/*", re: /from ['"]@supabase\// },
  { name: "drizzle-orm", re: /from ['"]drizzle-orm/ },
  { name: "googleapis", re: /from ['"]googleapis['"]/ },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("packages/jarvis-core purity (JARVIS-16)", () => {
  const files = walk(SRC);

  it("scanned at least one source file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const { name, re } of FORBIDDEN) {
      it(`${file.replace(SRC, "src")} must not import ${name}`, () => {
        expect(content).not.toMatch(re);
      });
    }
  }
});
