import { defineConfig } from "vitest/config";

// personal-context-mcp is pure TS — node env, no JSX, no React plugin.
// Mirrors the packages/jarvis-core/vitest.config.ts shape.

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
