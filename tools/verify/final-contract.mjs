/**
 * Final-integration contract probe.
 *
 * Companion to `apps/web/scripts/verify/f3-verify.mjs`, which already owns the
 * three shell assertions (uppercase, off-ladder radius, H1 left edge) and is
 * reused unchanged so the numbers stay comparable with F3's. This script covers
 * the parts of SDC-1 that F3 does not measure, plus console and network
 * hygiene, in one pass per route per theme:
 *
 *   - the dark canvas token (--canvas and --sd-app) is not near-black
 *   - body ink over canvas at the calmed ratios (light ~12.4, dark ~12.7)
 *   - uncaught page errors, console errors, failed requests
 *   - React key warnings and hydration warnings, matched on console text
 *
 * Usage: node final-contract.mjs
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

const PROJECT_ID = "394f8231-a519-5278-8800-df025a9318b5"; // verify-harness:project:thermodynamics
const ROUTES = [
  ["tasks", "/tasks"],
  ["wiki", "/wiki"],
  ["lifeos", "/lifeos"],
  ["habits", "/habits"],
  ["areas", "/areas"],
  ["project", `/projects/${PROJECT_ID}`],
];

/** sRGB relative luminance, WCAG 2.x. */
function luminance([r, g, b]) {
  const lin = [r, g, b]
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function parseRgb(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2]];
}
function hex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Read the tokens and the painted body colours from the live document. */
function readTokens() {
  // The tokens are authored in oklch, and Chromium serialises computed colour
  // as `lab(...)`, which no naive rgb() regex can read. Rasterising each colour
  // through a 2d canvas returns the exact sRGB bytes the screen receives, which
  // is also the only honest input to a WCAG ratio.
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const toRgb = (css) => {
    if (!css) return null;
    try {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "#000000";
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    } catch {
      return null;
    }
  };
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bodyCs = getComputedStyle(document.body);
  // The canvas the body actually paints on: walk up from <main> to the first
  // ancestor with a non-transparent background, so we compare ink against what
  // is behind it rather than against a token nobody used.
  let node = document.querySelector("main") ?? document.body;
  let painted = "rgba(0, 0, 0, 0)";
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      painted = bg;
      break;
    }
    node = node.parentElement;
  }
  return {
    canvasToken: cs.getPropertyValue("--canvas").trim(),
    sdAppToken: cs.getPropertyValue("--sd-app").trim(),
    inkToken: cs.getPropertyValue("--ink").trim(),
    bodyColor: bodyCs.color,
    bodyBackground: bodyCs.backgroundColor,
    paintedCanvas: painted,
    htmlClass: root.className,
    rgb: {
      canvasToken: toRgb(cs.getPropertyValue("--canvas").trim()),
      sdAppToken: toRgb(cs.getPropertyValue("--sd-app").trim()),
      inkToken: toRgb(cs.getPropertyValue("--ink").trim()),
      bodyColor: toRgb(bodyCs.color),
      paintedCanvas: toRgb(painted),
    },
  };
}

const results = { app: APP, themes: {} };
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
    const consoleErrors = [];
    const consoleWarnings = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];

    const onConsole = (msg) => {
      const text = msg.text();
      if (msg.type() === "error") consoleErrors.push(text.slice(0, 300));
      else if (msg.type() === "warning") consoleWarnings.push(text.slice(0, 300));
    };
    const onPageError = (err) => pageErrors.push(String(err).slice(0, 300));
    const onRequestFailed = (req) =>
      failedRequests.push(`${req.method()} ${req.url().slice(0, 160)} :: ${req.failure()?.errorText}`);
    const onResponse = (res) => {
      if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url().slice(0, 160)}`);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onRequestFailed);
    page.on("response", onResponse);

    await page.goto(APP + route, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2500);

    const tokens = await page.evaluate(readTokens);
    const fg = tokens.rgb.bodyColor?.slice(0, 3) ?? parseRgb(tokens.bodyColor);
    const bg =
      tokens.rgb.paintedCanvas?.slice(0, 3) ??
      tokens.rgb.canvasToken?.slice(0, 3) ??
      parseRgb(tokens.bodyBackground);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);

    const all = [...consoleErrors, ...consoleWarnings];
    results.themes[theme][key] = {
      route,
      ...tokens,
      inkHex: fg ? hex(fg) : null,
      canvasHex: bg ? hex(bg) : null,
      canvasTokenHex: tokens.rgb.canvasToken ? hex(tokens.rgb.canvasToken.slice(0, 3)) : null,
      sdAppTokenHex: tokens.rgb.sdAppToken ? hex(tokens.rgb.sdAppToken.slice(0, 3)) : null,
      inkTokenHex: tokens.rgb.inkToken ? hex(tokens.rgb.inkToken.slice(0, 3)) : null,
      contrast: fg && bg ? Number(contrast(fg, bg).toFixed(2)) : null,
      consoleErrors,
      consoleWarnings,
      pageErrors,
      failedRequests,
      badResponses,
      keyWarnings: all.filter((t) => /unique "key"|same key|duplicate key/i.test(t)),
      hydrationWarnings: all.filter((t) => /hydrat|did not match|Text content does not match/i.test(t)),
    };

    console.log(
      `${theme} ${route}  ink=${fg ? hex(fg) : "?"} canvas=${bg ? hex(bg) : "?"} ` +
        `contrast=${fg && bg ? contrast(fg, bg).toFixed(2) : "?"} ` +
        `errs=${consoleErrors.length} pageErrs=${pageErrors.length} ` +
        `reqFail=${failedRequests.length} http4xx5xx=${badResponses.length}`
    );
  }
  await context.close();
}

await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "final-contract-results.json"), JSON.stringify(results, null, 2));
console.log(`wrote ${path.join(OUT, "final-contract-results.json")}`);
