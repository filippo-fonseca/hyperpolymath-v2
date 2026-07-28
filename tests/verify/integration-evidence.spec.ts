import { expect, test } from "@playwright/test";
import {
  assertThemeApplied,
  ensureEvidenceDir,
  forceTheme,
  gridTracks,
  settle,
  shot,
  writeArtifact,
} from "./helpers/cockpit";

/**
 * Wave-1 integration: the evidence frames.
 *
 * Every frame here is also an assertion. A screenshot on its own only proves
 * something rendered; the checks around each one prove it rendered the thing
 * the contract asks for.
 */

test.beforeAll(() => {
  ensureEvidenceDir();
});

const ROUTES = [
  { path: "/tasks", name: "tasks" },
  { path: "/wiki", name: "wiki" },
  { path: "/lifeos", name: "lifeos" },
  { path: "/habits", name: "habits" },
] as const;

/* ── the cockpit on every route, in both themes ──────────────────────────── */

for (const theme of ["light", "dark"] as const) {
  for (const route of ROUTES) {
    test(`cockpit: ${route.path} in ${theme}`, async ({ page }) => {
      await forceTheme(page, theme);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await settle(page);
      await assertThemeApplied(page, theme);

      // The three cockpit zones are all present before the frame is taken.
      await expect(page.locator('[aria-label="Sidebar"]').first()).toBeAttached();
      await expect(page.locator('[aria-label="Ask Kiwi"]')).toBeAttached();

      await shot(page, `cockpit-${route.name}-${theme}`);
    });
  }
}

/* ── an area page and a project page, both themes ────────────────────────── */

for (const theme of ["light", "dark"] as const) {
  test(`cockpit: an area page in ${theme}`, async ({ page }) => {
    await forceTheme(page, theme);
    await page.goto("/areas", { waitUntil: "domcontentloaded" });
    await settle(page);

    // Target the register's own link rather than the text: "Academics" also
    // appears in the rail tree, and a loose text match takes that one, which
    // expands a tree node instead of navigating.
    await page.locator('a[href^="/areas/"]').first().click();
    await page.waitForURL(/\/areas\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await settle(page, 1800);
    await assertThemeApplied(page, theme);

    await shot(page, `cockpit-area-detail-${theme}`);
    expect(page.url()).toMatch(/\/areas\/[0-9a-f-]{36}/);
  });

  test(`cockpit: a project page in ${theme}`, async ({ page }) => {
    await forceTheme(page, theme);
    await page.goto("/areas", { waitUntil: "domcontentloaded" });
    await settle(page);

    await page.getByText("Thermodynamics", { exact: false }).first().click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await settle(page, 1800);
    await assertThemeApplied(page, theme);

    await shot(page, `cockpit-project-detail-${theme}`);
    expect(page.url()).toMatch(/\/projects\/[0-9a-f-]{36}/);
  });
}

/* ── the rail, collapsed and expanded ────────────────────────────────────── */

test("rail: expanded and collapsed", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  const railWidth = () =>
    page
      .locator('[aria-label="Sidebar"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));

  const expanded = await railWidth();
  await shot(page, "rail-expanded");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(900); // the 280ms collapse, plus settle
  const collapsed = await railWidth();
  await shot(page, "rail-collapsed");

  writeArtifact("rail-collapse.json", { expandedWidth: expanded, collapsedWidth: collapsed });

  expect(collapsed, "the rail did not narrow on collapse").toBeLessThan(expanded);

  // Restore, so the persisted `sidebar-collapsed` key does not leak into the
  // frames the other tests take.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.waitForTimeout(900);
  expect(await railWidth(), "the rail did not restore on expand").toBe(expanded);
});

/* ── the dock, open and collapsed ────────────────────────────────────────── */

test("dock: open and collapsed", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  const dock = page.locator("[data-dock]");
  await expect(dock, "the Dock is not rendered at 1440px").toBeAttached();

  const dockWidth = () => dock.evaluate((el) => Math.round(el.getBoundingClientRect().width));

  const open = await dockWidth();
  await shot(page, "dock-open");

  await page.getByRole("button", { name: "Collapse dock" }).click();
  await page.waitForTimeout(900);
  const collapsed = await dockWidth();
  await shot(page, "dock-collapsed");

  writeArtifact("dock-collapse.json", { openWidth: open, collapsedWidth: collapsed });

  expect(collapsed, "the Dock did not narrow on collapse").toBeLessThan(open);

  await page.getByRole("button", { name: "Expand dock" }).click();
  await page.waitForTimeout(900);
});

/* ── a SidePanel open, with the dock having yielded the right slot ───────── */

test("right slot: a SidePanel takes the dock's track", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  const before = await gridTracks(page);
  expect(await page.locator("[data-dock]").count()).toBe(1);

  await page.evaluate(() => {
    localStorage.setItem("split-screen-on", "1");
    window.dispatchEvent(new CustomEvent("split-screen-change", { detail: true }));
  });
  await page.waitForTimeout(1200);

  const after = await gridTracks(page);
  const panel = page.locator('[role="complementary"]');

  await expect(panel, "the SidePanel did not open").toBeAttached();
  expect(await page.locator("[data-dock]").count(), "the Dock did not yield").toBe(0);
  expect(after.count, "a fourth live column appeared").toBe(3);

  // The panel is genuinely in the layout, not floating over the stage.
  const chrome = await panel.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, boxShadow: cs.boxShadow, borderRadius: cs.borderTopLeftRadius };
  });

  writeArtifact("sidepanel-open.json", {
    tracksBefore: before.raw,
    tracksAfter: after.raw,
    chrome,
  });

  expect(chrome.position, "the SidePanel is position:fixed — §2.8 forbids it").not.toBe("fixed");

  await shot(page, "sidepanel-open-dock-yielded");

  await page.evaluate(() => {
    localStorage.setItem("split-screen-on", "0");
    window.dispatchEvent(new CustomEvent("split-screen-change", { detail: false }));
  });
});

/* ── the JARVIS command bar, pinned to the bottom of the stage ───────────── */

test("JARVIS command bar is pinned at the bottom of the stage", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  const geometry = await page.evaluate(() => {
    const input = document.querySelector<HTMLElement>('[aria-label="Ask Kiwi"]');
    if (!input) return null;
    // The command bar is the input's own bar container; the stage is the middle
    // grid track, which is the bar's nearest scrolling/grid ancestor.
    const bar = input.closest("div[class*='h-12']") ?? input.parentElement;
    const grid = document.querySelector<HTMLElement>("div.isolate.grid");
    if (!bar || !grid) return null;
    const b = bar.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    return {
      barBottom: Math.round(b.bottom),
      barTop: Math.round(b.top),
      viewportHeight: Math.round(g.height),
      gapToBottom: Math.round(g.bottom - b.bottom),
      barLeft: Math.round(b.left),
      barRight: Math.round(b.right),
    };
  });

  writeArtifact("jarvis-command-bar.json", geometry);
  expect(geometry, "the JARVIS command bar was not found").not.toBeNull();

  // Pinned means it sits at the foot of the shell, not scrolled into the page.
  expect(
    geometry?.gapToBottom ?? 999,
    "the JARVIS command bar is not at the bottom of the stage"
  ).toBeLessThan(8);

  await shot(page, "jarvis-command-bar-pinned");
});
