# Polypad Device Connection Status Pill — Research

**Researched:** 2026-06-07
**Mode:** quick-task
**Confidence:** HIGH (repo audit complete; nothing about Polypad exists yet)

## Summary

There is **zero Polypad code in the repo** — no bridge, no hook, no Supabase table, no IPC channel, no `polypad` filename anywhere. The web shell is **sidebar-only** (no topbar exists). The "desktop" app at `apps/desktop/` is empty scaffolding (just `dist/`, `node_modules/`, and `src-tauri/target` — no Rust source, no Tauri config, no renderer). However, the **`tools/jarvis-physical/bridge/` precedent exists** and points to the correct architecture: USB serial device → local Node bridge → HTTP POST to web app. That bridge is also stub-only (just `package-lock.json` + `.env`) but its dependencies (`serialport`, `@serialport/parser-readline`) and env shape (`SERIAL_PORT`, `TRIGGER_URL`, `PHYSICAL_TRIGGER_SECRET`) define the canonical pattern.

**Primary recommendation:** Ship the UI against a **client-side Zustand store with a manual setter + a fake-ready `usePolypadConnection()` hook** that returns `"disconnected"` today. The pill mounts in the **sidebar bottom rail** (next to ThemeToggle/profile chrome — there is no topbar to add it to). When the Polypad bridge ships, the hook gets re-wired to poll/SSE the bridge's local HTTP endpoint with zero pill-component changes. Match the `MicIndicatorDot` aesthetic exactly — same dot size, same `--hud-cyan` vocabulary, same `hud-pulse-slow/fast/breathe` keyframes.

---

## Q1 — Bridge state: NOTHING EXISTS. Propose stub.

**Verdict:** Nothing exists. No file in the repo references `polypad`, `polyPad`, or `poly_pad` (grep returned zero hits across `apps/`, `tools/`, `supabase/`). No Supabase migration touches a `devices` or `polypad_status` table. No IPC channel, no websocket, no local-helper port reference.

**Closest existing pattern — `tools/jarvis-physical/bridge/`:**
- Dependencies: `serialport@^12.0.0`, `@serialport/parser-readline@^12.0.0`, `dotenv`
- Env shape: `SERIAL_PORT=/dev/cu.usbmodem2101`, `SERIAL_BAUD=115200`, `TRIGGER_URL=http://localhost:3000/api/jarvis/physical/trigger`, `PHYSICAL_TRIGGER_SECRET=...`, `TRIGGER_IDS`, `DEBOUNCE_MS`
- **Only `package-lock.json` + `.env` exist — no `index.mjs`, no source.** Bridge is itself a stub.
- This tells us: when Polypad ships, it will follow the same shape (USB serial bridge → local HTTP POST to `/api/polypad/*` with a shared secret).

**Recommended stub for the pill task:**

```ts
// apps/web/lib/polypad/connection-store.ts
import { create } from "zustand"; // already in deps via TanStack/shadcn ecosystem? VERIFY

export type PolypadConnectionState =
  | "disconnected"   // no bridge heartbeat (default)
  | "connecting"     // saw a heartbeat in last 30s but not last 5s
  | "connected"      // heartbeat within last 5s
  | "error";         // bridge reachable but reported a device error

interface Store {
  state: PolypadConnectionState;
  setState: (s: PolypadConnectionState) => void;
}

export const usePolypadConnectionStore = create<Store>((set) => ({
  state: "disconnected",
  setState: (state) => set({ state }),
}));
```

```ts
// apps/web/lib/polypad/usePolypadConnection.ts
export function usePolypadConnection(): PolypadConnectionState {
  return usePolypadConnectionStore((s) => s.state);
}
```

**Wiring deferral:** the hook returns `"disconnected"` today. A future task wires it to either (a) `setInterval` polling `http://localhost:PORT/health` on the bridge, or (b) an SSE/EventSource subscription. **Decision: don't wire yet.** The pill ships immediately against a manual setter exposed via devtools/console (`window.__setPolypad('connected')`) for visual QA.

**VERIFY:** Is `zustand` in `apps/web/package.json`? If not, the stub can use `useSyncExternalStore` over a tiny module-level Set of listeners (matches the existing `subscribeToMicState` pattern in `apps/web/lib/voice/mic-state-bus.ts` — that's likely the cheaper/more-consistent path here).

**Stronger recommendation:** mirror `mic-state-bus.ts`. Project precedent. Zero new deps.

---

## Q2 — Web topbar location: THERE IS NO TOPBAR.

**Layout shape (`apps/web/components/shell/AppShell.tsx`):**
```tsx
<div className="flex h-screen w-screen ...">
  <Sidebar ... />
  <main className="flex-1 overflow-auto">{children}</main>
</div>
```

The shell is **sidebar-left + full-bleed main**. No top chrome bar. The closest analogues:
- `PersistentNav.tsx` has a "voice status row" (line 209) with `MicIndicatorDot` next to `PressToTalkButton` and `DiscreetToggleButton` — this is the canonical "live status indicator" mount point already used by JARVIS voice.
- `Sidebar.tsx` header (lines 156-180) renders Wordmark + collapse toggle.
- Bottom of Sidebar has profile chip + ThemeToggle (further down the file, not shown in this read but standard layout).

**Recommendation:** Mount the Polypad pill **inside `PersistentNav.tsx`, in the voice status row block (line 209-219)** as a third element alongside `MicIndicatorDotContainer` and `PressToTalkButton`. Rationale:
1. The voice status row is already the "live device state lives here" zone — it's the natural sibling.
2. The block has `agent-mode-scope` styling and the cyan vocabulary is already in place.
3. Collapsed-sidebar handling (icon-only) is already solved by the surrounding pattern.
4. No new file needs to claim the "topbar" responsibility.

In collapsed mode, the pill becomes a bare dot (matches `MicIndicatorDot` size: `w-2 h-2 rounded-full`). In expanded mode, the dot pairs with a tiny mono label "POLYPAD" (matches the uppercase mono tracking-wide register from UI-SPEC §5e/§12e referenced in `PersistentNav` comments).

---

## Q3 — Desktop topbar location: DESKTOP APP IS A STUB.

**Verdict:** `apps/desktop/` contains only:
- `dist/` (Vite build output)
- `node_modules/`
- `src-tauri/` with `target/` and `gen/` only — **no Cargo.toml, no `src/main.rs`, no `tauri.conf.json` at top level**
- `apps/desktop/apps/desktop/web/` (empty)

There is no desktop renderer, no custom titlebar code, no Tauri commands. The desktop app has not been built out.

**Recommendation:** Treat "desktop topbar" as **out of scope for this quick task**. Two options for the plan:

1. **(Preferred)** Scope this task to the **web shell only**. When the desktop app eventually ships (separate phase), it can either embed the web app via a Tauri webview (in which case the pill comes along for free — sidebar shows in the webview) OR build a native chrome and the pill spec from this task gets copied across.

2. If the user insists on a desktop-side surface today, the task expands to **scaffold a minimal Tauri main window first** (out of proportion for a quick task).

**Plan should state explicitly:** "Desktop surface deferred — `apps/desktop/` has no source yet. Pill ships in web shell only. Re-evaluate when desktop app is scaffolded."

---

## Q4 — Existing live-indicator precedent: STRONG.

**Three existing precedents to match:**

1. **`MicIndicatorDot.tsx`** — canonical "live state dot" in this repo:
   - Size: `w-2 h-2 rounded-full inline-block`
   - Color vocabulary: `--hud-cyan` for active states, `--ink-muted` for idle
   - Motion: `hud-pulse-slow` (1.2s), `hud-pulse-fast` (0.5s), `hud-breathe` (1.2s) keyframes already declared in `globals.css`
   - State attribute: `data-mic-state="..."` for CSS targeting and verification grep
   - Transition: `transition-all duration-200 ease-out`

2. **`subscribeToMicState` bus** (`apps/web/lib/voice/mic-state-bus.ts`) — module-level singleton pub/sub for hardware state, consumed via small `useEffect(() => subscribe(setState), [])` adapters. **Exact pattern to clone for Polypad.**

3. **Settings gcal red-dot badge** (`PersistentNav.tsx` lines 152-171) — precedent for "connection problem → red dot" with `--ink-coral`. Use the same coral for Polypad `error` state.

**State → presentation mapping (proposed, matches MicIndicatorDot register):**

| State          | Color           | Motion                       | Opacity |
|----------------|-----------------|------------------------------|---------|
| `disconnected` | `--ink-muted`   | none                         | 0.4     |
| `connecting`   | `--hud-cyan`    | `hud-breathe` 1.2s           | 0.6     |
| `connected`    | `--hud-cyan`    | `hud-pulse-slow` 1.2s (very subtle) or no animation | 1.0     |
| `error`        | `--ink-coral`   | `hud-pulse-fast` 0.5s        | 1.0     |

**Brand-coherence anchor:** the pill must read as "this is the same family as the mic dot, just for a different device." Identical size, identical motion vocabulary, identical placement register.

---

## Recommended task breakdown

**Scope: web-only. Desktop deferred (no app exists yet).**

### Task 1 — Polypad connection-state bus + hook
- Create `apps/web/lib/polypad/types.ts` with `PolypadConnectionState` union (`disconnected | connecting | connected | error`).
- Create `apps/web/lib/polypad/polypad-state-bus.ts` cloning the structure of `apps/web/lib/voice/mic-state-bus.ts` (module-level state + `subscribe(listener)` + `setState(next)`).
- Expose `window.__setPolypad(state)` in dev only for visual QA.
- Default state: `"disconnected"`.
- **No bridge wiring yet** — hook stub is the deliverable.

### Task 2 — `PolypadIndicatorDot` component
- Create `apps/web/components/polypad/PolypadIndicatorDot.tsx`.
- Mirror `MicIndicatorDot.tsx` API/structure exactly (props `state`, `data-polypad-state` attribute, same Tailwind class shape).
- Apply the state-to-presentation table from Q4 above.
- Accept `collapsed: boolean` to render label-or-dot-only.

### Task 3 — Mount in `PersistentNav`
- Add a `PolypadIndicatorDotContainer` adapter inside `PersistentNav.tsx` next to `MicIndicatorDotContainer` (mirror lines 72-76).
- Place the new dot in the voice status row block (line 209) so the row reads: `[mic dot] [polypad dot] [PressToTalk] [DiscreetToggle]` (expanded) or `[mic dot] [polypad dot]` (collapsed).
- Add a tooltip on the dot ("Polypad: connected" / "Polypad: disconnected") matching the existing `TooltipProvider` already in scope.

### Task 4 (optional, defer) — Bridge wiring
- Out of scope for this quick task. Spec lives in a future task once `tools/polypad/` (or extension of `tools/jarvis-physical/bridge/`) exists.

**Estimated effort:** Tasks 1-3 are ~30-60 min total. Pure UI + plumbing, no new deps, no new tables, no API routes.

---

## Open Questions

1. **Should the pill show a label in expanded mode?** Recommendation: tiny mono "POLYPAD" 10px uppercase tracking-wide. User to confirm or override.
2. **Does the user want the pill to be clickable** (e.g., opens a Polypad settings dialog)? Spec it as non-clickable for now; a tooltip + state is sufficient for the MVP visual.
3. **Coral for error state** — matches the gcal-disconnected precedent. User to confirm.

Sources:
- Repo audit (grep for `polypad` across all source: zero hits)
- `apps/web/components/shell/PersistentNav.tsx` (voice status row pattern, lines 208-219)
- `apps/web/components/voice/MicIndicatorDot.tsx` (canonical live-dot precedent)
- `apps/web/components/shell/AppShell.tsx` (confirms sidebar-only layout, no topbar)
- `apps/desktop/` directory walk (confirms no desktop source exists)
- `tools/jarvis-physical/bridge/.env` + `package-lock.json` (confirms serial-bridge precedent shape, but bridge itself is a stub)
