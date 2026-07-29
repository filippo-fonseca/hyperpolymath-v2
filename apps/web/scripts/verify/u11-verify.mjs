/**
 * u11 verification: drive /habits and the habits dock widget headlessly and
 * assert the acceptance criteria from the jul-28 seed §3 (U11), capturing
 * screenshots in both themes plus reduced motion.
 *
 * Run from the u11 worktree root:
 *   node apps/web/scripts/verify/u11-verify.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3111";
const WORKTREE = "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-u11";
const STORAGE = path.join(WORKTREE, ".verify/storage-state.json");
const OUT =
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/u11";

// 3.35544e+07px is Tailwind v4's computed rounded-full (calc(infinity*1px)):
// the pill rung of the ladder as Chrome reports it.
const LADDER = new Set(["0px", "4px", "8px", "12px", "14px", "9999px", "3.35544e+07px", "50%"]);
const DOCK = '[data-dock-widget-id="habits"]';

const results = { app: APP, routes: {}, checks: [] };
const check = (name, pass, detail) => {
  results.checks.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`
  );
};
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

async function audit(page, route) {
  const data = await page.evaluate((ladder) => {
    const LAD = new Set(ladder);
    const probe = document.createElement("div");
    probe.style.color = "var(--accent)";
    document.body.appendChild(probe);
    const accentRgb = getComputedStyle(probe).color;
    probe.style.color = "var(--sd-accent)";
    const sdAccentRgb = getComputedStyle(probe).color;
    probe.remove();

    // Scope to the surfaces u11 owns: the stage (main) and the habits dock
    // widget. Shell chrome (sidebar, top bar) is U0-owned and read-only for
    // this unit; its violations are recorded separately below.
    const scopes = [
      ...document.querySelectorAll("main"),
      ...document.querySelectorAll('[data-dock-widget-id="habits"]'),
      ...document.querySelectorAll("[role=dialog], [role=alertdialog], [role=menu]"),
    ];
    const owned = new Set();
    for (const s of scopes) {
      owned.add(s);
      for (const el of s.querySelectorAll("*")) owned.add(el);
    }
    // The shell's tab bar (U0-owned, components/shell/TopTabBar.tsx) renders
    // inside <main>; carve it back out of the owned set.
    const tabBar = document.querySelector('[aria-label="App tabs"]');
    if (tabBar) {
      owned.delete(tabBar);
      for (const el of tabBar.querySelectorAll("*")) owned.delete(el);
    }
    const issues = { uppercase: [], radius: [], accentBorders: [], shellUppercase: 0, shellRadius: 0 };
    for (const el of document.querySelectorAll("*")) {
      const mine = owned.has(el);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible =
        r.width > 1 && r.height > 1 && cs.display !== "none" && cs.visibility !== "hidden";
      if (!visible) continue;

      if (cs.textTransform === "uppercase" && el.tagName !== "KBD" && !el.closest("kbd")) {
        if (mine) {
          issues.uppercase.push({
            tag: el.tagName,
            text: (el.textContent || "").trim().slice(0, 40),
            cls: String(el.className).slice(0, 120),
          });
        } else {
          issues.shellUppercase += 1;
        }
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
          if (mine) {
            issues.radius.push({
              tag: el.tagName,
              radius: bad,
              cls: String(el.className).slice(0, 120),
            });
          } else {
            issues.shellRadius += 1;
          }
        }
      }

      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        if (
          mine &&
          parseFloat(cs[`border${side}Width`]) > 0 &&
          (cs[`border${side}Color`] === accentRgb || cs[`border${side}Color`] === sdAccentRgb)
        ) {
          issues.accentBorders.push({
            tag: el.tagName,
            side,
            cls: String(el.className).slice(0, 120),
          });
          break;
        }
      }
    }

    const h1 = document.querySelector("h1");
    return { issues, h1Left: h1 ? Math.round(h1.getBoundingClientRect().left) : null };
  }, [...LADDER]);
  results.routes[route] = data;
  return data;
}

/** Day-list rows on the page: CheckCircle buttons inside <main> (the
 * aria-label filter excludes the TopTabBar's aria-pressed tab buttons). */
const dayRows = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'main button[aria-label="Mark done"], main button[aria-label="Mark not done"]'
      ),
    ].map((b) => ({
      pressed: b.getAttribute("aria-pressed") === "true",
      row: (b.closest("div[class]")?.parentElement?.textContent || "").slice(0, 80),
    }))
  );

/** Click a day-list check by habit name and measure the optimistic flip. */
function flipTimed(page, scope, habitName) {
  return page.evaluate(
    ({ scope, habitName }) => {
      const root = scope ? document.querySelector(scope) : document.querySelector("main");
      // Dock rows are themselves buttons carrying the habit name; page
      // CheckCircles are icon-only, so fall back to their own row wrapper.
      const btns = [...root.querySelectorAll("button[aria-pressed]")];
      const btn =
        btns.find((b) => (b.textContent || "").includes(habitName)) ??
        btns.find((b) =>
          (b.closest("div")?.parentElement?.textContent || "").includes(habitName)
        );
      if (!btn) return Promise.resolve({ error: `no row for ${habitName}` });
      const want = btn.getAttribute("aria-pressed") !== "true";
      return new Promise((resolve) => {
        const t0 = performance.now();
        const obs = new MutationObserver(() => {
          if ((btn.getAttribute("aria-pressed") === "true") === want) {
            obs.disconnect();
            resolve({ ms: performance.now() - t0, to: want });
          }
        });
        obs.observe(btn, { attributes: true, attributeFilter: ["aria-pressed"] });
        btn.click();
        setTimeout(() => {
          obs.disconnect();
          resolve({ ms: -1, to: want });
        }, 3000);
      });
    },
    { scope, habitName }
  );
}

/**
 * Record habit-relevant traffic for `windowMs` around an action. Other dock
 * widgets also POST server actions to the current URL, so raw POST counts are
 * meaningless; classify by the action's serialized argument shape instead:
 *   toggle  — body carries {"completed":true|false}
 *   range   — getHabitCompletionsInRange(iso, iso): body has two ISO dates
 *   meta    — getHabitDockToday(iso): body has exactly one ISO date
 */
async function withNetLog(page, windowMs, action) {
  const log = { toggle: 0, range: 0, meta: 0, otherPost: 0, rscGet: 0 };
  const onReq = (req) => {
    const url = req.url();
    if (!url.startsWith(APP)) return;
    if (req.method() === "POST") {
      const body = req.postData() ?? "";
      if (/"completed":(true|false)/.test(body)) log.toggle += 1;
      else if (/"\d{4}-\d{2}-\d{2}","\d{4}-\d{2}-\d{2}"/.test(body)) log.range += 1;
      else if (/\["\d{4}-\d{2}-\d{2}"\]/.test(body)) log.meta += 1;
      else log.otherPost += 1;
    } else if (req.method() === "GET" && (url.includes("_rsc=") || req.headers().rsc === "1")) {
      log.rscGet += 1;
    }
  };
  page.on("request", onReq);
  await action();
  await page.waitForTimeout(windowMs);
  page.off("request", onReq);
  return log;
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      storageState: STORAGE,
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);

    await page.goto(`${APP}/habits`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, `habits-remaining-${theme}`);

    // ── Design contract audits ─────────────────────────────────────────
    const a = await audit(page, `/habits(${theme})`);
    check(`[${theme}] /habits uppercase=0`, a.issues.uppercase.length === 0, a.issues.uppercase.slice(0, 6));
    check(`[${theme}] /habits off-ladder radius=0`, a.issues.radius.length === 0, a.issues.radius.slice(0, 6));
    check(`[${theme}] /habits accent borders=0`, a.issues.accentBorders.length === 0, a.issues.accentBorders.slice(0, 6));

    // ── Glanceable header stats, no interaction ────────────────────────
    const stats = await page.evaluate(() => ({
      remaining: document.querySelector("[data-habits-remaining]")?.textContent ?? null,
      streak: document.querySelector("[data-habits-streak]")?.textContent ?? null,
      rate: document.querySelector("[data-habits-rate]")?.textContent ?? null,
    }));
    check(`[${theme}] header remaining text`, stats.remaining === "1 of 3 left today", stats.remaining);
    check(`[${theme}] header streak text (21 > 14 cap)`, stats.streak === "Best streak 21 days", stats.streak);
    check(`[${theme}] header rate text`, /\d+% over 28 days/.test(stats.rate ?? ""), stats.rate);

    // ── Schedule filter: drill absent from day list, denominator 3 ─────
    const rows = await dayRows(page);
    check(
      `[${theme}] day list = 3 scheduled habits, no Tomorrow-only drill`,
      rows.length === 3 && !rows.some((r) => r.row.includes("Tomorrow-only drill")),
      rows.map((r) => r.row.slice(0, 30))
    );

    // ── Day-1 streak: Journal (first-ever completion today) shows 1 ────
    const journalRow = rows.find((r) => r.row.includes("Journal"));
    check(`[${theme}] Journal day-1 streak chip visible`, /Journal.*1/.test(journalRow?.row ?? ""), journalRow?.row);

    // ── Dock widget: present, same numbers, no drill ───────────────────
    const dockState = await page.evaluate((sel) => {
      const w = document.querySelector(sel);
      if (!w) return null;
      return {
        stats: w.querySelector("p")?.textContent ?? "",
        rows: [...w.querySelectorAll("button[aria-pressed]")].map((b) => ({
          pressed: b.getAttribute("aria-pressed") === "true",
          text: (b.textContent || "").slice(0, 60),
        })),
      };
    }, DOCK);
    check(`[${theme}] dock widget rendered at 1440x900`, dockState !== null, dockState?.stats);
    check(
      `[${theme}] dock stats agree (1 of 3 left, best 21)`,
      (dockState?.stats ?? "").includes("1 of 3 left") && (dockState?.stats ?? "").includes("best 21"),
      dockState?.stats
    );
    check(
      `[${theme}] dock rows: 3 scheduled, Read streak 21 = page`,
      dockState?.rows.length === 3 &&
        dockState.rows.some((r) => r.text.includes("Read") && r.text.includes("21")) &&
        !dockState.rows.some((r) => r.text.includes("Tomorrow-only drill")),
      dockState?.rows
    );

    if (theme === "light") {
      // ── One-click optimistic toggle: <100ms flip, 1 refetch, 0 RSC ───
      let flip;
      const net = await withNetLog(page, 5000, async () => {
        flip = await flipTimed(page, null, "Run");
      });
      check(`[light] Run flips optimistically <100ms`, flip.ms >= 0 && flip.ms < 100, `${flip.ms?.toFixed(1)}ms`);
      check(
        `[light] toggle = 1 action + exactly 1 completions refetch`,
        net.toggle === 1 && net.range === 1,
        net
      );
      check(`[light] toggle = zero RSC document GETs`, net.rscGet === 0, net.rscGet);

      await page.waitForTimeout(500);
      const doneStats = await page.evaluate(
        () => document.querySelector("[data-habits-remaining]")?.textContent
      );
      check(`[light] finished header reads All 3 done today`, doneStats === "All 3 done today", doneStats);
      await shot(page, "habits-finished-light");

      // Dock canonical state lands with the echo refetch; poll briefly.
      await page
        .waitForFunction(
          (sel) => (document.querySelector(sel)?.textContent ?? "").includes("All 3 done"),
          DOCK,
          { timeout: 6000 }
        )
        .catch(() => {});
      const dockDone = await page.evaluate(
        (sel) => document.querySelector(sel)?.textContent ?? "",
        DOCK
      );
      check(
        `[light] dock terminal state`,
        dockDone.includes("All 3 done") && dockDone.includes("Done for today"),
        dockDone.slice(0, 120)
      );
      const dockEl = page.locator(DOCK);
      await dockEl.screenshot({ path: path.join(OUT, "dock-finished-light.png") });

      // Streak parity after toggle: Run goes to 2 on page and dock alike.
      const runPage = (await dayRows(page)).find((r) => r.row.includes("Run"));
      const runDock = await page.evaluate((sel) => {
        const b = [...document.querySelectorAll(`${sel} button[aria-pressed]`)].find((x) =>
          (x.textContent || "").includes("Run")
        );
        return b?.textContent ?? "";
      }, DOCK);
      check(
        `[light] Run streak 2 on page and dock after toggle`,
        /Run.*2/.test(runPage?.row ?? "") && /Run.*2/.test(runDock),
        { page: runPage?.row, dock: runDock }
      );

      // Restore: un-toggle Run from the page.
      await flipTimed(page, null, "Run");
      await page.waitForTimeout(1200);

      // ── Dock expanded: 7-day trails ──────────────────────────────────
      await page.getByRole("button", { name: "Expand Habits" }).click();
      await page.waitForTimeout(900);
      await dockEl.screenshot({ path: path.join(OUT, "dock-expanded-light.png") });
      const expandedOk = await page.evaluate(
        (sel) => (document.querySelector(sel)?.textContent ?? "").includes("Open habits"),
        DOCK
      );
      check(`[light] dock Expanded renders (Open habits link)`, expandedOk, null);
      await page.getByRole("button", { name: "Collapse Habits" }).click();
      await page.waitForTimeout(400);

      // ── Dock toggle syncs a second tab without reload ────────────────
      const page2 = await ctx.newPage();
      await page2.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page2.goto(`${APP}/habits`, { waitUntil: "networkidle" });
      await page2.waitForTimeout(1000);
      let page2Navigated = false;
      page2.on("framenavigated", () => {
        page2Navigated = true;
      });

      let dockFlip;
      const dockNet = await withNetLog(page, 5000, async () => {
        dockFlip = await flipTimed(page, DOCK, "Run");
      });
      check(`[light] dock toggle flips optimistically <100ms`, dockFlip.ms >= 0 && dockFlip.ms < 100, `${dockFlip.ms?.toFixed(1)}ms`);
      check(
        `[light] dock toggle = 1 action + 1 shared refetch (no second key)`,
        dockNet.toggle === 1 && dockNet.range === 1,
        dockNet
      );

      // page (same tab) reflects it once canonical lands: shared cache entry.
      const samePageOk = await page
        .waitForFunction(
          () => {
            const b = [
              ...document.querySelectorAll(
                'main button[aria-label="Mark done"], main button[aria-label="Mark not done"]'
              ),
            ].find((x) => (x.closest("div")?.parentElement?.textContent || "").includes("Run"));
            return b?.getAttribute("aria-pressed") === "true";
          },
          { timeout: 6000 }
        )
        .then(() => true)
        .catch(() => false);
      check(`[light] page day row reflects dock toggle (same tab)`, samePageOk, null);

      // second tab catches up via realtime, no reload.
      const page2Ok = await page2
        .waitForFunction(
          () =>
            document.querySelector("[data-habits-remaining]")?.textContent ===
            "All 3 done today",
          { timeout: 10000 }
        )
        .then(() => true)
        .catch(() => false);
      check(`[light] second tab reflects dock toggle without reload`, page2Ok && !page2Navigated, {
        page2Ok,
        navigated: page2Navigated,
      });
      await page2.close();

      // Restore Run to unchecked.
      await flipTimed(page, DOCK, "Run");
      await page.waitForTimeout(1200);

      // ── Create appears without realtime; delete needs confirmation ──
      const page3 = await ctx.newPage();
      // Block only the Supabase realtime socket (a blanket ws block also
      // swallows turbopack's dev runtime socket and breaks the page).
      await page3.routeWebSocket(/realtime\/v1/, () => {
        /* swallow: no realtime echo on this page */
      });
      await page3.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page3.goto(`${APP}/habits`, { waitUntil: "networkidle" });
      await page3.waitForTimeout(800);

      await page3.getByRole("button", { name: "New habit" }).click();
      await page3.getByPlaceholder("Run, read, meditate…").fill("U11 probe habit");
      await page3.getByRole("button", { name: "Add habit" }).click();
      let created = true;
      await page3
        .waitForFunction(
          () => document.body.textContent?.includes("U11 probe habit"),
          { timeout: 5000 }
        )
        .catch(() => {
          created = false;
        });
      check(`[light] created habit appears with realtime blocked`, created, null);

      // Single click on Delete does NOT remove; confirmation dialog gates it.
      // The habit appears in both the day list and the manage list; only the
      // manage row carries the options kebab.
      const probeRow = page3
        .locator("li", { has: page3.getByText("U11 probe habit") })
        .filter({ has: page3.getByRole("button", { name: "Habit options" }) })
        .first();
      await probeRow.getByRole("button", { name: "Habit options" }).click();
      await page3.getByRole("menuitem", { name: "Delete" }).click();
      await page3.waitForTimeout(600);
      const dialogUp = await page3.getByText("Delete habit?").isVisible().catch(() => false);
      const stillThere = await page3
        .locator("main")
        .evaluate((el) => el.textContent?.includes("U11 probe habit"));
      check(`[light] delete gated by confirmation dialog`, dialogUp && stillThere, {
        dialogUp,
        stillThere,
      });
      await page3.getByRole("button", { name: "Delete habit" }).click();
      let gone = true;
      await page3
        .waitForFunction(() => !document.body.textContent?.includes("U11 probe habit"), {
          timeout: 5000,
        })
        .catch(() => {
          gone = false;
        });
      check(`[light] confirmed delete removes the habit`, gone, null);
      await page3.close();

      // ── H1 left edges across routes ──────────────────────────────────
      const edges = {};
      for (const r of ["/tasks", "/areas", "/wiki", "/lifeos", "/habits"]) {
        await page.goto(`${APP}${r}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1800);
        edges[r] = await page.evaluate(() => {
          const h1 = document.querySelector("h1");
          if (!h1) return null;
          return {
            h1: Math.round(h1.getBoundingClientRect().left),
            // The measure that §2.9 says must line up: the title row / scaffold
            // container edge (the H1 itself sits 44px in when the spec's icon
            // slot is used: size-8 box + gap-3).
            row: Math.round(h1.parentElement.getBoundingClientRect().left),
          };
        });
      }
      results.routes["h1-edges"] = edges;
      check(
        `[light] /habits scaffold measure matches /tasks H1 edge (262)`,
        edges["/habits"] !== null && edges["/habits"].row === edges["/tasks"].h1,
        edges
      );
      check(
        `[light] /habits H1 left == /tasks H1 left (literal criterion)`,
        edges["/habits"] !== null && edges["/habits"].h1 === edges["/tasks"].h1,
        {
          note: "H1 sits at container+44 per the §2.9 icon anatomy; /tasks has not adopted PageScaffold yet",
          ...edges,
        }
      );
    }

    if (theme === "dark") {
      // Finished-state screenshots in dark, then restore.
      await flipTimed(page, null, "Run");
      await page.waitForTimeout(800);
      await shot(page, "habits-finished-dark");
      await page.locator(DOCK).screenshot({ path: path.join(OUT, "dock-finished-dark.png") });
      await flipTimed(page, null, "Run");
      await page.waitForTimeout(1000);

      await page.getByRole("button", { name: "Expand Habits" }).click();
      await page.waitForTimeout(900);
      await page.locator(DOCK).screenshot({ path: path.join(OUT, "dock-expanded-dark.png") });
      await page.getByRole("button", { name: "Collapse Habits" }).click();
      await page.locator(DOCK).screenshot({ path: path.join(OUT, "dock-compact-dark.png") });
    } else {
      await page.locator(DOCK).screenshot({ path: path.join(OUT, "dock-compact-light.png") });
    }

    await ctx.close();
  }

  // ── Reduced motion ───────────────────────────────────────────────────
  const rmCtx = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const rmPage = await rmCtx.newPage();
  await rmPage.addInitScript(() => localStorage.setItem("theme", "light"));
  await rmPage.goto(`${APP}/habits`, { waitUntil: "networkidle" });
  await rmPage.waitForTimeout(1200);
  await shot(rmPage, "habits-reduced-motion");
  await rmCtx.close();

  await browser.close();

  fs.writeFileSync(path.join(OUT, "u11-verify-results.json"), JSON.stringify(results, null, 2));
  const failed = results.checks.filter((c) => !c.pass);
  console.log(`\n${results.checks.length - failed.length}/${results.checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
