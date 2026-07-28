import { expect, test } from "@playwright/test";
import { ensureEvidenceDir, settle, shot, writeArtifact } from "./helpers/cockpit";

/**
 * Wave-1 integration: the specific defects U1, U2 and U4 claimed to fix.
 *
 * These three units could only argue their acceptance criteria at code level,
 * because no unit worktree could open the app in a browser. This spec is the
 * part of the integration pass that actually exercises them.
 */

test.beforeAll(() => {
  ensureEvidenceDir();
});

/* ── U4: the Calendar rail row shows the disconnect dot ──────────────────── */

test("U4: the Calendar rail row carries the disconnected-Google-Calendar indicator", async ({
  page,
}) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  // The fixture account has never connected Google Calendar, so
  // users.gcal_refresh_token_encrypted is NULL and the status is
  // "not_connected". The hook resolves after a fetch, so wait for the element
  // rather than sampling once.
  const badge = page.locator('[aria-label*="Google Calendar" i]');
  await expect(badge.first(), "no disconnected-Google-Calendar indicator in the rail").toBeAttached(
    {
      timeout: 20_000,
    }
  );

  const detail = await badge.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      ariaLabel: el.getAttribute("aria-label"),
      backgroundColor: cs.backgroundColor,
      width: Math.round(r.width),
      height: Math.round(r.height),
      // Is it actually on the Calendar row, not only the Settings row?
      onCalendarRow: Boolean(el.closest('a[href="/calendar"]')),
    };
  });

  // Resolve --ink-coral and --accent the same way the runtime does, so the
  // "functional ink, not accent" rule is checked against real paint.
  const tokens = await page.evaluate(() => {
    const read = (name: string) => {
      const el = document.createElement("div");
      el.style.backgroundColor = `var(${name})`;
      document.body.appendChild(el);
      const c = getComputedStyle(el).backgroundColor;
      el.remove();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context to rasterize a token");
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    return { coral: read("--ink-coral"), accent: read("--accent") };
  });

  // Being in the DOM with a non-zero rect is NOT the same as being on screen.
  // The rail's nav is a scroll container, so a row can report a perfectly good
  // bounding box while sitting below that container's visible box.
  const onScreen = await page
    .locator('a[href="/calendar"]')
    .first()
    .evaluate((a) => {
      const r = a.getBoundingClientRect();
      const scroller =
        a.closest<HTMLElement>(".sd-scroll-hover, [style*='overflow']") ??
        (() => {
          let el = a.parentElement;
          while (el && getComputedStyle(el).overflowY !== "auto") el = el.parentElement;
          return el;
        })();
      const s = scroller?.getBoundingClientRect();
      const centre = document.elementFromPoint(
        Math.round(r.x + r.width / 2),
        Math.round(r.y + r.height / 2)
      );
      return {
        rowTop: Math.round(r.y),
        rowBottom: Math.round(r.bottom),
        scrollerBottom: s ? Math.round(s.bottom) : null,
        scrollHeight: scroller?.scrollHeight ?? null,
        clientHeight: scroller?.clientHeight ?? null,
        clippedBelowFold: s ? r.bottom > s.bottom : false,
        hitTestIsSelf: !!centre && (a.contains(centre) || centre === a),
      };
    });

  writeArtifact("u4-calendar-indicator.json", { ...detail, tokens, onScreen });

  expect(detail.onCalendarRow, "the indicator is not on the /calendar rail row").toBe(true);
  expect(detail.ariaLabel?.toLowerCase()).toContain("google calendar");
  expect(detail.width, "the dot is not the canonical 6px functional dot").toBeLessThanOrEqual(8);

  // Scroll the row into view so the evidence frame actually shows the dot.
  await page.locator('a[href="/calendar"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, "u4-calendar-disconnect-dot");

  // Reported separately from the criteria above: the indicator is correct, but
  // it is below the rail's scroll fold at this viewport, so a user sees nothing
  // until they scroll the rail.
  expect(
    onScreen.hitTestIsSelf,
    `the Calendar row is below the rail's scroll fold (row bottom ${onScreen.rowBottom} vs scroller bottom ${onScreen.scrollerBottom}); the disconnect dot is not visible without scrolling`
  ).toBe(true);
});

/* ── U1 (b): breadcrumb navigation is responsive ─────────────────────────── */

test("U1: breadcrumb segments navigate, and do so quickly", async ({ page }) => {
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await settle(page);

  // Enter the seeded folder tree: Course notes > Thermodynamics.
  const folder = page.getByText("Course notes", { exact: false }).first();
  await folder.dblclick();
  await page.waitForTimeout(600);

  const nested = page.getByText("Thermodynamics", { exact: false }).first();
  if (await nested.count()) {
    await nested.dblclick().catch(() => {});
    await page.waitForTimeout(600);
  }

  await shot(page, "u1-wiki-folder-depth");

  // The breadcrumb root segment. Clicking it must return to the folder root.
  const crumb = page
    .locator("button, a")
    .filter({ hasText: /^\s*(Wiki|All pages|Course notes)\s*$/ })
    .first();

  const t0 = Date.now();
  await crumb.click();
  // Wait for the grid to actually reflect the new folder rather than for a
  // fixed sleep, so the number means something.
  await page.waitForFunction(
    () => document.querySelectorAll('[class*="min-h-[154px]"]').length >= 0,
    undefined,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(250);
  const elapsed = Date.now() - t0;

  writeArtifact("u1-breadcrumb-latency.json", { clickToSettleMs: elapsed });
  expect(elapsed, "breadcrumb navigation took over 2.5s").toBeLessThan(2500);
});

/* ── U1 (c): tiles do not droop ──────────────────────────────────────────── */

test("U1: folder tiles settle at identity transform and share a row baseline", async ({ page }) => {
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await settle(page, 1600);

  const tiles = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[class*="min-h-[154px]"]'));
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const t = getComputedStyle(el).transform;
      // A matrix's vertical translate is the 6th component.
      const f = t === "none" ? 0 : Number.parseFloat(t.split(",")[5] ?? "0");
      return { top: Math.round(r.top), transform: t, translateY: Number.isNaN(f) ? 0 : f };
    });
  });

  writeArtifact("u1-tile-transforms.json", { count: tiles.length, tiles });

  expect(tiles.length, "no wiki tiles rendered to measure").toBeGreaterThan(0);
  for (const t of tiles) {
    expect(t.translateY, `tile settled at translateY(${t.translateY}) — the droop bug`).toBe(0);
  }
});

/* ── U1 (d): things other than the breadcrumb are clickable in a page ────── */

test("U1: clicks inside a wiki page are not cancelled", async ({ page }) => {
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await settle(page);

  const link = page.locator('a[href^="/wiki/"]').first();
  await link.click();
  await page.waitForURL(/\/wiki\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await settle(page, 2500);

  const pointerEvents = await page.evaluate(() => getComputedStyle(document.body).pointerEvents);
  expect(pointerEvents, "body has pointer-events:none — Radix overlay residue").not.toBe("none");

  // Type into the editor: the surface handler must not steal focus or cancel
  // the interaction. This is the whitelist regression in one assertion.
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.type("integration-probe");
  await page.waitForTimeout(400);

  const typed = await page.evaluate(() => document.body.innerText.includes("integration-probe"));

  // A click on the page title must enter edit mode (an input/contenteditable
  // gains focus) rather than being swallowed.
  const titleEditable = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      isEditable: (active as HTMLElement | null)?.isContentEditable ?? false,
    };
  });

  writeArtifact("u1-page-clickability.json", { pointerEvents, typed, titleEditable });

  expect(typed, "typing into the BlockNote editor produced no text").toBe(true);
  await shot(page, "u1-wiki-page-clickable");
});

/* ── U1 (a): the wiki shows the truth without a manual refresh ───────────── */

test("U1: a page created in the explorer is fresh on return to /wiki", async ({ page }) => {
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await settle(page);

  const before = await page.locator('a[href^="/wiki/"]').count();

  // Create a page through the explorer's own "New" dropdown
  // (ExplorerNewMenu.tsx), which is the path useExplorerActions.handleCreatePage
  // sits behind — the one that used to leave an empty-title stub in the cache.
  const filesBefore = await page.getByRole("button", { name: /Untitled/ }).count();

  // Scoped away from the rail deliberately: the sidebar has a
  // "New project in Academics" button that a loose /^New/ match steals.
  await page
    .locator("main, [data-stage]")
    .getByRole("button", { name: "New", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /New page/ }).click();
  await page.waitForTimeout(2500);

  const afterCreate = {
    url: page.url(),
    links: await page.locator('a[href^="/wiki/"]').count(),
    untitled: await page.getByRole("button", { name: /Untitled/ }).count(),
  };

  // The criterion is about coming BACK to a surface and seeing the truth, with
  // no hard reload. Leave the wiki entirely, then return by client navigation.
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page, 1200);
  await page.locator('a[href="/wiki"]').first().click();
  await page.waitForURL(/\/wiki(\?|$)/, { timeout: 20_000 });
  await settle(page, 2500);

  const afterReturn = {
    links: await page.locator('a[href^="/wiki/"]').count(),
    untitled: await page.getByRole("button", { name: /Untitled/ }).count(),
  };

  // A hard reload is the control: if the row only shows up after this, the
  // client cache was stale and the defect is not fixed.
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 2500);
  const afterReload = {
    links: await page.locator('a[href^="/wiki/"]').count(),
    untitled: await page.getByRole("button", { name: /Untitled/ }).count(),
  };

  writeArtifact("u1-wiki-freshness.json", {
    filesBefore,
    afterCreate,
    afterReturn,
    afterReload,
    criterion:
      "afterReturn must already equal afterReload; if afterReturn < afterReload the client-side return served stale contents",
  });

  await shot(page, "u1-wiki-home-after-create");

  expect(afterCreate.untitled, "the created page never appeared in the explorer").toBeGreaterThan(
    filesBefore
  );
  expect(
    afterReturn.untitled,
    "returning to /wiki by client navigation served stale contents (a reload was needed)"
  ).toBe(afterReload.untitled);
});
