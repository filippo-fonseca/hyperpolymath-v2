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
      // Two entry points, not one. `index.html` is the JARVIS HUD; the flow
      // pill is a second, independent webview (label `flowpill`) that the
      // Tauri side opens for global dictation. Declaring both here is what
      // makes `flowpill.html` land in dist/ for the production build; Vite's
      // dev server serves it either way.
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
