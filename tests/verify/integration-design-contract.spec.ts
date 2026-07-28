import { expect, test } from "@playwright/test";
import {
  assertThemeApplied,
  contrastRatio,
  ensureEvidenceDir,
  forceTheme,
  gridTracks,
  probeToken,
  settle,
  toHex,
  writeArtifact,
} from "./helpers/cockpit";

/**
 * Wave-1 integration: the binding SDC-1 criteria, asserted as computed styles.
 *
 * Every assertion here reads what Chromium actually painted. Nothing is judged
 * by eye and nothing is inferred from source. Where a criterion is a whole-page
 * scan (radii, uppercase) the spec collects every violation into an artifact
 * next to the screenshots so a fix unit gets a work-list rather than a single
 * first-failure.
 */

const ROUTES = ["/tasks", "/wiki", "/lifeos", "/habits"] as const;

test.beforeAll(() => {
  ensureEvidenceDir();
});

/* ── §2.3 the dark canvas is no longer near-black ────────────────────────── */

test("dark canvas resolves to the calmed #15171a, not the near-black cascade bug", async ({
  page,
}) => {
  await forceTheme(page, "dark");
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);
  await assertThemeApplied(page, "dark");

  const canvas = await probeToken(page, "--canvas");
  const sdApp = await probeToken(page, "--sd-app");

  const result = {
    canvas: toHex(canvas),
    sdApp: toHex(sdApp),
    target: "#15171a",
    oldBug: "#090b0d",
  };
  writeArtifact("dark-canvas-token.json", result);

  // The whole point of the cascade fix: `--sd-app` must follow `.dark`, not the
  // later same-specificity `:root` remap that used to clobber it.
  expect(result.sdApp, "--sd-app in dark still paints the near-black bug").not.toBe("#090b0d");

  // Allow a channel or two of rounding from the oklch -> srgb conversion.
  for (const [i, expected] of [0x15, 0x17, 0x1a].entries()) {
    expect(Math.abs(canvas[i] - expected), `--canvas channel ${i} off target`).toBeLessThanOrEqual(
      3
    );
  }
  expect(result.sdApp, "--sd-app did not remap onto --canvas").toBe(result.canvas);
});

/* ── §2.3 body ink sits at the calmed ratio, not the old 14.4 / 15.7 ─────── */

for (const theme of ["light", "dark"] as const) {
  test(`body ink contrast is calmed in ${theme}`, async ({ page }) => {
    await forceTheme(page, theme);
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await settle(page);
    await assertThemeApplied(page, theme);

    const ink = await probeToken(page, "--ink");
    const canvas = await probeToken(page, "--canvas");
    const ratio = contrastRatio(ink, canvas);

    const expected = theme === "light" ? 12.4 : 12.7;
    const old = theme === "light" ? 14.4 : 15.7;

    writeArtifact(`ink-contrast-${theme}.json`, {
      theme,
      ink: toHex(ink),
      canvas: toHex(canvas),
      ratio,
      expected,
      previous: old,
    });

    // Calmed: materially below the old ratio, and still comfortably AAA body.
    expect(ratio, `ink contrast still at or above the old ${old}:1`).toBeLessThan(old - 0.5);
    expect(ratio, "ink contrast drifted from the pre-measured calmed value").toBeGreaterThan(
      expected - 1.0
    );
    expect(ratio, "ink contrast drifted from the pre-measured calmed value").toBeLessThan(
      expected + 1.0
    );
  });
}

/* ── §2.6 radius ladder: exactly 4, 8, 12, 9999 ──────────────────────────── */

test("no element carries an off-ladder border radius", async ({ page }) => {
  const violations: Array<{ route: string; radius: string; tag: string; cls: string }> = [];

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await settle(page, 1000);

    const found = await page.evaluate(() => {
      // The ladder, plus 0 (no radius) and the grandfathered WidgetCard 14px.
      const ALLOWED = new Set(["0px", "4px", "8px", "12px", "14px", "9999px"]);
      const out: Array<{ radius: string; tag: string; cls: string }> = [];

      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const cs = getComputedStyle(el);
        // Skip anything not painted; an invisible node's radius is not a
        // visual defect and would flood the work-list.
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        for (const corner of [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomLeftRadius,
          cs.borderBottomRightRadius,
        ]) {
          if (!corner || ALLOWED.has(corner)) continue;
          // A pill renders as half the box height rather than the literal
          // 9999px, so treat "radius >= half the shorter side" as the pill case.
          const px = Number.parseFloat(corner);
          if (!Number.isNaN(px) && px >= Math.min(r.width, r.height) / 2 - 0.5) continue;
          // Percentage radii on avatars resolve to px already; anything left
          // that is not on the ladder is a real violation.
          out.push({
            radius: corner,
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute("class") ?? "").slice(0, 120),
          });
          break;
        }
      }
      return out;
    });

    for (const v of found) violations.push({ route, ...v });
  }

  // Collapse to distinct (radius, class) pairs so the work-list is actionable.
  const distinct = Array.from(new Map(violations.map((v) => [`${v.radius}|${v.cls}`, v])).values());
  const path = writeArtifact("radius-ladder-violations.json", {
    total: violations.length,
    distinct: distinct.length,
    ladder: ["4px", "8px", "12px", "9999px (pill)", "14px grandfathered WidgetCard"],
    violations: distinct,
  });

  expect(
    distinct,
    `off-ladder radii found (work-list at ${path}): ${distinct
      .map((v) => `${v.radius} on .${v.cls.split(" ")[0]}`)
      .slice(0, 12)
      .join(", ")}`
  ).toHaveLength(0);
});

/* ── §2.4 uppercase is banned outside kbd and the sidebar eyebrows ───────── */

test("no uppercase outside kbd and the sanctioned eyebrow slots", async ({ page }) => {
  const violations: Array<{ route: string; tag: string; text: string; cls: string }> = [];

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await settle(page, 1000);

    const found = await page.evaluate(() => {
      const out: Array<{ tag: string; text: string; cls: string }> = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const cs = getComputedStyle(el);
        if (cs.textTransform !== "uppercase") continue;
        if (cs.display === "none" || cs.visibility === "hidden") continue;

        // Sanctioned: kbd hints, and the sidebar section eyebrows which keep
        // the SB_* grammar per SDC-1 §2.4. The whole rail subtree is excluded
        // rather than just the eyebrow nodes, deliberately: it is the
        // conservative choice, so this scan under-reports rather than inflates.
        if (el.tagName === "KBD" || el.closest("kbd")) continue;
        if (el.closest('[data-eyebrow], aside[aria-label="Sidebar"], nav[aria-label="Sidebar"]'))
          continue;

        // Only report a node that actually renders its own text, otherwise an
        // inherited text-transform reports the whole ancestor chain.
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (!own) continue;

        out.push({
          tag: el.tagName.toLowerCase(),
          text: own.slice(0, 60),
          cls: (el.getAttribute("class") ?? "").slice(0, 120),
        });
      }
      return out;
    });

    for (const v of found) violations.push({ route, ...v });
  }

  const distinct = Array.from(new Map(violations.map((v) => [`${v.text}|${v.cls}`, v])).values());
  const path = writeArtifact("uppercase-violations.json", {
    total: violations.length,
    distinct: distinct.length,
    violations: distinct,
  });

  expect(
    distinct,
    `uppercase outside kbd/eyebrow (work-list at ${path}): ${distinct
      .map((v) => `"${v.text}"`)
      .slice(0, 12)
      .join(", ")}`
  ).toHaveLength(0);
});

/* ── §2.9 one measure: H1 left edges line up across routes ───────────────── */

test("H1 left edges are equal across routes", async ({ page }) => {
  const measured: Array<{ route: string; left: number | null; text: string }> = [];

  for (const route of [...ROUTES, "/areas", "/calendar"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await settle(page, 1200);

    const h1 = await page.evaluate(() => {
      const el = document.querySelector("h1");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left * 10) / 10,
        text: (el.textContent ?? "").trim().slice(0, 40),
      };
    });

    measured.push({ route, left: h1?.left ?? null, text: h1?.text ?? "(no h1)" });
  }

  const withH1 = measured.filter((m) => m.left !== null);
  const lefts = Array.from(new Set(withH1.map((m) => m.left)));

  writeArtifact("h1-left-edges.json", { measured, distinctLefts: lefts });

  expect(withH1.length, "no route rendered an h1 to measure").toBeGreaterThan(2);
  expect(
    lefts,
    `H1 left edges differ across routes: ${withH1.map((m) => `${m.route}=${m.left}`).join(", ")}`
  ).toHaveLength(1);
});

/* ── §2.2 there are never four live columns ──────────────────────────────── */

test("the cockpit has three tracks, and a SidePanel yields the dock's track", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await settle(page);

  const before = await gridTracks(page);
  const dockBefore = await page.locator("[data-dock]").count();

  expect(dockBefore, "the Dock is not the right slot's default occupant").toBe(1);
  expect(before.count, `cockpit grid is not three tracks: ${before.raw}`).toBe(3);

  // Open the one SidePanel that exists in wave 1 (the split JARVIS console)
  // through its real state channel rather than by poking React internals.
  await page.evaluate(() => {
    localStorage.setItem("split-screen-on", "1");
    window.dispatchEvent(new CustomEvent("split-screen-change", { detail: true }));
  });
  await page.waitForTimeout(900); // the 260ms track transition, plus content fade

  const after = await gridTracks(page);
  const dockAfter = await page.locator("[data-dock]").count();
  const panelAfter = await page.locator('[role="complementary"]').count();

  writeArtifact("right-slot-arbitration.json", {
    before: { tracks: before.raw, count: before.count, dock: dockBefore },
    after: { tracks: after.raw, count: after.count, dock: dockAfter, panel: panelAfter },
  });

  expect(panelAfter, "the SidePanel did not open").toBeGreaterThan(0);
  expect(dockAfter, "the Dock did not yield the right slot to the SidePanel").toBe(0);
  expect(after.count, `four live columns with a panel open: ${after.raw}`).toBe(3);

  // Closing restores the Dock.
  await page.evaluate(() => {
    localStorage.setItem("split-screen-on", "0");
    window.dispatchEvent(new CustomEvent("split-screen-change", { detail: false }));
  });
  await page.waitForTimeout(900);
  expect(await page.locator("[data-dock]").count(), "the Dock did not come back").toBe(1);
});
