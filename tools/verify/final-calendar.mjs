/**
 * The Calendar not-connected indicator, at both viewports, both rail states and
 * both themes: eight combinations, each hit-tested rather than merely queried.
 *
 * The wave-1 integration run found the badge correct in the DOM but sitting
 * below the rail's scroll fold, so `document.querySelector` said "fixed" while
 * the screen said otherwise. Hit-testing the element's own centre through
 * `elementFromPoint`, and separately checking it against the scroll container's
 * visible box, is what distinguishes the two.
 *
 * Usage: node final-calendar.mjs
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

/**
 * The pinned fault row carries `data-slot="gcal-sidebar-alert"`; the dot inside
 * the Calendar nav row carries `data-slot="gcal-status-dot"`. Either being on
 * screen without a scroll satisfies "the disconnect is visible in the rail".
 */
function probe() {
  const results = {};
  for (const slot of ["gcal-sidebar-alert", "gcal-status-dot"]) {
    const el = document.querySelector(`[data-slot="${slot}"]`);
    if (!el) {
      results[slot] = { present: false };
      continue;
    }
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const cs = getComputedStyle(el);

    // Is any ancestor scroll container clipping it?
    let clipped = false;
    let node = el.parentElement;
    while (node) {
      const ncs = getComputedStyle(node);
      if (/(auto|scroll)/.test(ncs.overflowY)) {
        const nr = node.getBoundingClientRect();
        if (r.top < nr.top - 0.5 || r.bottom > nr.bottom + 0.5) clipped = true;
      }
      node = node.parentElement;
    }

    results[slot] = {
      present: true,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height > 0,
      clippedByScrollAncestor: clipped,
      hitTestIsSelf: Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el))),
      hitTestGot: hit ? `${hit.tagName}.${String(hit.className).slice(0, 60)}` : null,
      color: cs.backgroundColor || cs.color,
      ariaLabel: el.getAttribute("aria-label"),
      visible: cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05,
    };
  }
  return results;
}

const results = {};
const browser = await chromium.launch();

for (const [w, h] of [
  [1280, 720],
  [1440, 900],
]) {
  for (const railCollapsed of [false, true]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        storageState: STORAGE,
        viewport: { width: w, height: h },
        colorScheme: theme,
      });
      await context.addInitScript(
        ([t, collapsed]) => {
          try {
            localStorage.setItem("theme", t);
            localStorage.setItem("sidebar-collapsed", String(collapsed));
          } catch {}
        },
        [theme, railCollapsed]
      );
      const page = await context.newPage();
      await page.goto(`${APP}/tasks`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(2200);

      // Scroll position must be untouched: the whole question is whether the
      // signal is on screen *without* scrolling.
      const scrollTops = await page.evaluate(() =>
        Array.from(document.querySelectorAll("*"))
          .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
          .map((el) => el.scrollTop)
      );

      const data = await page.evaluate(probe);
      const key = `${w}x${h}-rail-${railCollapsed ? "collapsed" : "expanded"}-${theme}`;
      results[key] = { ...data, scrollTopsAllZero: scrollTops.every((t) => t === 0) };
      await page.screenshot({ path: path.join(OUT, `calendar-indicator-${key}.png`) });

      const a = data["gcal-sidebar-alert"];
      const d = data["gcal-status-dot"];
      console.log(
        `${key}  alert:${a.present ? `inView=${a.inViewport} clipped=${a.clippedByScrollAncestor} hit=${a.hitTestIsSelf}` : "ABSENT"}` +
          `  dot:${d.present ? `inView=${d.inViewport} clipped=${d.clippedByScrollAncestor}` : "ABSENT"}`
      );
      await context.close();
    }
  }
}

await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-calendar-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-calendar-results.json")}`);
