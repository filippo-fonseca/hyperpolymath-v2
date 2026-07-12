# VERIFY — U1 jarvis-web-brain (Loop 3, sesh-1783808685335)

Executor died at spend limit after landing all 3 core commits; conductor completed verification inline.

## Commits
- f60b4167 feat(web): web_search receipt exposes top_url + content_excerpt, graceful no-key path (executor.ts +47)
- a1ccea7b feat(web): answer-and-show pairing directive for web_search + studio widgets (studio-widget-tools.ts)
- cc4bcc95 feat(web): deterministic studio-widget backstop for weather/news intents (run-turn.ts +21)

## Verification
- `pnpm --filter web typecheck` → exit 0 (conductor, 18:41)
- LIVE receipts over the physical SSE bus (turns 53adcfe0, 3cfd3237):
  - "whats the temperature right now?" → studio-action kind:"weather" emitted ✓ (backstop/pairing)
  - "is england still in the world cup? whats the latest?" → studio-action kind:"browser" with url https://www.bbc.co.uk/sport/football/live/cgl33l55100t (real content page, NOT a google search fallback) ✓
  - Earlier turn d2fa8228 proved web_search returns real results (FIFA/BBC/Sky URLs) with the Browserbase key in env.

## Notes
- Intent backstop matcher covered by live receipts; unit test skipped (matcher inline in run-turn.ts, not exported) — acceptable given deterministic regex list.
- No-key graceful path implemented in f60b4167; not separately live-tested (would require unsetting env on the running server).

## Loop-2 fix — "open whatsapp" routes to the whatsapp widget (not the macOS app)

Bug: "open whatsapp" made JARVIS call the legacy `open_app` tool (launching
macOS WhatsApp.app) instead of `studio_open_widget{kind:"whatsapp"}`.

Fix (4 atomic commits on bgsd/studio-native):
- jarvis-core: `open_app` tool description + computer-control personality prose
  now say to ALWAYS prefer `studio_open_widget` when the request matches an
  available widget kind (whatsapp, browser, weather, news, camera, clock,
  settings); `open_app` is only for apps with no widget equivalent. Explicit
  "open whatsapp / show my messages → studio_open_widget{kind:\"whatsapp\"}".
- web: extended `studio_open_widget` zod enum + description to all HUD widget
  kinds (added card/clock/camera/settings), matching the desktop catalog.
- web: extended the physical studio-action bus enum + `PhysicalStudioWidgetKind`
  so the new kinds aren't rejected before reaching SSE subscribers.
- web: extended the deterministic backstop (`detectStudioBackstop`) with a
  whatsapp matcher so "open/show/pull up whatsapp|messages|chats" nudges the
  widget open even if the model wrongly picked open_app.

Verify:
- `pnpm --filter web typecheck` → exit 0.
- LIVE receipt (turn 4a03f654) — POST /api/jarvis/voice/text {"text":"open whatsapp"}
  captured over the physical SSE bus:
  - `event: studio-action` → `{"action":"open","kind":"whatsapp",...}` ✓
  - `event: jarvis-tool-call` → name `studio_open_widget`, receipt kind `whatsapp` ✓
  - NO `open_app` studio-action / tool-call in the stream ✓ (model chose the widget tool directly)
