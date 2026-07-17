/**
 * Studio debug stage — the browser-mountable evidence harness.
 *
 * WHY THIS EXISTS
 * apps/desktop normally boots through Tauri: index.html loads main.ts, which
 * expects a Tauri runtime and will not render in a plain browser. That leaves
 * this file as the ONLY entry a headless browser can mount, which makes it the
 * evidence protocol for the whole sd restyle. Every unit screenshots here.
 *
 * HOW TO USE IT
 *
 *   pnpm --filter desktop debug:stage          # vite dev server on :1420
 *
 * then open (or point Playwright at):
 *
 *   http://localhost:1420/src/studio/debug/index.html?widget=weather
 *
 * Query params:
 *
 *   widget=<kind>   Mount ONE widget's content bare on the stage, with no
 *                   window chrome around it. <kind> is any key of
 *                   WIDGET_CATALOG: browser | whatsapp | weather | news |
 *                   card | clock | camera | settings | orb.
 *                   Omit to get the window layer instead (see below).
 *
 *   surface=windows Mount WidgetWindowLayer with debugSummon — the full
 *                   window manager: summon, drag, resize, focus, pin, close.
 *                   This is the default when no `widget` is given, so the
 *                   old no-param behaviour of this harness is unchanged.
 *
 *   w= / h=         Stage size in px. Defaults to 1440x900, the size the
 *                   contract mandates for screenshots. The stage is a fixed
 *                   1440x900 box regardless of the browser window, so a
 *                   screenshot is deterministic without resizing the
 *                   viewport. Only override when you are specifically
 *                   testing reflow.
 *
 *   fill=1          Let the widget fill the whole stage instead of its
 *                   catalog defaultSize. Useful for OrbWidget, which is
 *                   designed to fill its window.
 *
 * Screenshot the `#sd-stage` element, not the page, to get exactly the
 * 1440x900 frame with no scrollbar or letterboxing:
 *
 *   await page.locator("#sd-stage").screenshot({ path: "evidence.png" })
 *
 * DARK ONLY. Sealed decision D2 exempts this app from the light+dark
 * verification rule, so there is no theme param — the stage is always dark.
 *
 * This harness is a dev tool and ships in no build; keep it dependency-light
 * so it cannot be the reason a unit is blocked.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { SD_FONT, SD_SURFACES, STUDIO_COLORS } from "../tokens";
import { WIDGET_CATALOG, type WidgetKind } from "../windows/catalog";
import { WidgetWindowLayer } from "../windows/WidgetWindowLayer";

// The sd vocabulary. Imported here rather than linked from index.html so Vite
// bundles it and the @font-face URLs get rewritten correctly.
import "../../styles/sd-fonts.css";
import "../../styles/sd-tokens.css";

const params = new URLSearchParams(window.location.search);

const STAGE_WIDTH = Number(params.get("w")) || 1440;
const STAGE_HEIGHT = Number(params.get("h")) || 900;

const widgetParam = params.get("widget");
const isWidgetKind = (value: string | null): value is WidgetKind =>
  value !== null && Object.prototype.hasOwnProperty.call(WIDGET_CATALOG, value);

document.documentElement.style.height = "100%";
document.body.style.cssText = `
  min-height: 100%;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  color: ${STUDIO_COLORS.text};
  background: ${SD_SURFACES.darkerBox};
  font-family: ${SD_FONT.sans};
  user-select: none;
`;

const root = document.getElementById("root");
if (!root) throw new Error("Missing studio debug root");

/* Bare ?widget= mounts a widget's content with no window chrome, which also
   means without the QueryClientProvider that WidgetWindowLayer supplies. The
   data-backed widgets (weather, news, whatsapp, browser) call useQuery and
   would throw "No QueryClient set" the instant they mount. Give the stage its
   own client so every widget can be evidenced bare. The window-layer path makes
   its own client; a second provider above it is harmless. */
const queryClient = new QueryClient();

/* The stage is a fixed-size box, not a viewport-filling element, so evidence is
   the same 1440x900 whatever the browser window happens to be. It keeps the
   Studio's own canvas treatment so widgets sit on the background they ship on. */
root.style.cssText = `
  position: relative;
  width: ${STAGE_WIDTH}px;
  height: ${STAGE_HEIGHT}px;
  overflow: hidden;
  background: radial-gradient(circle at top, ${STUDIO_COLORS.surface}, ${STUDIO_COLORS.background} 70%);
`;
root.id = "sd-stage";

function Stage(): React.ReactElement {
  if (!isWidgetKind(widgetParam)) {
    if (widgetParam !== null) {
      // A typo in ?widget= would otherwise silently fall back to the window
      // layer and look like the harness ignoring you.
      console.warn(
        `[sd-stage] unknown widget "${widgetParam}". Known: ${Object.keys(WIDGET_CATALOG).join(", ")}`,
      );
    }
    return <WidgetWindowLayer debugSummon />;
  }

  const entry = WIDGET_CATALOG[widgetParam];
  const Content = entry.component;
  const fill = params.get("fill") === "1";

  // Widgets are authored to fill their window, so give each one a box the size
  // its catalog entry asks for and let it lay out inside that.
  const box: React.CSSProperties = fill
    ? { position: "absolute", inset: 0 }
    : {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: Math.round(entry.defaultSize.w * STAGE_WIDTH),
        height: Math.round(entry.defaultSize.h * STAGE_HEIGHT),
        overflow: "hidden",
      };

  return (
    <div style={box} data-sd-widget={widgetParam}>
      <Suspense fallback={<></>}>
        <Content id={`debug-${widgetParam}`} props={{}} />
      </Suspense>
    </div>
  );
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Stage />
    </QueryClientProvider>
  </StrictMode>,
);
