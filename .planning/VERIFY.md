# Action bridge verification

Date: 2026-07-11
Branch: `bgsd/action-bridge`
Base: `bgsd/studio-native`

## Acceptance criteria

### 1. Voice opens and closes the weather widget

Status: **Automated path verified; live voice round trip blocked by local infrastructure.**

Evidence:

- `apps/web/tests/studio-action-bus.test.ts` passes and proves the two agent tool definitions are published, browser input is validated, and a valid `studio-action` is emitted on the existing physical bus.
- `apps/desktop/src/studio/actions/studio-action-router.test.ts` passes and proves an `open` action summons a catalog widget with catalog sizing, while `close` works by kind, id, and all.
- The desktop app was running and attempted `/api/jarvis/physical/events` against the worktree dev server.
- Live bearer authentication failed before the SSE route with `ECONNREFUSED 127.0.0.1:54322`; local Supabase/Postgres was unavailable. See `BLOCKED.md`.

### 2. Confirmed WhatsApp send materializes a confirmation card

Status: **Automated behavior verified; live voice/send round trip blocked by local infrastructure.**

Evidence:

- `apps/desktop/src/studio/actions/materialize.test.ts` passes.
- The test proves the WhatsApp tool call alone creates no widget, a `running` send task creates no widget, and only the existing post-confirm transport task's `done` state summons a card containing recipient and message text.
- A repeated `done` snapshot does not duplicate the card.
- No confirm-gate implementation or semantics were modified.

### 3. A tool result carrying a URL opens a browser widget

Status: **Verified.**

Evidence:

- `apps/desktop/src/studio/actions/materialize.test.ts` passes and proves an `open_url` result summons `browser` with the normalized HTTP URL in widget props.
- Materialization also accepts an HTTP(S) URL in `result.receipt.url` and rejects non-HTTP(S) URLs.
- Browser internals were not modified; the materializer only calls `summonWidget`.

### 4. Builds and dependency guard

Status: **Verified.**

Evidence:

- `pnpm --filter web typecheck` — exit 0.
- `pnpm --filter web build` — exit 0; all four `/api/studio/*` routes appear in the Next route manifest. Existing CSS/NFT warnings were non-fatal and outside this unit.
- `pnpm --filter desktop typecheck` — exit 0.
- `pnpm --filter desktop exec vite build` — exit 0; output includes the lazy `CardWidget` chunk. Existing duplicate-`jsx`, dynamic-import, and chunk-size warnings were non-fatal and outside this unit.
- `rg -n "@supabase|supabase-js" apps/desktop/package.json apps/desktop/src` returned no matches (`NO_DESKTOP_SUPABASE_CLIENT`).

## Prerequisite Studio API routes

Status: **Compiled and registered; live bearer curl blocked by local infrastructure.**

Evidence:

- Next production build registers `/api/studio/link-preview`, `/api/studio/weather`, `/api/studio/news`, and `/api/studio/whatsapp`.
- The routes accept paired-device bearer auth first and browser-cookie auth as fallback.
- Bearer curls reached the worktree server, but all returned HTTP 500 because middleware token validation requires local Postgres at `127.0.0.1:54322`, which refused connections.

## Focused test results

- Web: `apps/web/tests/studio-action-bus.test.ts` — 4/4 passed.
- Desktop: `studio-action-router.test.ts`, `materialize.test.ts`, and `widget-windows.test.ts` — 8/8 passed.

## Atomic commits

- `1a7e76c5` — Studio data API routes.
- `1ac0bf83` — validated agent tools and physical-bus SSE emit.
- `4d8567b8` — desktop SSE callback, action router, and bridge wiring.
- `12f6c2ac` — card widget and catalog entry.
- `6557de5d` — post-confirm and tool-result materialization.

## Live server cleanup

The worktree `pnpm --filter web dev` process was stopped after the curl attempt.
