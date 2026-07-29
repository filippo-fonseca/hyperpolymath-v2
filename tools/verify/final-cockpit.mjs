/**
 * The cockpit's structural rule (SDC-1 §2.2), measured rather than asserted.
 *
 * Three questions:
 *   1. At 1280x720 and 1440x900, does opening a SidePanel take over the Dock's
 *      grid track, so the shell never paints four live columns?
 *   2. Does the Dock auto-collapse below 1280px?
 *   3. Is the Dock not rendered at all below 1024px?
 *
 * The panel is opened through the product's own affordance (a task row on
 * /tasks opens the task detail panel) rather than by poking the context, so
 * what is measured is what Filippo will get.
 *
 * Usage: node final-cockpit.mjs
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

/** The shell root is the element whose computed grid-template-columns has 3 tracks. */
function readShell() {
  let root = null;
  let tracks = null;
  for (const el of document.querySelectorAll("div, main, section, body > *")) {
    const cs = getComputedStyle(el);
    if (cs.display !== "grid") continue;
    const cols = cs.gridTemplateColumns;
    if (!cols || cols === "none") continue;
    const parts = cols.trim().split(/\s+/);
    // The cockpit root is the outermost grid that spans the viewport width.
    const r = el.getBoundingClientRect();
    if (r.width < window.innerWidth - 4) continue;
    if (parts.length >= 2 && parts.length <= 4) {
      root = el;
      tracks = parts;
      break;
    }
  }
  // Markers taken from the components themselves: Dock.tsx renders `data-dock`
  // with aria-label="Dock"; SidePanel.tsx renders role="complementary".
  const dock = document.querySelector('[data-dock], [aria-label="Dock"]');
  const panel = document.querySelector('[role="complementary"]');
  return {
    gridTemplateColumns: tracks ? tracks.join(" ") : null,
    trackCount: tracks ? tracks.length : null,
    rootClass: root ? String(root.className).slice(0, 140) : null,
    dockPresent: Boolean(dock),
    dockWidth: dock ? Math.round(dock.getBoundingClientRect().width) : 0,
    panelPresent: Boolean(panel),
    panelWidth: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
    panelPosition: panel ? getComputedStyle(panel).position : null,
    panelBoxShadow: panel ? getComputedStyle(panel).boxShadow : null,
    panelRadius: panel ? getComputedStyle(panel).borderTopLeftRadius : null,
    /** A modal backdrop would be a full-viewport fixed overlay above the stage. */
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
    innerWidth: window.innerWidth,
  };
}

const results = {};
const browser = await chromium.launch();

/**
 * Open the task detail the way the product does. `TasksClient` holds the open
 * task in a `?task=` query param (`useQueryState("task")`, TasksClient.tsx:254),
 * so clicking a row is a client-side URL change. Clicking the row is the real
 * user path and is tried first; the URL is the fallback so a selector drift
 * cannot silently turn "panel never opened" into a pass.
 */
const OPEN_TASK_ID = "cc809342-fc3b-5fef-9038-a0baa4a2d43d"; // "Finish problem set 7"

async function openTaskPanel(page, appUrl) {
  const row = page.getByText("Finish problem set 7", { exact: false }).first();
  if (await row.count().catch(() => 0)) {
    await row.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const shell = await page.evaluate(readShell);
    if (shell.panelPresent) return "row-click";
  }
  await page.goto(`${appUrl}/tasks?task=${OPEN_TASK_ID}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const shell = await page.evaluate(readShell);
  return shell.panelPresent ? "url" : false;
}

for (const [w, h] of [
  [1280, 720],
  [1440, 900],
]) {
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: w, height: h },
  });
  const page = await context.newPage();
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const before = await page.evaluate(readShell);
  await page.screenshot({ path: path.join(OUT, `cockpit-${w}x${h}-dock.png`) });

  const opened = await openTaskPanel(page, APP);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(readShell);
  await page.screenshot({ path: path.join(OUT, `cockpit-${w}x${h}-panel.png`) });

  // Close it and confirm the Dock comes back.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1000);
  const restored = await page.evaluate(readShell);

  results[`${w}x${h}`] = { opened, before, after, restored };
  console.log(
    `${w}x${h} opened=${opened} tracks ${before.trackCount}->${after.trackCount} ` +
      `dock ${before.dockPresent ? 1 : 0}->${after.dockPresent ? 1 : 0}->${restored.dockPresent ? 1 : 0} ` +
      `panel ${after.panelPresent ? 1 : 0} backdrops=${after.backdrops} ` +
      `cols_after="${after.gridTemplateColumns}"`
  );
  await context.close();
}

// Breakpoint behaviour: auto-collapse below 1280, not rendered below 1024.
for (const [w, h, label] of [
  [1366, 900, "xl-above"],
  [1279, 800, "xl-below"],
  [1100, 800, "lg-above"],
  [1023, 800, "lg-below"],
]) {
  const context = await browser.newContext({ storageState: STORAGE, viewport: { width: w, height: h } });
  const page = await context.newPage();
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2200);
  const shell = await page.evaluate(readShell);
  await page.screenshot({ path: path.join(OUT, `cockpit-breakpoint-${label}-${w}.png`) });
  results[`breakpoint-${label}-${w}`] = shell;
  console.log(
    `breakpoint ${label} ${w}px  dockPresent=${shell.dockPresent} dockWidth=${shell.dockWidth} ` +
      `cols="${shell.gridTemplateColumns}"`
  );
  await context.close();
}

await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-cockpit-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-cockpit-results.json")}`);
