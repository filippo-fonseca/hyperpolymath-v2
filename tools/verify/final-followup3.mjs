/**
 * Third and last follow-up round.
 *
 *   T2c  grouping by Project and by Area with two tasks actually linked to the
 *        seeded project through `tasks_projects`, so what is proved is real
 *        segmentation and not just the "unassigned" bucket.
 *   H2c  toggling a habit from the dock widget. The row button carries
 *        `aria-pressed` (dock-widgets/habits.tsx:157-160), which is both the
 *        right selector and the state to read.
 *   DC   the full set of design-contract violations on /today.
 *
 * Usage: node final-followup3.mjs
 * Env: APP_URL, STORAGE, OUT_DIR.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3247";
const STORAGE = process.env.STORAGE ?? "./.verify/storage-state.json";
const OUT =
  process.env.OUT_DIR ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/final";

const LADDER = ["0px", "4px", "8px", "12px", "14px", "9999px", "3.35544e+07px", "50%"];
const results = {};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `followup3-${name}.png`) });

async function step(name, fn) {
  try {
    results[name] = await fn();
  } catch (err) {
    results[name] = { error: String(err).slice(0, 400) };
  }
  console.log(`${name}: ${JSON.stringify(results[name]).slice(0, 360)}`);
}

function audit(ladder) {
  const LAD = new Set(ladder);
  const issues = { uppercase: [], radius: [] };
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!(r.width > 1 && r.height > 1 && cs.display !== "none" && cs.visibility !== "hidden")) continue;
    if (
      cs.textTransform === "uppercase" &&
      el.tagName !== "KBD" &&
      !el.closest("kbd") &&
      !el.closest('[data-eyebrow="sidebar-section"]')
    ) {
      issues.uppercase.push({
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 44),
        cls: String(el.className).slice(0, 130),
      });
    }
    const hasPaint =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      parseFloat(cs.borderTopWidth) > 0 ||
      cs.boxShadow !== "none" ||
      el.tagName === "IMG";
    if (hasPaint) {
      const parts = [
        cs.borderTopLeftRadius,
        cs.borderTopRightRadius,
        cs.borderBottomLeftRadius,
        cs.borderBottomRightRadius,
      ].flatMap((v) => v.split(" "));
      const bad = parts.find((v) => v && !LAD.has(v));
      if (bad) {
        issues.radius.push({
          tag: el.tagName,
          radius: bad,
          text: (el.textContent || "").trim().slice(0, 30),
          cls: String(el.className).slice(0, 130),
        });
      }
    }
  }
  return {
    uppercaseCount: issues.uppercase.length,
    radiusCount: issues.radius.length,
    uppercase: issues.uppercase,
    radius: issues.radius,
  };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

async function reachFixtureDay() {
  for (let i = 0; i < 3; i++) {
    const seen = await page.evaluate(() =>
      (document.querySelector("main") || document.body).innerText.includes("Finish problem set 7")
    );
    if (seen) return i;
    const next = page.locator('button[aria-label="Next day"]').first();
    if (!(await next.count())) return -1;
    await next.click();
    await page.waitForTimeout(2200);
  }
  return -1;
}

/* -------------------------------- T2c: real segmentation by Project and Area */

await step("T2c_real_segmentation", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  await reachFixtureDay();
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(2200);

  const out = {};
  for (const label of ["Project", "Area"]) {
    const groupBtn = page.locator("button").filter({ hasText: /^Group/ }).first();
    if (!(await groupBtn.count())) {
      out[label] = { groupControlPresent: false };
      continue;
    }
    await groupBtn.click();
    await page.waitForTimeout(1000);
    const opt = page
      .locator('[role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: new RegExp(`^${label}$`, "i") })
      .first();
    if (!(await opt.count())) {
      out[label] = { optionPresent: false };
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }
    await opt.click();
    await page.waitForTimeout(3000);
    out[label] = await page.evaluate((lbl) => {
      const main = document.querySelector("main");
      const headers = Array.from(main?.querySelectorAll("h2, h3, [data-group-header]") ?? [])
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12);
      const text = main?.innerText ?? "";
      return {
        optionPresent: true,
        label: lbl,
        groupHeaders: headers,
        namesRealGroup: /Thermodynamics|Academics/.test(headers.join(" | ")),
        mentionsThermo: text.includes("Thermodynamics"),
        mentionsAcademics: text.includes("Academics"),
      };
    }, label);
    await shot(page, `segment-${label.toLowerCase()}`);
  }
  return out;
});

/* ------------------------------------ H2c: dock habit toggle via aria-pressed */

await step("H2c_dock_habit_toggle", async () => {
  await page.goto(`${APP}/habits`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const read = () =>
    page.evaluate(() => {
      const w = document.querySelector('[data-dock-widget-id="habits"]');
      const rows = Array.from(w?.querySelectorAll("button[aria-pressed]") ?? []).map((b) => ({
        label: (b.textContent || "").trim().slice(0, 30),
        pressed: b.getAttribute("aria-pressed"),
      }));
      return {
        dockRows: rows,
        dockDoneCount: rows.filter((r) => r.pressed === "true").length,
        pageMarkDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
        pageMarkNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
      };
    });

  const before = await read();
  const btn = page.locator('[data-dock-widget-id="habits"] button[aria-pressed]').first();
  if (!(await btn.count())) return { before, note: "no aria-pressed habit row in the dock widget" };

  const t0 = Date.now();
  await btn.click();
  let flippedAfterMs = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(25);
    const now = await read();
    if (now.dockDoneCount !== before.dockDoneCount) {
      flippedAfterMs = Date.now() - t0;
      break;
    }
  }
  await page.waitForTimeout(3000);
  const after = await read();
  await shot(page, "dock-habit-toggled");

  // Put the fixture back.
  await btn.click();
  await page.waitForTimeout(3000);
  const restored = await read();

  return {
    before,
    after,
    restored,
    flippedAfterMs,
    dockOptimistic: flippedAfterMs !== null && flippedAfterMs < 400,
    pageAgreesWithDock:
      after.dockDoneCount === before.dockDoneCount - 1 || after.dockDoneCount === before.dockDoneCount + 1
        ? after.pageMarkNotDone === after.dockDoneCount
        : null,
    dockAndPageConsistentAfter: after.pageMarkNotDone === after.dockDoneCount,
    dockAndPageConsistentBefore: before.pageMarkNotDone === before.dockDoneCount,
  };
});

/* ------------------------------------------ DC: full /today contract violations */

await step("DC_today_full", async () => {
  const out = {};
  for (const theme of ["light", "dark"]) {
    const c = await browser.newContext({
      storageState: STORAGE,
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    await c.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme);
    const p = await c.newPage();
    await p.goto(`${APP}/today`, { waitUntil: "networkidle", timeout: 60_000 });
    await p.waitForTimeout(2800);
    out[theme] = await p.evaluate(audit, LADDER);
    await p.screenshot({ path: path.join(OUT, `followup3-today-${theme}.png`) });
    await c.close();
  }
  return out;
});

await context.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-followup3-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-followup3-results.json")}`);
