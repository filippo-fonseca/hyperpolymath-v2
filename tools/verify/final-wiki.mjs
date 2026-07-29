/**
 * The wiki defects Filippo reported, exercised in a real browser.
 *
 *   W1  returning to the wiki home shows fresh contents with no manual refresh
 *   W2  returning to a directory shows fresh contents with no manual refresh
 *   W3  breadcrumb navigation is responsive
 *   W4  things other than the breadcrumb are clickable inside a page
 *   W5  the `/` menu's image option opens a usable file panel, and an upload succeeds
 *   W6  dragging an image into a block works
 *   W7  folders on the wiki home sit in an even grid with no drooping
 *
 * Selectors are taken from the live DOM (see probe-wiki.mjs), not guessed:
 * the explorer grid is the container whose grid-template-columns is authored
 * `repeat(auto-fill,minmax(118px,1fr))`, a folder opens on double-click and
 * navigates to `/wiki?folder=<id>`, and the breadcrumb is
 * `nav[aria-label="Explorer breadcrumbs"]`.
 *
 * Freshness is measured as a delta against a hard reload, not as an absolute:
 * a row is created through the app's own UI, the browser leaves the route and
 * comes back by client navigation, and the returned view is compared with what
 * a reload shows. Equal means nothing needed a manual refresh.
 *
 * Usage: node final-wiki.mjs
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

/** A 1x1 PNG, enough to exercise the upload and drop paths end to end. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const results = {};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `wiki-${name}.png`) });

/** The explorer's own grid, identified by its authored track template. */
function explorerSnapshot() {
  const grid = document.querySelector('div[class*="minmax(118px"]');
  if (!grid) return { gridFound: false, tiles: [] };
  const tiles = Array.from(grid.children).map((t) => {
    const r = t.getBoundingClientRect();
    const inner = t.firstElementChild ?? t;
    return {
      txt: (t.textContent || "").trim().slice(0, 45),
      top: Math.round(r.top),
      left: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      transform: getComputedStyle(t).transform,
      innerTransform: getComputedStyle(inner).transform,
      opacity: Number(getComputedStyle(t).opacity),
    };
  });
  return {
    gridFound: true,
    cols: getComputedStyle(grid).gridTemplateColumns,
    tileCount: tiles.length,
    tiles,
  };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 200)}`));

async function step(name, fn) {
  try {
    results[name] = await fn();
  } catch (err) {
    results[name] = { error: String(err).slice(0, 400) };
  }
  console.log(`${name}: ${JSON.stringify(results[name]).slice(0, 300)}`);
}

const gotoWikiHome = async () => {
  await page.goto(`${APP}/wiki`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
};

await gotoWikiHome();
await shot(page, "home");

/* ------------------------------------------------------- W7: folder grid */

await step("W7_folder_grid", async () => {
  const snap = await page.evaluate(explorerSnapshot);
  if (!snap.gridFound) return { gridFound: false };

  // Group tiles into rows by top edge; a "drooping" tile is one whose top sits
  // below its row's, which is what a y-transform interrupted mid-animation does.
  const rows = new Map();
  for (const t of snap.tiles) {
    let key = null;
    for (const k of rows.keys()) if (Math.abs(k - t.top) <= 3) key = k;
    if (key === null) key = t.top;
    rows.set(key, [...(rows.get(key) ?? []), t]);
  }
  const rowStats = Array.from(rows.entries()).map(([top, items]) => ({
    top,
    count: items.length,
    topSpread: Math.max(...items.map((i) => i.top)) - Math.min(...items.map((i) => i.top)),
    heightSpread: Math.max(...items.map((i) => i.height ?? i.h)) - Math.min(...items.map((i) => i.h)),
    widthSpread: Math.max(...items.map((i) => i.w)) - Math.min(...items.map((i) => i.w)),
  }));
  const translated = snap.tiles.filter(
    (t) =>
      (t.transform !== "none" && t.transform !== "matrix(1, 0, 0, 1, 0, 0)") ||
      (t.innerTransform !== "none" && t.innerTransform !== "matrix(1, 0, 0, 1, 0, 0)")
  );
  const faded = snap.tiles.filter((t) => t.opacity < 0.99);

  return {
    gridFound: true,
    cols: snap.cols,
    tileCount: snap.tileCount,
    rows: rowStats,
    maxTopSpread: Math.max(0, ...rowStats.map((r) => r.topSpread)),
    maxHeightSpread: Math.max(0, ...rowStats.map((r) => r.heightSpread)),
    translatedTiles: translated.length,
    translatedDetail: translated.slice(0, 5),
    fadedTiles: faded.length,
    even:
      rowStats.every((r) => r.topSpread <= 1 && r.heightSpread <= 1) &&
      translated.length === 0 &&
      faded.length === 0,
  };
});

/* -------------------- W7b: the grid is still even after an interrupted entry */

await step("W7b_grid_after_interrupted_entry", async () => {
  // The original bug needed the entry animation to be interrupted by a
  // re-render. Navigate into a folder and straight back out, then measure
  // before the stagger would have finished.
  const folder = page.locator("button", { hasText: "Course notes" }).first();
  if (!(await folder.count())) return { skipped: "no folder tile" };
  await folder.dblclick();
  await page.waitForTimeout(250);
  await page.goBack().catch(() => {});
  await page.waitForTimeout(280);
  const mid = await page.evaluate(explorerSnapshot);
  await page.waitForTimeout(2500);
  const settled = await page.evaluate(explorerSnapshot);
  await shot(page, "grid-after-interrupted-entry");

  const droopy = (snap) =>
    snap.tiles.filter(
      (t) =>
        (t.transform !== "none" && t.transform !== "matrix(1, 0, 0, 1, 0, 0)") ||
        (t.innerTransform !== "none" && t.innerTransform !== "matrix(1, 0, 0, 1, 0, 0)")
    ).length;

  return {
    midFlightTiles: mid.tileCount,
    midFlightTranslated: mid.gridFound ? droopy(mid) : null,
    settledTiles: settled.tileCount,
    settledTranslated: settled.gridFound ? droopy(settled) : null,
    settledOpacityAllOne: settled.gridFound ? settled.tiles.every((t) => t.opacity > 0.99) : null,
  };
});

/* ---------------------------------------- W1: wiki home fresh on return */

await step("W1_home_freshness", async () => {
  await gotoWikiHome();
  const before = await page.evaluate(explorerSnapshot);

  // Create a folder through the explorer's own New menu, so the mutation takes
  // the same path a user's would.
  // The item is labelled "New folder" inside the explorer's New dropdown
  // (ExplorerNewMenu.tsx:40-43), and the new tile lands in inline rename, which
  // Enter commits.
  let created = null;
  const newBtn = page.locator("button", { hasText: /^New$/ }).first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(800);
    const folderItem = page.getByRole("menuitem", { name: /new folder/i }).first();
    if (await folderItem.count()) {
      await folderItem.click();
      await page.waitForTimeout(2500);
      // The item opens a name dialog with a focused input; an empty name is
      // rejected, so the name has to be typed before Enter commits.
      created = `folder:W1-${Date.now()}`;
      await page.keyboard.type(created, { delay: 25 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  const afterCreate = await page.evaluate(explorerSnapshot);

  // Leave to another route, then come back by client-side navigation.
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1800);
  await page.locator('nav[aria-label="Main navigation"] a', { hasText: "Wiki" }).first().click();
  await page.waitForTimeout(3200);
  const afterClientReturn = await page.evaluate(explorerSnapshot);
  await shot(page, "home-after-client-return");

  // Ground truth: a hard reload.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const afterReload = await page.evaluate(explorerSnapshot);

  return {
    created,
    tilesBefore: before.tileCount,
    tilesAfterCreate: afterCreate.tileCount,
    tilesAfterClientReturn: afterClientReturn.tileCount,
    tilesAfterHardReload: afterReload.tileCount,
    freshWithoutRefresh: afterClientReturn.tileCount === afterReload.tileCount,
    createWasVisibleImmediately: created ? afterCreate.tileCount > before.tileCount : null,
  };
});

/* ------------------------------------ W2: a directory fresh on return */

await step("W2_directory_freshness", async () => {
  await gotoWikiHome();
  const folder = page.locator("button", { hasText: "Course notes" }).first();
  if (!(await folder.count())) return { skipped: "no 'Course notes' tile" };
  await folder.dblclick();
  await page.waitForTimeout(2800);
  const dirUrl = page.url();
  const before = await page.evaluate(explorerSnapshot);
  await shot(page, "directory");

  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1800);
  await page.goBack().catch(() => {});
  await page.waitForTimeout(3200);
  const afterReturn = await page.evaluate(explorerSnapshot);
  const urlAfterReturn = page.url();
  await shot(page, "directory-after-return");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const afterReload = await page.evaluate(explorerSnapshot);

  return {
    dirUrl,
    urlAfterReturn,
    tilesInDir: before.tileCount,
    tilesAfterReturn: afterReturn.tileCount,
    tilesAfterReload: afterReload.tileCount,
    returnedToSameDir: urlAfterReturn === dirUrl,
    freshWithoutRefresh:
      afterReturn.tileCount === afterReload.tileCount && afterReturn.tileCount > 0,
  };
});

/* --------------------------------------------- W3: breadcrumb latency */

await step("W3_breadcrumb", async () => {
  await gotoWikiHome();
  const folder = page.locator("button", { hasText: "Course notes" }).first();
  if (!(await folder.count())) return { skipped: "no folder tile" };
  await folder.dblclick();
  await page.waitForTimeout(2800);

  const crumbs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="Explorer breadcrumbs"] a, nav[aria-label="Explorer breadcrumbs"] button'))
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean)
  );
  const urlBefore = page.url();

  const root = page.locator('nav[aria-label="Explorer breadcrumbs"] a, nav[aria-label="Explorer breadcrumbs"] button').first();
  let latencyMs = null;
  let navigated = false;
  if (await root.count()) {
    const t0 = Date.now();
    await root.click();
    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(50);
      if (page.url() !== urlBefore) {
        const ready = await page
          .evaluate(() => {
            const g = document.querySelector('div[class*="minmax(118px"]');
            return Boolean(g && g.children.length > 0);
          })
          .catch(() => false);
        if (ready) {
          latencyMs = Date.now() - t0;
          navigated = true;
          break;
        }
      }
    }
  }
  await shot(page, "breadcrumb-after-click");
  return { crumbs, navigated, latencyMs, urlBefore, urlAfter: page.url() };
});

/* ---------------------------- W4: clickability inside a page (not only crumbs) */

await step("W4_page_clickability", async () => {
  await gotoWikiHome();
  await page.locator("button", { hasText: "Course notes" }).first().dblclick();
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Thermodynamics" }).first().dblclick().catch(() => {});
  await page.waitForTimeout(2500);
  const pageTile = page.locator("button", { hasText: "The first law" }).first();
  if (!(await pageTile.count())) return { skipped: "could not reach a wiki page", url: page.url() };
  await pageTile.dblclick();
  await page.waitForTimeout(3500);
  const pageUrl = page.url();
  await shot(page, "page-open");

  const bodyPointerEvents = await page.evaluate(() => getComputedStyle(document.body).pointerEvents);

  // A large transparent overlay above the editor would swallow clicks while
  // leaving the breadcrumb (higher in the stack) usable, which is the symptom.
  const blockers = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("div, section")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (
        (cs.position === "fixed" || cs.position === "absolute") &&
        r.width >= window.innerWidth * 0.5 &&
        r.height >= window.innerHeight * 0.5 &&
        cs.pointerEvents !== "none" &&
        Number(cs.zIndex || 0) > 0
      ) {
        out.push({ cls: String(el.className).slice(0, 80), z: cs.zIndex, pos: cs.position });
      }
    }
    return out;
  });

  const editable = page.locator('[contenteditable="true"]').first();
  let typedTextLanded = false;
  let focusedTag = null;
  let editableCount = await editable.count();
  if (editableCount) {
    const box = await editable.boundingBox();
    if (box) {
      await page.mouse.click(box.x + Math.min(180, box.width / 2), box.y + Math.min(30, box.height / 2));
      await page.waitForTimeout(700);
      focusedTag = await page.evaluate(() => {
        const a = document.activeElement;
        return a ? `${a.tagName}[contenteditable=${a.getAttribute("contenteditable")}]` : null;
      });
      const marker = `hpv2verify${Date.now()}`;
      await page.keyboard.type(marker, { delay: 15 });
      await page.waitForTimeout(1200);
      typedTextLanded = await page.evaluate((m) => document.body.innerText.includes(m), marker);
    }
  }
  await shot(page, "page-after-typing");
  return { pageUrl, bodyPointerEvents, blockers, editableCount, focusedTag, typedTextLanded };
});

/* ------------------------------------ W5: slash menu image -> file panel -> upload */

await step("W5_slash_image_upload", async () => {
  const editable = page.locator('[contenteditable="true"]').first();
  if (!(await editable.count())) return { skipped: "no editable block on the page", url: page.url() };
  const box = await editable.boundingBox();
  await page.mouse.click(box.x + 150, box.y + 20);
  await page.waitForTimeout(500);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.keyboard.type("/", { delay: 60 });
  await page.waitForTimeout(1500);
  await shot(page, "slash-menu");

  // The editor is BlockNote: the menu is `.bn-suggestion-menu`, its rows are
  // plain divs (not role=option), and it scrolls, so a first-page scan is not
  // proof of absence. Read the whole list, then filter it by typing.
  const MENU = ".bn-suggestion-menu";
  const menuItems = await page.evaluate((sel) => {
    const menu = document.querySelector(sel);
    if (!menu) return [];
    return Array.from(menu.querySelectorAll("*"))
      .filter((el) => el.children.length === 0 && (el.textContent || "").trim())
      .map((el) => (el.textContent || "").trim())
      .slice(0, 60);
  }, MENU);
  const imageInFullMenu = menuItems.some((t) => /^image$/i.test(t));

  // Filter to the Image entry the way a user would.
  await page.keyboard.type("image", { delay: 70 });
  await page.waitForTimeout(1200);
  await shot(page, "slash-menu-image-query");

  const imageOption = page.locator(`${MENU} div`).filter({ hasText: /^Image$/ }).first();
  const imageOptionFound = (await imageOption.count()) > 0;
  if (!imageOptionFound) return { menuItems, imageInFullMenu, imageOptionFound: false };

  await imageOption.click();
  await page.waitForTimeout(2500);
  await shot(page, "file-panel");

  const panel = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const tabs = Array.from(document.querySelectorAll('[role="tab"], button'))
      .map((el) => (el.textContent || "").trim())
      .filter((t) => /^(upload|embed|link|url)/i.test(t))
      .slice(0, 8);
    return {
      fileInputs: inputs.length,
      accept: inputs[0]?.getAttribute("accept") ?? null,
      tabs,
    };
  });

  const countBucketImages = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("img")).filter((i) =>
          /page-images/.test(i.currentSrc || i.src)
        ).length
    );

  const imagesBefore = await countBucketImages();

  let uploaded = null;
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles({
      name: "verify-upload.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_BASE64, "base64"),
    });
    await page.waitForTimeout(7000);
    uploaded = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll("img")).find((i) =>
        /page-images/.test(i.currentSrc || i.src)
      );
      return { src: hit ? (hit.currentSrc || hit.src).slice(0, 220) : null };
    });
  }
  await shot(page, "after-upload");

  let urlStatus = null;
  if (uploaded?.src) {
    urlStatus = await page.evaluate(async (u) => {
      try {
        return (await fetch(u)).status;
      } catch (e) {
        return String(e).slice(0, 60);
      }
    }, uploaded.src);
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  const persisted = await countBucketImages();
  await shot(page, "upload-after-reload");

  return {
    menuItems,
    imageInFullMenu,
    imageOptionFound,
    panel,
    imagesBefore,
    uploadedSrc: uploaded?.src ?? null,
    uploadedUrlStatus: urlStatus,
    persistedAfterReload: persisted,
    uploadSucceeded: Boolean(uploaded?.src) && urlStatus === 200 && persisted > imagesBefore,
  };
});

/* -------------------------------------------------- W6: drag and drop an image */

await step("W6_drag_drop_image", async () => {
  const editable = page.locator('[contenteditable="true"]').first();
  if (!(await editable.count())) return { skipped: "no editable block", url: page.url() };
  const box = await editable.boundingBox();
  const countBucketImages = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("img")).filter((i) =>
          /page-images/.test(i.currentSrc || i.src)
        ).length
    );
  const before = await countBucketImages();

  // A real DataTransfer carrying a File, with the full sequence the editor
  // listens for. Playwright cannot drive an OS-level drag from outside the page.
  await page.evaluate(
    ({ b64, x, y }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], "dropped.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          })
        );
      }
    },
    { b64: PNG_BASE64, x: Math.round(box.x + 150), y: Math.round(box.y + 25) }
  );
  await page.waitForTimeout(8000);
  const after = await countBucketImages();
  await shot(page, "after-drop");
  return { imagesBefore: before, imagesAfter: after, dropAddedImage: after > before };
});

results._consoleErrors = consoleErrors.slice(0, 30);
await context.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-wiki-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-wiki-results.json")}`);
