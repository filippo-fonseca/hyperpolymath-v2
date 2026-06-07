# 260607-gy1 — Polypad Device Connection Status Pill

## Files

- `apps/web/lib/polypad/polypad-state-bus.ts` (new) — stub state bus mirroring `mic-state-bus.ts` shape; exports `PolypadConnectionState` type, `subscribeToPolypadState`, `setPolypadState`. Dev-only `window.__setPolypad` wired for devtools QA.
- `apps/web/components/polypad/PolypadIndicatorDot.tsx` (new) — presentational dot + Keyboard icon + "POLYPAD" mono label (expanded mode only). Uses `var(--hud-cyan)` (connected, pulsing via `hud-pulse-slow`), `var(--ink-coral)` (error), `var(--ink-muted)` (disconnected). `motion-reduce:!animate-none` kills pulse for reduced-motion users.
- `apps/web/components/shell/PersistentNav.tsx` (edit) — adds `PolypadIndicatorDotContainer` adapter and mounts it adjacent to `MicIndicatorDotContainer` in the voice status row; outer `gap-1` → `gap-2`.

## Commits

- `4324a43` feat(polypad): add stub state bus with manual setter (260607-gy1)
- `8ec3324` feat(polypad): add PolypadIndicatorDot component (260607-gy1)
- `69377e7` feat(polypad): mount PolypadIndicatorDot in sidebar voice status row (260607-gy1)

## State bus API

```ts
export type PolypadConnectionState = "connected" | "disconnected" | "error";
export function subscribeToPolypadState(fn: (s: PolypadConnectionState) => void): () => void;
export function setPolypadState(s: PolypadConnectionState): void;
// dev-only: window.__setPolypad === setPolypadState
```

Initial state: `"disconnected"`. Eager-emit-on-subscribe (consumer gets current frame synchronously).

## DevTools QA recipe

```js
window.__setPolypad('connected')    // cyan, pulsing
window.__setPolypad('error')        // coral, static
window.__setPolypad('disconnected') // muted, static
```

Toggle sidebar collapse — label + Keyboard icon vanish; dot remains. Enable system "Reduce Motion" — pulse stops, cyan fill stays.

## Out of scope

- Desktop topbar mount deferred — `apps/desktop/` is empty scaffolding.
- Real bridge wiring (`tools/jarvis-physical/bridge/` extension publishing connection state via SSE or HTTP POST) is a separate workstream. This plan ships UI against a stub bus.

## Deviations

None. Plan executed verbatim:
- `gap-1` → `gap-2` retained (no visible regression in either sidebar state).
- `motion-reduce:!animate-none` Tailwind utility used (mic precedent does not have an explicit reduced-motion path; this is an additive improvement consistent with token discipline).
