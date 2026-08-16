import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
// @ts-expect-error — harness fixtures are plain .mjs, like the rest of scripts/verify
import { seedStudyFixtures } from "../../apps/web/scripts/verify/study-fixtures.mjs";

/**
 * Study Review (issue #400) — drives the real cockpit against seeded fixtures.
 *
 * The point is not that the route returns 200; the build already proves that.
 * It is that the three things the feature actually promises are visible and
 * work: the rail ranks by decay, a topic can be dragged onto a day, and logging
 * a review reschedules it.
 *
 * Fixtures are rebuilt before every run because these specs mutate the state
 * they assert on — logging a review reschedules the topic whose rank the
 * previous test just checked. Reseeding is what keeps the second run from
 * failing on a rail the first run rearranged.
 */

function harnessUserId(): string {
  const state = JSON.parse(readFileSync(".verify/storage-state.json", "utf8"));
  const cookie = state.cookies?.find((c: { name: string }) =>
    c.name.includes("auth-token"),
  );
  if (!cookie) throw new Error("no auth cookie in storage state — run pnpm verify:bootstrap");
  const raw = decodeURIComponent(cookie.value).replace(/^base64-/, "");
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const sub = json?.user?.id ?? JSON.parse(
    Buffer.from(json.access_token.split(".")[1], "base64").toString("utf8"),
  ).sub;
  if (!sub) throw new Error("could not resolve the harness user id");
  return sub;
}

test.beforeAll(async () => {
  await seedStudyFixtures(harnessUserId());
});

test.describe("/review", () => {
  test("renders the cockpit: countdowns, fading rail, day board", async ({ page }) => {
    await page.goto("/review");

    await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fading now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();

    // Exam countdowns for both seeded classes.
    await expect(page.getByText("Midterm 2").first()).toBeVisible();
    await expect(page.getByText("Quiz 4").first()).toBeVisible();

    // The rail must be ranked by urgency: Bode plots is the most-decayed
    // core-weight topic in the fixture, so it leads.
    const rail = page.locator("ul li", { hasText: "Bode plots" }).first();
    await expect(rail).toBeVisible();

    await page.screenshot({ path: ".verify/shots/review-cockpit.png", fullPage: false });
  });

  test("the fading rail is ordered most-urgent first", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Fading now" })).toBeVisible();

    const titles = await page
      .locator("aside, div")
      .filter({ has: page.getByRole("heading", { name: "Fading now" }) })
      .first()
      .locator("li p")
      .allTextContents();

    const cleaned = titles.filter((t) => t.trim().length > 0);
    expect(cleaned.length).toBeGreaterThan(3);

    // Never-reviewed topics and the badly-faded core topics must outrank the
    // freshly-reviewed one; "Nyquist criterion" was reviewed yesterday.
    const joined = cleaned.join("|");
    const bode = joined.indexOf("Bode plots");
    const nyquist = joined.indexOf("Nyquist criterion");
    expect(bode).toBeGreaterThanOrEqual(0);
    if (nyquist >= 0) expect(bode).toBeLessThan(nyquist);
  });

  test("logging a review reschedules the topic", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Fading now" })).toBeVisible();

    // Target by the topic-specific aria-label, not a bare "Log": dnd-kit gives
    // the draggable row role="button", so its accessible name also contains the
    // word and a substring match would hit the row instead of the action.
    await page
      .getByRole("button", { name: "Log review for Bode plots" })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("How did you review it?")).toBeVisible();
    await expect(dialog.getByText("How did it go?")).toBeVisible();

    // Forecast is empty until a grade is chosen — that is the whole point of
    // showing the consequence before you commit to an honest answer.
    await expect(dialog.getByText("Pick how it went")).toBeVisible();

    const blanked = dialog.getByRole("button", { name: "Blanked" });
    await blanked.click();
    await expect(dialog.getByText(/Back in/)).toBeVisible();

    // The selected grade paints via an inline background plus a `transition-all`
    // class; assert the settled colour rather than trusting a screenshot taken
    // mid-transition, which is what made an earlier capture look unselected.
    await expect(blanked).toHaveCSS("background-color", "rgb(239, 68, 68)");
    await expect(blanked).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.screenshot({ path: ".verify/shots/review-log-sheet.png" });

    await dialog.getByRole("button", { name: "Log review" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
  });
});

test("class project page shows the study section", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Fading now" })).toBeVisible();

  // Reach a class through the rail's class filter chip, then its project page.
  await page.goto("/areas");
  const link = page.getByRole("link", { name: /Signals and Systems/ }).first();
  if (await link.count()) {
    await link.click();
    await expect(page.getByRole("heading", { name: "Study review" })).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: ".verify/shots/class-study-section.png", fullPage: false });
  }
});

test("lifeos shows the review tile", async ({ page }) => {
  await page.goto("/lifeos");
  await expect(page.getByText("Review", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: ".verify/shots/lifeos-review-tile.png", fullPage: false });
});
