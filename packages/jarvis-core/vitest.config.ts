import { defineConfig } from "vitest/config";

// jarvis-core is pure TS — node env, no JSX, no React plugin.
//
// TZ=UTC pins the host process timezone so chrono-node's internal Date math
// produces deterministic `knownValues` across dev machines and CI runners.
// Without this, host tz (e.g. America/New_York) interferes with DST-boundary
// reference dates — chrono's internal validation drops candidates whose
// inferred wall-clock time doesn't exist in the host tz (Mar 8 2:30am NY).
// Setting TZ=UTC neutralizes that; our IANA-aware re-interpretation happens
// via @date-fns/tz `TZDate` regardless.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
