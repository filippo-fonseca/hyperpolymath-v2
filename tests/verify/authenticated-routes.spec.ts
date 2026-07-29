import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The proof that the verification harness works.
 *
 * Three wave-1 units blocked on the same thing: `/wiki` 307s to `/sign-in`,
 * auth is Google OAuth with no headless path, and local Supabase was down. This
 * spec closes that loop. It loads the storageState written by
 * `apps/web/scripts/verify/storage-state.mjs`, visits each route the Tester
 * lane needs, and asserts the page rendered authenticated content rather than
 * bouncing to sign-in.
 *
 * Run `pnpm verify:bootstrap` first; it seeds the database and starts the
 * server this spec talks to.
 */

const EVIDENCE_DIR =
  process.env.VERIFY_EVIDENCE_DIR ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence";

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

/**
 * Each route asserts two independent things:
 *
 *   `shellLink` — a nav link that only the authenticated `(app)` layout renders.
 *                 This is what distinguishes "signed in" from "the sign-in page
 *                 happened to return 200".
 *   `content`   — a string from the seeded fixtures, which proves the page
 *                 queried the database as this user and got rows back. Without
 *                 it a route that renders an empty shell would pass.
 */
const ROUTES = [
  { path: "/tasks", name: "tasks", content: "Finish problem set 7" },
  { path: "/wiki", name: "wiki", content: "Course notes" },
  { path: "/lifeos", name: "lifeos", content: "Read for 30 minutes" },
  { path: "/habits", name: "habits", content: "Read for 30 minutes" },
] as const;

for (const route of ROUTES) {
  test(`${route.path} renders authenticated content`, async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

    // 1. Not bounced. The proxy redirects an unauthenticated request to
    //    /sign-in, so the landing URL is the primary signal.
    expect(page.url(), `${route.path} redirected to sign-in`).not.toContain("/sign-in");
    expect(response?.status(), `${route.path} did not return 200`).toBe(200);

    // 2. The authenticated app shell mounted. A nav link to a sibling app route
    //    exists only inside the (app) layout, which is gated by
    //    getUserOrRedirect().
    await expect(
      page.locator('a[href="/wiki"], a[href^="/wiki?"]').first(),
      `${route.path} did not render the authenticated app shell`,
    ).toBeAttached({ timeout: 30_000 });

    // 3. This user's own seeded data reached the page.
    await expect(
      page.getByText(route.content, { exact: false }).first(),
      `${route.path} rendered the shell but none of the seeded fixture data`,
    ).toBeVisible({ timeout: 30_000 });

    // Let fonts, images and entry animations settle so the evidence frame is
    // representative rather than mid-transition.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: join(EVIDENCE_DIR, `verify-harness-${route.name}.png`),
      fullPage: false,
    });
  });
}

test("an unauthenticated context is still redirected to sign-in", async ({ browser }) => {
  // The harness must not have weakened auth. A context with no cookies has to
  // be bounced exactly as before; if this passes trivially, the storageState
  // assertions above prove nothing.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/sign-in");
  await context.close();
});
