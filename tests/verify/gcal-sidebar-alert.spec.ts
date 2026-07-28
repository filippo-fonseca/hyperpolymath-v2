import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * D2: the Google Calendar disconnect signal has to be on screen without a
 * scroll, on a laptop.
 *
 * U4 wired the badge onto the /calendar row, which is the right home for it and
 * not a sufficient one. MAIN lives in the sidebar's `flex-1` scroll column and
 * Calendar is its thirteenth row, so at 1280x720 the column has ~331px of
 * client height against ~626px of content and the badge sits below the fold.
 * A DOM query still found the dot, which is exactly why the original
 * verification passed while the signal did not exist for a human.
 *
 * So this spec asserts what a DOM query cannot:
 *
 *   1. the pinned alert's box is inside the viewport, top to bottom;
 *   2. `elementFromPoint` at the alert's own centre lands on the alert, so
 *      nothing is painted over it;
 *   3. it points at the reconnect control rather than only reporting the fault.
 *
 * Across the two laptop viewports named in the defect, both rail states, and
 * both themes. Screenshots are the evidence; the assertions are what makes a
 * green run mean something.
 *
 * Requires `pnpm verify:bootstrap`. The seeded harness account has never
 * connected Google Calendar, so `gcal_refresh_token_encrypted` is NULL and the
 * app is genuinely in the disconnected state under test.
 */

const EVIDENCE_DIR =
  process.env.VERIFY_EVIDENCE_DIR ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/f1";

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

/** The two laptop viewports the defect names by measurement. */
const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const THEMES = ["light", "dark"] as const;
const RAILS = [
  { name: "expanded", collapsed: false },
  { name: "collapsed", collapsed: true },
] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const rail of RAILS) {
      const label = `${viewport.name}-${theme}-${rail.name}`;

      test(`calendar disconnect is visible without scrolling: ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        // Both preferences are read from localStorage on mount, so they have to
        // be in place before the first paint or the rail flashes the other way.
        await page.addInitScript(
          ([themeValue, collapsedValue]) => {
            localStorage.setItem("hyperpolymath-theme", themeValue);
            localStorage.setItem("sidebar-collapsed", collapsedValue);
          },
          [theme, String(rail.collapsed)] as const
        );

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });

        // A collapsed rail hover-peeks open on desktop. Park the pointer over
        // the stage so the screenshot shows the rail state under test.
        await page.mouse.move(viewport.width - 200, viewport.height / 2);

        const alert = page.locator('[data-slot="gcal-sidebar-alert"]');
        await expect(alert, "the pinned calendar alert never rendered").toBeVisible({
          timeout: 30_000,
        });

        // 1. Inside the viewport, top to bottom. This is the assertion the
        //    Calendar row fails: its box starts below the scroll container's
        //    visible bottom edge.
        const box = await alert.boundingBox();
        expect(box, "the alert has no layout box").not.toBeNull();
        if (!box) return;
        expect(box.y, `${label}: alert starts above the viewport`).toBeGreaterThanOrEqual(0);
        expect(
          box.y + box.height,
          `${label}: alert bottom (${box.y + box.height}) is below the ${viewport.height}px fold`
        ).toBeLessThanOrEqual(viewport.height);

        // 2. Hit test at its own centre. `document.querySelector` finding an
        //    element proves nothing about whether a human can see or click it.
        const hitIsSelf = await page.evaluate(
          ([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return !!hit?.closest('[data-slot="gcal-sidebar-alert"]');
          },
          [box.x + box.width / 2, box.y + box.height / 2] as const
        );
        expect(hitIsSelf, `${label}: something is painted over the alert`).toBe(true);

        // 3. It is a way out, not just a report.
        await expect(alert).toHaveAttribute("href", "/settings#integrations");
        expect(await alert.getAttribute("aria-label")).toContain("Google Calendar");

        await page.screenshot({
          path: join(EVIDENCE_DIR, `d2-${label}.png`),
        });

        // A rail-only crop, so the 6px dot is legible at review size.
        const rail_ = page.locator("aside").first();
        if (await rail_.isVisible()) {
          await rail_.screenshot({ path: join(EVIDENCE_DIR, `d2-rail-${label}.png`) });
        }
      });
    }
  }
}

/**
 * The contrast case, kept deliberately.
 *
 * The Calendar row's badge is still there and still correct; the fix did not
 * move it. This records that it is ALSO still below the fold at 1280x720, which
 * is why the pinned row exists rather than being redundant with it.
 */
test("the Calendar row's own badge is still below the fold at 1280x720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });

  const dot = page.locator('a[href="/calendar"] [data-slot="gcal-status-dot"]');
  await expect(dot).toBeAttached({ timeout: 30_000 });

  const measurement = await page.evaluate(() => {
    const row = document.querySelector('a[href="/calendar"]');
    if (!row) return null;
    const box = row.getBoundingClientRect();
    const scroller = row.closest(".overflow-y-auto");
    const scrollerBox = scroller?.getBoundingClientRect() ?? null;
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      rowTop: Math.round(box.top),
      rowBottom: Math.round(box.bottom),
      scrollerBottom: scrollerBox ? Math.round(scrollerBox.bottom) : null,
      clippedBelowFold: scrollerBox ? box.top >= scrollerBox.bottom : null,
      hitTestIsSelf: !!hit?.closest('a[href="/calendar"]'),
    };
  });

  // Recorded, not asserted as a pass condition: this is the state of the world
  // the pinned row was added to work around, and it is fine for it to change if
  // the rail ever gets shorter.
  console.log(`[d2] calendar row at 1280x720: ${JSON.stringify(measurement)}`);
  expect(measurement).not.toBeNull();
});
