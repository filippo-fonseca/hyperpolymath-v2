/**
 * The remaining defects Filippo reported: Tasks, Projects, Habits, LifeOS and
 * the JARVIS command bar.
 *
 *   T1  the task detail opens as an inline panel that resizes the stage
 *   T2  tasks can be segmented by Project and by Area
 *   T3  list and kanban both work
 *   P1  the project kanban board uses the full width rather than hugging left
 *   P2  the project list view with zero tasks shows an empty state
 *   P3  no large vertical gap between the tasks section and captures
 *   H1  marking today's habit done is one tap and optimistic
 *   H2  the habits dock widget works and agrees with the page
 *   L1  the LifeOS background video plays, is muted, loops, and falls back to a
 *       static frame under prefers-reduced-motion
 *   J1  the JARVIS command bar is pinned to the bottom of the stage and expands
 *       to the full page
 *
 * Selectors come from probe-surfaces.mjs and the components themselves: the
 * view switcher is role=radio Board/List/Overview, grouping is the "Group"
 * dropdown, habit toggles carry aria-label "Mark done"/"Mark not done", and the
 * command bar is input[aria-label="Ask Kiwi"] with a sibling
 * button[aria-label="Open the full console"].
 *
 * Usage: node final-surfaces.mjs
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
const PROJECT_ID = "394f8231-a519-5278-8800-df025a9318b5";

const results = {};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `surface-${name}.png`) });

async function step(name, fn) {
  try {
    results[name] = await fn();
  } catch (err) {
    results[name] = { error: String(err).slice(0, 400) };
  }
  console.log(`${name}: ${JSON.stringify(results[name]).slice(0, 300)}`);
}

/** Panel + dock + grid state, same markers the cockpit probe uses. */
function shellState() {
  const rootGrid = Array.from(document.querySelectorAll("div")).find(
    (el) =>
      getComputedStyle(el).display === "grid" &&
      el.getBoundingClientRect().width >= window.innerWidth - 4
  );
  const panel = document.querySelector('[role="complementary"]');
  const dock = document.querySelector("[data-dock]");
  return {
    cols: rootGrid ? getComputedStyle(rootGrid).gridTemplateColumns : null,
    panelPresent: Boolean(panel),
    panelPosition: panel ? getComputedStyle(panel).position : null,
    panelShadow: panel ? getComputedStyle(panel).boxShadow : null,
    dockPresent: Boolean(dock),
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

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 180)));
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 180)}`));

/* =============================================================== TASKS */

await step("T3_list_and_board", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);

  const views = {};
  for (const view of ["Board", "List", "Overview"]) {
    const btn = page.getByRole("radio", { name: view }).first();
    if (!(await btn.count())) {
      views[view] = { present: false };
      continue;
    }
    await btn.click();
    await page.waitForTimeout(2200);
    views[view] = await page.evaluate(() => {
      const main = document.querySelector("main");
      const text = main ? main.innerText : "";
      return {
        present: true,
        renderedTaskTitles: [
          "Finish problem set 7",
          "Redo the calibration run",
          "Read Callen chapter 3",
          "Write up the calorimetry lab",
          "Scope the final project",
        ].filter((t) => text.includes(t)).length,
        mainHeight: main ? Math.round(main.getBoundingClientRect().height) : null,
        hasError: /something went wrong|failed to load/i.test(text),
      };
    });
    await shot(page, `tasks-${view.toLowerCase()}`);
  }
  return views;
});

await step("T2_group_by_project_and_area", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(1800);

  const groupBtn = page.locator("button", { hasText: /^Group$/ }).first();
  if (!(await groupBtn.count())) return { groupControlPresent: false };
  await groupBtn.click();
  await page.waitForTimeout(900);
  const options = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'))
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 20)
  );
  await shot(page, "tasks-group-menu");

  const applied = {};
  for (const label of ["Project", "Area"]) {
    const opt = page
      .locator('[role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: new RegExp(`^${label}$`, "i") })
      .first();
    if (!(await opt.count())) {
      applied[label] = { optionPresent: false };
      // Reopen the menu for the next label.
      await page.keyboard.press("Escape").catch(() => {});
      await groupBtn.click().catch(() => {});
      await page.waitForTimeout(700);
      continue;
    }
    await opt.click();
    await page.waitForTimeout(2500);
    applied[label] = await page.evaluate((lbl) => {
      const main = document.querySelector("main");
      const text = main ? main.innerText : "";
      // A grouped list renders group headers; ungrouped renders none.
      const headers = Array.from(main?.querySelectorAll("h2, h3, [data-group-header]") ?? [])
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12);
      return {
        optionPresent: true,
        label: lbl,
        groupHeaders: headers,
        mentionsAcademics: text.includes("Academics"),
        mentionsThermo: text.includes("Thermodynamics"),
        mentionsNoProject: /no project|unassigned|none/i.test(text),
      };
    }, label);
    await shot(page, `tasks-group-${label.toLowerCase()}`);
    await groupBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.keyboard.press("Escape").catch(() => {});
  return { groupControlPresent: true, options, applied };
});

await step("T1_detail_inline_panel_by_row_click", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(2200);

  const before = await page.evaluate(shellState);
  const row = page.getByText("Finish problem set 7", { exact: false }).first();
  const rowPresent = (await row.count()) > 0;
  let afterRowClick = null;
  if (rowPresent) {
    await row.click();
    await page.waitForTimeout(1600);
    afterRowClick = await page.evaluate(shellState);
    afterRowClick.url = page.url();
  }
  await shot(page, "tasks-detail-panel");
  return {
    rowPresent,
    before,
    afterRowClick,
    opensInlinePanel: Boolean(
      afterRowClick?.panelPresent &&
        afterRowClick.backdrops === 0 &&
        afterRowClick.panelPosition === "static"
    ),
    stageResized: before.cols !== afterRowClick?.cols,
  };
});

/* ============================================================ PROJECTS */

await step("P1_P2_P3_project_page", async () => {
  await page.goto(`${APP}/projects/${PROJECT_ID}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);

  // Kanban width: how much of the stage the board actually occupies.
  await page.locator("button", { hasText: /^Kanban$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2200);
  const kanban = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const mainRect = main.getBoundingClientRect();
    // The board is the widest horizontal flex/grid row of status columns.
    const cols = Array.from(main.querySelectorAll("div")).filter((el) =>
      /not started|up next|in progress|almost done/i.test((el.textContent || "").slice(0, 60))
    );
    const board = cols
      .map((c) => c.parentElement)
      .filter(Boolean)
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const boardRect = board ? board.getBoundingClientRect() : null;
    const colRects = board
      ? Array.from(board.children).map((c) => {
          const r = c.getBoundingClientRect();
          return { w: Math.round(r.width), left: Math.round(r.left) };
        })
      : [];
    return {
      mainLeft: Math.round(mainRect.left),
      mainRight: Math.round(mainRect.right),
      mainWidth: Math.round(mainRect.width),
      boardLeft: boardRect ? Math.round(boardRect.left) : null,
      boardRight: boardRect ? Math.round(boardRect.right) : null,
      boardWidth: boardRect ? Math.round(boardRect.width) : null,
      columnCount: colRects.length,
      columns: colRects,
    };
  });
  await shot(page, "project-kanban");

  // Empty list view.
  await page.locator("button", { hasText: /^List$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2200);
  const list = await page.evaluate(() => {
    const main = document.querySelector("main");
    const text = main ? main.innerText : "";
    return {
      text: text.slice(0, 1200),
      hasEmptyStateCopy:
        /no tasks|nothing here|nothing yet|add your first|empty|all clear|no results/i.test(text),
    };
  });
  await shot(page, "project-list-empty");

  // Vertical gap between the tasks section and the captures section.
  const gap = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const nodes = Array.from(main.querySelectorAll("*"));
    const find = (re) =>
      nodes.filter((el) => {
        const t = (el.textContent || "").trim();
        return re.test(t.slice(0, 30)) && el.getBoundingClientRect().height > 0;
      });
    const tasksHeader = find(/^Tasks\s*\d*$/)[0];
    const capturesHeader = find(/^Captures\s*\d*$/)[0];
    if (!tasksHeader || !capturesHeader) return { measured: false };
    // Climb to each header's section so the gap is section-to-section.
    const sectionOf = (el) => {
      let n = el;
      for (let i = 0; i < 6 && n.parentElement; i++) {
        n = n.parentElement;
        if (n.getBoundingClientRect().height > el.getBoundingClientRect().height * 1.5) break;
      }
      return n;
    };
    const a = sectionOf(tasksHeader).getBoundingClientRect();
    const b = sectionOf(capturesHeader).getBoundingClientRect();
    return {
      measured: true,
      tasksSectionBottom: Math.round(a.bottom),
      capturesSectionTop: Math.round(b.top),
      gapPx: Math.round(b.top - a.bottom),
    };
  });
  await shot(page, "project-sections");

  return {
    kanban,
    kanbanUsesFullWidth:
      kanban && kanban.boardWidth != null
        ? kanban.boardWidth >= kanban.mainWidth * 0.9
        : null,
    listEmptyState: list.hasEmptyStateCopy,
    listText: list.text.slice(0, 400),
    sectionGap: gap,
  };
});

/* ============================================================== HABITS */

await step("H1_one_tap_optimistic", async () => {
  await page.goto(`${APP}/habits`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);

  const markDone = page.locator('button[aria-label="Mark done"]').first();
  const count = await markDone.count();
  if (!count) return { markDoneButtons: 0, note: "all habits already done today" };

  await shot(page, "habits-before-tap");
  const t0 = Date.now();
  await markDone.click();

  // Optimistic = the control flips before the server round trip settles.
  let flippedAfterMs = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(25);
    const flipped = await page
      .evaluate(() => document.querySelectorAll('button[aria-label="Mark done"]').length)
      .catch(() => null);
    if (flipped !== null && flipped < count) {
      flippedAfterMs = Date.now() - t0;
      break;
    }
  }
  await page.waitForTimeout(2500);
  const afterSettle = await page.evaluate(() => ({
    markDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
    markNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
  }));
  await shot(page, "habits-after-tap");

  // Survives a reload: the optimistic flip was backed by a real write.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const afterReload = await page.evaluate(() => ({
    markDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
    markNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
  }));

  return {
    markDoneButtonsBefore: count,
    tapsRequired: 1,
    flippedAfterMs,
    optimistic: flippedAfterMs !== null && flippedAfterMs < 400,
    afterSettle,
    afterReload,
    persisted: afterReload.markDone === afterSettle.markDone,
  };
});

await step("H2_dock_widget_agrees_with_page", async () => {
  await page.goto(`${APP}/habits`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  const pageState = await page.evaluate(() => ({
    markDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
    markNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
  }));

  const dock = await page.evaluate(() => {
    const d = document.querySelector("[data-dock]");
    if (!d) return { present: false };
    const widget = Array.from(d.querySelectorAll("[data-dock-widget-id]")).find(
      (w) => (w.getAttribute("data-dock-widget-id") || "").includes("habit")
    );
    return {
      present: true,
      widgetIds: Array.from(d.querySelectorAll("[data-dock-widget-id]")).map((w) =>
        w.getAttribute("data-dock-widget-id")
      ),
      habitWidgetPresent: Boolean(widget),
      habitWidgetText: widget ? (widget.textContent || "").trim().slice(0, 120) : null,
      habitWidgetButtons: widget ? widget.querySelectorAll("button").length : 0,
    };
  });
  await shot(page, "habits-dock-widget");

  // Toggle from the dock and check the page agrees.
  let dockToggle = null;
  if (dock.habitWidgetPresent) {
    const before = pageState.markDone;
    const btn = page
      .locator('[data-dock-widget-id*="habit"] button')
      .filter({ hasNotText: /all|→/ })
      .first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(3000);
      const after = await page.evaluate(() => ({
        markDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
        markNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
      }));
      dockToggle = { pageMarkDoneBefore: before, pageAfter: after, changed: after.markDone !== before };
      await shot(page, "habits-after-dock-toggle");
    }
  }
  return { pageState, dock, dockToggle };
});

/* ============================================================== LIFEOS */

await step("L1_lifeos_video", async () => {
  await page.goto(`${APP}/lifeos`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(4000);
  const motion = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return { videoPresent: false };
    return {
      videoPresent: true,
      muted: v.muted,
      loop: v.loop,
      paused: v.paused,
      readyState: v.readyState,
      currentTime: v.currentTime,
      src: (v.currentSrc || v.src).split("/").pop(),
      poster: (v.poster || "").split("/").pop(),
      preload: v.preload,
    };
  });
  await page.waitForTimeout(1500);
  const advanced = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? v.currentTime : null;
  });
  await shot(page, "lifeos-video");
  return { motion, currentTimeAdvanced: advanced != null && advanced > motion.currentTime };
});

await step("L1b_reduced_motion_fallback", async () => {
  const rmContext = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const rmPage = await rmContext.newPage();
  await rmPage.goto(`${APP}/lifeos`, { waitUntil: "networkidle", timeout: 60_000 });
  await rmPage.waitForTimeout(4000);
  const data = await rmPage.evaluate(() => ({
    prefersReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    videoPresent: Boolean(document.querySelector("video")),
    posterImg: Array.from(document.querySelectorAll("img"))
      .map((i) => (i.currentSrc || i.src).split("/").pop())
      .filter((s) => /space-poster/.test(s)),
  }));
  await rmPage.screenshot({ path: path.join(OUT, "surface-lifeos-reduced-motion.png") });
  await rmContext.close();
  return {
    ...data,
    fallsBackToStaticFrame: data.prefersReduced && !data.videoPresent && data.posterImg.length > 0,
  };
});

/* ============================================================== JARVIS */

await step("J1_command_bar", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  const bar = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Ask Kiwi"]');
    if (!input) return { present: false };
    // The bar is the input's nearest bordered container inside the stage.
    let barEl = input;
    for (let i = 0; i < 6 && barEl.parentElement; i++) {
      barEl = barEl.parentElement;
      if (getComputedStyle(barEl).borderTopWidth !== "0px") break;
    }
    const r = barEl.getBoundingClientRect();
    const stage = barEl.closest("main")?.parentElement ?? document.querySelector("main")?.parentElement;
    const sr = stage ? stage.getBoundingClientRect() : null;
    const expand = document.querySelector('button[aria-label="Open the full console"]');
    return {
      present: true,
      placeholder: input.getAttribute("placeholder"),
      barRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
      stageRect: sr ? { bottom: Math.round(sr.bottom), left: Math.round(sr.left), right: Math.round(sr.right) } : null,
      viewportH: window.innerHeight,
      position: getComputedStyle(barEl).position,
      expandButtonPresent: Boolean(expand),
    };
  });
  await shot(page, "jarvis-bar");

  let expanded = null;
  const expandBtn = page.locator('button[aria-label="Open the full console"]').first();
  if (await expandBtn.count()) {
    await expandBtn.click();
    await page.waitForTimeout(3000);
    expanded = { url: page.url() };
    expanded.fullPage = await page.evaluate(() => {
      const main = document.querySelector("main");
      const r = main ? main.getBoundingClientRect() : null;
      return {
        mainHeight: r ? Math.round(r.height) : null,
        viewportH: window.innerHeight,
        hasConsole: /jarvis|kiwi/i.test(document.body.innerText.slice(0, 4000)),
      };
    });
    await shot(page, "jarvis-expanded");
  }

  const pinnedToStageBottom =
    bar.present && bar.stageRect ? Math.abs(bar.barRect.bottom - bar.stageRect.bottom) <= 2 : null;

  return { bar, pinnedToStageBottom, expanded };
});

results._consoleErrors = consoleErrors.slice(0, 40);
await context.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-surfaces-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-surfaces-results.json")}`);
