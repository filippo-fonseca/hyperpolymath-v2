/**
 * Follow-ups the first surfaces pass could not settle.
 *
 * /tasks is day-scoped, and the harness seeded "today" from UTC while the app
 * derives today from the browser's local zone. On this machine those are
 * different days, so the default board is legitimately empty and every
 * task-row assertion was measuring an empty page rather than a defect. Here the
 * day switcher is advanced to the day the fixtures actually sit on before
 * anything is asserted.
 *
 * Also settles: grouping by Area (the first pass failed to reopen the menu),
 * the project kanban's column geometry, the project list empty-state copy, the
 * tasks-to-captures section gap, the dock habit toggle, and where the JARVIS
 * expand button actually goes.
 *
 * Usage: node final-tasks-followup.mjs
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

const TITLES = [
  "Finish problem set 7",
  "Redo the calibration run",
  "Read Callen chapter 3",
  "Write up the calorimetry lab",
  "Scope the final project",
];

const results = {};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `followup-${name}.png`) });

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

const countTitles = () =>
  ((document.querySelector("main") || document.body).innerText.match(/./s) ? null : null);

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

/** Advance the day switcher until the seeded tasks are on screen (max 3 days). */
async function reachFixtureDay() {
  const seen = async () =>
    page.evaluate(
      (titles) => {
        const t = (document.querySelector("main") || document.body).innerText;
        return titles.filter((x) => t.includes(x)).length;
      },
      TITLES
    );
  let hops = 0;
  let found = await seen();
  const dayLabel = async () =>
    page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /\w+day, \w+ \d+, \d{4}/.test((b.textContent || "").trim())
      );
      return btn ? (btn.textContent || "").trim().slice(0, 40) : null;
    });
  const startLabel = await dayLabel();
  while (found === 0 && hops < 3) {
    const next = page.locator('button[aria-label="Next day"]').first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(2200);
    hops++;
    found = await seen();
  }
  return { hops, titlesVisible: found, startLabel, endLabel: await dayLabel() };
}

/* ------------------------------------------------- T3 revisited, on the right day */

await step("T3_list_and_board_on_fixture_day", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  const reach = await reachFixtureDay();

  const views = {};
  for (const view of ["Board", "List", "Overview"]) {
    const btn = page.getByRole("radio", { name: view }).first();
    if (!(await btn.count())) {
      views[view] = { present: false };
      continue;
    }
    await btn.click();
    await page.waitForTimeout(2200);
    views[view] = await page.evaluate((titles) => {
      const main = document.querySelector("main");
      const text = main ? main.innerText : "";
      return {
        present: true,
        titlesRendered: titles.filter((t) => text.includes(t)).length,
        hasError: /something went wrong|failed to load/i.test(text),
      };
    }, TITLES);
    await shot(page, `tasks-${view.toLowerCase()}`);
  }
  return { reach, views };
});

/* ------------------------------------------- T1 revisited: row click opens panel */

await step("T1_row_click_opens_inline_panel", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  const reach = await reachFixtureDay();
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(2200);

  const before = await page.evaluate(shellState);
  const row = page.getByText("Finish problem set 7", { exact: false }).first();
  const rowPresent = (await row.count()) > 0;
  let after = null;
  if (rowPresent) {
    await row.click();
    await page.waitForTimeout(1800);
    after = await page.evaluate(shellState);
    after.url = page.url();
  }
  await shot(page, "tasks-detail-panel");

  // Close and confirm the dock returns.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1200);
  const restored = await page.evaluate(shellState);

  return {
    reach,
    rowPresent,
    before,
    after,
    restored,
    opensInlinePanel: Boolean(
      after?.panelPresent && after.backdrops === 0 && after.panelPosition === "static"
    ),
    stageResized: Boolean(after && before.cols !== after.cols),
    dockRestored: restored.dockPresent === true && restored.panelPresent === false,
  };
});

/* --------------------------------------------- T2 revisited: group by Area too */

await step("T2_group_by_area", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  await reachFixtureDay();
  await page.getByRole("radio", { name: "List" }).first().click().catch(() => {});
  await page.waitForTimeout(1800);

  const out = {};
  for (const label of ["Project", "Area"]) {
    const groupBtn = page.locator("button", { hasText: /^Group$/ }).first();
    if (!(await groupBtn.count())) {
      out[label] = { groupControlPresent: false };
      continue;
    }
    await groupBtn.click();
    await page.waitForTimeout(900);
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
      const text = main ? main.innerText : "";
      const headers = Array.from(main?.querySelectorAll("h2, h3, [data-group-header]") ?? [])
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12);
      return { optionPresent: true, label: lbl, groupHeaders: headers, grouped: headers.length > 0 };
    }, label);
    await shot(page, `tasks-group-${label.toLowerCase()}`);
  }
  return out;
});

/* ------------------------------------------------- Project page, measured properly */

await step("P_project_page", async () => {
  await page.goto(`${APP}/projects/${PROJECT_ID}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3200);

  await page.locator("button", { hasText: /^Kanban$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2400);
  const kanban = await page.evaluate(() => {
    const main = document.querySelector("main");
    const mainRect = main.getBoundingClientRect();
    // Status columns are the elements whose own heading is a status name.
    const STATUSES = ["Not started", "Up next", "In progress", "Almost done", "Lesno"];
    const heads = Array.from(main.querySelectorAll("button, h2, h3, div")).filter((el) => {
      const t = (el.textContent || "").trim();
      return STATUSES.some((s) => t.startsWith(s)) && t.length < 24 && el.children.length <= 2;
    });
    // The board is the common parent that holds the most of them.
    const parents = new Map();
    for (const h of heads) {
      let n = h;
      for (let i = 0; i < 5 && n.parentElement; i++) {
        n = n.parentElement;
        parents.set(n, (parents.get(n) ?? 0) + 1);
      }
    }
    const board = Array.from(parents.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const br = board ? board.getBoundingClientRect() : null;
    const cols = board
      ? Array.from(board.children).map((c) => {
          const r = c.getBoundingClientRect();
          return { txt: (c.textContent || "").trim().slice(0, 20), w: Math.round(r.width), left: Math.round(r.left) };
        })
      : [];
    return {
      mainLeft: Math.round(mainRect.left),
      mainWidth: Math.round(mainRect.width),
      mainRight: Math.round(mainRect.right),
      statusHeadCount: heads.length,
      boardLeft: br ? Math.round(br.left) : null,
      boardRight: br ? Math.round(br.right) : null,
      boardWidth: br ? Math.round(br.width) : null,
      columns: cols,
      rightmostColumnRight: cols.length ? Math.max(...cols.map((c) => c.left + c.w)) : null,
    };
  });
  await shot(page, "project-kanban");

  await page.locator("button", { hasText: /^List$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2400);
  const list = await page.evaluate(() => {
    const main = document.querySelector("main");
    const text = main ? main.innerText : "";
    // Look for empty-state copy inside the tasks section specifically.
    const idx = text.indexOf("Tasks");
    const window = idx >= 0 ? text.slice(idx, idx + 400) : text.slice(0, 400);
    return {
      tasksSectionText: window,
      hasEmptyStateCopy:
        /no tasks|nothing here|nothing yet|add your first|no open tasks|all clear|nothing to do/i.test(
          window
        ),
    };
  });
  await shot(page, "project-list-empty");

  const gap = await page.evaluate(() => {
    const main = document.querySelector("main");
    const all = Array.from(main.querySelectorAll("*"));
    const header = (re) =>
      all.find((el) => re.test((el.textContent || "").trim()) && el.children.length <= 2);
    const tasksH = header(/^Tasks\s*\d*$/);
    const capturesH = header(/^Captures\s*\d*$/);
    if (!tasksH || !capturesH) return { measured: false };
    // Section = the ancestor of the header that stops just before the next one.
    const sectionOf = (el) => {
      let n = el;
      while (n.parentElement && n.parentElement !== main && n.parentElement.children.length < 3) {
        n = n.parentElement;
      }
      return n.parentElement && n.parentElement !== main ? n.parentElement : n;
    };
    const a = sectionOf(tasksH).getBoundingClientRect();
    const b = capturesH.getBoundingClientRect();
    return {
      measured: true,
      tasksSectionBottom: Math.round(a.bottom),
      capturesHeaderTop: Math.round(b.top),
      gapPx: Math.round(b.top - a.bottom),
    };
  });
  await shot(page, "project-sections");
  return { kanban, kanbanUsesFullWidth: kanban.boardWidth >= kanban.mainWidth * 0.9, list, gap };
});

/* ------------------------------------------------------- Dock habit toggle */

await step("H2_dock_toggle", async () => {
  await page.goto(`${APP}/habits`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2800);
  const pageBefore = await page.evaluate(() => ({
    markDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
    markNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
  }));
  const widget = await page.evaluate(() => {
    const w = document.querySelector('[data-dock-widget-id="habits"]');
    if (!w) return { present: false };
    return {
      present: true,
      text: (w.textContent || "").trim().slice(0, 140),
      buttons: Array.from(w.querySelectorAll("button")).map((b) =>
        (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 40)
      ),
    };
  });

  // Un-complete one from the dock, then check the page and the widget agree.
  let toggled = null;
  const dockBtn = page.locator('[data-dock-widget-id="habits"] button').first();
  if (await dockBtn.count()) {
    await dockBtn.click();
    await page.waitForTimeout(3200);
    toggled = await page.evaluate(() => ({
      pageMarkDone: document.querySelectorAll('button[aria-label="Mark done"]').length,
      pageMarkNotDone: document.querySelectorAll('button[aria-label="Mark not done"]').length,
      widgetText: (
        document.querySelector('[data-dock-widget-id="habits"]')?.textContent || ""
      )
        .trim()
        .slice(0, 140),
    }));
    await shot(page, "habits-dock-toggle");
  }
  return {
    pageBefore,
    widget,
    toggled,
    pageChanged: toggled ? toggled.pageMarkDone !== pageBefore.markDone : null,
  };
});

/* ------------------------------------------------- JARVIS expand destination */

await step("J1_expand_destination", async () => {
  await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2600);
  const before = page.url();
  await page.locator('button[aria-label="Open the full console"]').first().click();
  await page.waitForTimeout(3200);
  const after = await page.evaluate(() => {
    const main = document.querySelector("main");
    const input = document.querySelector('input[aria-label="Ask Kiwi"], textarea');
    const r = main ? main.getBoundingClientRect() : null;
    return {
      url: location.pathname,
      mainHeight: r ? Math.round(r.height) : null,
      viewportH: window.innerHeight,
      composerPresent: Boolean(input),
      composerLabel: input ? input.getAttribute("aria-label") || input.getAttribute("placeholder") : null,
      headingText: (main?.querySelector("h1")?.textContent || "").trim(),
      bodySample: (main?.innerText || "").slice(0, 200),
    };
  });
  await shot(page, "jarvis-expanded");

  // What the rail's JARVIS entry points at, for comparison.
  const railJarvisHref = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] a')).find(
      (x) => /jarvis/i.test(x.textContent || "")
    );
    return a ? a.getAttribute("href") : null;
  });
  return { urlBefore: before, after, railJarvisHref };
});

await context.close();
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-followup-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-followup-results.json")}`);
