import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Desktop unit tests run in a plain Node environment (the pure logic under test
// touches no DOM). The `@` alias mirrors vite.config.ts / tsconfig paths so test
// imports resolve the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
