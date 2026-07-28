import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // Two entry points, one per native window. `index.html` is the main HUD;
      // `flowpill.html` is the transparent, non-activating voice overlay
      // (label `flowpill`, declared in src-tauri/tauri.conf.json). Vite only
      // builds `index.html` by default, so without this the overlay window
      // would 404 in a packaged build.
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        flowpill: fileURLToPath(new URL("./flowpill.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@studio": fileURLToPath(new URL("./src/studio", import.meta.url)),
    },
  },
});
