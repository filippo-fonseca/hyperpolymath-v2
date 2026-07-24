# PLAN — unit-wiki-editor (issue #331)

Real BlockNote editor inside an Expo DOM component (`'use dom'`), bridged to a
native Wiki editor screen, plus a daily quick-entry fast path. Builds on the
sealed API-CONTRACT (§2–5) and the sd register (theme.ts `sd`/`font`).

## Key research findings (see RESEARCH-expo-dom-blocknote.md)
- `'use dom'` file → Metro web bundle rendered in a WebView. SDK 56 backs it
  with `@expo/dom-webview` (default); no `react-native-webview` needed.
- `BlockNoteView` is in `@blocknote/mantine` (NOT `@blocknote/react`).
- Pin every `@blocknote/*` to **0.51.4** to match apps/web (schema/JSON compat).
- Props bridge = serializable-only, async; callbacks are top-level async props;
  no `children`.
- **HIGH RISK (Expo #46374):** large *initial* prop payloads can blank the
  WKWebView on this exact stack (SDK56/RN0.85.3/New Arch/iOS17.5+). Mitigation:
  mount the editor near-empty, then deliver content **after mount** via a small
  prop the DOM side applies with `replaceBlocks` — never a multi-KB initial prop.
- Legacy pages (`contentJson === null`) seed from markdown via
  `await editor.tryParseMarkdownToBlocks(content)` then `replaceBlocks`.
- Web schema has CUSTOM blocks (callout, linkEmbed) + inline (mentions,
  receipts). Mobile uses the DEFAULT schema, which THROWS on unknown node types.
  → sanitize incoming JSON before seeding (keep default blocks + text/link
  inline; drop unknown). Documented fidelity limitation for v1.

## Files (all inside the fence)
1. `components/wiki-editor/wikiApi.ts` — DONE (commit ae9537f5). Device wiki
   client: getPage/createPage/patchPage/getDailyPage.
2. `components/wiki-editor/sanitize.ts` — strip unknown block/inline node types
   from incoming contentJson so the default-schema editor never crashes on
   web-authored custom nodes. Pure, unit-testable.
3. `components/wiki-editor/WikiEditorDom.tsx` — `'use dom'` BlockNote editor.
   Props: `content` (sanitized Block[] | null, applied post-mount),
   `markdownFallback` (string, for legacy seed), `editable`, `onChange` (async,
   debounced on the native side), `onReady`. Inlines sd-dark CSS + Space Grotesk
   over BlockNote's default (Inter), solid canvas.
4. `screens/WikiEditor.tsx` — native host screen. Loads page (by id OR daily),
   native title TextInput + emoji in header, hosts the DOM editor, debounced
   autosave + explicit Done → PATCH contentJson (server regenerates markdown),
   save-state affordance (idle/saving/saved/error) in the sd register. Exports:
   - `WikiEditorScreen` (props: `pageId` | `daily` open target, `onClose`)
   - a route name const + daily quick-entry helper for browse/More/tab links.
5. `components/wiki-editor/WikiEditorDevHarness.tsx` — standalone dev entry so
   the screen is drivable in the simulator without Root wiring (Conductor
   stitches nav at merge). Used ONLY for verification; App.tsx temporarily
   points at it during the sim drive, then reverted (App.tsx stays unchanged in
   git).

## Deps to add (mobile package.json)
- `@blocknote/core` `0.51.4`, `@blocknote/react` `0.51.4`, `@blocknote/mantine`
  `0.51.4` (exact, lockstep, = web).
- DOM-component runtime (SDK-pinned via `npx expo install`): `@expo/dom-webview`,
  `@expo/metro-runtime`, `react-dom` (match react 19.2.3), `react-native-web`.
- Verify a single react/react-dom/prosemirror instance in the web bundle
  (pnpm hoist) — duplicates blank the editor.

## Bridge / content strategy (mitigates #46374)
- `useCreateBlockNote({})` mounts empty (tiny initial payload).
- A `contentKey` + `content` prop: on change of `contentKey`, the DOM side
  `await`-applies content (sanitized JSON, or markdown-parsed fallback) via
  `replaceBlocks`. Native passes content shortly AFTER first render.
- `onChange` fires `editor.document` back to native; native debounces (~800ms)
  and PATCHes. Explicit "Done" flushes immediately then closes.

## Verification (the hard part — DOM needs a native binary)
- Managed CNG (no `ios/`): `@expo/dom-webview` ships native code, so a fresh dev
  client is required. Do OUR OWN build: secondary simulator (iPhone 16 variant),
  our Metro on **:8090** (never touch user's :8083 or servers :3000/:3100).
  `cd apps/mobile && npx expo run:ios --device "<secondary udid>" --port 8090`
  (prebuild + pod install + xcodebuild). If the native build is infeasible in
  the sandbox, fall back to: typecheck gate + web-bundle smoke of the DOM file +
  documented manual-drive steps, and report the constraint honestly.
- Drive: open editor → type heading + bullet + checkbox → observe autosave →
  reload → confirm identical contentJson (capture the PATCH 200 body + the
  reloaded GET body and diff). Screenshots: open, typing, saved. Evidence under
  `.planning/evidence/`, committed.

## Gates
- `pnpm --filter mobile typecheck`
- simulator: editor opens, accepts typing, save round-trips contentJson
  (screenshots + PATCH response captured).

## Commit plan (atomic, explicit pathspecs)
1. ae9537f5 wikiApi.ts (done)
2. deps (package.json + lockfile)
3. sanitize.ts (+ tiny test if a runner exists)
4. WikiEditorDom.tsx
5. WikiEditor.tsx (native screen) + exports
6. dev harness
7. evidence + docs (bundle-size note, fidelity limitation)

## Risks / open items
- #46374 blank WebView — primary risk; validated by the post-mount content
  strategy + early sim check.
- Custom web nodes not editable on mobile v1 (sanitized) — documented, not a
  blocker for the write-from-phone core.
- Native build time/feasibility in the sandbox — fallback path defined above.
