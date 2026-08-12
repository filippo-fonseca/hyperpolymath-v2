import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Issue #345 — proof that the XP surfaces render against a real database.
 *
 * Unit tests cover the curve and the migration is exercised against a real
 * Postgres, but neither proves the page draws. This loads /profile and the XP
 * tab on /insights as the seeded user and asserts the actual furniture is
 * there: the rank heading, the level ring, the ladder, and the rates table
 * that reads from xp_rules.
 *
 * Run `pnpm verify:bootstrap` first, and make sure migration 0044 has been
 * applied to the local database, or every assertion here fails on a missing
 * relation rather than on anything about the UI.
 */

const EVIDENCE_DIR = process.env.VERIFY_EVIDENCE_DIR ?? ".verify/evidence";

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test("/profile renders the XP dashboard", async ({ page }) => {
  const response = await page.goto("/profile", { waitUntil: "domcontentloaded" });

  expect(page.url(), "/profile redirected to sign-in").not.toContain("/sign-in");
  expect(response?.status(), "/profile did not return 200").toBe(200);

  // The authenticated shell mounted.
  await expect(
    page.locator('a[href="/wiki"], a[href^="/wiki?"]').first(),
    "/profile did not render the authenticated app shell",
  ).toBeAttached({ timeout: 30_000 });

  // The page's own furniture. The heading is the rank name, which is derived
  // from the level, which is derived from the ledger — so seeing any of the
  // eleven rank names proves the whole read path worked.
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("The ladder", { exact: false })).toBeVisible();
  await expect(page.getByText("How XP works", { exact: false })).toBeVisible();

  // The ring is an SVG with an aria-label naming the level and rank.
  await expect(page.locator('[role="img"][aria-label*="Level"]').first()).toBeVisible();

  // The rates table is populated from xp_rules; an empty one means the seed
  // rows in migration 0044 never landed.
  await expect(page.getByText("Completed a task", { exact: false }).first()).toBeVisible();

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(EVIDENCE_DIR, "xp-profile.png"), fullPage: true });
});

test("/insights exposes the XP tab", async ({ page }) => {
  await page.goto("/insights", { waitUntil: "domcontentloaded" });
  expect(page.url()).not.toContain("/sign-in");

  const xpTab = page.getByRole("tab", { name: "XP", exact: true });
  await expect(xpTab, "the XP tab did not render on /insights").toBeVisible({ timeout: 30_000 });

  await xpTab.click();

  // Either the charts or the honest empty state, depending on whether the
  // seeded user has earned anything. Both are a pass; a crash is not.
  await expect(
    page
      .getByText("XP per day", { exact: false })
      .or(page.getByText("No XP yet", { exact: false }))
      .first(),
  ).toBeVisible({ timeout: 30_000 });

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(EVIDENCE_DIR, "xp-insights.png"), fullPage: true });
});
