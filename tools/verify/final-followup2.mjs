/**
 * Second follow-up round.
 *
 *   T1b  the detail panel opens from the row's options menu and from a board
 *        card. (Clicking a list row's title starts inline rename by design:
 *        TaskListRow.tsx:217 `onClick={startEditTitle}`, with the title wrapper
 *        stopping propagation at :195. The panel trigger is the row menu item
 *        at :292, which calls `onRowClick(task.id)`.)
 *   T2b  grouping by Area, with a selector that survives the Group button
 *        relabelling itself once a grouping is applied.
 *   H2b  toggling a habit from the dock widget, clicking an actual habit button
 *        rather than "Expand Habits".
 *   DC   the design contract on /today, the JARVIS console the command bar
 *        expands into. The f3 scan covers six routes and not this one.
 *
 * Usage: node final-followup2.mjs
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
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `followup2-${name}.png`) });

async function step(name, fn) {
  try {
    results[name] = await fn();
  } catch (err) {
    results[name] = { error: String(err).slice(0, 400) };
  }
  console.log(`${name}: ${JSON.stringify(results[name]).slice(0, 340)}`);
}

function shellState() {
  const rootGrid = Array.from(document.querySelectorAll("div")).find(
    (el) =>
      getComputedStyle(el).display === "grid" &&
      el.getBoundingClientRect().width >= window.innerWidth - 4
  );
  const panel = document.querySelector('[role="complementary"]');
  return {
    cols: rootGrid ? getComputedStyle(rootGrid).gridTemplateColumns : null,
    panelPresent: Boolean(panel),
    panelPosition: panel ? getComputedStyle(panel).position : null,
    panelShadow: panel ? getComputedStyle(panel).boxShadow : null,
    panelRadius: panel ? getComputedStyle(panel).borderTopLeftRadius : null,
    dockPresent: Boolean(document.querySelector("[data-dock]")),
    backdrops: Array.from(document.querySelectorAll("div")).filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.position === "fixed" &&
        r.width >= window.innerWidth - 2 &&
        r.height >= window.innerHeight - 2 &&
        cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        Number(cs.opacity) > 0.01 &&
        cs.pointerEvents !== "none"
      );
    }).length,
  };
}

/** Same audit the f3 script runs, so the numbers are comparable. */
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
        text: (el.textContent || "").trim().slice(0, 40),
        cls: String(el.className).slice(0, 100),
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
        issues.radius.push({ tag: el.tagName, radius: bad, cls: String(el.className).slice(0, 100) });
      }
    }
  }
  const h1 = document.querySelector("main h1") ?? document.querySelector("h1");
  return {
    uppercaseCount: issues.uppercase.length,
    radiusCount: issues.radius.length,
    h1Left: h1 ? Math.round(h1.getBoundingClientRect().left) : null,
    uppercase: issues.uppercase.slice(0, 12),
    radius: issues.radius.slice(0, 12),
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

/* ------------------------------- T1b: open the detail from the row options menu */

await step("T1b_detail_from_row_menu", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  await reachFixtureDay();
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(2200);

  const before = await page.evaluate(shellState);
  const optionsBtn = page.locator('button[aria-label="Task options"]').first();
  const menuPresent = (await optionsBtn.count()) > 0;
  let menuItems = [];
  let after = null;
  if (menuPresent) {
    await optionsBtn.click();
    await page.waitForTimeout(900);
    menuItems = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    );
    const openItem = page
      .locator('[role="menuitem"]')
      .filter({ hasText: /open|detail|view/i })
      .first();
    if (await openItem.count()) {
      await openItem.click();
      await page.waitForTimeout(1800);
      after = await page.evaluate(shellState);
      after.url = page.url();
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  await shot(page, "detail-from-row-menu");
  return {
    menuPresent,
    menuItems,
    before,
    after,
    opensInlinePanel: Boolean(
      after?.panelPresent && after.backdrops === 0 && after.panelPosition === "static"
    ),
    stageResized: Boolean(after && before.cols !== after.cols),
  };
});

/* ------------------------------------- T1c: open the detail from a board card */

await step("T1c_detail_from_board_card", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  await reachFixtureDay();
  await page.getByRole("radio", { name: "Board" }).first().click().catch(() => {});
  await page.waitForTimeout(2400);
  const before = await page.evaluate(shellState);
  const card = page.getByText("Finish problem set 7", { exact: false }).first();
  let after = null;
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1800);
    after = await page.evaluate(shellState);
    after.url = page.url();
  }
  await shot(page, "detail-from-board-card");
  return {
    before,
    after,
    opensInlinePanel: Boolean(
      after?.panelPresent && after.backdrops === 0 && after.panelPosition === "static"
    ),
    stageResized: Boolean(after && before.cols !== after.cols),
  };
});

/* ---------------------------------------------------- T2b: group by Area */

await step("T2b_group_by_area", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  await reachFixtureDay();
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  const out = {};
  for (const label of ["Project", "Area", "No grouping"]) {
    // The trigger relabels itself once a grouping is applied, so match on the
    // prefix rather than the exact word.
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
    await page.waitForTimeout(2600);
    out[label] = await page.evaluate((lbl) => {
      const main = document.querySelector("main");
      const headers = Array.from(main?.querySelectorAll("h2, h3, [data-group-header]") ?? [])
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12);
      return {
        optionPresent: true,
        label: lbl,
        groupHeaders: headers,
        triggerLabel: (
          Array.from(document.querySelectorAll("button")).find((b) =>
            /^Group/.test((b.textContent || "").trim())
          )?.textContent || ""
        ).trim(),
      };
    }, label);
    await shot(page, `group-${label.replace(/\s+/g, "-").toLowerCase()}`);
  }
  return out;
});

/* ---------------------------------------------- H2b: toggle a habit from the dock */

await step("H2b_dock_habit_toggle", async () => {
  await page.goto(`${APP}/habits`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  const read = () =>
    page.evaluate(() => ({
      pageMarkDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
      pageMarkNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
      widgetText: (document.querySelector('[data-dock-widget-id="habits"]')?.textContent || "")
        .trim()
        .slice(0, 90),
    }));
  const before = await read();

  // Skip "Expand Habits"; click an actual habit row inside the widget.
  const habitBtn = page
    .locator('[data-dock-widget-id="habits"] button')
    .filter({ hasNotText: /^Expand/ })
    .first();
  const btnLabel = (await habitBtn.count()) ? (await habitBtn.textContent())?.trim().slice(0, 40) : null;
  let after = null;
  if (await habitBtn.count()) {
    await habitBtn.click();
    await page.waitForTimeout(3200);
    after = await read();
    await shot(page, "dock-habit-toggled");
  }
  // Toggle it back so the fixture ends where it started.
  if (await habitBtn.count()) {
    await habitBtn.click();
    await page.waitForTimeout(2500);
  }
  const restored = await read();
  return {
    btnLabel,
    before,
    after,
    restored,
    pageFollowedDock: Boolean(after && after.pageMarkDone !== before.pageMarkDone),
    widgetFollowedDock: Boolean(after && after.widgetText !== before.widgetText),
  };
});

/* --------------------------- DC: the design contract on /today (JARVIS console) */

await step("DC_today_console_contract", async () => {
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
    await p.waitForTimeout(2600);
    out[theme] = await p.evaluate(audit, LADDER);
    await p.screenshot({ path: path.join(OUT, `followup2-today-${theme}.png`) });
    await c.close();
  }
  return out;
});

await context.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-followup2-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-followup2-results.json")}`);
