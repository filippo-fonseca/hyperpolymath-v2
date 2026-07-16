#!/usr/bin/env node
/**
 * Vendors the MediaPipe tasks-vision WASM fileset from node_modules into
 * `public/models/mediapipe/wasm/` so it is served from our own origin (mirrors
 * the committed `public/wake-word/*.onnx` and `public/voice/*.wasm` convention).
 *
 * The WASM binaries are version-locked to the `@mediapipe/tasks-vision` package,
 * so `@mediapipe/tasks-vision` is pinned (no caret) and re-vendoring after an
 * upgrade is a one-liner: `node apps/web/scripts/copy-mediapipe-wasm.mjs`.
 */

import { createRequire } from "node:module";
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Resolve the package's main entry (its `exports` map hides package.json), then
// walk to the package root — the WASM fileset sits alongside the bundle.
const pkgEntry = require.resolve("@mediapipe/tasks-vision");
const srcWasmDir = join(dirname(pkgEntry), "wasm");
const destWasmDir = join(here, "..", "public", "models", "mediapipe", "wasm");

mkdirSync(destWasmDir, { recursive: true });
cpSync(srcWasmDir, destWasmDir, { recursive: true });

const copied = readdirSync(destWasmDir).sort();
console.log(`Vendored ${copied.length} MediaPipe WASM files → ${destWasmDir}`);
for (const f of copied) console.log(`  ${f}`);
