/**
 * verify-flowpill-paint.mjs — does the dictation pill actually paint?
 *
 * The overlay window is 440x300 and fully transparent. A pill that renders
 * invisibly and a window that was never shown look exactly the same from
 * outside the process, which is how "I held Option and never saw anything"
 * survived a whole feature's worth of green tests.
 *
 * This loads `flowpill.html` from the running dev server in a real browser
 * engine, drives the machine through the handle the entry point publishes, and
 * reports the pill's geometry, its computed fill, and how many opaque pixels a
 * screenshot over a transparent background actually contains. WebKit is the
 * engine that matters: it is what WKWebView runs, so a rendering difference
 * between it and Chromium would show up here rather than on the user's screen.
 *
 * It deliberately does NOT boot Tauri. Everything downstream of "the DOM
 * painted" (the NSWindow being ordered front, the compositor, the display) is
 * outside a browser's reach and needs the real app.
 *
 * Usage:
 *   pnpm vite --port 1425 --strictPort &
 *   node scripts/verify-flowpill-paint.mjs --base http://localhost:1425
 */

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
// `@playwright/test` rather than `playwright`: it is what the workspace root
// actually installs, and it re-exports the same browser launchers.
const { chromium, webkit } = require("@playwright/test");

const args = process.argv.slice(2);
const readArg = (flag, fallback) => {
  const at = args.indexOf(flag);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const BASE = readArg("--base", "http://localhost:1425");
const OUT = readArg("--out", "");

/** The pill has to be at least this big to be a pill rather than a stray node. */
const MIN_WIDTH = 160;
const MIN_HEIGHT = 40;
/** Below this the surface is see-through and the user sees nothing. */
const MIN_ALPHA = 0.5;

/** Count opaque pixels by handing the screenshot back to a page as a data URL. */
async function countOpaqueViaPage(page, shot) {
  const dataUrl = `data:image/png;base64,${shot.toString("base64")}`;
  return page.evaluate(async (url) => {
    const image = new Image();
    await new Promise((done, fail) => {
      image.onload = done;
      image.onerror = fail;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque += 1;
    return opaque;
  }, dataUrl);
}

async function run() {
  const results = [];
  for (const [engine, name] of [
    [chromium, "chromium"],
    [webkit, "webkit (the engine WKWebView runs)"],
  ]) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 440, height: 300 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${BASE}/flowpill.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__flowpill), null, { timeout: 5_000 });
    await page.evaluate(() => {
      window.__flowpill.dispatch({ type: "invoke", mode: "hold" });
      window.__flowpill.dispatch({ type: "capture-started" });
    });
    await page.waitForSelector(".flowpill", { timeout: 5_000 });
    // The pill fades in. Measuring mid-entrance reports a half-transparent
    // surface, which is a true statement about frame 3 and a false one about
    // whether the user can see it.
    await page.waitForFunction(
      () => {
        const pill = document.querySelector(".flowpill");
        return pill !== null && Number(getComputedStyle(pill).opacity) > 0.99;
      },
      null,
      { timeout: 5_000 },
    );

    const measured = await page.evaluate(() => {
      const pill = document.querySelector(".flowpill");
      const rect = pill.getBoundingClientRect();
      const style = getComputedStyle(pill);
      return {
        status: window.__flowpill.getState().status,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        onScreen:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight,
        opacity: Number(style.opacity),
        visibility: style.visibility,
        fill: style.backgroundImage === "none" ? style.backgroundColor : style.backgroundImage,
        border: `${style.borderTopWidth} ${style.borderTopStyle}`,
        hasWaveform: Boolean(document.querySelector("canvas.flowpill-wave")),
      };
    });

    const shot = await page.screenshot({ omitBackground: true });
    const opaque = await countOpaqueViaPage(page, shot);
    if (OUT) {
      const file = resolve(OUT, `flowpill-${name.split(" ")[0]}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, shot);
    }
    await browser.close();

    const filled =
      measured.fill.includes("gradient") || !/rgba\(0, 0, 0, 0\)/.test(measured.fill);
    // The controller reaches for Tauri the moment it attaches, and there is no
    // Tauri here by design. That one rejection is expected; anything else is a
    // real script error in the overlay's own realm, which is precisely the
    // failure this script is looking for.
    // Chromium and WebKit word the same missing-global rejection differently,
    // so match on either half of it.
    const realErrors = errors.filter(
      (message) =>
        !message.includes("__TAURI_INTERNALS__") && !message.includes("transformCallback"),
    );
    const failures = [];
    if (realErrors.length > 0) failures.push(`page errors: ${realErrors.join("; ")}`);
    if (!measured.onScreen) failures.push("the pill is not inside the window");
    if (measured.width < MIN_WIDTH || measured.height < MIN_HEIGHT) {
      failures.push(`the pill is ${measured.width}x${measured.height}, too small to be a pill`);
    }
    if (measured.opacity < MIN_ALPHA) failures.push(`opacity ${measured.opacity}`);
    if (measured.visibility !== "visible") failures.push(`visibility ${measured.visibility}`);
    if (!filled) failures.push(`no fill: ${measured.fill}`);
    if (!measured.hasWaveform) failures.push("no waveform canvas");
    if (opaque < 1_000) failures.push(`only ${opaque} opaque pixels were painted`);

    results.push({ name, measured, opaque, failures });
  }

  for (const result of results) {
    console.log(`\n=== ${result.name} ===`);
    console.log(JSON.stringify(result.measured, null, 2));
    console.log(`opaque pixels painted: ${result.opaque}`);
    console.log(result.failures.length === 0 ? "PASS" : `FAIL: ${result.failures.join("; ")}`);
  }

  const failed = results.filter((result) => result.failures.length > 0);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

void run();
