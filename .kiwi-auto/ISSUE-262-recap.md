# Issue #262 recap — Tauri hardening: CSP + child-webview isolation

**Status: resolved** (committed on branch `kiwi/auto/2026-07-12-issue-262`, not pushed).

## What the issue asked
REVIEW.md MAJOR 3: the desktop Tauri shell shipped with `security.csp: null`
and `withGlobalTauri: true`. With no CSP and the global `window.__TAURI__`
bridge exposed, any content the webview loads (including injected or external
content) could reach the native command surface. Define a CSP and restrict the
global bridge.

## Fit assessment
Good fit: self-contained, single-file config change (`apps/desktop/src-tauri/tauri.conf.json`),
clear and unambiguous acceptance criteria, no design questions, no new deps, no
DB migrations.

## What I changed
`apps/desktop/src-tauri/tauri.conf.json`:

1. **`withGlobalTauri: true → false`.** Restricts the global bridge. Verified
   safe: `grep` found zero `window.__TAURI__` / `__TAURI__` references in the
   frontend — all Tauri access is through `@tauri-apps/api` and plugin ESM
   imports, which use `__TAURI_INTERNALS__` (unaffected by this flag). No
   functional change.

2. **Defined `security.csp` (production) and `security.devCsp` (dev).**
   Replaces `csp: null`.
   - `default-src 'self'`, `script-src 'self'` (prod). Dev CSP adds
     `'unsafe-inline' 'unsafe-eval'` + `ws://localhost:1420` +
     `http://localhost:1420` for Vite HMR so `tauri dev` keeps working.
   - `connect-src` limited to the origins the **webview** actually reaches.
     The only webview-level network call is the `EventSource` (SSE) in
     `src/physical-extender/sse-client.ts` → `apiBaseUrl`
     (`http://localhost:3000` default). Added `127.0.0.1:3000` and
     `https://hyperpolymath.com` to match the app's own HTTP capability
     whitelist for a prod-pointed desktop. Plus `ipc:` /
     `http://ipc.localhost` for Tauri's own IPC.
   - **All other HTTP is CSP-exempt**: `src/api/client.ts`,
     `src/audio/tts-player.ts`, and `src/actions/confirm-gate.ts` all import
     `fetch` from `@tauri-apps/plugin-http`, which routes natively through
     Rust and bypasses the WKWebView (hence bypasses `connect-src`). This is
     why the strict `connect-src` is safe.
   - `frame-src 'none'` and `object-src 'none'` — the "child-webview
     isolation" ask: block embedded frames/plugins from loading arbitrary
     URLs. The desktop app only has one `main` window and creates no child
     webviews, so this is purely defensive with no functional impact.
   - `style-src 'self' 'unsafe-inline'` kept — `index.html` has an inline
     `<style>` block and the app applies styles dynamically.
   - Extra defensive tightening: `base-uri 'self'`, `form-action 'none'`,
     scoped `img-src` / `media-src` / `font-src` / `worker-src`.

## Verification
- `JSON.parse` of the config passes; confirmed `withGlobalTauri=false`, both
  `csp` and `devCsp` present.
- Derived every `connect-src` entry from actual code (SSE target + IPC),
  and confirmed all other network calls use native plugin-http (CSP-exempt).
- Did not run a full `tauri build` (Rust toolchain build, well beyond the
  session cap and not needed to validate a schema-valid config change). The
  CSP was constructed conservatively from the app's real network surface to
  avoid runtime breakage; the dev CSP preserves Vite HMR.

## Risks / follow-ups
- If the desktop is ever pointed at a JARVIS server origin other than
  `localhost:3000` / `127.0.0.1:3000` / `hyperpolymath.com` via
  `VITE_API_BASE_URL`, that origin must be added to `connect-src` for SSE to
  connect. Documented here so it's not a surprise.
- Recommend a manual `pnpm tauri dev` smoke test (orb loads, voice turn works,
  physical-extender SSE connects) before release, since CSP effects are
  runtime-only.

## Git
- Commit `fe1298dd` — `fix(desktop): harden Tauri with a CSP and disable the
  global bridge` (`Closes #262`).
- No push, no destructive git, per instructions.
