/**
 * main.tsx — the entry point for `flowpill.html`, the second webview.
 *
 * This is not the JARVIS HUD and it must never become it. The overlay is INPUT
 * ONLY: it hears the user and posts the transcript as a normal message. It has
 * no speaker, no voice, and no view of JARVIS's reply, which appears only in the
 * web conversation. Nothing in this directory imports `src/main.ts`,
 * `src/hud/**` or `src/conversation/**`, and that boundary is the feature.
 *
 * HOW THE CONTROLLER ATTACHES. This unit owns the pill, not the wiring. A
 * `controller.ts` dropped alongside this file is picked up automatically (see
 * the glob below) and handed the mounted handle; it subscribes to
 * `handle.store.onEffect` and performs `start-capture`, `stop-capture`,
 * `discard`, `send`, `show` and `hide` against units u0 and u2. The glob is
 * used rather than a static import precisely so this entry still builds, and
 * the pill still renders, before that file exists.
 */

// sd-fonts.css and sd-tokens.css are linked from flowpill.html, exactly as
// index.html links them: their @font-face rules point at absolute /fonts/*
// paths under the Vite public root, so they belong in the document rather than
// in a bundled import.
import "./flowpill.css";

import { mountFlowPill, type FlowPillHandle } from "./mount";

declare global {
  interface Window {
    /** The mounted pill, for the controller and for headless verification. */
    __flowpill?: FlowPillHandle;
  }
}

const container = document.getElementById("flowpill-root");
if (!container) {
  throw new Error("flowpill: #flowpill-root is missing from flowpill.html");
}

async function boot(): Promise<void> {
  const harness = import.meta.env.DEV
    ? (await import("./dev-harness")).readHarness(window.location.search)
    : null;

  const handle = mountFlowPill(container as HTMLElement, {
    store: harness?.store,
    // The harness runs in a plain browser, where u0's corner command does not
    // exist; pinning the corner skips a read that would only log a warning.
    corner: harness ? "bottom-right" : undefined,
  });
  window.__flowpill = handle;

  if (harness) {
    harness.start(handle.pushLevel);
    return;
  }

  // `import.meta.glob` resolves at build time, so a missing controller is an
  // empty map rather than a broken bundle.
  const controllers = import.meta.glob<{
    attachFlowPillController?: (handle: FlowPillHandle) => void;
  }>("./controller.ts");
  const load = controllers["./controller.ts"];
  if (!load) return;
  try {
    const module = await load();
    module.attachFlowPillController?.(handle);
  } catch (error) {
    // A controller that fails to load leaves an inert pill, which is the right
    // failure: the overlay stays quiet instead of half-listening.
    console.error("[flowpill] controller failed to attach", error);
  }
}

void boot();
