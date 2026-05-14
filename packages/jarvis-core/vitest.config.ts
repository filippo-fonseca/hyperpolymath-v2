import { defineConfig } from "vitest/config";

// jarvis-core is pure TS — node env, no JSX, no React plugin.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
