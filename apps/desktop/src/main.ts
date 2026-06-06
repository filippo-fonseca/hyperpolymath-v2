// apps/desktop/src/main.ts
// Webview entrypoint. Boots the Physical Extender SSE listener so the
// desktop starts capturing on ESP32 wake events immediately on launch.
//
// Plan 14-04 will add the persistent 10s background heartbeat here
// (CONTEXT.md Decision #6 — covers idle + active states).

import { startPhysicalExtenderListener } from "@/physical-extender/sse-client";

async function boot(): Promise<void> {
  startPhysicalExtenderListener();
  // eslint-disable-next-line no-console
  console.log(
    "[boot] JARVIS Desktop ready — Physical Extender mode active",
  );
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[boot]", err);
});
