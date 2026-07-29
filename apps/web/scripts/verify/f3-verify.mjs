/**
 * F3 verification: the three computed-style assertions from the F3 brief,
 * across /tasks, /wiki, /lifeos, /habits, /areas and a project page, in both
 * themes.
 *
 *   1. uppercase count: visible elements with computed text-transform
 *      uppercase, excluding <kbd> (and descendants) and the sanctioned sidebar
 *      section eyebrows, which are marked data-eyebrow="sidebar-section".
 *   2. off-ladder radius count: painted elements with any corner radius off
 *      the ladder {0, 4, 8, 12, 14 grandfathered, 9999/pill, 50%}. Same
 *      LADDER set u11 used, for metric parity with the handover.
 *   3. h1 left: the H1 element's left edge (the H1 contains only the title
 *      text now, so element left == text left). Target 262 everywhere.
 *
 * Run: node f3-verify.mjs
 * Env: APP_URL (default http://localhost:3177), STORAGE (storage state path),
 *      OUT_PREFIX (screenshot prefix, e.g. "after"), OUT_DIR.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3177";
const STORAGE =
  process.env.STORAGE ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-f3-shell/.verify/storage-state.json";
const OUT =
  process.env.OUT_DIR ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/f3";
const PREFIX = process.env.OUT_PREFIX ?? "after";

// 3.35544e+07px is Tailwind v4's computed rounded-full (calc(infinity*1px)).
const LADDER = ["0px", "4px", "8px", "12px", "14px", "9999px", "3.35544e+07px", "50%"];

const PROJECT_ID = "394f8231-a519-5278-8800-df025a9318b5"; // verify-harness:project:thermodynamics
const ROUTES = [
  ["tasks", "/tasks"],
  ["wiki", "/wiki"],
  ["lifeos", "/lifeos"],
  ["habits", "/habits"],
  ["areas", "/areas"],
  ["project", `/projects/${PROJECT_ID}`],
];

function audit(ladder) {
  const LAD = new Set(ladder);
  const issues = { uppercase: [], radius: [] };
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible =
      r.width > 1 && r.height > 1 && cs.display !== "none" && cs.visibility !== "hidden";
    if (!visible) continue;

    if (
      cs.textTransform === "uppercase" &&
      el.tagName !== "KBD" &&
      !el.closest("kbd") &&
      !el.closest('[data-eyebrow="sidebar-section"]')
    ) {
      issues.uppercase.push({
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 40),
        cls: String(el.className).slice(0, 110),
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
          cls: String(el.className).slice(0, 110),
        });
      }
    }
  }
  const h1 = document.querySelector("main h1") ?? document.querySelector("h1");
  return {
    uppercaseCount: issues.uppercase.length,
    radiusCount: issues.radius.length,
    h1Left: h1 ? Math.round(h1.getBoundingClientRect().left) : null,
    h1Text: h1 ? (h1.textContent || "").trim().slice(0, 40) : null,
    uppercase: issues.uppercase.slice(0, 25),
    radius: issues.radius.slice(0, 25),
  };
}

const results = { app: APP, prefix: PREFIX, themes: {} };

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
  const page = await context.newPage();
  results.themes[theme] = {};
  for (const [key, route] of ROUTES) {
    await page.goto(APP + route, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1200); // let motion settle and lazy chrome mount
    const data = await page.evaluate(audit, LADDER);
    results.themes[theme][key] = { route, ...data };
    await page.screenshot({
      path: path.join(OUT, `${PREFIX}-${key}-${theme}.png`),
      fullPage: false,
    });
    console.log(
      `${PREFIX} ${theme} ${route}  uppercase=${data.uppercaseCount} radius=${data.radiusCount} h1Left=${data.h1Left}`
    );
  }
  await context.close();
}
await browser.close();

fs.writeFileSync(
  path.join(OUT, `${PREFIX}-results.json`),
  JSON.stringify(results, null, 2)
);
console.log(`wrote ${path.join(OUT, `${PREFIX}-results.json`)}`);
