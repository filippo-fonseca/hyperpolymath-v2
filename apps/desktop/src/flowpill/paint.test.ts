// @vitest-environment jsdom
/**
 * paint.test.ts — the pill is actually on the screen, not merely mounted.
 *
 * This file exists because of a specific live failure: the user held Option,
 * the gesture pipeline ran end to end (the Rust log shows `flowpill_show`
 * reaching the window on every cycle), and he never saw the pill. A window that
 * shows a fully transparent surface and a window that was never shown look
 * identical from the outside, and every test in this feature up to now asserted
 * state transitions rather than pixels, so neither would have failed.
 *
 * Three failure modes are locked here, all of them silent by nature:
 *
 *  1. **The React tree never renders.** The overlay is a second webview, a
 *     separate JavaScript realm that fails independently and quietly: the
 *     controller can be perfectly wired and driving `show` while the pill's own
 *     tree has thrown. Mounting the real component and asserting real elements
 *     is the check.
 *
 *  2. **The pill renders with nothing to paint.** Every visible property of the
 *     pill (its fill, its border, its radius, its shadow, its text colour) comes
 *     from a `--sd-*` custom property defined in a sheet the pill's document
 *     links separately from the HUD's. An undefined custom property is invalid
 *     at computed-value time, which unsets the whole declaration: the fill
 *     becomes transparent, the border becomes none, the shadow disappears. The
 *     result is an invisible pill in a transparent window, with no error
 *     anywhere. Renaming one token in the design system is enough to cause it.
 *
 *  3. **The pill's document stops linking the token sheets.** `flowpill.html` is
 *     a second entry point, so a refactor that moves the sd register into a
 *     bundled import for `index.html` takes the pill's whole palette with it and
 *     nothing about `index.html` looks broken.
 *
 * jsdom does not composite, so this cannot assert a photograph. It asserts the
 * two inputs that decide whether anything can be painted at all. The photograph
 * is `scripts/verify-flowpill-paint.mjs`, which drives the real dev server in
 * Chromium and WebKit.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { mountFlowPill, type FlowPillHandle } from "./mount";
import type { FlowPillEvent } from "./types";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const PILL_CSS = read("./flowpill.css");
const TOKENS_CSS = read("../styles/sd-tokens.css");
const FLOWPILL_HTML = read("../../flowpill.html");

let mounted: FlowPillHandle | null = null;

beforeAll(() => {
  // React 19 commits concurrently, so a bare dispatch leaves the DOM one turn
  // behind. Every mount and dispatch below is wrapped in `act` to flush it.
  (globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;
  // jsdom has no 2D context and logs a stack trace every time the waveform asks
  // for one. The waveform already bails out on a null context, which is the
  // behaviour under test; this only silences the noise.
  HTMLCanvasElement.prototype.getContext = (): null => null;
});

afterEach(async () => {
  const handle = mounted;
  mounted = null;
  if (handle) await act(async () => handle.unmount());
  document.body.innerHTML = "";
});

async function mount(): Promise<{ handle: FlowPillHandle; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  let handle!: FlowPillHandle;
  await act(async () => {
    handle = mountFlowPill(container, { corner: "bottom-right" });
  });
  mounted = handle;
  return { handle, container };
}

async function send(handle: FlowPillHandle, event: FlowPillEvent): Promise<void> {
  await act(async () => {
    handle.dispatch(event);
  });
}

describe("the pill renders something", () => {
  it("paints nothing at all while idle", async () => {
    const { container } = await mount();
    expect(container.querySelector(".flowpill")).toBeNull();
  });

  it("renders a real pill the moment the machine leaves idle", async () => {
    const { handle, container } = await mount();

    await send(handle, { type: "invoke", mode: "hold" });

    const pill = container.querySelector(".flowpill");
    expect(pill, "no .flowpill element after invoke").not.toBeNull();
    expect(pill?.getAttribute("data-status")).toBe("armed");
    // The stage is what positions the pill against the window's anchored edge.
    expect(container.querySelector('.flowpill-stage[data-anchor="bottom"]')).not.toBeNull();
    // Armed and listening both show the waveform, which is the pill's whole
    // body while recording. No canvas means an empty pill.
    expect(container.querySelector("canvas.flowpill-wave")).not.toBeNull();
  });

  it("keeps painting through every visible status", async () => {
    const { handle, container } = await mount();
    const seen: string[] = [];

    for (const event of [
      { type: "invoke", mode: "hold" },
      { type: "capture-started" },
      { type: "end" },
      { type: "transcript", text: "book the bench for Thursday" },
      { type: "sent" },
    ] as const) {
      await send(handle, event);
      const pill = container.querySelector(".flowpill");
      expect(pill, `nothing rendered in ${handle.getState().status}`).not.toBeNull();
      seen.push(pill?.getAttribute("data-status") ?? "");
    }

    expect(seen).toEqual(["armed", "listening", "transcribing", "sending", "sent"]);
  });

  it("shows the named failure when the microphone produced nothing", async () => {
    const { handle, container } = await mount();

    await send(handle, { type: "invoke", mode: "hold" });
    await send(handle, { type: "fail", reason: "No audio from BlackHole 16ch" });

    const status = container.querySelector(".flowpill-status");
    expect(status?.getAttribute("data-tone")).toBe("error");
    expect(status?.textContent).toContain("BlackHole 16ch");
  });
});

describe("the pill has something to paint with", () => {
  /**
   * Every custom property the pill's sheet reads, minus the ones it defines
   * itself. `var(--x, fallback)` is excluded: a fallback is by definition safe.
   */
  function requiredTokens(css: string): string[] {
    const declaredHere = new Set(
      [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1] as string),
    );
    const used = new Set<string>();
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      const name = match[1] as string;
      const next = match[2] as string;
      if (next === ",") continue; // has a fallback
      if (declaredHere.has(name)) continue;
      used.add(name);
    }
    return [...used].sort();
  }

  it("reads only tokens the sd register actually defines", () => {
    const declared = new Set(
      [...TOKENS_CSS.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1] as string),
    );
    const required = requiredTokens(PILL_CSS);
    // Guard against a regex change quietly making this test vacuous.
    expect(required.length).toBeGreaterThan(10);
    const missing = required.filter((token) => !declared.has(token));

    expect(
      missing,
      "these tokens are read by flowpill.css but defined nowhere in sd-tokens.css. " +
        "An undefined custom property unsets the whole declaration, so the pill " +
        "loses its fill, border and shadow and becomes an invisible rectangle in a " +
        "transparent window, with no error anywhere.",
    ).toEqual([]);
  });

  it("depends on the tokens that make it visible at all", () => {
    // Guards the guard: if the pill's fill ever stops coming from these, the
    // test above would pass vacuously.
    for (const token of ["--sd-box", "--sd-line", "--sd-ink"]) {
      expect(PILL_CSS, `flowpill.css no longer reads ${token}`).toContain(`var(${token})`);
    }
  });

  it("links the token sheets from its own document", () => {
    // flowpill.html is a separate entry point from index.html and gets no
    // styling by inheritance.
    expect(FLOWPILL_HTML).toContain("/src/styles/sd-tokens.css");
    expect(FLOWPILL_HTML).toContain("/src/styles/sd-fonts.css");
    expect(FLOWPILL_HTML).toContain('id="flowpill-root"');
    // The empty region has to stay at alpha zero from the first paint, or a
    // 440x300 white rectangle flashes over whatever the user is working in and
    // the window becomes a click shield.
    expect(FLOWPILL_HTML).toMatch(/background:\s*transparent/);
  });
});
