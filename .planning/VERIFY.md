# Verification — studio-core-port

Date: 2026-07-11  
Branch: `bgsd/studio-core-port`  
Base: `next`

## Acceptance criteria

### 1. Debug summon surface for all four widget kinds — PASS

- Temporary bare React mount: `apps/desktop/src/studio/debug/`.
- `WidgetWindowLayer` shows dev-only buttons for Browser, WhatsApp, Weather,
  and News.
- Headless Chrome exercise found all four labels and four rendered
  `[data-widget-window]` dialogs after summoning.

### 2. Mouse drag, resize, focus/z-order, pin, and close — PASS

Exercised against the bare Vite mount using Chrome DevTools pointer input:

- Browser drag delta: `80px × 60px`.
- Browser resize delta: `60px × 40px`.
- Browser pin/focus changed z-order from `1` to `5`.
- WhatsApp pin/focus then changed z-order to `6`.
- Closing News reduced the rendered window count from four to three.

### 3. Layout persistence across reload — PASS

- Store key remains `studio:widget-windows:v1`.
- The interactive exercise reloaded the page and restored all three remaining
  windows.
- Persisted Browser geometry after interaction was normalized as
  `x=0.6058201058`, `y=0.6079317697`, `w=0.4993650794`,
  `h=0.5852878465`.
- Unit tests cover persistence rehydration, clamping, singleton reuse, focus,
  and close behavior.

### 4. Weather/news/WhatsApp use the authenticated desktop HTTP path — PASS (wiring)

- All widget API calls use `studioFetch`; no bare `fetch()` remains under
  `src/studio/`.
- `studioFetch` uses `@tauri-apps/plugin-http`, prefixes
  `VITE_API_BASE_URL` (default `http://localhost:3000`), preserves caller
  headers, and applies the device bearer plus legacy trigger-secret fallback.
- Unit coverage verifies the exact localhost URL and both auth headers.
- Live receipts were not exercised: nothing was listening on port 3000, and
  the `next` base does not yet contain the studio API routes that exist on
  `bgsd/studio-v2`. The client-side implementation is complete; live response
  verification requires those web routes/server to be present at integration.

### 5. Typecheck and Vite builds — PASS

Commands run successfully:

```text
pnpm --filter desktop typecheck
pnpm --filter desktop test
pnpm --filter desktop exec vite build --outDir /tmp/studio-core-port-desktop-dist --emptyOutDir
pnpm --filter desktop exec vite build src/studio/debug --outDir /tmp/studio-core-port-debug-dist --emptyOutDir
```

Final test result: 15 tests passed across three files.

The standalone studio build transformed 2,044 modules and emitted lazy chunks
for Browser, News, Weather, and WhatsApp. Vite logged only dependency-level
`"use client"` directive warnings from React Query/Motion; the build completed.

### 6. Desktop-safe imports — PASS

```text
rg -n 'next/|@/' apps/desktop/src/studio
```

No matches.

## Merge seams

- `src/studio/tokens.ts` and `src/studio/debug/` are explicitly marked
  `TEMP: replaced by desktop-react-shell at merge`.
- Hand-gesture, voice-bridge, and WhatsApp realtime subscription integration
  are explicitly marked seams for their later owning units.
- The window layer is self-contained with its own React Query provider so it
  can run before the sibling shell is merged.
