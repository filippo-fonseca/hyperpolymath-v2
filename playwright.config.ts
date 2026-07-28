import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the verification harness.
 *
 * This lives at the repo root, not in `apps/web`, on purpose: `@playwright/test`
 * is a harness dependency, and keeping it out of `apps/web/package.json` keeps
 * it off the manifest that every feature unit edits in parallel.
 *
 * There is no `webServer` block. The dev server is started by
 * `apps/web/scripts/verify/bootstrap.mjs`, which also seeds the database and
 * writes the storage state; letting Playwright boot a second one would race it.
 * Run `pnpm verify:bootstrap` first (or `pnpm verify`, which does both).
 */
const PORT = Number(process.env.VERIFY_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/verify",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // Next dev compiles each route on first hit; the first navigation to a heavy
  // route can take a while on a cold .next cache.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: ".verify/storage-state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
